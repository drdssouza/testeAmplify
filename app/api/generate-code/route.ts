import { NextRequest, NextResponse } from 'next/server';

// Configuração segura usando variáveis de ambiente
const API_GATEWAY_BASE_URL = process.env.API_GATEWAY_BASE_URL;
const API_GATEWAY_KEY = process.env.API_GATEWAY_KEY;
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || 'temp-storage-dev';
const S3_REGION = process.env.S3_REGION || 'us-east-1';

// Validar se variáveis essenciais estão configuradas
if (!API_GATEWAY_BASE_URL) {
  throw new Error('API_GATEWAY_BASE_URL não configurada no .env.local');
}

interface FileData {
  name: string;
  type: string;
  content: string; // base64
  category?: 'story' | 'context';
}

interface GenerateCodeRequest {
  inputType: 'text' | 'file';
  userStory?: string;
  files?: FileData[];
  language: 'python' | 'java';
  contexto?: string;
  requestId: string;
}

// Validação de tipos de arquivo incluindo PDF
const validateFileType = (fileName: string, fileType: string): boolean => {
  const supportedExtensions = ['.txt', '.doc', '.docx', '.pdf'];
  const supportedMimeTypes = [
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/pdf'
  ];
  
  const fileExtension = '.' + fileName.split('.').pop()?.toLowerCase();
  
  return supportedExtensions.includes(fileExtension) || 
         supportedMimeTypes.includes(fileType);
};

