import type { Milli } from "./move-input";
import { lotSize } from "./mps-calc";

// MRP 계산 — 날짜(리드타임 · 완성일 · 늦음)와 품목 하나의 주별 넷팅. 화면과 서버가 함께 쓰며 DB 를 보지 않는다.
// 날짜는 Date.UTC 로만 센다 — 서버의 지역 시각에 기대지 않는다(weeks.ts 와 같다).

const DAY_MS = 86_400_000;
const ZERO = BigInt(0);

const toMs = (date: string): number => {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const fromMs = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** date 에서 n일 뒤(음수는 앞). */
export function addDays(date: string, n: number): string {
  return fromMs(toMs(date) + n * DAY_MS);
}

/** to − from (일). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toMs(to) - toMs(from)) / DAY_MS);
}

/** 그 주(월요일)의 dueWeekday(1 = 월 … 7 = 일) 날짜 — 월요일 + (dueWeekday − 1)일. */
export function dueDateOf(week: string, dueWeekday: number): string {
  return addDays(week, dueWeekday - 1);
}

export type Schedule = {
  /** 완성일 — 지났으면 오늘(결정 9-1) */
  dueDate: string;
  /** 완성일 − 리드타임 */
  plannedStart: string;
  /** 실제 시작일 — 계획 시작이 지났으면 오늘 */
  startDate: string;
  /** 계획 시작이 오늘보다 앞선 날수(결정 9) */
  lateDays: number;
};

/** 필요한 날(due) · 리드타임 · 오늘로 완성일 · 시작일 · 늦은 날수를 셈한다. */
export function scheduleOf(due: string, leadTimeDays: number, today: string): Schedule {
  const dueDate = due > today ? due : today;
  const plannedStart = addDays(dueDate, -leadTimeDays);
  const startDate = plannedStart > today ? plannedStart : today;
  const lateDays = Math.max(0, daysBetween(plannedStart, today));
  return { dueDate, plannedStart, startDate, lateDays };
}

export type NetWeek = {
  week: string;
  /** 그 주의 총소요(이미 단위 자릿수로 올린 값) */
  gross: Milli;
  /** 그 주 총소요 중 가장 이른 필요일(총소요가 없으면 null) */
  earliestNeed: string | null;
  /** 그 주에 받아야 할 수량(계획 입고) */
  receipt: Milli;
  projected: Milli;
};

export type NetItemInput = {
  /** 이번 주부터 이어진 월요일들, 차례대로 */
  weeks: string[];
  /** 처음 재고 = 지금 가용재고 */
  available: Milli;
  safety: Milli;
  minLot: Milli;
  multiple: Milli;
  /** 품목 단위의 소수 자릿수 0 ~ 3 */
  decimals: number;
  /** 주 → 총소요 · 가장 이른 필요일(없으면 그 주는 총소요 0) */
  gross: ReadonlyMap<string, { qty: Milli; earliestNeed: string }>;
};

/**
 * 품목 하나의 주별 넷팅(결정 1). 주마다 net = 지난주 예상재고 − 총소요 이고,
 * net 이 안전재고 밑이면 receipt = lotSize(안전재고 − net), projected = net + receipt.
 * 음수 예상재고도 그대로 다음 주로 넘긴다.
 */
export function netItem(input: NetItemInput): NetWeek[] {
  const { safety, minLot, multiple, decimals, gross } = input;
  let prev = input.available;
  return input.weeks.map((week) => {
    const g = gross.get(week);
    const qty = g?.qty ?? ZERO;
    const net = prev - qty;
    const receipt = net < safety ? lotSize(safety - net, minLot, multiple, decimals) : ZERO;
    const projected = net + receipt;
    prev = projected;
    return { week, gross: qty, earliestNeed: g?.earliestNeed ?? null, receipt, projected };
  });
}
