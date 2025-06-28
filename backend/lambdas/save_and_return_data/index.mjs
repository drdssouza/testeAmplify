import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client();
const BUCKET_NAME = process.env.RESULT_BUCKET || "pocdesktoptemp";

const normalize = (event) => {
  const parsed = typeof event === "string" ? JSON.parse(event) : event?.body ? 
    (typeof event.body === "string" ? JSON.parse(event.body) : event.body) : event;

  // Priorizar code_result > extract_result > evento principal
  const mainPayload = parsed?.code_result?.Payload ?? 
    parsed?.extract_result?.Payload ?? parsed;

  return { ...parsed, ...mainPayload };
};

const formatCodeForDisplay = (code) => {
  console.log('Formatando código para exibição');
  
  if (!code) return '';
  
  // Garantir quebras de linha corretas
  let formattedCode = code.replace(/\\n/g, '\n');
  
  // Remover linhas vazias excessivas (máximo 2 seguidas)
  formattedCode = formattedCode.replace(/\n{3,}/g, '\n\n');
  
  // Garantir espaçamento após imports
  formattedCode = formattedCode.replace(/(^import.*$|^from.*$)/gm, '$1\n');
  
  // Remover espaços em branco no final das linhas
  formattedCode = formattedCode.split('\n')
    .map(line => line.trimEnd())
    .join('\n');
  
  return formattedCode.trim();
};

const generateFinalResult = (processedData) => {
  console.log('Gerando resultado final estruturado');
  
  const {
    statuscode = 200,
    requestId,
    filename,
    start_timestamp,
    configuration = {},
    user_data = {},
    extracted_data = {},
    code_generated = {},
    error = null
  } = processedData;

  const executionTime = Date.now() - (start_timestamp || Date.now());

  return {
    statuscode,
    requestId,
    filename,
    executionTime,
    processedAt: new Date().toISOString(),
    
    // Dados de configuração
    configuration,
    
    // Dados do usuário
    user_data,
    
    // Dados extraídos
    extracted_data: {
      content: extracted_data.content || '',
      s3ContextKey: extracted_data.s3ContextKey || null,
      contentLength: extracted_data.contentLength || 0,
      input_tokens:extracted_data.input_tokens||0,
      output_tokens:extracted_data.output_tokens||0,
      wordCount: extracted_data.wordCount || 0,
      extractedAt: extracted_data.extractedAt || null
    },
    
    // Código gerado
    code_generated: {
      language: code_generated.language || 'python',
      code: code_generated.code || '',
      s3CodeKey: code_generated.s3CodeKey || null,
      codeLength: code_generated.codeLength || 0,
      linesOfCode: code_generated.linesOfCode || 0,
      input_tokens:code_generated.input_tokens||0,
      output_tokens:code_generated.output_tokens||0,
      generatedAt: code_generated.generatedAt || null
    },
    
    // Estatísticas do processamento
    stats: {
      totalExecutionTime: executionTime,
      extractionSuccess: !!extracted_data.content,
      codeGenerationSuccess: !!code_generated.code,
      s3ContextSaved: !!extracted_data.s3ContextKey,
      s3CodeSaved: !!code_generated.s3CodeKey
    },
    
    // Erro se houver
    error
  };
};

const saveResultToS3 = async (filename, result) => {
  console.log(`Salvando resultado final no S3: ${filename}`);
  
  try {
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: filename,
      Body: JSON.stringify(result, null, 2),
      ContentType: "application/json",
      Metadata: {
        'request-id': result.requestId || 'unknown',
        'status-code': result.statuscode.toString(),
        'processed-at': result.processedAt,
        'execution-time': result.executionTime.toString(),
        'language': result.code_generated.language || 'unknown'
      }
    }));
    
    console.log(`Resultado salvo com sucesso: s3://${BUCKET_NAME}/${filename}`);
    return filename;
    
  } catch (error) {
    console.error('Erro ao salvar resultado no S3:', error);
    throw error;
  }
};

const generateDownloadUrls = async (result) => {
  console.log('Gerando URLs de download para recursos');
  
  const urls = {};
  
  try {
    // URL para o código gerado (se existir)
    if (result.code_generated.s3CodeKey) {
      urls.codeDownloadUrl = await getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: result.code_generated.s3CodeKey
        }),
        { expiresIn: 3600 } // 1 hora
      );
      console.log(`URL de código gerada: ${urls.codeDownloadUrl}`);
    }
    
    // URL para o contexto extraído (se existir)
    if (result.extracted_data.s3ContextKey) {
      urls.contextDownloadUrl = await getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: result.extracted_data.s3ContextKey
        }),
        { expiresIn: 3600 } // 1 hora
      );
      console.log(`URL de contexto gerada: ${urls.contextDownloadUrl}`);
    }
    
    return urls;
    
  } catch (error) {
    console.warn('Erro ao gerar URLs de download:', error.message);
    return {};
  }
};

