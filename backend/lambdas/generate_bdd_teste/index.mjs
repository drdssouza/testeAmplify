import { callBedrock } from "/opt/nodejs/index.js";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client();
const BUCKET_NAME = "pocdesktoptemp";

const normalize = (event) => {
  if (typeof event === 'string') return JSON.parse(event);
  if (event?.body) return typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  return event;
};

const getContextFromS3 = async (s3ContextKey) => {
  console.log(`Recuperando contexto do S3: ${s3ContextKey}`);
  
  try {
    const response = await s3.send(new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3ContextKey
    }));
    
    const contextData = JSON.parse(await response.Body.transformToString());
    console.log(`Contexto recuperado: ${contextData.content.length} caracteres`);
    
    return contextData.content;
    
  } catch (error) {
    console.error('Erro ao recuperar contexto do S3:', error);
    throw error;
  }
};

const getCodeFromS3 = async (s3CodeKey) => {
  console.log(`Recuperando código do S3: ${s3CodeKey}`);
  
  try {
    const response = await s3.send(new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3CodeKey
    }));
    
    const code = await response.Body.transformToString();
    console.log(`Código recuperado: ${code.length} caracteres`);
    
    return code;
    
  } catch (error) {
    console.error('Erro ao recuperar código do S3:', error);
    throw error;
  }
};

const buildBDDPrompt = (extractedContent, generatedCode, userRequirements) => {
  console.log('Construindo prompt para geração de testes BDD');
  
  const prompt = `Você é um especialista em testes automatizados e BDD (Behavior Driven Development). Analise o contexto e código fornecidos para gerar testes BDD profissionais e assertivos.

CONTEXTO ORIGINAL DO USUÁRIO:
${extractedContent}

CÓDIGO PYTHON GERADO:
${generatedCode}

REQUISITOS ADICIONAIS:
${userRequirements || 'Nenhum requisito adicional especificado.'}

DIRETRIZES OBRIGATÓRIAS PARA TESTES BDD:
1. Analisar o código Python para entender suas funcionalidades principais
2. Criar cenários de teste que cubram os casos de uso críticos
3. Usar linguagem natural clara e precisa no formato Gherkin
4. Incluir testes para casos de sucesso, falha e edge cases
5. Focar em comportamentos observáveis do usuário
6. Garantir que os testes sejam executáveis e verificáveis
7. Usar dados realistas nos exemplos
8. Incluir validações de entrada e saída
9. Considerar diferentes perfis de usuário se aplicável
10. Manter cenários independentes e reutilizáveis

ESTRUTURA ESPERADA:
- Feature: Descrição da funcionalidade principal
- Background: Configuração comum (se necessário)
- Scenarios: Múltiplos cenários cobrindo diferentes casos
- Examples: Dados de teste quando usar Scenario Outline

FORMATO GHERKIN ESPERADO:
Feature: [Nome da funcionalidade]
  Como [usuário]
  Eu quero [objetivo]
  Para que [benefício]

  Background:
    Given [configuração comum]

  Scenario: [Caso de sucesso]
    Given [pré-condição]
    When [ação]
    Then [resultado esperado]
    And [validação adicional]

  Scenario: [Caso de falha]
    Given [pré-condição]
    When [ação inválida]
    Then [erro esperado]

  Scenario Outline: [Casos múltiplos]
    Given [pré-condição com <parametro>]
    When [ação com <parametro>]
    Then [resultado com <parametro>]
    Examples:
      | parametro | resultado |
      | valor1    | esperado1 |
      | valor2    | esperado2 |

QUALIDADE ESPERADA:
- Cenários testáveis e executáveis
- Linguagem natural e clara
- Cobertura abrangente das funcionalidades
- Casos de borda identificados
- Validações assertivas e específicas
- Dados de teste realistas
- Estrutura Gherkin correta

IMPORTANTE:
- Gere APENAS o conteúdo BDD em formato Gherkin
- Não inclua explicações fora do formato
- Base-se no código Python para criar testes realistas
- Foque em comportamentos, não implementação
- Inclua pelo menos 3-5 cenários diferentes

Gere os testes BDD baseados no código e contexto fornecidos:`;

  console.log(`Prompt construído: ${prompt.length} caracteres`);
  return prompt;
};

const generateBDDWithBedrock = async (prompt) => {
  console.log('Gerando testes BDD com Amazon Nova Pro');
  
  try {
    const modelId = 'amazon.nova-pro-v1:0';
    
            const bedrockResp = await callBedrock({
      modelId: modelId,
      userPrompt: prompt,
      maxTokens: 4000,
      temperature: 0.2
    });

    console.log(`Testes BDD gerados: ${bedrockResp.response.message.length} caracteres`);
    return bedrockResp;
    
  } catch (error) {
    console.error('Erro ao gerar BDD com Bedrock:', error);
    throw error;
  }
};

