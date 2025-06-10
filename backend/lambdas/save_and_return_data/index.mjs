
// lambda_save_and_return_data/index.mjs
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client();
const BUCKET = process.env.RESULT_BUCKET;

const normalize = (event) => {
  if (typeof event === "string") return JSON.parse(event);
  if (event?.body) return typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  return event;
};

const putS3File = async (filename, content) => {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: filename,
      Body: JSON.stringify(content),
      ContentType: "application/json"
    })
  );
  return filename;
};

export const handler = async (event) => {
  try {
    const parsed = normalize(event);
    const codePayload = parsed.codeResponse?.Payload ?? {};
    const filename = codePayload.filename || parsed.filename;
    const data = codePayload.data ?? {};
    await putS3File(filename, data);
    return { statusCode: 200, filename };
  } catch (err) {
    return { statusCode: 500, error: err.message ?? "Unknown error" };
  }
};
