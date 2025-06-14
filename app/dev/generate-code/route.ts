// app/api/dev/generate-code/route.ts - API para versão DEV
import { NextRequest, NextResponse } from 'next/server';
import { StepLLMSelections, mapLLMToBedrockModel } from '../../types/llm-types';

interface GenerateCodeDevRequest {
  userStory: string;
  language: 'python' | 'java';
  llmSelections: StepLLMSelections;
  requestId: string;
}

interface GenerateCodeDevResponse {
  success: boolean;
  requestId: string;
  presignedUrl: string;
  selectedModels: {
    extractHistory: {
      family: string;
      model: string;
      bedrockId: string;
    };
    generateCode: {
      family: string;
      model: string;
      bedrockId: string;
    };
    generateBDD: {
      family: string;
      model: string;
      bedrockId: string;
    };
  };
  debugInfo: {
    modelsUsed: {
      extractHistory: string;
      generateCode: string;
      generateBDD: string;
    };
    timestamp: string;
    environment: string;
    apiGateway: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateCodeDevRequest = await request.json();
    const { userStory, language, llmSelections, requestId } = body;

    // Validação básica
    if (!userStory || !language || !requestId || !llmSelections) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: userStory, language, requestId, llmSelections' },
        { status: 400 }
      );
    }

    if (!['python', 'java'].includes(language)) {
      return NextResponse.json(
        { error: 'Linguagem deve ser python ou java' },
        { status: 400 }
      );
    }

    // Validar se todas as seleções de LLM estão presentes
    if (!llmSelections.extractHistory || !llmSelections.generateCode || !llmSelections.generateBDD) {
      return NextResponse.json(
        { error: 'Todas as seleções de LLM são obrigatórias (extractHistory, generateCode, generateBDD)' },
        { status: 400 }
      );
    }

    console.log('🔧 DEV API - Generate Code Request:', {
      userStoryLength: userStory.length,
      language,
      llmSelections,
      requestId
    });

    // Mapear modelos para AWS Bedrock IDs
    const selectedModels = {
      extractHistory: {
        family: llmSelections.extractHistory.family,
        model: llmSelections.extractHistory.model,
        bedrockId: mapLLMToBedrockModel(llmSelections.extractHistory.family, llmSelections.extractHistory.model)
      },
      generateCode: {
        family: llmSelections.generateCode.family,
        model: llmSelections.generateCode.model,
        bedrockId: mapLLMToBedrockModel(llmSelections.generateCode.family, llmSelections.generateCode.model)
      },
      generateBDD: {
        family: llmSelections.generateBDD.family,
        model: llmSelections.generateBDD.model,
        bedrockId: mapLLMToBedrockModel(llmSelections.generateBDD.family, llmSelections.generateBDD.model)
      }
    };

    // Payload para Step Functions DEV (com seleções específicas)
    const stepFunctionPayload = {
      userStory,
      language,
      requestId,
      timestamp: new Date().toISOString(),
      source: 'dev',
      
      // Modelos específicos selecionados pelo desenvolvedor
      models: selectedModels
    };

    // Simular chamada para AWS API Gateway DEV (diferente do cliente)
    // const response = await fetch(process.env.DEV_API_GATEWAY_URL, {
    //   method: 'POST',
    //   headers: { 
    //     'Content-Type': 'application/json',
    //     'X-Dev-Mode': 'true'
    //   },
    //   body: JSON.stringify(stepFunctionPayload)
    // });

    console.log('🚀 Sending to DEV Step Functions:', {
      ...stepFunctionPayload,
      userStory: `${userStory.substring(0, 100)}...`
    });

    // Simular resposta com presigned URL DEV
    const presignedUrl = `https://temp-storage-dev.s3.amazonaws.com/${requestId}/generated-code.${language}`;

    const response: GenerateCodeDevResponse = {
      success: true,
      requestId,
      presignedUrl,
      selectedModels,
      debugInfo: {
        modelsUsed: {
          extractHistory: `${llmSelections.extractHistory.family} ${llmSelections.extractHistory.model}`,
          generateCode: `${llmSelections.generateCode.family} ${llmSelections.generateCode.model}`,
          generateBDD: `${llmSelections.generateBDD.family} ${llmSelections.generateBDD.model}`
        },
        timestamp: new Date().toISOString(),
        environment: 'development',
        apiGateway: 'DEV_API_GATEWAY'
      }
    };

    console.log('✅ DEV Response sent:', {
      requestId,
      presignedUrl,
      modelsUsed: response.debugInfo.modelsUsed
    });

    return NextResponse.json(response);

  } catch (error) {
    console.error('❌ DEV API Error:', error);
    return NextResponse.json(
      { 
        error: 'Erro interno do servidor',
        details: error instanceof Error ? error.message : 'Erro desconhecido'
      },
      { status: 500 }
    );
  }
}