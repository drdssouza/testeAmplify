import json
import logging
import traceback
import boto3
from datetime import datetime, timezone

# Configuração de logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Constantes
S3_BUCKET = 'temp-storage-generate-bdd-test'
MAX_TOKENS = 6000

def build_bdd_prompt(generated_code, language):
    """
    Constrói prompt específico para geração de testes BDD.
    """
    logger.info(f"Construindo prompt para geração BDD - {language}")
    
    try:
        prompt = f"""
Você é um especialista em testes BDD (Behavior Driven Development) e Quality Assurance.

Analise o código {language.upper()} fornecido e gere testes BDD completos no formato Gherkin.

CÓDIGO A SER TESTADO:
```{language}
{generated_code}
```

DIRETRIZES PARA TESTES BDD:
- Use o formato Gherkin padrão (Feature, Scenario, Given, When, Then)
- Escreva em português brasileiro
- Crie cenários que cubram diferentes aspectos do código
- Inclua testes para casos de sucesso (happy path)
- Inclua testes para casos de erro e exceções
- Teste validações de entrada
- Teste casos extremos (edge cases)
- Use linguagem natural e clara
- Cada cenário deve ser independente
- Use exemplos concretos e realistas

ESTRUTURA ESPERADA:
Feature: [Nome da funcionalidade]
  Como [tipo de usuário]
  Eu quero [objetivo]
  Para que [benefício]

  Background: (se necessário)
    Given [pré-condições comuns]

  Scenario: [Cenário de sucesso]
    Given [contexto inicial]
    When [ação executada]
    Then [resultado esperado]
    And [resultado adicional]

  Scenario: [Cenário de erro]
    Given [contexto inicial]
    When [ação que causa erro]
    Then [erro esperado]

TIPOS DE CENÁRIOS A INCLUIR:
- Fluxo principal (happy path)
- Validação de dados de entrada
- Tratamento de erros
- Casos extremos (valores nulos, vazios, inválidos)
- Limites e restrições
- Integração com sistemas externos (se aplicável)
- Performance (se relevante)

QUALIDADE DOS TESTES:
- Cenários devem ser claros e específicos
- Use dados de exemplo realistas
- Cada cenário deve testar uma única funcionalidade
- Evite cenários muito complexos
- Use linguagem de negócio, não técnica
- Garanta que os cenários sejam executáveis

FORMATO DE SAÍDA:
- APENAS código Gherkin (.feature)
- Não inclua explicações fora do formato Gherkin
- Não inclua markdown ou formatação especial
- Use comentários Gherkin (#) apenas se necessário

Agora gere os testes BDD no formato Gherkin baseados no código fornecido:
"""
        
        logger.info(f"Prompt construído: {len(prompt)} caracteres")
        return prompt
        
    except Exception as e:
        logger.error(f"Erro ao construir prompt: {str(e)}")
        raise

def generate_bdd_with_llm(prompt):
    """
    Chama Amazon Nova Pro para gerar testes BDD.
    """
    logger.info("Gerando testes BDD com Amazon Nova Pro")
    
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
                'temperature': 0.2,  # Temperatura um pouco maior para criatividade nos cenários
                'top_p': 0.9
            })
        )
        
        # Processar resposta
        response_body = json.loads(response['body'].read())
        generated_bdd = response_body['output']['message']['content'][0]['text'].strip()
        
        logger.info(f"BDD gerado: {len(generated_bdd)} caracteres")
        return generated_bdd
        
    except Exception as e:
        logger.error(f"Erro ao gerar BDD com LLM: {str(e)}")
        raise



