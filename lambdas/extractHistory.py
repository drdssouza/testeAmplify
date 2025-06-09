import json
import logging
import traceback
import re
import boto3
from datetime import datetime, timezone

# Configuração de logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Constantes
MAX_TEXT_LENGTH = 100000
MIN_TEXT_LENGTH = 10
SUPPORTED_LANGUAGES = ['python', 'java']

def clean_text(text):
    """
    Limpa e normaliza o texto de entrada.
    """
    logger.info("Limpando texto de entrada")
    
    try:
        # Remove caracteres de controle
        cleaned = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]', '', text)
        
        # Normaliza quebras de linha
        cleaned = re.sub(r'\r\n|\r', '\n', cleaned)
        
        # Remove espaços extras
        cleaned = re.sub(r'[ \t]+', ' ', cleaned)
        cleaned = re.sub(r'\n\s*\n\s*\n', '\n\n', cleaned)
        
        # Remove espaços no início e fim
        cleaned = cleaned.strip()
        
        logger.info(f"Texto limpo: {len(text)} -> {len(cleaned)} caracteres")
        return cleaned
        
    except Exception as e:
        logger.error(f"Erro ao limpar texto: {str(e)}")
        raise

def validate_input(user_story, language):
    """
    Validação básica da entrada.
    """
    logger.info("Validando entrada")
    
    try:
        # Validar texto
        if not user_story or not user_story.strip():
            return False, "História de usuário não pode estar vazia"
        
        if len(user_story.strip()) < MIN_TEXT_LENGTH:
            return False, f"História muito curta (mínimo {MIN_TEXT_LENGTH} caracteres)"
        
        if len(user_story) > MAX_TEXT_LENGTH:
            return False, f"História muito longa (máximo {MAX_TEXT_LENGTH} caracteres)"
        
        # Validar linguagem
        if language not in SUPPORTED_LANGUAGES:
            return False, f"Linguagem não suportada. Use: {', '.join(SUPPORTED_LANGUAGES)}"
        
        logger.info("Validação bem-sucedida")
        return True, "Válido"
        
    except Exception as e:
        logger.error(f"Erro na validação: {str(e)}")
        return False, f"Erro de validação: {str(e)}"

def standardize_story_with_llm(text):
    """
    Usa LLM para padronizar e estruturar a história de usuário.
    """
    logger.info("Padronizando história com LLM")
    
    try:
        bedrock_client = boto3.client('bedrock-runtime')
        
        # Prompt para padronização
        standardization_prompt = f"""
Você é um analista de requisitos especializado. Sua tarefa é reformular a história de usuário fornecida de forma clara e estruturada, SEM INVENTAR nenhuma informação nova.

REGRAS IMPORTANTES:
- Use APENAS as informações fornecidas
- NÃO adicione funcionalidades não mencionadas
- NÃO invente detalhes técnicos
- Organize melhor o texto existente
- Deixe mais claro e estruturado
- Mantenha a essência e objetivo original

HISTÓRIA ORIGINAL:
{text}

INSTRUÇÕES:
- Se for uma história mal formatada, organize melhor
- Se for muito técnica, mantenha os detalhes técnicos
- Se for muito simples, mantenha simples
- Se tiver múltiplas funcionalidades, liste cada uma claramente
- Use linguagem clara e objetiva

Reformule a história mantendo todas as informações originais, apenas organizando melhor:
"""
        
        # Chamar Bedrock
        response = bedrock_client.invoke_model(
            modelId='amazon.nova-lite-v1:0',  # Usando Amazon Nova Lite
            body=json.dumps({
                'messages': [
                    {
                        'role': 'user',
                        'content': standardization_prompt
                    }
                ],
                'max_tokens': 2000,
                'temperature': 0.1  # Baixa temperatura para manter consistência
            })
        )
        
        # Processar resposta
        response_body = json.loads(response['body'].read())
        standardized_story = response_body['output']['message']['content'][0]['text'].strip()
        
        logger.info(f"História padronizada: {len(text)} -> {len(standardized_story)} caracteres")
        return standardized_story
        
    except Exception as e:
        logger.error(f"Erro ao padronizar com LLM: {str(e)}")
        logger.info("Usando texto original como fallback")
        return text  # Fallback para texto original se houver erro

