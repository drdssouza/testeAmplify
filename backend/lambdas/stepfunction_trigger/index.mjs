
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const sfn = new SFNClient();
const s3 = new S3Client();
const RESULT_BUCKET = process.env.RESULT_BUCKET;
const URL_TTL = 60 * 60 * 24;

const generateFileName = () => `FileCode-${Math.floor(Date.now() / 1000)}.json`;

export const handler = async (event) => {
  try {
    const body = typeof event.body === "string" ? JSON.parse(event.body) : event.body ?? {};
    const filename = generateFileName();
    const input = JSON.stringify({ ...body, filename });

    const { executionArn } = await sfn.send(
      new StartExecutionCommand({
        stateMachineArn: process.env.SFN_ARN,
        input
      })
    );

    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: RESULT_BUCKET, Key: filename }),
      { expiresIn: URL_TTL }
    );

    return {
      statusCode: 202,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ executionArn, downloadUrl: url })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal error", error: err.message })
    };
  }
};
