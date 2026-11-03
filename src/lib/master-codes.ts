// 프로그램이 아는 공통코드 — 「시스템 코드」 묶음의 값(ADR 0009).
// 품목 코드의 머리(ADR 0003)와 뒤 조각의 계산이 이 값에 기대므로 화면에서 바꾸지 않는다.
// 샘플 데이터(src/db/sample.ts)의 시스템 코드 묶음은 이 목록과 같아야 한다 — 시험이 견준다.

export const ITEM_TYPES = [
  { code: "RM", name: "원자재" },
  { code: "SF", name: "반제품" },
  { code: "FG", name: "완제품" },
] as const;

export const PROC_TYPES = [
  { code: "BUY", name: "구매" },
  { code: "MAKE", name: "생산" },
] as const;

export type ItemType = (typeof ITEM_TYPES)[number]["code"];
export type ProcType = (typeof PROC_TYPES)[number]["code"];

/** 시스템 코드 묶음 — 묶음 코드와 프로그램이 아는 값. */
export const SYSTEM_CODE_GROUPS = {
  ITEM_TYPE: ITEM_TYPES,
  PROC_TYPE: PROC_TYPES,
} as const;
