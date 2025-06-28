import { callBedrock } from "/opt/nodejs/index.js";
import { TextractClient, DetectDocumentTextCommand } from "@aws-sdk/client-textract";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

const textract = new TextractClient();
const s3 = new S3Client();
const BUCKET_NAME = "pocdesktoptemp";

const normalize = (event) => {
  if (typeof event === 'string') return JSON.parse(event);
  if (event?.body) return typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  return event;
};

const extractTextFromFile = async (fileBuffer, fileType) => {
  console.log(`Extraindo texto do arquivo tipo: ${fileType}`);
  
  try {
    if (fileType === 'txt') {
      return fileBuffer.toString('utf-8');
    }
    
    if (['pdf', 'docx', 'doc'].includes(fileType)) {
      const command = new DetectDocumentTextCommand({
        Document: { Bytes: fileBuffer }
      });
      
      const response = await textract.send(command);
      const extractedText = response.Blocks
        .filter(block => block.BlockType === 'LINE')
        .map(block => block.Text)
        .join('\n');
      
      console.log(`Texto extraído: ${extractedText.length} caracteres`);
      return extractedText;
    }
    
    throw new Error(`Tipo de arquivo não suportado: ${fileType}`);
    
  } catch (error) {
    console.error('Erro na extração de texto:', error);
    throw error;
  }
};

const cleanAndStructureText = (rawText) => {
  console.log('Limpando e estruturando texto extraído');
  
  return rawText
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
};

const buildAnalysisPrompt = (userStory, contextualStandards, targetLanguage) => {
  console.log('Construindo prompt de análise para geração de diretrizes');
  
  return `Você é um Arquiteto de Software Senior especializado em análise de requisitos e definição de diretrizes técnicas precisas.

MISSÃO: Analisar a história de usuário fornecida e gerar diretrizes técnicas estruturadas para desenvolvimento de código ${targetLanguage.toUpperCase()} limpo e profissional.

═══════════════════════════════════════════════════════════════

📋 HISTÓRIA DE USUÁRIO:
${userStory}

${contextualStandards ? `🎯 PADRÕES E CONTEXTO TÉCNICO:
${contextualStandards}

` : ''}═══════════════════════════════════════════════════════════════

🎯 ANÁLISE REQUERIDA:

1. **FUNCIONALIDADES CORE**: Identifique as funcionalidades principais que precisam ser implementadas
2. **ARQUITETURA**: Defina a estrutura de classes, módulos e organização do código
3. **PADRÕES TÉCNICOS**: Estabeleça convenções de nomenclatura, estruturação e boas práticas
4. **VALIDAÇÕES**: Determine quais validações de entrada e tratamento de erros são necessários
5. **DEPENDÊNCIAS**: Liste bibliotecas padrão do ${targetLanguage} que devem ser utilizadas

═══════════════════════════════════════════════════════════════

📐 FORMATO DE SAÍDA OBRIGATÓRIO:

## ANÁLISE TÉCNICA

### FUNCIONALIDADES IDENTIFICADAS
- [Lista clara e objetiva das funcionalidades principais]

### ARQUITETURA PROPOSTA
- **Estrutura de Classes**: [Definir classes necessárias com responsabilidades]
- **Módulos/Arquivos**: [Organização em arquivos se aplicável]
- **Fluxo Principal**: [Sequência de execução do programa]

### DIRETRIZES DE IMPLEMENTAÇÃO
- **Nomenclatura**: [Convenções para variáveis, funções, classes]
- **Estruturação**: [Como organizar o código, indentação, separação]
- **Padrões ${targetLanguage}**: [Convenções específicas da linguagem]
- **Tratamento de Erros**: [Como implementar validações e exceptions]

### BIBLIOTECAS REQUERIDAS
- [Lista de imports necessários da biblioteca padrão]

### VALIDAÇÕES OBRIGATÓRIAS
- [Validações de entrada, tipos, rangos, etc.]

### ESTRUTURA DE SAÍDA
- [Como o programa deve retornar resultados/interagir com usuário]

═══════════════════════════════════════════════════════════════

⚠️ REGRAS CRÍTICAS:
- Mantenha foco nas funcionalidades essenciais da história de usuário
- Priorize simplicidade e clareza sobre complexidade desnecessária
- Use apenas bibliotecas padrão do ${targetLanguage} quando possível
- Defina diretrizes específicas e implementáveis
- Seja preciso: cada diretriz deve ser clara o suficiente para implementação direta

Gere a análise seguindo rigorosamente este formato:`;
};

const analyzeRequirementsWithBedrock = async (userStory, contextualStandards, targetLanguage) => {
  console.log('Iniciando análise de requisitos com Bedrock');
  
  try {
    const prompt = buildAnalysisPrompt(userStory, contextualStandards, targetLanguage);
    
    const bedrockResp = await callBedrock({
      modelId: 'amazon.nova-pro-v1:0',
      userPrompt: prompt,
      maxTokens: 4000,
      temperature: 0.1
    });
    const responseBody = bedrockResp.response.message;
const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const analysis = responseBody.output.message.content[0].text.trim();
    
    console.log(`Análise gerada: ${analysis.length} caracteres`);
    return analysis;
    
  } catch (error) {
    console.error('Erro na análise com Bedrock:', error);
    throw error;
  }
};

