import puppeteer, { Browser, Page } from "puppeteer";
import { authenticator } from "otplib";
import { mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { logger } from "../utils/logger";
import { captureAndUploadScreenshot } from "../utils/screenshot";

export class MayohrService {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private password: string;
  private secret: string;
  private loginUrl: string = "https://asiaauth.mayohr.com/HRM/Account/Login";
  private punchUrl: string = "https://apollo.mayohr.com/ta?id=webpunch";
  private delay: number = 500;

  constructor(
    private readonly headless: boolean = true,
    private readonly domain: string,
    private readonly username: string,
    password: string,
    secret: string
  ) {
    this.password = password;
    this.secret = secret;
  }

  async init(): Promise<void> {
    try {
      // 每次建立全新的 user data dir，避免 warm container 殘留 session
      const userDataDir = mkdtempSync(join(tmpdir(), "chrome-"));

      this.browser = await puppeteer.launch({
        headless: this.headless,
        defaultViewport: null,
        protocolTimeout: 60000,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--no-first-run",
          "--no-zygote",
          "--disable-extensions",
          "--disable-dev-tools",
          "--disable-software-rasterizer",
          "--ignore-certificate-errors",
          "--window-size=1920,1080",
          `--user-data-dir=${userDataDir}`,
          "--crash-dumps-dir=/tmp/chrome-crashes",
          "--homedir=/tmp",
          "--disk-cache-dir=/tmp/chrome-cache",
        ],
      });

      this.page = await this.browser.newPage();
    } catch (error) {
      logger.error(
        "Puppeteer 初始化失敗:",
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  }

  async login(): Promise<boolean> {
    if (!this.page) throw new Error("Browser not initialized");

    try {
      await this.page.goto(this.loginUrl);

      // 點選 Microsoft 登入按鈕
      await this.page.waitForSelector(".btn_microsoft>a");
      await this.page.click(".btn_microsoft>a");

      // 等待跳轉：可能是公司網域輸入頁，也可能直接到 Microsoft 登入頁
      await new Promise((resolve) => setTimeout(resolve, this.delay));
      const matched = await Promise.race([
        this.page.waitForSelector("input.input-div").then(() => "domain" as const),
        this.page.waitForSelector("input#i0116").then(() => "ms-login" as const),
      ]);

      if (matched === "domain") {
        // 輸入網域並前往驗證
        await this.page.type("input.input-div", this.domain);
        await this.page.waitForSelector("button.submit-btn");
        await this.page.click("button.submit-btn");

        // 等待 MS 帳號輸入頁
        await new Promise((resolve) => setTimeout(resolve, this.delay));
        await this.page.waitForSelector("input#i0116");
      }

      // MS 帳號
      await this.page.click("input#i0116");
      await new Promise((resolve) => setTimeout(resolve, this.delay));
      await this.page.type("input#i0116", this.username);
      await this.page.click("input#idSIButton9");

      // MS 密碼
      await new Promise((resolve) => setTimeout(resolve, 4 * this.delay));
      await this.page.waitForSelector("input#i0118");
      await this.page.click("input#i0118");
      await new Promise((resolve) => setTimeout(resolve, this.delay));
      await this.page.type("input#i0118", this.password);
      await this.page.click("input#idSIButton9");

      // MS TOTP
      await new Promise((resolve) => setTimeout(resolve, 4 * this.delay));
      // 如果 secret 為 url 格式，則透過 url 解析出密鑰
      if (this.secret.startsWith("otpauth://")) {
        const url = new URL(this.secret);
        this.secret = url.searchParams.get("secret") || "";
      }
      // 產生 TOTP Code
      const totp = authenticator.generate(this.secret);

      // MFA 驗證：偵測是哪種頁面
      const mfaType = await Promise.race([
        // 流程 A：Authenticator push 頁面（"Approve sign in request"），需要切換到其他方式
        this.page.waitForSelector("#idDiv_SAOTCS_HavingTrouble").then(() => "push" as const),
        // 流程 A2：新版 "Sign in another way" 連結（by ID 或 by 文字）
        this.page.waitForSelector("#signInAnotherWay").then(() => "signInAnotherWay" as const),
        this.page.waitForFunction(
          () => Array.from(document.querySelectorAll("a")).some((a) => a.textContent?.includes("Sign in another way")),
          { timeout: 30000 }
        ).then(() => "signInAnotherWay" as const),
        // 流程 B：直接顯示驗證方式選擇（Verify your identity）
        this.page.waitForFunction(
          () => document.body.innerText.includes("Verify your identity"),
          { timeout: 30000 }
        ).then(() => "choose" as const),
      ]);

      logger.info(`MFA 頁面類型: ${mfaType}`);

      if (mfaType === "push" || mfaType === "signInAnotherWay") {
        // 點選「我目前無法使用我的 Outlook 行動裝置應用程式」
        const clicked = await this.page.evaluate(() => {
          const links = Array.from(document.querySelectorAll("a"));
          const cantUseApp = links.find((a) =>
            a.textContent?.includes("我目前無法使用我的 Outlook 行動裝置應用程式") ||
            a.textContent?.includes("I can't use my Microsoft Authenticator app") ||
            a.textContent?.includes("I can't use my Outlook mobile app right now") ||
            a.textContent?.includes("Sign in another way")
          );
          if (cantUseApp) { cantUseApp.click(); return cantUseApp.textContent?.trim(); }
          // 備選：舊版按鈕
          const btn = document.querySelector("#idDiv_SAOTCS_HavingTrouble") as HTMLElement;
          if (btn) { btn.click(); return "button"; }
          return null;
        });
        logger.info(`點擊切換驗證方式: ${clicked}`);
        await new Promise((resolve) => setTimeout(resolve, 2 * this.delay));

        // 截圖：確認切換後的頁面
        await captureAndUploadScreenshot(this.page, "mfa-switch");

        // 等待「驗證身分識別」頁面載入
        await this.page.waitForFunction(
          () => document.body.innerText.includes("驗證身分識別") || document.body.innerText.includes("Verify your identity"),
          { timeout: 15000 }
        );
        await new Promise((resolve) => setTimeout(resolve, this.delay));

        // 點選「使用驗證碼」選項
        const selectedMethod = await this.page.evaluate(() => {
          const allClickable = Array.from(document.querySelectorAll("div[data-value], a, button"));
          const otpOption = allClickable.find((el) =>
            el.textContent?.includes("使用驗證碼") ||
            el.textContent?.includes("verification code") ||
            el.textContent?.includes("Use a code")
          );
          if (otpOption) { (otpOption as HTMLElement).click(); return otpOption.textContent?.trim(); }
          // 舊版：直接用 Proofs 清單
          const proofOption = document.querySelector("#idDiv_SAOTCS_Proofs>div:nth-child(2)>div") as HTMLElement;
          if (proofOption) { proofOption.click(); return "legacy-proof"; }
          return null;
        });
        logger.info(`選擇的驗證方式: ${selectedMethod}`);
      } else {
        // 點選「Use a verification code」選項
        await this.page.evaluate(() => {
          const divs = Array.from(document.querySelectorAll("div[data-value]"));
          const otpDiv = divs.find((d) => d.textContent?.includes("verification code"));
          if (otpDiv) (otpDiv as HTMLElement).click();
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 2 * this.delay));

      // 填入 TOTP Code（支援新舊版 selector）
      await this.page.waitForSelector("#idTxtBx_SAOTCC_OTC, input[name='otc']", { timeout: 15000 });
      const otcSelector = await this.page.evaluate(() => {
        if (document.querySelector("#idTxtBx_SAOTCC_OTC")) return "#idTxtBx_SAOTCC_OTC";
        if (document.querySelector("input[name='otc']")) return "input[name='otc']";
        return "#idTxtBx_SAOTCC_OTC"; // fallback
      });
      await this.page.type(otcSelector, totp);

      // 送出
      await this.page.click("input#idSubmit_SAOTCC_Continue");

      // 是否保持登入
      await new Promise((resolve) => setTimeout(resolve, 4 * this.delay));
      await this.page.waitForSelector("input#idBtn_Back");
      await this.page.click("input#idBtn_Back");

      // 等待登入完成
      await this.page.waitForNavigation();

      return true;
    } catch (error) {
      logger.error(
        "登入過程發生錯誤:",
        error instanceof Error ? error.message : String(error)
      );
      if (this.page) {
        await captureAndUploadScreenshot(this.page, "login-failed");
      }
      return false;
    }
  }

  async punch(): Promise<boolean> {
    if (!this.page) throw new Error("Browser not initialized");

    try {
      await new Promise((resolve) => setTimeout(resolve, 4 * this.delay));
      // 前往打卡頁面
      await this.page.goto(this.punchUrl, {
        waitUntil: "networkidle2",
      });

      // 按下 上班/下班 按鈕
      await this.page.waitForSelector("button.checkIn-window-button-work");
      await this.page.click("button.checkIn-window-button-work");

      // 已存在下班打卡紀錄，是否覆蓋該筆打卡紀錄？
      await new Promise((resolve) => setTimeout(resolve, 2 * this.delay));
      if (
        (await this.page.$(
          "div.v3-confirm-buttons>button.button.filled.buttonText"
        )) !== null
      ) {
        await new Promise((resolve) => setTimeout(resolve, 2 * this.delay));
        await this.page.click(
          "div.v3-confirm-buttons>button.button.filled.buttonText"
        );
      }

      return true;
    } catch (error) {
      logger.error(
        "打卡過程發生錯誤:",
        error instanceof Error ? error.message : String(error)
      );
      if (this.page) {
        await captureAndUploadScreenshot(this.page, "punch-failed");
      }
      return false;
    }
  }

  /**
   * 從瀏覽器 cookie 中取得 __ModuleSessionCookie（JWT，有效 7 天）
   */
  async getSessionCookie(): Promise<string | null> {
    if (!this.page) return null;
    const cookies = await this.page.cookies("https://apollo.mayohr.com");
    const session = cookies.find((c) => c.name === "__ModuleSessionCookie");
    return session?.value || null;
  }

  /**
   * 透過 HTTP API 直接打卡，不需要瀏覽器操作
   * 需要先登入取得 sessionCookie，或傳入快取的 cookie
   */
  async punchByApi(sessionCookie?: string): Promise<boolean> {
    const cookie =
      sessionCookie || (await this.getSessionCookie());
    if (!cookie) {
      logger.error("無法取得 session cookie，請先登入");
      return false;
    }

    const punchApiUrl =
      "https://apollo.mayohr.com/backend/pt/api/checkIn/punch/web";

    try {
      const response = await fetch(punchApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ActionCode: "Default",
          FunctionCode: "PunchCard",
          Cookie: `__ModuleSessionCookie=${cookie}`,
          Origin: "https://apollo.mayohr.com",
          Referer: "https://apollo.mayohr.com/ta?id=webpunch",
        },
        body: JSON.stringify(
          new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei" })).getHours() < 12
            ? { AttendanceType: 1, IsOverride: false }
            : { AttendanceType: 2, IsOverride: true }
        ),
      });

      if (!response.ok) {
        logger.error(`打卡 API 回傳 ${response.status}`);
        return false;
      }

      const data = await response.json();
      logger.debug("打卡 API 回傳", data);
      return true;
    } catch (error) {
      logger.error(
        "打卡 API 呼叫失敗:",
        error instanceof Error ? error.message : String(error)
      );
      return false;
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
    }
  }
}
