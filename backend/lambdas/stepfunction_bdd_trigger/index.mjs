
// lambdas/stepfunction_bdd_trigger/index.mjs
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const sfn = new SFNClient();
const s3 = new S3Client();
const BUCKET = process.env.RESULT_BUCKET;
const URL_TTL = 60 * 60 * 24;

const generateFileName = () => `file_bdd${Math.floor(Date.now() / 1000)}.json`;

export const handler = async (event) => {
  try {
    const body =
      typeof event.body === "string"
        ? JSON.parse(event.body)
        : event.body ?? event;

    const filename = generateFileName();
    const input = JSON.stringify({ ...body, filename });

    const { executionArn } = await sfn.send(
      new StartExecutionCommand({
        stateMachineArn: process.env.SFN_ARN,
        input,
      })
    );

    const downloadUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: BUCKET, Key: filename }),
      { expiresIn: URL_TTL }
    );

    return {
      statusCode: 202,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ executionArn, downloadUrl }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal error", error: err.message }),
    };
  }
};
