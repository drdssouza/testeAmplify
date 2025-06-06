// app/api/generate-code/route.ts
import { NextRequest, NextResponse } from 'next/server';

const API_GATEWAY_URL = process.env.API_GATEWAY_URL || '';

export async function POST(request: NextRequest) {
  try {
    const { userStory, language, requestId } = await request.json();
    
    if (!userStory || userStory.trim() === '') {
      return NextResponse.json(
        { error: 'História de usuário é obrigatória' },
        { status: 400 }
      );
    }

    if (!language || !['python', 'java'].includes(language)) {
      return NextResponse.json(
        { error: 'Linguagem deve ser "python" ou "java"' },
        { status: 400 }
      );
    }

    // Chamar API Gateway que aciona Step Function com fallback imediato
    const response = await fetch(`${API_GATEWAY_URL}/generate-code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.API_KEY || ''}`,
        'x-api-key': process.env.API_KEY || '',
      },
      body: JSON.stringify({
        userStory: userStory.trim(),
        language: language,
        requestId: requestId || crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Erro na Step Function' }));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    // API Gateway deve retornar presigned URL imediatamente (fallback)
    const data = await response.json();
    
    if (!data.presignedUrl) {
      throw new Error('Presigned URL não foi fornecida pela API Gateway');
    }

    // Retornar presigned URL para polling
    return NextResponse.json({
      presignedUrl: data.presignedUrl,
      requestId: data.requestId,
      status: 'processing',
      message: 'Step Function iniciada. Use a presigned URL para polling.'
    });

  } catch (error) {
    console.error('Erro ao conectar com AWS:', error);
    
    return NextResponse.json(
      { 
        error: 'Erro interno do servidor ao iniciar geração de código',
        details: error instanceof Error ? error.message : 'Erro desconhecido'
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { 
      message: 'Endpoint para geração de código',
      version: '3.0.0',
      status: 'Step Functions + S3 Polling',
      architecture: 'API Gateway -> Step Function (fallback) -> extract_history -> generate_code -> S3 -> presigned URL',
      endpoints: {
        POST: '/api/generate-code - Inicia Step Function e retorna presigned URL para polling'
      }
    },
    { status: 200 }
  );
}