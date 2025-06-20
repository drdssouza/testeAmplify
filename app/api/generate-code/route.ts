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
}

interface GenerateCodeRequest {
  inputType: 'text' | 'file';
  userStory?: string;
  files?: FileData[];
  language: 'python' | 'java';
  contexto?: string;
  requestId: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateCodeRequest = await request.json();
    const { inputType, userStory, files, language, contexto, requestId } = body;

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

    console.log('📤 Enviando para API Gateway:', {
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

    // Preparar payload para API Gateway/Step Function
    const stepFunctionPayload: any = {
      inputType: inputType,
      language: language,
      requestId: requestId,
      timestamp: new Date().toISOString(),
      source: "nextjs-frontend",
      models: defaultModels
    };

    // Adicionar dados específicos baseados no tipo
    if (inputType === 'text') {
      stepFunctionPayload.userStory = userStory;
      stepFunctionPayload.contextualInfo = contexto || "";
    } else if (inputType === 'file') {
      stepFunctionPayload.files = files;
      stepFunctionPayload.contextualInfo = contexto || "";
      stepFunctionPayload.userStory = ""; // Vazio quando usando arquivos
    }

    // Preparar headers da requisição
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    // Adicionar API Key se configurada
    if (API_GATEWAY_KEY) {
      requestHeaders['x-api-key'] = API_GATEWAY_KEY;
    }

    // Chamar API Gateway
    const apiResponse = await fetch(`${API_GATEWAY_BASE_URL}/generate-code`, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(stepFunctionPayload),
    });

    console.log('📨 Status da API Gateway:', apiResponse.status);

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      console.error('❌ Erro da API Gateway:', errorText);
      
      throw new Error(`API Gateway retornou erro ${apiResponse.status}: ${errorText}`);
    }

    const apiData = await apiResponse.json();
    console.log('✅ Resposta da API Gateway:', apiData);

    // A API Gateway deve retornar algo como:
    // { executionArn: "...", startDate: "...", status: "STARTED" }
    
    if (!apiData.executionArn) {
      throw new Error('Step Function não foi iniciada corretamente');
    }

    // Gerar URL presignada para polling (baseada no padrão esperado)
    const presignedUrl = `https://${S3_BUCKET_NAME}.s3.${S3_REGION}.amazonaws.com/${requestId}/generated-code.${language}`;

    // Retornar resposta para o frontend
    return NextResponse.json({
      success: true,
      requestId: requestId,
      presignedUrl: presignedUrl,
      executionArn: apiData.executionArn,
      status: 'processing',
      message: 'Step Function iniciada com sucesso. Use a presigned URL para polling.',
      apiGatewayResponse: apiData
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
      version: process.env.APP_VERSION || '2.1.0',
      environment: process.env.APP_ENVIRONMENT || 'development',
      status: 'API Gateway Integration Active',
      configuration: {
        apiGatewayConfigured: !!API_GATEWAY_BASE_URL,
        s3Bucket: S3_BUCKET_NAME,
        s3Region: S3_REGION,
        hasApiKey: !!API_GATEWAY_KEY,
        maxFileSize: `${process.env.MAX_FILE_SIZE_MB || 5}MB`,
        supportedFileTypes: (process.env.SUPPORTED_FILE_EXTENSIONS || '.txt,.doc,.docx,.pdf').split(',')
      },
      supportedLanguages: ['python', 'java'],
      supportedInputTypes: ['text', 'file'],
      architecture: 'Next.js → API Gateway → Step Function → Lambdas → S3 → Polling',
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
          files: '[{name, type, content}]',
          language: 'python|java',
          contexto: 'string (optional)',
          requestId: 'uuid'
        }
      }
    },
    { status: 200 }
  );
}