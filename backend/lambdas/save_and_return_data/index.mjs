import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client();
const BUCKET = process.env.RESULT_BUCKET;

// 🔥 Função que normaliza o payload da Step Function
const normalize = (event) => {
  const parsed =
    typeof event === "string"
      ? JSON.parse(event)
      : event?.body
      ? typeof event.body === "string"
        ? JSON.parse(event.body)
        : event.body
      : event;

  // ✅ Prioriza code_result > extract_result > erro padrão
  const mainPayload =
    parsed?.code_result?.Payload ??
    parsed?.extract_result?.Payload ??
    {
      statuscode: 500,
      error: "Unsupported language or previous step failure",
    };

  return {
    ...parsed,
    ...mainPayload,
  };
};

// 🔥 Função que faz o upload no S3
const putS3File = async (filename, content) => {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: filename,
      Body: JSON.stringify(content, null, 2),
      ContentType: "application/json",
    })
  );
  return filename;
};

// 🚀 Handler principal da Lambda
export const handler = async (event) => {
  const body = normalize(event);

  const {
    statuscode = 200,
    filename = null,
    start_timestamp = new Date(),
    configuration = {},
    user_data = {},
    extracted_data = {},
    code_generated = {},
  } = body;

  try {
    const result = {
      statuscode,
      filename,
      execution_time: (Date.now()-start_timestamp),
      configuration,
      user_data,
      extracted_data,
      code_generated,
    };

    await putS3File(filename, result);

    return result;
  } catch (err) {
    const result = {
      statuscode: 500,
      filename,
      start_timestamp,
      configuration,
      user_data,
      extracted_data,
      code_generated,
      error: err.message ?? "Unknown error",
    };

    return result;
  }
};