def build_context_for_generation(standardized_story, language):
    """
    Constrói contexto simples para geração de código.
    """
    logger.info(f"Construindo contexto para {language}")
    
    try:
        context_parts = []
        
        # Cabeçalho simples
        context_parts.append("=== HISTÓRIA DE USUÁRIO PADRONIZADA ===")
        context_parts.append(f"Linguagem de destino: {language.upper()}")
        context_parts.append("")
        
        # História padronizada
        context_parts.append(standardized_story)
        
        final_context = "\n".join(context_parts)
        
        logger.info(f"Contexto criado: {len(final_context)} caracteres")
        return final_context
        
    except Exception as e:
        logger.error(f"Erro ao construir contexto: {str(e)}")
        raise

def lambda_handler(event, context):
    """
    Handler principal da Lambda para processar e padronizar história de usuário.
    """
    # Log de início
    request_id = event.get('requestId', 'unknown')
    logger.info(f"=== INICIANDO EXTRACT_HISTORY_LAMBDA ===")
    logger.info(f"Request ID: {request_id}")
    logger.info(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")
    
    try:
        # 1. EXTRAÇÃO DOS DADOS
        logger.info("ETAPA 1: Extraindo dados do evento")
        user_story = event.get('userStory', '').strip()
        file_content = event.get('fileContent', '').strip()
        language = event.get('language', '').lower()
        
        # Usar arquivo se existir, senão usar texto direto
        input_text = file_content if file_content else user_story
        
        logger.info(f"Texto: {len(input_text)} caracteres")
        logger.info(f"Linguagem: {language}")
        logger.info(f"Fonte: {'arquivo' if file_content else 'texto_direto'}")
        
        # 2. VALIDAÇÃO
        logger.info("ETAPA 2: Validando entrada")
        is_valid, validation_message = validate_input(input_text, language)
        
        if not is_valid:
            logger.error(f"Validação falhou: {validation_message}")
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'error': 'Validation failed',
                    'message': validation_message,
                    'requestId': request_id
                })
            }
        
        logger.info("✓ Entrada válida")
        
        # 3. LIMPEZA DO TEXTO
        logger.info("ETAPA 3: Limpando texto")
        cleaned_text = clean_text(input_text)
        
        # 4. PADRONIZAÇÃO COM LLM
        logger.info("ETAPA 4: Padronizando história com LLM")
        standardized_story = standardize_story_with_llm(cleaned_text)
        
        # 5. CONSTRUÇÃO DO CONTEXTO
        logger.info("ETAPA 5: Construindo contexto para próxima Lambda")
        context_for_generation = build_context_for_generation(standardized_story, language)
        
        # 6. RESPOSTA
        logger.info("ETAPA 6: Preparando resposta")
        response_body = {
            'originalStory': cleaned_text,
            'structuredStory': standardized_story,
            'contextForGeneration': context_for_generation,
            'language': language,
            'requestId': request_id,
            'processedAt': datetime.now(timezone.utc).isoformat(),
            'stats': {
                'originalLength': len(input_text),
                'cleanedLength': len(cleaned_text),
                'standardizedLength': len(standardized_story),
                'wordCount': len(standardized_story.split())
            }
        }
        
        logger.info("=== PROCESSAMENTO CONCLUÍDO COM SUCESSO ===")
        logger.info(f"Texto original: {len(cleaned_text)} caracteres")
        logger.info(f"Texto padronizado: {len(standardized_story)} caracteres")
        logger.info(f"Contexto final: {len(context_for_generation)} caracteres")
        
        return {
            'statusCode': 200,
            'body': response_body
        }
        
    except Exception as e:
        # Log de erro
        error_message = str(e)
        error_traceback = traceback.format_exc()
        
        logger.error("=== ERRO NO PROCESSAMENTO ===")
        logger.error(f"Request ID: {request_id}")
        logger.error(f"Erro: {error_message}")
        logger.error(f"Traceback: {error_traceback}")
        
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Internal server error',
                'message': error_message,
                'requestId': request_id,
                'timestamp': datetime.now(timezone.utc).isoformat()
            })
        }