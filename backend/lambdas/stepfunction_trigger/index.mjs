import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Inicialização dos clientes AWS
const sfn = new SFNClient();
const s3 = new S3Client();

// Configurações do ambiente
const RESULT_BUCKET = "pocdesktoptemp";
const URL_TTL = 60 * 60 * 24; // 24 horas
const SFN_ARN = process.env.SFN_ARN;

//Função generateFileName definida
const generateFileName = () => `FileCode-${Math.floor(Date.now() / 1000)}.json`;

export const handler = async (event) => {
  try {
    const body = typeof event.body === "string" ? JSON.parse(event.body) : (event.body ?? {});
    const filename = generateFileName();
    const start_timestamp = Date.now();

    console.log('📥 Payload recebido pela Lambda:', JSON.stringify(body, null, 2));

    // ESTRUTURA COMPATÍVEL: Suporta formato atual E novo
    const stepFunctionInput = {
      filename,
      start_timestamp,
      configuration: body.models || {},
      user_data: {
        language: body.language,
        // 🔄 COMPATIBILIDADE: Múltiplos formatos de dados
        ...(body.inputType === 'text' ? {
          user_history: body.userStory || '',
          context: body.contextualInfo || body.contexto || '', // ← Suporta ambos
          contextualInfo: body.contextualInfo || body.contexto || '' // ← Para compatibilidade
        } : {
          // Para files, manter estrutura atual
          user_history: body.files ? 
            body.files.map(f => `Arquivo: ${f.name}\nTipo: ${f.type}\nConteúdo: ${f.content}`).join('\n\n') 
            : '',
          context: body.contextualInfo || body.contexto || '',
          contextualInfo: body.contextualInfo || body.contexto || ''
        })
      },
      
      // Manter campos existentes
      inputType: body.inputType,
      requestId: body.requestId,
      source: body.source || 'stepfunction_trigger',
      
      // Adicionar arquivos se existirem (sem quebrar o atual)
      ...(body.files && {
        files: body.files.map(file => ({
          name: file.name,
          type: file.type,
          content: file.content,
          category: file.category || 'story'
        }))
      }),
      
      // Manter campos legados
      ...(body.fileContent && {
        fileContent: body.fileContent,
        fileName: body.fileName
      })
    };

    console.log('🚀 Payload estruturado para Step Function:', {
      filename,
      'user_data.language': stepFunctionInput.user_data.language,
      inputType: stepFunctionInput.inputType,
      requestId: stepFunctionInput.requestId,
      hasFiles: !!stepFunctionInput.files,
      filesCount: stepFunctionInput.files?.length || 0
    });

    // Montagem do input para a State Machine
    const input = JSON.stringify(stepFunctionInput);

    // Disparo da Step Function
    const { executionArn } = await sfn.send(
      new StartExecutionCommand({
        stateMachineArn: SFN_ARN,
        input,
      })
    );

    console.log('✅ Step Function iniciada:', executionArn);

    // Geração da URL assinada para download do resultado no S3
    const downloadUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: RESULT_BUCKET,
        Key: filename,
      }),
      { expiresIn: URL_TTL }
    );

    console.log('🔗 URL de download gerada:', downloadUrl.substring(0, 100) + '...');

    // Retorno para quem chamou a API
    return {
      statusCode: 202,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        executionArn,
        downloadUrl,
      }),
    };
  } catch (err) {
    console.error("💥 Erro na execução da Lambda:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Internal error",
        error: err.message,
      }),
    };
  }
};