#!/usr/bin/env node

/**
 * 側錄整個登入 + 打卡流程的所有 HTTP request/response
 * 輸出到 captured-requests.json
 *
 * 用法: npx ts-node src/bin/capture-requests.ts
 */

import dotenv from "dotenv";
import { MayohrService } from "../services/MayohrService";
import { logger } from "../utils/logger";
import { join } from "path";
import { homedir } from "os";
import { statSync, writeFileSync } from "fs";
import { Protocol } from "puppeteer";

try {
  const envPath = join(homedir(), ".mayohr-auto-punch", ".env");
  if (statSync(envPath).isFile()) {
    dotenv.config({ path: envPath });
  }
} catch {}
dotenv.config();

interface CapturedRequest {
  index: number;
  timestamp: string;
  phase: string;
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody?: string;
  status?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  mimeType?: string;
}

async function main() {
  const captured: CapturedRequest[] = [];
  let phase = "init";
  let index = 0;

  const mayohrService = new MayohrService(
    false, // 非 headless，讓你能看到流程
    process.env.MS_DOMAIN || "",
    process.env.MS_USERNAME || "",
    process.env.MS_PASSWORD || "",
    process.env.MS_TOPT_SECRET || ""
  );

  try {
    await mayohrService.init();
    const page = (mayohrService as any).page;
    if (!page) throw new Error("No page");

    // 啟用 CDP Fetch 攔截所有 request
    const cdp = await page.createCDPSession();
    await cdp.send("Fetch.enable", {
      patterns: [{ urlPattern: "*", requestStage: "Response" }],
    });

    cdp.on(
      "Fetch.requestPaused",
      async (event: Protocol.Fetch.RequestPausedEvent) => {
        const { requestId, request, responseStatusCode, responseHeaders } =
          event;

        const entry: CapturedRequest = {
          index: index++,
          timestamp: new Date().toISOString(),
          phase,
          method: request.method,
          url: request.url,
          requestHeaders: request.headers as Record<string, string>,
          requestBody: request.postData,
          status: responseStatusCode,
          responseHeaders: responseHeaders
            ? Object.fromEntries(
                responseHeaders.map((h) => [h.name, h.value])
              )
            : undefined,
        };

        // 只對 document / json / form 類型抓 response body
        const contentType =
          responseHeaders
            ?.find(
              (h) => h.name.toLowerCase() === "content-type"
            )
            ?.value?.toLowerCase() || "";

        const shouldCaptureBody =
          contentType.includes("json") ||
          contentType.includes("html") ||
          contentType.includes("text/plain") ||
          contentType.includes("form") ||
          contentType.includes("xml");

        if (shouldCaptureBody && responseStatusCode) {
          try {
            const body = await cdp.send("Fetch.getResponseBody", {
              requestId,
            });
            entry.responseBody = body.base64Encoded
              ? Buffer.from(body.body, "base64").toString("utf-8")
              : body.body;
            entry.mimeType = contentType;
            // 截斷過長的 HTML
            if (
              entry.responseBody &&
              entry.responseBody.length > 5000 &&
              contentType.includes("html")
            ) {
              entry.responseBody =
                entry.responseBody.substring(0, 5000) + "\n... [TRUNCATED]";
            }
          } catch {}
        }

        captured.push(entry);

        // 繼續 request
        try {
          await cdp.send("Fetch.continueResponse", { requestId });
        } catch {
          try {
            await cdp.send("Fetch.continueRequest", { requestId });
          } catch {}
        }
      }
    );

    // 執行登入流程
    logger.info("=== 開始側錄 ===");

    phase = "login-page";
    const isLoggedIn = await mayohrService.login();
    if (!isLoggedIn) throw new Error("登入失敗");
    logger.info("登入成功");

    phase = "punch";
    const isPunched = await mayohrService.punch();
    if (!isPunched) throw new Error("打卡失敗");
    logger.info("打卡成功");

    // 等待打卡 API response 完成
    logger.info("等待 5 秒收集剩餘 request...");
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // 停用攔截
    await cdp.send("Fetch.disable");

    // 過濾掉靜態資源，只保留 API call 和關鍵 request
    const important = captured.filter((r) => {
      const url = r.url.toLowerCase();
      // 排除靜態資源
      const staticExts = [".png", ".jpg", ".gif", ".svg", ".ico", ".woff", ".woff2", ".ttf", ".css", ".js"];
      if (staticExts.some((ext) => url.split("?")[0].endsWith(ext))) return false;
      if (
        url.includes("fonts.googleapis") ||
        url.includes("googletagmanager") ||
        url.includes("google-analytics") ||
        url.includes("applicationinsights") ||
        url.includes("/favicon") ||
        url.includes("browser-signal") ||
        url.includes("telemetry") ||
        url.includes("ppsecure")
      )
        return false;
      return true;
    });

    // 敏感資料遮罩
    const sanitized = important.map((r) => {
      const s = JSON.parse(JSON.stringify(r));
      // 遮罩密碼
      if (s.requestBody) {
        s.requestBody = s.requestBody
          .replace(/passwd=[^&]*/g, "passwd=***REDACTED***")
          .replace(/"passwd":"[^"]*"/g, '"passwd":"***REDACTED***"');
      }
      return s;
    });

    // 輸出
    const outputPath = join(process.cwd(), "captured-requests.json");
    writeFileSync(outputPath, JSON.stringify(sanitized, null, 2));
    logger.success(
      `側錄完成！共 ${sanitized.length} 個 request（已過濾靜態資源）`
    );
    logger.info(`輸出: ${outputPath}`);

    // 輸出摘要
    logger.info("\n=== 摘要 ===");
    const phases = [...new Set(sanitized.map((r) => r.phase))];
    for (const p of phases) {
      const reqs = sanitized.filter((r) => r.phase === p);
      logger.info(`[${p}] ${reqs.length} requests`);
      for (const r of reqs) {
        const body = r.requestBody ? ` (body: ${r.requestBody.length} bytes)` : "";
        console.log(
          `  ${r.method.padEnd(6)} ${r.status || "---"} ${r.url.substring(0, 120)}${body}`
        );
      }
    }
  } catch (error) {
    logger.error("錯誤:", error);
    // 即使失敗也輸出已收集的 request
    if (captured.length > 0) {
      const outputPath = join(process.cwd(), "captured-requests-partial.json");
      writeFileSync(outputPath, JSON.stringify(captured, null, 2));
      logger.info(`已儲存部分結果到: ${outputPath}`);
    }
  } finally {
    await mayohrService.close();
  }
}

main();
