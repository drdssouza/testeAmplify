import { callBedrock } from '/opt/nodejs/index.js';
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client();
const BUCKET_NAME = "pocdesktoptemp";

const normalize = (event) => {
  if (typeof event === 'string') return JSON.parse(event);
  if (event?.body) return typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  return event;
};

const getDirectivesFromS3 = async (s3ContextKey) => {
  console.log(`Recuperando diretrizes técnicas do S3: ${s3ContextKey}`);
  
  try {
    const response = await s3.send(new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3ContextKey
    }));
    
    const directivesData = JSON.parse(await response.Body.transformToString());
    console.log(`Diretrizes recuperadas: ${directivesData.directives.length} caracteres`);
    
    return directivesData.directives;
    
  } catch (error) {
    console.error('Erro ao recuperar diretrizes do S3:', error);
    throw error;
  }
};

const buildImplementationPrompt = (technicalDirectives, targetLanguage) => {
  console.log('Construindo prompt de implementação baseado em diretrizes');
  
  return `Você é um Desenvolvedor ${targetLanguage.toUpperCase()} Senior especializado em implementação de código limpo e profissional.

MISSÃO: Implementar código ${targetLanguage.toUpperCase()} seguindo rigorosamente as diretrizes técnicas fornecidas abaixo.

═══════════════════════════════════════════════════════════════

${technicalDirectives}

═══════════════════════════════════════════════════════════════

🚀 INSTRUÇÕES DE IMPLEMENTAÇÃO:

1. **CONFORMIDADE TOTAL**: Siga EXATAMENTE todas as diretrizes técnicas estabelecidas acima
2. **ESTRUTURA**: Implemente a arquitetura proposta sem desvios
3. **NOMENCLATURA**: Use precisamente as convenções de nomenclatura definidas
4. **VALIDAÇÕES**: Inclua todas as validações obrigatórias especificadas
5. **BIBLIOTECAS**: Use apenas as bibliotecas listadas como permitidas
6. **FUNCIONALIDADES**: Implemente apenas as funcionalidades identificadas
7. **PADRÕES**: Aplique todos os padrões de código estabelecidos
8. **SAÍDA**: Formate a saída conforme a estrutura definida

═══════════════════════════════════════════════════════════════

⚠️ REGRAS CRÍTICAS:

- Gere APENAS código ${targetLanguage.toUpperCase()} executável
- Não adicione funcionalidades extras não especificadas
- Mantenha foco absoluto nas diretrizes fornecidas
- Use type hints e docstrings seguindo PEP 8 (para Python)
- Implemente tratamento de erros conforme especificado
- Código deve ser autocontido e executável
- Não inclua explicações fora do código

═══════════════════════════════════════════════════════════════

🎯 RESULTADO ESPERADO:

Código ${targetLanguage.toUpperCase()} limpo, executável e profissional que implementa exatamente o que foi solicitado nas diretrizes técnicas, sem adições ou modificações não autorizadas.

Implemente o código agora:`;
};

const generateCodeWithBedrock = async (prompt) => {
  console.log('Gerando código com Amazon Nova Pro baseado em diretrizes');
  
  try {
            const bedrockResp = await callBedrock({
      modelId: 'amazon.nova-pro-v1:0',
      userPrompt: prompt,
      maxTokens: 4000,
      temperature: 0.1
    });

    console.log(`Código gerado: ${bedrockResp.response.message.length} caracteres`);
    return bedrockResp;
    
  } catch (error) {
    console.error('Erro ao gerar código com Bedrock:', error);
    throw error;
  }
};

