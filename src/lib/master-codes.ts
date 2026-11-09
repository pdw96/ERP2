// 프로그램이 아는 공통코드 — 「시스템 코드」 묶음의 값(ADR 0009).
// 품목 코드의 머리(ADR 0003)와 뒤 조각의 계산이 이 값에 기대므로 화면에서 바꾸지 않는다.
// 샘플 데이터(src/db/sample.ts)의 시스템 코드 묶음은 이 목록과 같아야 한다 — 시험이 견준다.

export const ITEM_TYPES = [
  { code: "RM", name: "원자재" },
  { code: "SF", name: "반제품" },
  { code: "FG", name: "완제품" },
  // 조각 「재고 수불」 PR B(ADR 0019) — 사 오는 품목 가운데 LOT 없이 들어오는 것.
  { code: "SM", name: "부자재" },
  { code: "CS", name: "소모품" },
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

/**
 * 유형을 고르면 붙는 기본값 — 원자재 → 구매 · 수입검사, 반제품 → 생산, 완제품 → 생산 · 출하검사(ADR 0003),
 * 부자재 · 소모품 → 구매(ADR 0019). LOT 관리는 원자재 · 반제품 · 완제품만 켬(ADR 0015 · 0019). 등록 화면에서 바꿀 수 있다.
 */
export const ITEM_TYPE_DEFAULTS: Record<
  ItemType,
  { procurement: ProcType; inspectIn: boolean; inspectOut: boolean; lotManaged: boolean }
> = {
  RM: { procurement: "BUY", inspectIn: true, inspectOut: false, lotManaged: true },
  SF: { procurement: "MAKE", inspectIn: false, inspectOut: false, lotManaged: true },
  FG: { procurement: "MAKE", inspectIn: false, inspectOut: true, lotManaged: true },
  SM: { procurement: "BUY", inspectIn: false, inspectOut: false, lotManaged: false },
  CS: { procurement: "BUY", inspectIn: false, inspectOut: false, lotManaged: false },
};

/** 만드는 품목 — LOT 번호 규칙을 쓰고, 입고에서 LOT 를 비우면 저절로 붙는다(ADR 0016). 나머지는 사 오는 품목이다. */
export const MADE_ITEM_TYPES = ["SF", "FG"] as const satisfies readonly ItemType[];
export type MadeItemType = (typeof MADE_ITEM_TYPES)[number];
export const isMadeType = (type: string): type is MadeItemType => (MADE_ITEM_TYPES as readonly string[]).includes(type);

export const itemTypeName = (code: string) => ITEM_TYPES.find((t) => t.code === code)?.name ?? code;
export const procTypeName = (code: string) => PROC_TYPES.find((t) => t.code === code)?.name ?? code;

/** 한국 — 거래처의 사업자등록번호 꼴(000-00-00000) 검사가 기대는 국가 코드(ADR 0011). */
export const KOREA = "KR";

/**
 * 사용자 코드이지만 「사용 안 함」으로 바꾸지 못하는 값 — 프로그램이 기댄다.
 * 국가 KR(사업자등록번호 꼴 검사, ADR 0011 · 저자 인터뷰 2026-11-03).
 */
export const ALWAYS_ACTIVE: Readonly<Record<string, readonly string[]>> = { COUNTRY: [KOREA] };

export const isAlwaysActive = (group: string, code: string) => ALWAYS_ACTIVE[group]?.includes(code) ?? false;
