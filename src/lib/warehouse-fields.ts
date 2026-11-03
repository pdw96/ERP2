// 창고 입력의 칸 이름 — 화면(브라우저)과 서버의 검사(src/lib/warehouse-input.ts)가 함께 쓴다.
// 검사 도구(zod)를 브라우저로 보내지 않게 따로 둔다.

export const WAREHOUSE_FIELDS = ["name", "active"] as const;

export type WarehouseField = (typeof WAREHOUSE_FIELDS)[number];
/** 화면이 보낸 그대로의 글자 — 거절하면 이 값으로 입력 칸을 다시 채운다. */
export type WarehouseValues = Partial<Record<WarehouseField, string>>;
/** 칸마다 거절한 까닭 하나. */
export type WarehouseErrors = Partial<Record<WarehouseField, string>>;
