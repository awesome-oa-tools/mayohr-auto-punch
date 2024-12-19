interface Holiday {
  date: string;
  week: string;
  isHoliday: boolean;
  description: string;
}

/**
 * 取得指定年份的假日資料
 */
export async function getHolidays(year: number): Promise<Holiday[]> {
  try {
    const response = await fetch(
      `https://cdn.jsdelivr.net/gh/ruyut/TaiwanCalendar/data/${year}.json`
    );
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.warn(`取得假日失敗: ${error}`);
    console.warn("僅計算是否為星期六,或星期日");
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

/**
 * 檢查指定日期是否為假日
 */
export async function isHoliday(date: Date): Promise<boolean> {
  const year = date.getFullYear();
  const holidays = await getHolidays(year);
  const formattedDate = date.toISOString().slice(0, 10).replace(/-/g, "");
  const holiday = holidays.find((h) => h.date === formattedDate);
  return holiday?.isHoliday ?? false;
}