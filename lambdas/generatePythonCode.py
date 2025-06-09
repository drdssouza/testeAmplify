import json
import logging
import traceback
import boto3
from datetime import datetime, timezone

# Configuração de logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Constantes - CONFIGURAR CONFORME SEU AMBIENTE
S3_BUCKET = 'temp-storage-generate-python-code'  # ← ALTERE AQUI O NOME DO SEU BUCKET
MAX_TOKENS = 8000

def build_python_prompt(context_for_generation):
    """
    Constrói prompt específico para geração de código Python.
    """
    logger.info("Construindo prompt para geração Python")
    
    try:
        prompt = f"""
Você é um desenvolvedor Python sênior especializado em criar código limpo, funcional e bem estruturado. 

Baseado na história de usuário fornecida, gere código Python completo e funcional.

{context_for_generation}

DIRETRIZES PARA CÓDIGO PYTHON:
- Seguir rigorosamente PEP 8 (estilo de código Python)
- Usar type hints em funções e variáveis quando apropriado
- Incluir docstrings detalhadas (formato Google style)
- Implementar tratamento de exceções adequado
- Usar bibliotecas padrão do Python quando possível
- Aplicar princípios SOLID e Clean Code
- Criar código modular e reutilizável
- Incluir comentários explicativos quando necessário
- Usar nomes de variáveis e funções descritivos
- Implementar validações de entrada
- Considerar performance e legibilidade

ESTRUTURA ESPERADA:
- Imports organizados (padrão, terceiros, locais)
- Constantes no topo (se necessário)
- Classes e funções bem definidas
- Função main() se for script executável
- Código de exemplo de uso (se aplicável)

QUALIDADE DO CÓDIGO:
- Código deve ser executável e sem erros
- Implementar a funcionalidade completa descrita
- Usar padrões Python apropriados
- Incluir validações e tratamento de erros
- Código deve ser self-contained (sem dependências externas complexas)

IMPORTANTE:
- Gere APENAS código Python
- Não inclua explicações longas fora do código
- Não inclua markdown ou formatação especial
- O código deve ser direto, limpo e funcional

Agora gere o código Python baseado na história de usuário:
"""
        
        logger.info(f"Prompt construído: {len(prompt)} caracteres")
        return prompt
        
    except Exception as e:
        logger.error(f"Erro ao construir prompt: {str(e)}")
        raise

def generate_code_with_llm(prompt):
    """
    Chama Amazon Nova Pro para gerar código Python.
    """
    logger.info("Gerando código Python com Amazon Nova Pro")
    
    try:
        bedrock_client = boto3.client('bedrock-runtime')
        
        # Chamar Bedrock com Amazon Nova Pro
        response = bedrock_client.invoke_model(
            modelId='amazon.nova-pro-v1:0',  # Amazon Nova Pro
            body=json.dumps({
                'messages': [
                    {
                        'role': 'user',
                        'content': prompt
                    }
                ],
                'max_tokens': MAX_TOKENS,
                'temperature': 0.1,  # Baixa temperatura para código mais consistente
                'top_p': 0.9
            })
        )
        
        # Processar resposta
        response_body = json.loads(response['body'].read())
        generated_code = response_body['output']['message']['content'][0]['text'].strip()
        
        logger.info(f"Código gerado: {len(generated_code)} caracteres")
        return generated_code
        
    except Exception as e:
        logger.error(f"Erro ao gerar código com LLM: {str(e)}")
        raise



def save_to_s3_and_get_presigned_url(code, request_id):
    """
    Salva código no S3 e retorna presigned URL.
    """
    logger.info("Salvando código no S3")
    
    try:
        s3_client = boto3.client('s3')
        
        # Definir chave do objeto
        s3_key = f"generated-code/{request_id}.py"
        
        # Salvar no S3
        s3_client.put_object(
            Bucket=S3_BUCKET,
            Key=s3_key,
            Body=code,
            ContentType='text/plain',
            Metadata={
                'request-id': request_id,
                'generated-at': datetime.now(timezone.utc).isoformat(),
                'language': 'python'
            }
        )
        
        logger.info(f"Código salvo no S3: s3://{S3_BUCKET}/{s3_key}")
        
        # Gerar presigned URL
        presigned_url = s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': S3_BUCKET, 'Key': s3_key},
            ExpiresIn=3600  # 1 hora
        )
        
        logger.info("Presigned URL gerada com sucesso")
        return presigned_url
        
    except Exception as e:
        logger.error(f"Erro ao salvar no S3: {str(e)}")
        raise

def lambda_handler(event, context):
    """
    Handler principal da Lambda para geração de código Python.
    """
    # Log de início
    request_id = event.get('requestId', 'unknown')
    logger.info(f"=== INICIANDO GENERATE_PYTHON_CODE_LAMBDA ===")
    logger.info(f"Request ID: {request_id}")
    logger.info(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")
    
    try:
        # 1. EXTRAÇÃO DOS DADOS
        logger.info("ETAPA 1: Extraindo dados do evento")
        context_for_generation = event.get('contextForGeneration', '')
        language = event.get('language', '')
        
        if not context_for_generation:
            logger.error("Contexto para geração não fornecido")
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'error': 'Missing context',
                    'message': 'contextForGeneration é obrigatório',
                    'requestId': request_id
                })
            }
        
        if language != 'python':
            logger.error(f"Linguagem incorreta: {language}")
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'error': 'Wrong language',
                    'message': 'Esta Lambda é específica para Python',
                    'requestId': request_id
                })
            }
        
        logger.info(f"Contexto recebido: {len(context_for_generation)} caracteres")
        
        # 2. CONSTRUÇÃO DO PROMPT
        logger.info("ETAPA 2: Construindo prompt para Amazon Nova Pro")
        python_prompt = build_python_prompt(context_for_generation)
        
        # 3. GERAÇÃO DO CÓDIGO
        logger.info("ETAPA 3: Gerando código Python com LLM")
        generated_code = generate_code_with_llm(python_prompt)
        
        # 4. SALVAMENTO NO S3
        logger.info("ETAPA 4: Salvando código no S3")
        presigned_url = save_to_s3_and_get_presigned_url(generated_code, request_id)
        
        # 5. RESPOSTA
        logger.info("ETAPA 5: Preparando resposta")
        response_body = {
            'presignedUrl': presigned_url,
            'codeLength': len(generated_code),
            'language': 'python',
            'requestId': request_id,
            'generatedAt': datetime.now(timezone.utc).isoformat(),
            'stats': {
                'promptLength': len(python_prompt),
                'codeLength': len(generated_code),
                'estimatedLines': len(generated_code.split('\n'))
            }
        }
        
        logger.info("=== GERAÇÃO DE CÓDIGO PYTHON CONCLUÍDA ===")
        logger.info(f"Código gerado: {len(generated_code)} caracteres")
        logger.info(f"Linhas estimadas: {len(generated_code.split('\n'))}")
        
        return {
            'statusCode': 200,
            'body': response_body
        }
        
    except Exception as e:
        # Log de erro
        error_message = str(e)
        error_traceback = traceback.format_exc()
        
        logger.error("=== ERRO NA GERAÇÃO DE CÓDIGO PYTHON ===")
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