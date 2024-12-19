#!/usr/bin/env node

import dotenv from "dotenv";
import { MayohrService } from "../services/MayohrService";
import { Holiday } from "../interfaces/Holiday";
import { logger } from "../utils/logger";
import { join } from "path";
import { homedir } from "os";
import { statSync } from "fs";
import { TelegramService } from '../services/TelegramService';
import { Notifier } from '../utils/notifier';

try {
  const envPath = join(homedir(), ".mayohr-auto-punch", ".env");
  if (statSync(envPath).isFile()) {
    dotenv.config({ path: envPath });
  }
} catch (error) {
  logger.debug("~/.mayohr-auto-punch/.env 不存在");
}

dotenv.config();

async function getHolidays(year: number): Promise<Holiday[]> {
  try {
    const response = await fetch(
      `https://cdn.jsdelivr.net/gh/ruyut/TaiwanCalendar/data/${year}.json`
    );
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    logger.warn(`取得假日失敗: ${error}`);
    logger.warn("僅計算是否為星期六,或星期日");
    const holidays: Holiday[] = [];
    for (let i = 0; i < 365; i++) {
      const date = new Date(year, 0, i + 1);
      const dayOfWeek = date.getDay();
      const isHoliday = dayOfWeek === 6 || dayOfWeek === 0;
      const description = isHoliday ? "假日" : "";
      const holiday = {
        date: date.toISOString().slice(0, 10).replace(/-/g, ""),
        week: dayOfWeek === 0 ? "日" : dayOfWeek === 6 ? "六" : "一",
        isHoliday,
        description,
      };
      holidays.push(holiday);
    }
    return holidays;
  }
}

async function isHoliday(date: Date): Promise<boolean> {
  const year = date.getFullYear();
  const holidays = await getHolidays(year);

  // 格式化日期為 'YYYYMMDD' 格式
  const formattedDate = date.toISOString().slice(0, 10).replace(/-/g, "");

  const holiday = holidays.find((h) => h.date === formattedDate);
  return holiday?.isHoliday ?? false;
}

async function main() {
  // 初始化通知服務
  const telegramService = new TelegramService(
    process.env.TELEGRAM_BOT_TOKEN,
    process.env.TELEGRAM_CHAT_ID
  );
  const notifier = new Notifier(telegramService);

  // 檢查今天是否為假日
  const today = new Date();
  const holidayCheck = await isHoliday(today);
  if (holidayCheck) {
    await notifier.info("今天是假日，不需要打卡");
    return;
  }

  const mayohrService = new MayohrService(
    process.env.HEADLESS !== "false",
    process.env.MS_DOMAIN || "",
    process.env.MS_USERNAME || "",
    process.env.MS_PASSWORD || "",
    process.env.MS_TOPT_SECRET || ""
  );

  try {
    try {
      await mayohrService.init();
    } catch (error) {
      logger.error("初始化失敗:", error);
      throw new Error("初始化失敗");
    }

    const isLoggedIn = await mayohrService.login();
    if (!isLoggedIn) {
      throw new Error("登入失敗");
    }
    logger.info("登入成功");

    const isPunched = await mayohrService.punch();
    if (!isPunched) {
      throw new Error("打卡失敗");
    } else {
      logger.info("打卡成功");
      await notifier.success("打卡成功");
    }
  } catch (error) {
    logger.error("發生錯誤", error);
    await notifier.error("打卡過程發生錯誤", error);
  } finally {
    await mayohrService.close();
  }
}

main();