import { isMoveType, type MoveType } from "@/lib/master-codes";
import { LOT, WAREHOUSE_CODE } from "@/lib/move-input";

// 수불 이력 · 수불부의 주소 값(거르기 · 정렬 · 쪽)을 읽는다(조각 「재고 수불」 설계 「2026-11-09 — PR D 를 열기 전에 정한 것」).
// 틀린 값은 버리고 알린다 — 화면이 멈추지 않고 그 거르기만 걸지 않는다(품목 목록의 거르기와 같다).

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const text = (params: Params, key: string) => (first(params[key]) ?? "").trim();

/** 한 화면의 줄 수(저자 판정). */
export const PAGE_SIZE = 100;
/** 처음 열 때의 기간 — 오늘을 넣어 30일(저자 판정). */
export const DEFAULT_DAYS = 30;

export const ITEM_CODE = /^(RM|SF|FG|SM|CS)-[0-9]{4,}$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type SortDir = "asc" | "desc";
export type Notice = { field: string; message: string };

/** 날짜 글자가 달력에 있는 날인가. */
export function isCalendarDate(value: string): boolean {
  const m = DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export type Period = { from: string; to: string };

/** 기간 — 비우면 최근 30일. 꼴이 틀리거나 시작이 끝보다 뒤면 처음 값으로 두고 알린다. */
export function parsePeriod(params: Params, today: string, notices: Notice[]): Period {
  const fallback = { from: addDays(today, -(DEFAULT_DAYS - 1)), to: today };
  const rawFrom = text(params, "from");
  const rawTo = text(params, "to");
  const from = rawFrom === "" ? fallback.from : rawFrom;
  const to = rawTo === "" ? fallback.to : rawTo;
  if (!isCalendarDate(from) || !isCalendarDate(to)) {
    notices.push({ field: "period", message: "달력에 없는 날짜라 기간을 처음대로 두었습니다" });
    return fallback;
  }
  if (from > to) {
    notices.push({ field: "period", message: "시작일이 끝일보다 뒤라 기간을 처음대로 두었습니다" });
    return fallback;
  }
  return { from, to };
}

function parseCode(params: Params, key: string, pattern: RegExp, what: string, notices: Notice[]): string | undefined {
  const v = text(params, key);
  if (v === "") return undefined;
  if (pattern.test(v)) return v;
  notices.push({ field: key, message: `${what} 꼴이 아니라 거르지 않았습니다` });
  return undefined;
}

/** 정렬 — 고를 수 있는 칸 가운데 하나와 방향. 모르는 칸이면 처음 값. */
function parseSort<K extends string>(params: Params, keys: readonly K[], fallback: K): { sort: K; dir: SortDir } {
  const s = text(params, "sort");
  const sort = (keys as readonly string[]).includes(s) ? (s as K) : fallback;
  const dir: SortDir = text(params, "dir") === "desc" ? "desc" : "asc";
  return { sort, dir: s === sort ? dir : "asc" };
}

function parsePage(params: Params): number {
  const n = Number(text(params, "page"));
  return Number.isInteger(n) && n >= 1 && n <= 100000 ? n : 1;
}

// ── 수불 이력 ───────────────────────────────────────────

/** 수불 이력에서 칸 머리를 눌러 세울 수 있는 칸 — 표의 칸 순서 그대로(저자 판정). */
export const HISTORY_SORTS = [
  "date",
  "code",
  "type",
  "reason",
  "item",
  "itemName",
  "lot",
  "from",
  "to",
  "inQty",
  "outQty",
  "unit",
  "entered",
  "cancel",
  "ref",
  "note",
] as const;
export type HistorySort = (typeof HISTORY_SORTS)[number];

export type HistoryQuery = Period & {
  item?: string;
  warehouse?: string;
  lot?: string;
  moveType?: MoveType;
  sort: HistorySort;
  dir: SortDir;
  page: number;
};

export function parseHistoryQuery(params: Params, today: string): { query: HistoryQuery; notices: Notice[] } {
  const notices: Notice[] = [];
  const period = parsePeriod(params, today, notices);
  const item = parseCode(params, "item", ITEM_CODE, "품목 코드", notices);
  const warehouse = parseCode(params, "wh", WAREHOUSE_CODE, "창고 코드", notices);
  const lot = parseCode(params, "lot", LOT, "LOT", notices);
  const type = text(params, "type");
  let moveType: MoveType | undefined;
  if (isMoveType(type)) moveType = type;
  else if (type) notices.push({ field: "type", message: "없는 유형이라 거르지 않았습니다" });
  return {
    query: {
      ...period,
      item,
      warehouse,
      lot,
      moveType,
      ...parseSort(params, HISTORY_SORTS, "date"),
      page: parsePage(params),
    },
    notices,
  };
}

// ── 수불부 ─────────────────────────────────────────────

/** 수불부의 품목별 목록에서 칸 머리를 눌러 세울 수 있는 칸 — 표의 칸 순서 그대로. */
export const LEDGER_SORTS = [
  "item",
  "itemName",
  "unit",
  "opening",
  "inIn",
  "inXfer",
  "inAdj",
  "inTotal",
  "outOut",
  "outXfer",
  "outAdj",
  "outTotal",
  "closing",
] as const;
export type LedgerSort = (typeof LEDGER_SORTS)[number];

export type LedgerQuery = Period & { item?: string; warehouse?: string; sort: LedgerSort; dir: SortDir; page: number };

export function parseLedgerQuery(params: Params, today: string): { query: LedgerQuery; notices: Notice[] } {
  const notices: Notice[] = [];
  const period = parsePeriod(params, today, notices);
  const item = parseCode(params, "item", ITEM_CODE, "품목 코드", notices);
  const warehouse = parseCode(params, "wh", WAREHOUSE_CODE, "창고 코드", notices);
  const sorted = parseSort(params, LEDGER_SORTS, "item");
  // 창고를 고르지 않으면 「이동」 칸이 없다 — 그 칸으로는 세우지 않는다.
  const hidden = !warehouse && (sorted.sort === "inXfer" || sorted.sort === "outXfer");
  return {
    query: {
      ...period,
      item,
      warehouse,
      ...(hidden ? { sort: "item" as const, dir: "asc" as const } : sorted),
      page: parsePage(params),
    },
    notices,
  };
}

/** 품목 하나의 거래(수불부에서 품목을 누른 화면) — 기간 · 창고만. */
export function parseLedgerDetailQuery(
  params: Params,
  today: string,
): { query: Period & { warehouse?: string }; notices: Notice[] } {
  const notices: Notice[] = [];
  const period = parsePeriod(params, today, notices);
  const warehouse = parseCode(params, "wh", WAREHOUSE_CODE, "창고 코드", notices);
  return { query: { ...period, warehouse }, notices };
}

/**
 * 주소의 쿼리 — 값이 있는 것만 싣는다. 처음 값(정렬 처음 칸의 오름 · 1쪽)은 빼서 주소를 짧게 둔다.
 * 거르기를 바꾸는 폼은 쪽을 싣지 않으므로 1쪽으로 돌아간다.
 */
export function queryString(values: Record<string, string | number | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(values)) if (v !== undefined && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/**
 * 표의 숫자를 어떻게 셌는지(저자 판정 — 표 위 「모두 N품목」 줄에) — 창고를 고르면 그 창고에 들고 난 것(이동 포함),
 * 고르지 않으면 모든 창고의 합(창고끼리의 이동은 들고 나는 것이 지워져 빠진다). 지금 보이는 숫자와 늘 같다.
 */
export function basisOf(warehouse: string | undefined, warehouses: readonly { code: string; name: string }[]) {
  if (!warehouse) return "모든 창고 합계 · 이동 제외";
  const name = warehouses.find((w) => w.code === warehouse)?.name;
  return `${warehouse}${name ? ` ${name}` : ""} 기준 · 이동 포함`;
}
