import json
import logging
import traceback
import boto3
from datetime import datetime, timezone

# Configuração de logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Constantes 
S3_BUCKET = 'temp-storage-generate-java-code'  
MAX_TOKENS = 8000

def build_java_prompt(context_for_generation):
    """
    Constrói prompt específico para geração de código Java.
    """
    logger.info("Construindo prompt para geração Java")
    
    try:
        prompt = f"""
Você é um desenvolvedor Java sênior especializado em criar código enterprise-ready, limpo e bem estruturado.

Baseado na história de usuário fornecida, gere código Java completo e funcional.

{context_for_generation}

DIRETRIZES PARA CÓDIGO JAVA:
- Seguir rigorosamente as convenções Java (camelCase, PascalCase para classes)
- Usar Java 11+ features quando apropriado
- Incluir JavaDoc detalhado para classes e métodos públicos
- Implementar tratamento de exceções robusto
- Aplicar design patterns apropriados (Strategy, Factory, Builder, etc.)
- Usar anotações Spring quando relevante (@Service, @Repository, @Controller)
- Considerar princípios SOLID e Clean Architecture
- Implementar interfaces quando apropriado
- Usar generics para type safety
- Implementar validações de entrada robustas
- Considerar performance e manutenibilidade

ESTRUTURA ESPERADA:
- Package declaration no topo
- Imports organizados (java.*, javax.*, terceiros, locais)
- JavaDoc da classe
- Classe principal bem definida
- Constantes como static final
- Métodos organizados (construtor, públicos, privados)
- Classes auxiliares se necessário
- Método main() se for aplicação executável

QUALIDADE DO CÓDIGO:
- Código deve compilar sem erros
- Implementar a funcionalidade completa descrita
- Usar padrões Java enterprise apropriados
- Incluir validações e tratamento de exceções
- Código deve ser self-contained (evitar dependências externas complexas)
- Seguir convenções de nomenclatura Java
- Usar Optional para valores que podem ser null
- Implementar equals() e hashCode() quando apropriado

PADRÕES ENTERPRISE:
- Usar anotações Spring Boot quando aplicável
- Implementar DTOs para transferência de dados
- Criar Services para lógica de negócio
- Usar Repositories para acesso a dados
- Implementar Controllers para APIs REST
- Aplicar validações Bean Validation (@Valid, @NotNull, etc.)

IMPORTANTE:
- Gere APENAS código Java
- Não inclua explicações longas fora do código
- Não inclua markdown ou formatação especial
- O código deve ser direto, limpo e funcional
- Use comentários apenas quando necessário para clareza

Agora gere o código Java baseado na história de usuário:
"""
        
        logger.info(f"Prompt construído: {len(prompt)} caracteres")
        return prompt
        
    except Exception as e:
        logger.error(f"Erro ao construir prompt: {str(e)}")
        raise

def generate_code_with_llm(prompt):
    """
    Chama Amazon Nova Pro para gerar código Java.
    """
    logger.info("Gerando código Java com Amazon Nova Pro")
    
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
        
        # Extrair nome da classe para o arquivo (se possível)
        class_name = "GeneratedCode" 
        lines = code.split('\n')
        for line in lines:
            if 'public class ' in line:
                parts = line.split('public class ')[1].split(' ')[0].split('{')[0]
                if parts:
                    class_name = parts.strip()
                break
        
        # Definir chave do objeto
        s3_key = f"generated-code/{request_id}_{class_name}.java"
        
        # Salvar no S3
        s3_client.put_object(
            Bucket=S3_BUCKET,
            Key=s3_key,
            Body=code,
            ContentType='text/plain',
            Metadata={
                'request-id': request_id,
                'generated-at': datetime.now(timezone.utc).isoformat(),
                'language': 'java',
                'class-name': class_name
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
        return presigned_url, class_name
        
    except Exception as e:
        logger.error(f"Erro ao salvar no S3: {str(e)}")
        raise

def lambda_handler(event, context):
    """
    Handler principal da Lambda para geração de código Java.
    """
    # Log de início
    request_id = event.get('requestId', 'unknown')
    logger.info(f"=== INICIANDO GENERATE_JAVA_CODE_LAMBDA ===")
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
        
        if language != 'java':
            logger.error(f"Linguagem incorreta: {language}")
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'error': 'Wrong language',
                    'message': 'Esta Lambda é específica para Java',
                    'requestId': request_id
                })
            }
        
        logger.info(f"Contexto recebido: {len(context_for_generation)} caracteres")
        
        # 2. CONSTRUÇÃO DO PROMPT
        logger.info("ETAPA 2: Construindo prompt para Amazon Nova Pro")
        java_prompt = build_java_prompt(context_for_generation)
        
        # 3. GERAÇÃO DO CÓDIGO
        logger.info("ETAPA 3: Gerando código Java com LLM")
        generated_code = generate_code_with_llm(java_prompt)
        
        # 4. SALVAMENTO NO S3
        logger.info("ETAPA 4: Salvando código no S3")
        presigned_url, class_name = save_to_s3_and_get_presigned_url(generated_code, request_id)
        
        # 5. RESPOSTA
        logger.info("ETAPA 5: Preparando resposta")
        response_body = {
            'presignedUrl': presigned_url,
            'codeLength': len(generated_code),
            'className': class_name,
            'language': 'java',
            'requestId': request_id,
            'generatedAt': datetime.now(timezone.utc).isoformat(),
            'stats': {
                'promptLength': len(java_prompt),
                'codeLength': len(generated_code),
                'estimatedLines': len(generated_code.split('\n'))
            }
        }
        
        logger.info("=== GERAÇÃO DE CÓDIGO JAVA CONCLUÍDA ===")
        logger.info(f"Código gerado: {len(generated_code)} caracteres")
        logger.info(f"Linhas estimadas: {len(generated_code.split('\n'))}")
        logger.info(f"Classe: {class_name}")
        
        return {
            'statusCode': 200,
            'body': response_body
        }
        
    except Exception as e:
        # Log de erro
        error_message = str(e)
        error_traceback = traceback.format_exc()
        
        logger.error("=== ERRO NA GERAÇÃO DE CÓDIGO JAVA ===")
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