const cleanGeneratedBDD = (rawBDD) => {
  console.log('Limpando testes BDD gerados');
  
  // Remover markdown se houver - corrigido regex
  let cleanBDD = rawBDD.replace(/^```gherkin\n?/g, '').replace(/\n?```$/g, '');
  
  // Remover explicações após o BDD
  const lines = cleanBDD.split('\n');
  const bddLines = [];
  let foundExplanation = false;
  
  for (const line of lines) {
    // Parar se encontrar explicações
    if (line.match(/^###?\s+(Explicação|Como executar|Observações)/i)) {
      foundExplanation = true;
      break;
    }
    
    bddLines.push(line);
  }
  
  let finalBDD = bddLines.join('\n').trim();
  
  // Garantir formatação correta do Gherkin
  finalBDD = finalBDD
    .replace(/^\s*Feature:/gm, 'Feature:')
    .replace(/^\s*Background:/gm, '  Background:')
    .replace(/^\s*Scenario:/gm, '  Scenario:')
    .replace(/^\s*Scenario Outline:/gm, '  Scenario Outline:')
    .replace(/^\s*Given/gm, '    Given')
    .replace(/^\s*When/gm, '    When')
    .replace(/^\s*Then/gm, '    Then')
    .replace(/^\s*And/gm, '    And')
    .replace(/^\s*But/gm, '    But')
    .replace(/^\s*Examples:/gm, '    Examples:')
    .replace(/^\s*\|/gm, '      |');
  
  return finalBDD;
};

const saveBDDResultToS3 = async (finalResult, filename) => {
  console.log('Salvando resultado BDD final no S3');
  
  // ✅ CORREÇÃO: Usar filename exato do payload (igual save_and_return_data)
  const s3Key = filename;
  
  try {
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: JSON.stringify(finalResult, null, 2),
      ContentType: 'application/json',
      Metadata: {
        'request-id': finalResult.requestId || 'unknown',
        'status-code': finalResult.statuscode.toString(),
        'processed-at': new Date().toISOString(),
        'bdd-scenarios': finalResult.bdd_generated?.scenarioCount?.toString() || '0',
        'language': finalResult.code_generated?.language || 'unknown'
      }
    }));
    
    console.log(`Resultado BDD salvo: s3://${BUCKET_NAME}/${s3Key}`);
    return s3Key;
    
  } catch (error) {
    console.error('Erro ao salvar resultado BDD no S3:', error);
    throw error;
  }
};

const saveContentToS3 = async (content, requestId, type = 'temp') => {
  console.log(`Salvando conteúdo temporário no S3: ${type}`);
  
  const s3Key = `temp-${type}/${requestId}.json`;
  const contentData = {
    createdAt: new Date().toISOString(),
    requestId,
    content: content,
    contentLength: content.length,
    type: type
  };
  
  try {
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: JSON.stringify(contentData, null, 2),
      ContentType: 'application/json',
      Metadata: {
        'request-id': requestId,
        'content-type': `temp-${type}`,
        'created-at': new Date().toISOString()
      }
    }));
    
    console.log(`Conteúdo salvo: s3://${BUCKET_NAME}/${s3Key}`);
    return s3Key;
    
  } catch (error) {
    console.error('Erro ao salvar conteúdo temporário no S3:', error);
    throw error;
  }
};