def save_to_s3_and_get_presigned_url(bdd_content, request_id):
    """
    Salva testes BDD no S3 e retorna presigned URL.
    """
    logger.info("Salvando testes BDD no S3")
    
    try:
        s3_client = boto3.client('s3')
        
        # Definir chave do objeto
        s3_key = f"bdd-tests/{request_id}_tests.feature"
        
        # Salvar no S3
        s3_client.put_object(
            Bucket=S3_BUCKET,
            Key=s3_key,
            Body=bdd_content,
            ContentType='text/plain',
            Metadata={
                'request-id': request_id,
                'generated-at': datetime.now(timezone.utc).isoformat(),
                'file-type': 'gherkin-feature'
            }
        )
        
        logger.info(f"BDD salvo no S3: s3://{S3_BUCKET}/{s3_key}")
        
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
    Handler principal da Lambda para geração de testes BDD.
    """
    # Log de início
    request_id = event.get('requestId', 'unknown')
    logger.info(f"=== INICIANDO GENERATE_BDD_TEST_LAMBDA ===")
    logger.info(f"Request ID: {request_id}")
    logger.info(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")
    
    try:
        # 1. EXTRAÇÃO DOS DADOS
        logger.info("ETAPA 1: Extraindo dados do evento")
        
        # Esta Lambda recebe dados da Lambda de geração de código
        # Pode vir de uma Step Function ou chamada direta do front-end
        generated_code = event.get('code', '') or event.get('generatedCode', '')
        language = event.get('language', '')
        
        # Se vier presigned URL, precisamos buscar o código no S3
        presigned_url_code = event.get('presignedUrl', '')
        if presigned_url_code and not generated_code:
            logger.info("Buscando código via presigned URL")
            # Aqui você pode implementar fetch do S3 se necessário
            # Por simplicidade, vamos assumir que o código vem diretamente
        
        if not generated_code:
            logger.error("Código gerado não fornecido")
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'error': 'Missing code',
                    'message': 'Código gerado é obrigatório para gerar testes BDD',
                    'requestId': request_id
                })
            }
        
        if language not in ['python', 'java']:
            logger.error(f"Linguagem não suportada: {language}")
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'error': 'Unsupported language',
                    'message': 'Linguagem deve ser python ou java',
                    'requestId': request_id
                })
            }
        
        logger.info(f"Código recebido: {len(generated_code)} caracteres")
        logger.info(f"Linguagem: {language}")
        
        # 2. CONSTRUÇÃO DO PROMPT
        logger.info("ETAPA 2: Construindo prompt para Amazon Nova Pro")
        bdd_prompt = build_bdd_prompt(generated_code, language)
        
        # 3. GERAÇÃO DOS TESTES BDD
        logger.info("ETAPA 3: Gerando testes BDD com LLM")
        generated_bdd = generate_bdd_with_llm(bdd_prompt)
        
        # 4. SALVAMENTO NO S3
        logger.info("ETAPA 4: Salvando testes BDD no S3")
        presigned_url = save_to_s3_and_get_presigned_url(generated_bdd, request_id)
        
        # 5. RESPOSTA
        logger.info("ETAPA 5: Preparando resposta")
        # Contar cenários simples
        scenario_count = generated_bdd.count('Scenario:')
        
        response_body = {
            'presignedUrl': presigned_url,
            'bddLength': len(generated_bdd),
            'scenarioCount': scenario_count,
            'language': language,
            'requestId': request_id,
            'generatedAt': datetime.now(timezone.utc).isoformat(),
            'stats': {
                'promptLength': len(bdd_prompt),
                'bddLength': len(generated_bdd),
                'estimatedLines': len(generated_bdd.split('\n')),
                'scenarioCount': scenario_count
            }
        }
        
        logger.info("=== GERAÇÃO DE TESTES BDD CONCLUÍDA ===")
        logger.info(f"BDD gerado: {len(generated_bdd)} caracteres")
        logger.info(f"Cenários: {scenario_count}")
        
        return {
            'statusCode': 200,
            'body': response_body
        }
        
    except Exception as e:
        # Log de erro
        error_message = str(e)
        error_traceback = traceback.format_exc()
        
        logger.error("=== ERRO NA GERAÇÃO DE TESTES BDD ===")
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