import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Inicialização dos clientes AWS
const sfn = new SFNClient();
const s3 = new S3Client();

// Configurações do ambiente
const RESULT_BUCKET = process.env.RESULT_BUCKET;
const URL_TTL = 60 * 60 * 24; // 24 horas
const SFN_ARN = process.env.SFN_ARN;

// Geração de nome de arquivo único
const generateFileName = () => `FileCode-${Math.floor(Date.now() / 1000)}.json`;

export const handler = async (event) => {
  try {
    const body = typeof event.body === "string" ? JSON.parse(event.body) : (event.body ?? {});
    const filename = generateFileName();
    const start_timestamp = Date.now();

    // Montagem do input para a State Machine
    const input = JSON.stringify({
      ...body,
      filename,
      start_timestamp
    });

    // Disparo da Step Function
    const { executionArn } = await sfn.send(
      new StartExecutionCommand({
        stateMachineArn: SFN_ARN,
        input,
      })
    );

    // Geração da URL assinada para download do resultado no S3
    const downloadUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: RESULT_BUCKET,
        Key: filename,
      }),
      { expiresIn: URL_TTL }
    );

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
    console.error("Erro na execução da Lambda:", err);
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
