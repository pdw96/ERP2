// LOT 번호 규칙(조각 「재고 수불」 PR B, ADR 0016)의 칸과 번호의 꼴 — 화면(브라우저)과 서버가 함께 쓴다.
// 검사 도구(zod)를 브라우저로 보내지 않게 입력 검사(src/lib/number-rule-input.ts)와 따로 둔다.

export const NUMBER_RULE_FIELDS = [
  "code",
  "name",
  "prefix",
  "separator",
  "dateFormat",
  "seqDigits",
  "defaultFor",
  "active",
] as const;

export type NumberRuleField = (typeof NUMBER_RULE_FIELDS)[number];
/** 화면이 보낸 그대로의 글자 — 거절하면 이 값으로 입력 칸을 다시 채운다. */
export type NumberRuleValues = Partial<Record<NumberRuleField, string>>;
/** 칸마다 거절한 까닭 하나. */
export type NumberRuleErrors = Partial<Record<NumberRuleField, string>>;

/** 규칙 코드 — 공통코드 묶음과 같은 꼴(영문 대문자로 시작해 대문자 · 숫자 · 밑줄 2 ~ 20자). DB 도 막는다. */
export const RULE_CODE = /^[A-Z][A-Z0-9_]{1,19}$/;

/** 고르는 칸의 값 — 「없음」은 화면에서 `NONE` 으로 보내고 DB 에는 빈 글자로 둔다. */
export const NONE = "NONE";

export const SEPARATORS = [
  { value: "", label: "없음" },
  { value: "-", label: "붙임표 -" },
  { value: "_", label: "밑줄 _" },
  { value: ".", label: "점 ." },
] as const;

/** 날짜 꼴 — 날짜는 수불 일자. 일련은 날짜 꼴의 단위로 다시 센다(매일 · 매달 · 다시 세지 않음). */
export const DATE_FORMATS = [
  { value: "", label: "없음", resets: "다시 세지 않음" },
  { value: "YYMMDD", label: "YYMMDD", resets: "매일" },
  { value: "YYYYMMDD", label: "YYYYMMDD", resets: "매일" },
  { value: "YYMM", label: "YYMM", resets: "매달" },
] as const;

export type Separator = (typeof SEPARATORS)[number]["value"];
export type DateFormat = (typeof DATE_FORMATS)[number]["value"];

export const SEQ_DIGITS_MIN = 2;
export const SEQ_DIGITS_MAX = 6;

export type RuleShape = { prefix: string; separator: string; dateFormat: string; seqDigits: number };

/** 날짜(YYYY-MM-DD)를 날짜 꼴로 — 일련을 다시 세는 기간의 열쇠이기도 하다. 날짜 꼴이 없으면 빈 글자. */
export function periodOf(dateFormat: string, date: string): string {
  const [y, m, d] = date.split("-");
  if (dateFormat === "YYMMDD") return `${y.slice(2)}${m}${d}`;
  if (dateFormat === "YYYYMMDD") return `${y}${m}${d}`;
  if (dateFormat === "YYMM") return `${y.slice(2)}${m}`;
  return "";
}

/**
 * 번호 하나 — 머리 → 날짜 → 일련의 차례로, 있는 조각 사이에 구분자를 넣는다. 머리 · 날짜 꼴이 없으면 그 조각과 그 앞의 구분자가 빠진다.
 * 일련은 자릿수만큼 0 으로 채우고, 넘으면 자리가 는다(ADR 0016).
 */
export function formatLotNumber(rule: RuleShape, date: string, seq: number): string {
  const parts = [rule.prefix, periodOf(rule.dateFormat, date), String(seq).padStart(rule.seqDigits, "0")];
  return parts.filter((p) => p !== "").join(rule.separator);
}

export const separatorLabel = (v: string) => SEPARATORS.find((s) => s.value === v)?.label ?? v;
export const dateFormatLabel = (v: string) => DATE_FORMATS.find((d) => d.value === v)?.label ?? v;
