
// lambdas/generate_bdd_teste/index.mjs
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client();
const BUCKET = process.env.RESULT_BUCKET;

const normalize = (event) => {
  if (typeof event === "string") return JSON.parse(event);
  if (event?.body)
    return typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  return event;
};

export const handler = async (event) => {
  try {
    const input = normalize(event);
    const filename =
      input.filename || `file_bdd${Math.floor(Date.now() / 1000)}.json`;

    const bdd = {
      given: input.given ?? "some state",
      when: input.when ?? "some action",
      then: input.then ?? "expected outcome",
    };

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: filename,
        Body: JSON.stringify(bdd),
        ContentType: "application/json",
      })
    );

    return { statusCode: 200, filename, bdd };
  } catch (err) {
    return { statusCode: 500, error: err.message ?? "Unknown error" };
  }
};