export const handler = async (event) => {
  const requestId = event.requestId || `req_${Date.now()}`;
  console.log(`=== GENERATE_BDD_TESTE INICIADO ===`);
  console.log(`Request ID: ${requestId}`);
  
  let body;
  
  try {
    body = normalize(event);
    console.log('Evento processado:', JSON.stringify(body, null, 2));
    
    let extractedContent, generatedCode;
    
    // Detectar se é fluxo simplificado ou completo
    const isSimplifiedFlow = body.simplified_flow || (!body.extracted_data?.s3ContextKey && !body.code_generated?.s3CodeKey);
    
    if (isSimplifiedFlow) {
      console.log('🔄 Usando fluxo simplificado (sem s3Keys)');
      
      // Usar dados diretos do payload
      extractedContent = body.extracted_data?.content || body.user_data?.user_history || '';
      generatedCode = body.code_generated?.code || '';
      
      if (!generatedCode) {
        throw new Error('Código não encontrado no payload simplificado');
      }
      
      console.log(`Fluxo simplificado - Código: ${generatedCode.length} caracteres`);
      console.log(`Fluxo simplificado - Contexto: ${extractedContent.length} caracteres`);
      
    } else {
      console.log('🚀 Usando fluxo completo (com s3Keys)');
      
      // Recuperar contexto original do S3
      const s3ContextKey = body.extracted_data?.s3ContextKey;
      if (!s3ContextKey) {
        throw new Error('Chave do contexto S3 não encontrada');
      }
      
      console.log(`Recuperando contexto: ${s3ContextKey}`);
      extractedContent = await getContextFromS3(s3ContextKey);
      
      // Recuperar código gerado do S3
      const s3CodeKey = body.code_generated?.s3CodeKey;
      if (!s3CodeKey) {
        throw new Error('Chave do código S3 não encontrada');
      }
      
      console.log(`Recuperando código: ${s3CodeKey}`);
      generatedCode = await getCodeFromS3(s3CodeKey);
    }
    
    // Construir prompt específico para BDD
    const userRequirements = body.user_data?.requirements || body.user_data?.context || '';
    const prompt = buildBDDPrompt(extractedContent, generatedCode, userRequirements);
    
    // Gerar testes BDD com Bedrock
    console.log('Iniciando geração de testes BDD com LLM...');
    const rawBDD = await generateBDDWithBedrock(prompt);
    
    // Limpar e estruturar BDD
    const cleanBDD = cleanGeneratedBDD(rawBDD.response.message);
    
    // Para fluxo simplificado, precisamos garantir que extracted_data e code_generated existam
    const finalExtractedData = body.extracted_data || {
      content: extractedContent,
      contentLength: extractedContent.length,
      wordCount: extractedContent.split(/\s+/).length,
      extractedAt: new Date().toISOString()
    };
    
    const finalCodeGenerated = body.code_generated || {
      language: body.user_data?.language || 'python',
      code: generatedCode,
      codeLength: generatedCode.length,
      linesOfCode: generatedCode.split('\n').length,
      generatedAt: new Date().toISOString()
    };
    
    // Preparar resposta final estruturada
    const response = {
      statuscode: 200,
      requestId,
      filename: body.filename,
      start_timestamp: body.start_timestamp,
      executionTime: Date.now() - (body.start_timestamp || Date.now()),
      processedAt: new Date().toISOString(),
      configuration: body.configuration || {},
      user_data: body.user_data || {},
      extracted_data: finalExtractedData,
      code_generated: finalCodeGenerated,
      bdd_generated: {
        content: cleanBDD,
        bddLength: cleanBDD.length,
        input_tokens:rawBDD.response.input_tokens,
        output_tokens:rawBDD.response.output_tokens,
        scenarioCount: (cleanBDD.match(/Scenario:/g) || []).length,
        generatedAt: new Date().toISOString()
      },
      simplified_flow: isSimplifiedFlow,
      
      // Estatísticas do processamento
      stats: {
        totalExecutionTime: Date.now() - (body.start_timestamp || Date.now()),
        bddGenerationSuccess: !!cleanBDD,
        scenarios: (cleanBDD.match(/Scenario:/g) || []).length,
        features: (cleanBDD.match(/Feature:/g) || []).length,
        steps: (cleanBDD.match(/(Given|When|Then|And|But)\s+/g) || []).length
      }
    };
    
    // ✅ CORREÇÃO: Salvar resultado final estruturado no filename correto
    await saveBDDResultToS3(response, body.filename);
    
    console.log(`=== GERAÇÃO DE BDD CONCLUÍDA ===`);
    console.log(`BDD: ${cleanBDD.length} caracteres`);
    console.log(`Cenários: ${response.bdd_generated.scenarioCount}`);
    console.log(`Execução: ${response.executionTime}ms`);
    console.log(`Arquivo salvo: ${body.filename}`);
    
    return response;
    
  } catch (error) {
    console.error('=== ERRO NA GERAÇÃO DE BDD ===');
    console.error('Erro:', error.message);
    console.error('Stack:', error.stack);
    
    const errorResult = {
      statuscode: 500,
      requestId,
      filename: body?.filename,
      start_timestamp: body?.start_timestamp,
      executionTime: Date.now() - (body?.start_timestamp || Date.now()),
      processedAt: new Date().toISOString(),
      configuration: body?.configuration || {},
      user_data: body?.user_data || {},
      extracted_data: body?.extracted_data || {},
      code_generated: body?.code_generated || {},
      error: {
        message: error.message,
        type: error.name,
        timestamp: new Date().toISOString()
      },
      simplified_flow: body?.simplified_flow || false
    };
    
    // Tentar salvar erro no local correto
    try {
      if (body?.filename) {
        await saveBDDResultToS3(errorResult, body.filename);
      }
    } catch (s3Error) {
      console.error('Erro ao salvar erro no S3:', s3Error.message);
    }
    
    return errorResult;
  }
};