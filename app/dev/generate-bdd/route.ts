// app/api/dev/generate-bdd/route.ts - API BDD para versão DEV
import { NextRequest, NextResponse } from 'next/server';
import { StepLLMSelections, mapLLMToBedrockModel } from '../../types/llm-types';

interface GenerateBDDDevRequest {
  generatedCode: string;
  language: 'python' | 'java';
  llmSelections: StepLLMSelections;
  requestId: string;
}

interface GenerateBDDDevResponse {
  success: boolean;
  requestId: string;
  presignedUrl: string;
  modelUsed: {
    family: string;
    model: string;
    bedrockId: string;
  };
  debugInfo: {
    codeLength: number;
    language: string;
    timestamp: string;
    environment: string;
    apiGateway: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateBDDDevRequest = await request.json();
    const { generatedCode, language, llmSelections, requestId } = body;

    // Validação básica
    if (!generatedCode || !language || !requestId || !llmSelections) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: generatedCode, language, requestId, llmSelections' },
        { status: 400 }
      );
    }

    if (!['python', 'java'].includes(language)) {
      return NextResponse.json(
        { error: 'Linguagem deve ser python ou java' },
        { status: 400 }
      );
    }

    // Validar se seleção BDD está presente
    if (!llmSelections.generateBDD) {
      return NextResponse.json(
        { error: 'Seleção de LLM para BDD é obrigatória' },
        { status: 400 }
      );
    }

    console.log('🔧 DEV API - Generate BDD Request:', {
      codeLength: generatedCode.length,
      language,
      bddModel: llmSelections.generateBDD,
      requestId
    });

    // Mapear modelo BDD para AWS Bedrock ID
    const bddModelConfig = {
      family: llmSelections.generateBDD.family,
      model: llmSelections.generateBDD.model,
      bedrockId: mapLLMToBedrockModel(llmSelections.generateBDD.family, llmSelections.generateBDD.model)
    };

    // Payload para Step Functions DEV BDD
    const stepFunctionPayload = {
      generatedCode,
      language,
      requestId,
      timestamp: new Date().toISOString(),
      source: 'dev',
      
      // Modelo específico selecionado para BDD
      bddModel: bddModelConfig
    };

    // Simular chamada para AWS API Gateway DEV BDD
    // const response = await fetch(process.env.DEV_BDD_API_GATEWAY_URL, {
    //   method: 'POST',
    //   headers: { 
    //     'Content-Type': 'application/json',
    //     'X-Dev-Mode': 'true'
    //   },
    //   body: JSON.stringify(stepFunctionPayload)
    // });

    console.log('🧪 Sending to DEV BDD Step Functions:', {
      ...stepFunctionPayload,
      generatedCode: `${generatedCode.substring(0, 100)}...`
    });

    // Simular resposta com presigned URL DEV
    const presignedUrl = `https://temp-storage-dev-bdd.s3.amazonaws.com/${requestId}/bdd-tests.feature`;

    const response: GenerateBDDDevResponse = {
      success: true,
      requestId,
      presignedUrl,
      modelUsed: bddModelConfig,
      debugInfo: {
        codeLength: generatedCode.length,
        language,
        timestamp: new Date().toISOString(),
        environment: 'development',
        apiGateway: 'DEV_BDD_API_GATEWAY'
      }
    };

    console.log('✅ DEV BDD Response sent:', {
      requestId,
      presignedUrl,
      modelUsed: `${bddModelConfig.family} ${bddModelConfig.model}`
    });

    return NextResponse.json(response);

  } catch (error) {
    console.error('❌ DEV BDD API Error:', error);
    return NextResponse.json(
      { 
        error: 'Erro interno do servidor',
        details: error instanceof Error ? error.message : 'Erro desconhecido'
      },
      { status: 500 }
    );
  }
}