const cleanGeneratedCode = (rawCode) => {
  console.log('Limpando código gerado');
  
  // Remover markdown
  let cleanCode = rawCode.replace(/^```python\n?/, '').replace(/\n?```$/, '');
  
  // Remover explicações após o código
  const lines = cleanCode.split('\n');
  const codeLines = [];
  let inCodeBlock = true;
  
  for (const line of lines) {
    // Parar se encontrar explicações após o código
    if (line.match(/^###?\s+(Explicação|Como usar|Observações|Resultado)/i) && inCodeBlock) {
      inCodeBlock = false;
      break;
    }
    
    // Pular linhas vazias no início
    if (codeLines.length === 0 && line.trim() === '') {
      continue;
    }
    
    if (inCodeBlock) {
      codeLines.push(line);
    }
  }
  
  let finalCode = codeLines.join('\n').trim();
  
  // Corrigir problemas comuns de formatação
  finalCode = finalCode
    .replace(/\*\*(__\w+__)\*\*/g, '$1') // __init__ etc
    .replace(/\\\*/g, '*')
    .replace(/\\\\/g, '\\');
  
  // Garantir indentação consistente (4 espaços)
  const indentedLines = finalCode.split('\n').map(line => {
    if (line.trim() === '') return '';
    
    // Contar nível de indentação atual
    const leadingSpaces = line.match(/^(\s*)/)[1].length;
    const indentLevel = Math.floor(leadingSpaces / 4);
    
    // Recriar indentação com 4 espaços por nível
    return '    '.repeat(indentLevel) + line.trim();
  });
  
  return indentedLines.join('\n');
};

const validateGeneratedCode = (code, directives) => {
  console.log('Validando código gerado contra diretrizes');
  
  const issues = [];
  
  // Verificações básicas
  if (!code || code.trim().length === 0) {
    issues.push('Código vazio gerado');
    return issues;
  }
  
  // Verificar se contém estruturas Python básicas
  if (!code.includes('def ') && !code.includes('class ') && code.split('\n').length < 3) {
    issues.push('Código parece muito simples ou incompleto');
  }
  
  // Verificar indentação Python
  const lines = code.split('\n').filter(line => line.trim().length > 0);
  const hasIndentationIssues = lines.some(line => {
    const leadingSpaces = line.match(/^(\s*)/)[1].length;
    return leadingSpaces % 4 !== 0 && line.trim() !== line; // Deve ser múltiplo de 4
  });
  
  if (hasIndentationIssues) {
    issues.push('Problemas de indentação detectados');
  }
  
  // Verificar se parece ser código executável
  const pythonKeywords = ['def', 'class', 'if', 'for', 'while', 'import', 'from'];
  const hasPythonKeywords = pythonKeywords.some(keyword => code.includes(keyword));
  
  if (!hasPythonKeywords) {
    issues.push('Código não parece conter estruturas Python válidas');
  }
  
  if (issues.length > 0) {
    console.warn('Problemas encontrados na validação:', issues);
  } else {
    console.log('✓ Código validado com sucesso');
  }
  
  return issues;
};

const saveCodeToS3 = async (code, requestId) => {
  console.log('Salvando código Python no S3');
  
  const s3Key = `generated-code/${requestId}.py`;
  
  try {
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: code,
      ContentType: 'text/plain',
      Metadata: {
        'request-id': requestId,
        'language': 'python',
        'generated-at': new Date().toISOString(),
        'code-length': code.length.toString(),
        'generation-method': 'directives-based'
      }
    }));
    
    console.log(`Código salvo: s3://${BUCKET_NAME}/${s3Key}`);
    return s3Key;
    
  } catch (error) {
    console.error('Erro ao salvar código no S3:', error);
    throw error;
  }
};

export const handler = async (event) => {
  const requestId = event.requestId || `req_${Date.now()}`;
  console.log(`=== GENERATE_PYTHON_CODE OTIMIZADO INICIADO ===`);
  console.log(`Request ID: ${requestId}`);
  
  let body;
  
  try {
    body = normalize(event);
    console.log('Evento processado:', JSON.stringify(body, null, 2));
    
    // Recuperar diretrizes técnicas do S3
    const s3ContextKey = body.extracted_data?.s3ContextKey;
    if (!s3ContextKey) {
      throw new Error('Chave das diretrizes técnicas S3 não encontrada');
    }
    
    console.log(`Recuperando diretrizes: ${s3ContextKey}`);
    const technicalDirectives = await getDirectivesFromS3(s3ContextKey);
    
    // Verificar linguagem alvo
    const targetLanguage = body.user_data?.language || 'python';
    if (targetLanguage !== 'python') {
      throw new Error(`Esta lambda é específica para Python. Linguagem solicitada: ${targetLanguage}`);
    }
    
    // Construir prompt de implementação baseado nas diretrizes
    const implementationPrompt = buildImplementationPrompt(technicalDirectives, targetLanguage);
    
    // Gerar código com Bedrock
    console.log('Iniciando geração de código baseada em diretrizes...');
    const rawCode = await generateCodeWithBedrock(implementationPrompt);
    
    // Limpar e estruturar código
    const cleanCode = cleanGeneratedCode(rawCode.response.message);
    
    // Validar código gerado
    const validationIssues = validateGeneratedCode(cleanCode, technicalDirectives);
    
    // Salvar código no S3
    const s3CodeKey = await saveCodeToS3(cleanCode, requestId);
    
    // Preparar resposta
    const response = {
      statuscode: 200,
      requestId,
      filename: body.filename,
      start_timestamp: body.start_timestamp,
      configuration: body.configuration,
      user_data: body.user_data,
      extracted_data: body.extracted_data,
      code_generated: {
        language: 'python',
        code: cleanCode,
        s3CodeKey,
        codeLength: cleanCode.length,
        linesOfCode: cleanCode.split('\n').length,
        input_tokens:rawCode.response.input_tokens,
        output_tokens:rawCode.response.output_tokens,
        generatedAt: new Date().toISOString(),
        validationIssues: validationIssues,
        generationMethod: 'technical-directives-based',
        directivesUsed: s3ContextKey
      }
    };
    
    console.log(`=== GERAÇÃO DE CÓDIGO CONCLUÍDA ===`);
    console.log(`Código: ${cleanCode.length} caracteres`);
    console.log(`Linhas: ${cleanCode.split('\n').length}`);
    console.log(`Validação: ${validationIssues.length} problemas`);
    console.log(`S3 Key: ${s3CodeKey}`);
    
    return response;
    
  } catch (error) {
    console.error('=== ERRO NA GERAÇÃO DE CÓDIGO ===');
    console.error('Erro:', error.message);
    console.error('Stack:', error.stack);
    
    return {
      statuscode: 500,
      requestId,
      filename: body?.filename,
      start_timestamp: body?.start_timestamp,
      configuration: body?.configuration,
      user_data: body?.user_data,
      extracted_data: body?.extracted_data,
      error: {
        message: error.message,
        type: error.name,
        timestamp: new Date().toISOString()
      }
    };
  }
};