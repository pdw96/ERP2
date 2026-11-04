// 품목 입력의 칸 이름 — 화면(브라우저)과 서버의 검사(src/lib/item-input.ts)가 함께 쓴다.
// 검사 도구(zod)를 브라우저로 보내지 않게 따로 둔다.

export const ITEM_FIELDS = [
  "itemType",
  "procurement",
  "name",
  "spec",
  "unit",
  "inspectIn",
  "inspectOut",
  "leadTimeDays",
  "safetyStock",
  "minLot",
  "lotMultiple",
  "cls1",
  "cls2",
  "cls3",
  "note",
  "active",
] as const;

export type ItemField = (typeof ITEM_FIELDS)[number];
/** 화면이 보낸 그대로의 글자 — 거절하면 이 값으로 입력 칸을 다시 채운다. */
export type ItemValues = Partial<Record<ItemField, string>>;
/** 칸마다 거절한 까닭 하나. */
export type ItemErrors = Partial<Record<ItemField, string>>;

/** 품목 분류 — 칸과 공통코드 묶음(저자 인터뷰 2026-11-04, ADR 0012). 대분류는 종류, 중분류는 패키지, 소분류는 용도. */
export const ITEM_CLASSES = [
  { field: "cls1", group: "ITEM_CLS1", label: "대분류" },
  { field: "cls2", group: "ITEM_CLS2", label: "중분류" },
  { field: "cls3", group: "ITEM_CLS3", label: "소분류" },
] as const;

export type ItemClassField = (typeof ITEM_CLASSES)[number]["field"];

/** 비고의 길이(설계 「PR H 를 열기 전에 정한 것」) — 품목 · 거래처 같다. */
export const NOTE_MAX = 500;
