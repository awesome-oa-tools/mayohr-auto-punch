import puppeteer, { Browser, Page } from "puppeteer";
import { authenticator } from "otplib";
import { logger } from "../utils/logger";

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
      this.browser = await puppeteer.launch({
        headless: this.headless,
        defaultViewport: null,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--no-first-run",
          "--no-zygote",
          "--single-process", // 重要！在 Lambda 中使用單進程模式
          "--disable-extensions",
          "--disable-dev-tools",
          "--disable-software-rasterizer",
          "--ignore-certificate-errors",
          "--window-size=1920,1080",
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

      // 輸入網域並前往驗證
      await new Promise((resolve) => setTimeout(resolve, this.delay));
      await this.page.waitForSelector("input.input-div");
      await this.page.type("input.input-div", this.domain);
      await this.page.waitForSelector("button.submit-btn");
      await this.page.click("button.submit-btn");

      // MS 帳號
      await new Promise((resolve) => setTimeout(resolve, this.delay));
      await this.page.waitForSelector("input#i0116");
      await this.page.type("input#i0116", this.username);
      await this.page.click("input#idSIButton9");

      // MS 密碼
      await new Promise((resolve) => setTimeout(resolve, 4 * this.delay));
      await this.page.waitForSelector("input#i0118");
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

      // 點選使用其他方式登入
      await this.page.waitForSelector("#idDiv_SAOTCS_HavingTrouble");
      await this.page.click("#idDiv_SAOTCS_HavingTrouble");

      // 點選 TOTP 登入
      await this.page.waitForSelector(
        "#idDiv_SAOTCS_Proofs>div:nth-child(2)>div"
      );
      await this.page.click("#idDiv_SAOTCS_Proofs>div:nth-child(2)>div");

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