const extractStructuredRequirements = (analysis) => {
  console.log('Extraindo requisitos estruturados da análise');
  
  const sections = {};
  
  const extractSection = (text, sectionName) => {
    const regex = new RegExp(`### ${sectionName}([\\s\\S]*?)(?=###|$)`, 'i');
    const match = text.match(regex);
    return match ? match[1].trim() : '';
  };
  
  sections.funcionalities = extractSection(analysis, 'FUNCIONALIDADES IDENTIFICADAS');
  sections.architecture = extractSection(analysis, 'ARQUITETURA PROPOSTA');
  sections.guidelines = extractSection(analysis, 'DIRETRIZES DE IMPLEMENTAÇÃO');
  sections.libraries = extractSection(analysis, 'BIBLIOTECAS REQUERIDAS');
  sections.validations = extractSection(analysis, 'VALIDAÇÕES OBRIGATÓRIAS');
  sections.output = extractSection(analysis, 'ESTRUTURA DE SAÍDA');
  
  return sections;
};

const generateCodeGenerationDirectives = (analysis, sections, targetLanguage) => {
  console.log('Gerando diretrizes para geração de código');
  
  return `DIRETRIZES TÉCNICAS PARA GERAÇÃO DE CÓDIGO ${targetLanguage.toUpperCase()}

═══════════════════════════════════════════════════════════════
🎯 ANÁLISE COMPLETA DOS REQUISITOS:

${analysis}

═══════════════════════════════════════════════════════════════
🔧 INSTRUÇÕES PARA IMPLEMENTAÇÃO:

FUNCIONALIDADES A IMPLEMENTAR:
${sections.funcionalities}

ARQUITETURA OBRIGATÓRIA:
${sections.architecture}

PADRÕES DE CÓDIGO:
${sections.guidelines}

BIBLIOTECAS PERMITIDAS:
${sections.libraries}

VALIDAÇÕES REQUERIDAS:
${sections.validations}

FORMATO DE SAÍDA:
${sections.output}

═══════════════════════════════════════════════════════════════
⚠️ REGRAS DE IMPLEMENTAÇÃO OBRIGATÓRIAS:

1. ESTRUTURA: Siga rigorosamente a arquitetura proposta acima
2. NOMENCLATURA: Use exatamente as convenções definidas nas diretrizes
3. VALIDAÇÕES: Implemente todas as validações listadas como obrigatórias
4. SIMPLICIDADE: Foque apenas nas funcionalidades identificadas, sem extras
5. PADRÕES: Aplique todas as diretrizes de implementação definidas
6. BIBLIOTECAS: Use apenas as bibliotecas listadas como permitidas
7. SAÍDA: Formate a saída conforme especificado na estrutura

═══════════════════════════════════════════════════════════════
🚀 RESULTADO ESPERADO:

Código ${targetLanguage} executável, limpo e profissional que implementa exatamente as funcionalidades identificadas, seguindo rigorosamente todas as diretrizes técnicas estabelecidas nesta análise.`;
};

const saveAnalysisToS3 = async (directives, requestId) => {
  console.log('Salvando diretrizes de análise no S3');
  
  const s3Key = `analysis/${requestId}.txt`;
  const analysisData = {
    analyzedAt: new Date().toISOString(),
    requestId,
    directives: directives,
    directivesLength: directives.length,
    wordCount: directives.split(/\s+/).length
  };
  
  try {
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: JSON.stringify(analysisData, null, 2),
      ContentType: 'application/json',
      Metadata: {
        'request-id': requestId,
        'content-type': 'requirements-analysis',
        'analyzed-at': new Date().toISOString()
      }
    }));
    
    console.log(`Análise salva: s3://${BUCKET_NAME}/${s3Key}`);
    return s3Key;
    
  } catch (error) {
    console.error('Erro ao salvar análise no S3:', error);
    throw error;
  }
};

const getFileFromRequest = async (event) => {
  console.log('Processando arquivos da requisição');
  
  const files = [];
  
  //Formato atual (fileContent + fileName)
  if (event.fileContent && event.fileName) {
    const buffer = Buffer.from(event.fileContent, 'base64');
    const fileType = event.fileName.split('.').pop().toLowerCase();
    files.push({
      buffer, fileType, fileName: event.fileName, category: 'story'
    });
  }
  
  // Formato de array de files
  if (event.files && Array.isArray(event.files)) {
    for (const file of event.files) {
      const buffer = Buffer.from(file.content, 'base64');
      const fileType = file.name.split('.').pop().toLowerCase();
      files.push({
        buffer, fileType, fileName: file.name, 
        category: file.category || 'story'
      });
    }
  }
  
  // Arquivos do S3
  if (event.s3Bucket && event.s3Key) {
    const response = await s3.send(new GetObjectCommand({
      Bucket: event.s3Bucket,
      Key: event.s3Key
    }));
    
    const buffer = Buffer.from(await response.Body.transformToByteArray());
    const fileType = event.s3Key.split('.').pop().toLowerCase();
    files.push({
      buffer, fileType, fileName: event.s3Key, category: 'story'
    });
  }
  
  if (files.length === 0) {
    throw new Error('Nenhum arquivo encontrado na requisição');
  }
  
  return files;
};

