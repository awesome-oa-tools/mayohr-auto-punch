import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { MayohrService } from "../services/MayohrService";
import { TelegramService } from "../services/TelegramService";
import { Notifier } from "../utils/notifier";
import { isHoliday } from '../utils/holiday';

const ssmClient = new SSMClient({ region: process.env.AWS_REGION });
async function getParameter(name: string): Promise<string> {
  const command = new GetParameterCommand({
    Name: name,
    WithDecryption: true,
  });
  const response = await ssmClient.send(command);
  return response.Parameter?.Value || '';
}

export const handler = async (event: any, context: any) => {
  let mayohrService = null;
  try {

    const [msPassword, msToptSecret, telegramBotToken] = await Promise.all([
      getParameter('/mayohr-auto-punch/ms-password'),
      getParameter('/mayohr-auto-punch/ms-totp-secret'),
      getParameter('/mayohr-auto-punch/telegram-bot-token'),
    ]);

    mayohrService = new MayohrService(
      true,
      process.env.MS_DOMAIN || "",
      process.env.MS_USERNAME || "",
      msPassword,
      msToptSecret
    );

    // Initialize notification service
    const telegramService = new TelegramService(
      telegramBotToken,
      process.env.TELEGRAM_CHAT_ID
    );
    const notifier = new Notifier(telegramService);

    // Check if today is a holiday
    const today = new Date();
    const holidayCheck = await isHoliday(today);
    if (holidayCheck) {
      await notifier.info("今天是假日，不需要打卡");
      return {
        statusCode: 200,
        body: JSON.stringify({ message: "今天是假日，不需要打卡" }),
      };
    }

    try {
      await mayohrService.init();
    } catch (error) {
      console.error("初始化失敗:", error);
      throw new Error("初始化失敗");
    }
    console.info("初始化成功");

    const isLoggedIn = await mayohrService.login();
    if (!isLoggedIn) {
      throw new Error("登入失敗");
    }
    console.info("登入成功");

    const isPunched = await mayohrService.punch();
    if (!isPunched) {
      throw new Error("打卡失敗");
    } else {
      console.info("打卡成功");
      await notifier.success("打卡成功");
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "打卡成功" }),
    };
  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "打卡過程發生錯誤",
        error: error instanceof Error ? error.message : "Unknown error",
      }),
    };
  } finally {
    mayohrService?.close();
  }
};
