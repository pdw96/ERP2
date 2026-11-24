import { WEEKDAY_NAMES } from "@/lib/mrp-calc";
import { toMs } from "@/lib/weeks";

/** 「11-24(화)」 — 요일은 UTC 날짜로 센다(서버의 지역 시각에 기대지 않는다). */
export function shortDate(date: string): string {
  const weekday = WEEKDAY_NAMES[(new Date(toMs(date)).getUTCDay() + 6) % 7];
  return `${date.slice(5, 7)}-${date.slice(8, 10)}(${weekday})`;
}