const extractContextualInfo = (body) => {
  // Múltiplos campos de contexto
  return body.user_data?.context || 
         body.contexto || 
         body.contextualInfo || 
         body.user_data?.contextualInfo || 
         '';
};

export const handler = async (event) => {
  const requestId = event.requestId || `req_${Date.now()}`;
  console.log(`=== EXTRACT_CONTENT_DATA OTIMIZADO INICIADO ===`);
  console.log(`Request ID: ${requestId}`);
  
  try {
    const body = normalize(event);
    console.log('Evento processado:', JSON.stringify(body, null, 2));
    
    let userStoryContent = '';
    let contextualStandards = '';
    const targetLanguage = body.user_data?.language || 'python';
    
    // Processar arquivos se existirem
    if (body.fileContent || body.files || body.s3Bucket) {
      console.log('Arquivos detectados - iniciando extração');
      
      const files = await getFileFromRequest(body);
      
      for (const file of files) {
        console.log(`Processando arquivo: ${file.fileName} (${file.category})`);
        
        const rawText = await extractTextFromFile(file.buffer, file.fileType);
        const cleanedText = cleanAndStructureText(rawText);
        
        if (file.category === 'context') {
          contextualStandards += cleanedText + '\n\n';
        } else {
          userStoryContent += cleanedText + '\n\n';
        }
      }
    }
    
    // Usar texto direto se não há arquivos
    if (!userStoryContent && body.user_data?.user_history) {
      console.log('Usando texto direto da história do usuário');
      userStoryContent = body.user_data.user_history;
    }
    
    // Adicionar contexto de múltiplas fontes
    const additionalContext = extractContextualInfo(body);
    if (additionalContext) {
      contextualStandards += additionalContext;
    }
    
    if (!userStoryContent.trim()) {
      throw new Error('Nenhum conteúdo de história de usuário fornecido');
    }
    
    console.log(`História extraída: ${userStoryContent.length} caracteres`);
    console.log(`Contexto extraído: ${contextualStandards.length} caracteres`);
    
    //Análise com LLM para gerar diretrizes estruturadas
    console.log('Iniciando análise técnica com LLM...');
    const technicalAnalysis = await analyzeRequirementsWithBedrock(
      userStoryContent.trim(),
      contextualStandards.trim(),
      targetLanguage
    );
    
    // Extrair seções estruturadas da análise
    const structuredSections = extractStructuredRequirements(technicalAnalysis);
    
    // Gerar diretrizes finais para geração de código
    const codeGenerationDirectives = generateCodeGenerationDirectives(
      technicalAnalysis,
      structuredSections,
      targetLanguage
    );
    
    console.log(`Diretrizes geradas: ${codeGenerationDirectives.length} caracteres`);
    
    // Salvar análise no S3
    const s3AnalysisKey = await saveAnalysisToS3(codeGenerationDirectives, requestId);
    
    // Preparar resposta estruturada
    const response = {
      statuscode: 200,
      requestId,
      filename: body.filename,
      start_timestamp: body.start_timestamp,
      configuration: body.configuration,
      user_data: body.user_data,
      extracted_data: {
        content: codeGenerationDirectives,
        rawUserStory: userStoryContent,
        rawContext: contextualStandards,
        technicalAnalysis: technicalAnalysis,
        structuredSections: structuredSections,
        s3ContextKey: s3AnalysisKey,
        contentLength: codeGenerationDirectives.length,
        wordCount: codeGenerationDirectives.split(/\s+/).length,
        extractedAt: new Date().toISOString(),
        analysisType: 'technical-requirements-with-directives'
      }
    };
    
    console.log(`=== ANÁLISE TÉCNICA CONCLUÍDA COM SUCESSO ===`);
    console.log(`Diretrizes: ${codeGenerationDirectives.length} caracteres`);
    console.log(`Análise S3: ${s3AnalysisKey}`);
    console.log(`Linguagem: ${targetLanguage}`);
    
    return response;
    
  } catch (error) {
    console.error('=== ERRO NA ANÁLISE TÉCNICA ===');
    console.error('Erro:', error.message);
    console.error('Stack:', error.stack);
    
    return {
      statuscode: 500,
      requestId,
      filename: body?.filename,
      start_timestamp: body?.start_timestamp,
      configuration: body?.configuration,
      user_data: body?.user_data,
      error: {
        message: error.message,
        type: error.name,
        timestamp: new Date().toISOString()
      }
    };
  }
};