const validateResult = (result) => {
  console.log('Validando resultado final');
  
  const issues = [];
  
  // Verificar se há código gerado
  if (!result.code_generated.code) {
    issues.push('Nenhum código foi gerado');
  }
  
  // Verificar se extração foi bem-sucedida
  if (!result.extracted_data.content) {
    issues.push('Nenhum conteúdo foi extraído');
  }
  
  // Verificar se houve erro
  if (result.error) {
    issues.push(`Erro durante processamento: ${result.error.message}`);
  }
  
  // Verificar se statuscode indica sucesso
  if (result.statuscode !== 200) {
    issues.push(`Status code não indica sucesso: ${result.statuscode}`);
  }
  
  if (issues.length > 0) {
    console.warn('Problemas encontrados na validação:', issues);
    result.validationIssues = issues;
  } else {
    console.log('✓ Validação concluída sem problemas');
  }
  
  return result;
};

export const handler = async (event) => {
  const requestId = event.requestId || `req_${Date.now()}`;
  console.log(`=== SAVE_AND_RETURN_DATA INICIADO ===`);
  console.log(`Request ID: ${requestId}`);
  
  try {
    // Normalizar evento
    const body = normalize(event);
    console.log('Evento normalizado:', JSON.stringify(body, null, 2));
    
    // Gerar resultado estruturado
    const result = generateFinalResult(body);
    
    // Validar resultado
    const validatedResult = validateResult(result);
    
    // Salvar resultado no S3
    const filename = body.filename || `result_${requestId}.json`;
    await saveResultToS3(filename, validatedResult);
    
    // Gerar URLs de download
    const downloadUrls = await generateDownloadUrls(validatedResult);
    
    // Preparar resposta final
    const finalResponse = {
      ...validatedResult,
      downloadUrls,
      s3Location: `s3://${BUCKET_NAME}/${filename}`,
      
      // Informações para o front-end
      frontendData: {
        success: validatedResult.statuscode === 200 && !validatedResult.error,
        code: validatedResult.code_generated.code.replace(/\\n/g, '\n'), // Garantir quebras de linha
        language: validatedResult.code_generated.language,
        executionTime: validatedResult.executionTime,
        codeLength: validatedResult.code_generated.codeLength,
        linesOfCode: validatedResult.code_generated.linesOfCode,
        extractedContentLength: validatedResult.extracted_data.contentLength,
        issues: validatedResult.validationIssues || [],
        // Dados extras para visualização
        formattedCode: formatCodeForDisplay(validatedResult.code_generated.code),
        codeStats: {
          classes: (validatedResult.code_generated.code.match(/class\s+\w+/g) || []).length,
          functions: (validatedResult.code_generated.code.match(/def\s+\w+/g) || []).length,
          imports: (validatedResult.code_generated.code.match(/^(import|from)\s+/gm) || []).length
        }
      }
    };
    
    console.log(`=== PROCESSAMENTO CONCLUÍDO ===`);
    console.log(`Status: ${finalResponse.statuscode}`);
    console.log(`Código: ${finalResponse.code_generated.codeLength} caracteres`);
    console.log(`Execução: ${finalResponse.executionTime}ms`);
    console.log(`Arquivo salvo: ${filename}`);
    
    return finalResponse;
    
  } catch (error) {
    console.error('=== ERRO NO SAVE_AND_RETURN ===');
    console.error('Erro:', error.message);
    console.error('Stack:', error.stack);
    
    const errorResult = {
      statuscode: 500,
      requestId,
      filename: body?.filename || `error_${requestId}.json`,
      executionTime: Date.now() - (body?.start_timestamp || Date.now()),
      processedAt: new Date().toISOString(),
      error: {
        message: error.message,
        type: error.name,
        timestamp: new Date().toISOString()
      },
      frontendData: {
        success: false,
        code: '',
        language: 'python',
        executionTime: 0,
        issues: [`Erro interno: ${error.message}`]
      }
    };
    
    try {
      // Tentar salvar erro no S3
      await saveResultToS3(errorResult.filename, errorResult);
    } catch (s3Error) {
      console.error('Erro ao salvar erro no S3:', s3Error.message);
    }
    
    return errorResult;
  }
};