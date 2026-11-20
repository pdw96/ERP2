import { koreaToday } from "./today";

// 판매계획의 주 계산. 주는 월요일 ~ 일요일이고, 그 주 월요일 YYYY-MM-DD 로 가리킨다.
// 날짜는 Date.UTC 로만 센다 — 서버의 지역 시각에 기대지 않는다. 화면(브라우저)과 서버가 함께 쓴다.

/** 한 화면에 보이는 주 수. */
export const PAGE_WEEKS = 13;
/** 고칠 수 있는 주 수 — 이번 주부터 52주(51주 뒤까지). */
export const EDIT_WEEKS = 52;
/** 볼 수 있는 지난 주 수 — 52주 전까지. */
export const VIEW_BACK_WEEKS = 52;

const DATE = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;
const DAY_MS = 86_400_000;

const toMs = (date: string): number => {
  const m = DATE.exec(date);
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};
const fromMs = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** `YYYY-MM-DD` 이고 달력에 있는 월요일인가. */
export function isMonday(date: string): boolean {
  const ms = toMs(date);
  if (Number.isNaN(ms)) return false;
  const d = new Date(ms);
  return fromMs(ms) === date && d.getUTCDay() === 1;
}

/** 그 날이 든 주의 월요일. */
export function mondayOf(date: string): string {
  const ms = toMs(date);
  const back = (new Date(ms).getUTCDay() + 6) % 7;
  return fromMs(ms - back * DAY_MS);
}

/** 월요일에서 n주 뒤(음수는 앞)의 월요일. */
export function addWeeks(monday: string, n: number): string {
  return fromMs(toMs(monday) + n * 7 * DAY_MS);
}

/** 이번 주 — 한국 시각의 오늘이 든 주의 월요일. */
export function thisWeekOf(now?: Date): string {
  return mondayOf(koreaToday(now));
}

/** 그 월요일의 ISO 주 — 그 주 목요일의 해가 ISO 해, 그 해 1월 4일이 든 주가 1주. */
export function isoWeekOf(monday: string): { year: number; week: number } {
  const thursday = toMs(monday) + 3 * DAY_MS;
  const year = new Date(thursday).getUTCFullYear();
  const week1Monday = toMs(mondayOf(`${year}-01-04`));
  const week = Math.floor((toMs(monday) - week1Monday) / (7 * DAY_MS)) + 1;
  return { year, week };
}

/** 주 머리의 윗줄 — 「47주」, ISO 해가 이번 주의 ISO 해와 다르면 「2027년 1주」. */
export function weekLabel(monday: string, thisWeek: string): string {
  const { year, week } = isoWeekOf(monday);
  return year === isoWeekOf(thisWeek).year ? `${week}주` : `${year}년 ${week}주`;
}

/** 주 머리의 아랫줄 — 「11/16~11/22」(두 자리 월 · 일). */
export function weekRange(monday: string): string {
  const fmt = (date: string) => `${date.slice(5, 7)}/${date.slice(8, 10)}`;
  return `${fmt(monday)}~${fmt(fromMs(toMs(monday) + 6 * DAY_MS))}`;
}

/** 고칠 수 있는 주인가 — 이번 주 ≤ week ≤ 이번 주 + 51주. 월요일인지는 따로 본다. */
export function isEditableWeek(week: string, thisWeek: string): boolean {
  return week >= thisWeek && week <= addWeeks(thisWeek, EDIT_WEEKS - 1);
}

/** 쪽의 첫 주 8개 — 이번 주 + 13주 × k (k = −4 … 3). 첫 화면은 이번 주부터. */
export function pageStarts(thisWeek: string): string[] {
  return Array.from({ length: 8 }, (_, i) => addWeeks(thisWeek, (i - 4) * PAGE_WEEKS));
}

/** 주소의 쪽 값 — 쪽의 첫 주에 든 값이면 그대로, 아니면 이번 주. */
export function pageStartOf(param: string | undefined, thisWeek: string): string {
  return param !== undefined && pageStarts(thisWeek).includes(param) ? param : thisWeek;
}

/** 한 쪽의 주 13개. */
export function pageWeeks(start: string): string[] {
  return Array.from({ length: PAGE_WEEKS }, (_, i) => addWeeks(start, i));
}