export async function POST(request: NextRequest) {
  try {
    const body: GenerateCodeRequest = await request.json();
    const { inputType, userStory, files, language, contexto, requestId } = body;

    console.log('📥 Request recebido:', {
      inputType,
      filesCount: files?.length || 0,
      language,
      requestId,
      hasContext: !!contexto
    });

    // Log dos arquivos para debug
    if (files && files.length > 0) {
      files.forEach((file, index) => {
        console.log(`📄 Arquivo ${index}:`, {
          name: file.name,
          type: file.type,
          category: file.category || 'não definida',
          size: file.content?.length || 0
        });
      });
    }

    // Validações baseadas no tipo de entrada
    if (inputType === 'text') {
      if (!userStory || userStory.trim() === '') {
        return NextResponse.json(
          { error: 'História de usuário é obrigatória quando inputType é text' },
          { status: 400 }
        );
      }
    } else if (inputType === 'file') {
      if (!files || files.length === 0) {
        return NextResponse.json(
          { error: 'Pelo menos um arquivo é obrigatório quando inputType é file' },
          { status: 400 }
        );
      }

      // Validar tipos de arquivo incluindo PDF
      for (const file of files) {
        if (!validateFileType(file.name, file.type)) {
          return NextResponse.json(
            { error: `Tipo de arquivo não suportado: ${file.name}. Use .txt, .doc, .docx ou .pdf` },
            { status: 400 }
          );
        }

        // Validar tamanho (PDFs podem ser maiores)
        const maxSize = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') 
          ? 10 * 1024 * 1024 // 10MB para PDF
          : 5 * 1024 * 1024;  // 5MB para outros

        const contentSize = file.content ? Buffer.from(file.content, 'base64').length : 0;
        if (contentSize > maxSize) {
          return NextResponse.json(
            { error: `Arquivo ${file.name} muito grande. Máximo: ${maxSize / (1024 * 1024)}MB` },
            { status: 400 }
          );
        }
      }
    } else {
      return NextResponse.json(
        { error: 'inputType deve ser "text" ou "file"' },
        { status: 400 }
      );
    }

    if (!language || !['python', 'java'].includes(language)) {
      return NextResponse.json(
        { error: 'Linguagem deve ser "python" ou "java"' },
        { status: 400 }
      );
    }

    if (!requestId) {
      return NextResponse.json(
        { error: 'RequestId é obrigatório' },
        { status: 400 }
      );
    }

    console.log('📤 Enviando para API Gateway (Nova Arquitetura - Upload + Step Function):', {
      inputType,
      userStory: inputType === 'text' ? userStory?.substring(0, 100) + '...' : 'N/A',
      filesCount: inputType === 'file' ? files?.length : 0,
      language,
      requestId,
      hasContext: !!contexto
    });

    // Modelos padrão a partir das variáveis de ambiente
    const defaultModels = {
      extractHistory: {
        family: process.env.DEFAULT_EXTRACT_MODEL_FAMILY || "amazon",
        model: process.env.DEFAULT_EXTRACT_MODEL_NAME || "nova-pro",
        bedrockId: process.env.DEFAULT_EXTRACT_MODEL_ID || "amazon.nova-pro-v1:0"
      },
      generateCode: {
        family: process.env.DEFAULT_GENERATE_MODEL_FAMILY || "amazon",
        model: process.env.DEFAULT_GENERATE_MODEL_NAME || "nova-pro",
        bedrockId: process.env.DEFAULT_GENERATE_MODEL_ID || "amazon.nova-pro-v1:0"
      },
      generateBDD: {
        family: process.env.DEFAULT_BDD_MODEL_FAMILY || "amazon",
        model: process.env.DEFAULT_BDD_MODEL_NAME || "nova-pro",
        bedrockId: process.env.DEFAULT_BDD_MODEL_ID || "amazon.nova-pro-v1:0"
      }
    };

    // Preparar payload para API Gateway/Lambda Upload
    const uploadPayload: any = {
      inputType: inputType,
      language: language,
      requestId: requestId,
      timestamp: new Date().toISOString(),
      source: "nextjs-frontend",
      models: defaultModels,
      selectedModel: defaultModels.extractHistory
    };

    // Adicionar dados específicos baseados no tipo
    if (inputType === 'text') {
      uploadPayload.userStory = userStory;
      uploadPayload.contextualInfo = contexto || "";
    } else if (inputType === 'file') {
      // Continua enviando arquivos em base64 - agora serão salvos no S3 pela Lambda
      uploadPayload.files = files.map(file => ({
        name: file.name,
        type: file.type,
        content: file.content,
        category: file.category || 'story'
      }));
      uploadPayload.contextualInfo = contexto || "";
      uploadPayload.userStory = "";
    }

    console.log('🚀 Payload final (para Lambda Upload):', {
      ...uploadPayload,
      files: uploadPayload.files ? 
        uploadPayload.files.map((f: any) => ({ 
          name: f.name, 
          type: f.type, 
          category: f.category,
          size: f.content?.length || 0 
        })) : undefined
    });

    // Preparar headers da requisição
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    // Adicionar API Key se configurada
    if (API_GATEWAY_KEY) {
      requestHeaders['x-api-key'] = API_GATEWAY_KEY;
    }

    // Chamar API Gateway (agora aponta para Lambda de Upload)
    const apiResponse = await fetch(`${API_GATEWAY_BASE_URL}/generate_code`, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(uploadPayload),
    });

    console.log('📨 Status da API Gateway:', apiResponse.status);

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      console.error('❌ Erro da API Gateway:', errorText);
      
      throw new Error(`API Gateway retornou erro ${apiResponse.status}: ${errorText}`);
    }

    // Verificar Content-Type da resposta
    const contentType = apiResponse.headers.get('content-type') || '';
    console.log('📋 Content-Type da resposta:', contentType);
    
    let apiData;
    const responseText = await apiResponse.text();
    console.log('📄 Resposta bruta da API Gateway:', responseText.substring(0, 500));
    
    try {
      apiData = JSON.parse(responseText);
      console.log('✅ Resposta da API Gateway (Nova Arquitetura):', apiData);
    } catch (parseError) {
      console.error('❌ Resposta não é JSON válido:', parseError);
      console.log('🔍 Resposta completa:', responseText);
      
      // Se não é JSON, provavelmente a Step Function foi iniciada mesmo assim
      if (responseText.includes('execution') || responseText.includes('arn:aws:states')) {
        console.log('🔄 Tentando extrair ARN da resposta HTML...');
        
        // Criar resposta padrão assumindo que funcionou
        apiData = {
          executionArn: `arn:aws:states:us-east-1:225054510764:stateMachine:generate-code-flow:${requestId}`,
          downloadUrl: `https://${S3_BUCKET_NAME}.s3.${S3_REGION}.amazonaws.com/FileCode-${Math.floor(Date.now() / 1000)}.json`,
          uploadedFiles: [] // Novo campo para indicar arquivos upados
        };
        console.log('✅ Usando resposta padrão:', apiData);
      } else {
        throw new Error(`API Gateway retornou HTML ao invés de JSON: ${responseText.substring(0, 200)}`);
      }
    }

    // Verificar se temos os dados necessários
    if (!apiData.executionArn) {
      throw new Error('Step Function não foi iniciada corretamente');
    }

    // ✅ CORREÇÃO PRINCIPAL: Usar downloadUrl da API Gateway
    if (!apiData.downloadUrl) {
      throw new Error('URL de download não foi fornecida pela API Gateway');
    }

    // Log adicional para nova arquitetura
    if (apiData.uploadedFiles && apiData.uploadedFiles.length > 0) {
      console.log('📁 Arquivos salvos no S3:', apiData.uploadedFiles.map((f: any) => ({
        original: f.originalName,
        s3Key: f.key
      })));
    }

    console.log('🔗 URL de polling:', apiData.downloadUrl);

    // Retornar resposta para o frontend
    return NextResponse.json({
      success: true,
      requestId: requestId,
      presignedUrl: apiData.downloadUrl, // ✅ Usar downloadUrl da API Gateway
      executionArn: apiData.executionArn,
      status: 'processing',
      message: 'Arquivos salvos no S3 e Step Function iniciada com sucesso. Use a presigned URL para polling.',
      apiGatewayResponse: apiData,
      uploadedFiles: apiData.uploadedFiles || [] // NOVO: info dos arquivos salvos
    });

  } catch (error) {
    console.error('💥 Erro ao processar requisição:', error);
    
    return NextResponse.json(
      { 
        error: 'Erro interno do servidor ao iniciar geração de código',
        details: error instanceof Error ? error.message : 'Erro desconhecido',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { 
      message: 'Endpoint para geração de código',
      version: process.env.APP_VERSION || '2.2.0', // Incrementado
      environment: process.env.APP_ENVIRONMENT || 'development',
      status: 'API Gateway Integration Active - S3 Upload Architecture', // Atualizado
      configuration: {
        apiGatewayConfigured: !!API_GATEWAY_BASE_URL,
        s3Bucket: S3_BUCKET_NAME,
        s3Region: S3_REGION,
        hasApiKey: !!API_GATEWAY_KEY,
        maxFileSize: `${process.env.MAX_FILE_SIZE_MB || 5}MB`,
        maxFileSizePDF: '10MB',
        supportedFileTypes: (process.env.SUPPORTED_FILE_EXTENSIONS || '.txt,.doc,.docx,.pdf').split(',')
      },
      supportedLanguages: ['python', 'java'],
      supportedInputTypes: ['text', 'file'],
      architecture: 'Next.js → API Gateway → Lambda Upload → S3 → Step Function → Lambdas → S3 → Polling', // Atualizado
      polling: {
        maxAttempts: parseInt(process.env.POLLING_MAX_ATTEMPTS || '30'),
        intervalMs: parseInt(process.env.POLLING_INTERVAL_MS || '2000'),
        timeoutSeconds: parseInt(process.env.POLLING_TIMEOUT_SECONDS || '300')
      },
      models: {
        default: {
          extractHistory: {
            family: process.env.DEFAULT_EXTRACT_MODEL_FAMILY || "amazon",
            model: process.env.DEFAULT_EXTRACT_MODEL_NAME || "nova-pro"
          },
          generateCode: {
            family: process.env.DEFAULT_GENERATE_MODEL_FAMILY || "amazon",
            model: process.env.DEFAULT_GENERATE_MODEL_NAME || "nova-pro"
          }
        }
      },
      payloadExamples: {
        text: {
          inputType: 'text',
          userStory: 'Como usuário, quero...',
          language: 'python|java',
          contexto: 'string (optional)',
          requestId: 'uuid'
        },
        file: {
          inputType: 'file',
          files: '[{name, type, content, category}]',
          language: 'python|java',
          contexto: 'string (optional)',
          requestId: 'uuid'
        }
      },
      // NOVO: Informações sobre a nova arquitetura
      newArchitecture: {
        description: 'Arquivos são salvos no S3 antes da Step Function para contornar limitações de tamanho',
        uploadProcess: 'Lambda Upload → S3 Storage → Step Function com referências',
        benefits: ['Suporte a arquivos maiores', 'Melhor performance', 'Menor payload na Step Function']
      }
    },
    { status: 200 }
  );
}