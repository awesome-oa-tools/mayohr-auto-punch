import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { Page } from "puppeteer";
import { logger } from "./logger";

const s3Client = new S3Client({ region: process.env.AWS_REGION });

export async function captureAndUploadScreenshot(
  page: Page,
  step: string
): Promise<string | null> {
  const bucket = process.env.SCREENSHOT_S3_BUCKET;
  if (!bucket) {
    logger.warn("SCREENSHOT_S3_BUCKET 未設定，跳過截圖上傳");
    return null;
  }

  try {
    const screenshot = await page.screenshot({ fullPage: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const key = `screenshots/${timestamp}_${step}.png`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: screenshot,
        ContentType: "image/png",
      })
    );

    const url = `s3://${bucket}/${key}`;
    logger.info(`截圖已上傳: ${url}`);
    return url;
  } catch (error) {
    logger.error(
      "截圖上傳失敗:",
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}
