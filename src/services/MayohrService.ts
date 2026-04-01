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
        // 流程 A：Authenticator push 頁面，需要點「I can't use...」
        this.page.waitForSelector("#idDiv_SAOTCS_HavingTrouble").then(() => "push" as const),
        // 流程 B：直接顯示驗證方式選擇（Verify your identity）
        this.page.waitForFunction(
          () => document.body.innerText.includes("Verify your identity"),
          { timeout: 30000 }
        ).then(() => "choose" as const),
      ]);

      if (mfaType === "push") {
        // 點選「I can't use...」
        await this.page.click("#idDiv_SAOTCS_HavingTrouble");
        // 點選 TOTP 選項
        await this.page.waitForSelector(
          "#idDiv_SAOTCS_Proofs>div:nth-child(2)>div"
        );
        await this.page.click("#idDiv_SAOTCS_Proofs>div:nth-child(2)>div");
      } else {
        // 點選「Use a verification code」選項
        await this.page.evaluate(() => {
          const divs = Array.from(document.querySelectorAll("div[data-value]"));
          const otpDiv = divs.find((d) => d.textContent?.includes("verification code"));
          if (otpDiv) (otpDiv as HTMLElement).click();
        });
      }

      // 填入 TOTP Code
      await this.page.waitForSelector("#idTxtBx_SAOTCC_OTC");
      await this.page.type("#idTxtBx_SAOTCC_OTC", totp);

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

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
    } else {
    }
  }
}
