import { isMadeType } from "./master-codes";

// 품목의 재고 칸(조각 「재고 수불」 PR B, 설계 ③ 「품목의 새 칸」) — LOT 번호 규칙과 기본 입고 · 출고 창고를 DB 의 목록에 대어 본다.
// 한 건 등록 · 수정과 시트가 같이 쓴다(같은 규칙 · 같은 말). 목록은 부르는 쪽이 DB 에서 읽어 준다.
// - 규칙은 만드는 품목(반제품 · 완제품)만 고른다. 비우면 유형의 기본 규칙이다(ADR 0016).
// - 창고는 불량창고를 고르지 못한다(ADR 0015).
// - 「사용 안 함」인 규칙 · 창고는 새로 고르지 못하고, 그 품목의 지금 값이면 남는다(단위 · 분류와 같다).

export type RuleChoice = { code: string; name: string; active: boolean };
export type WarehouseChoice = { id: number; code: string; name: string; active: boolean; isDefect: boolean };
export type StockLists = { rules: readonly RuleChoice[]; warehouses: readonly WarehouseChoice[] };

export type StockField = "lotRuleCode" | "defaultInWarehouse" | "defaultOutWarehouse";
export type StockColumns = {
  lotRuleCode: string | null;
  defaultInWarehouseId: number | null;
  defaultOutWarehouseId: number | null;
};

export const RULE_NOT_MADE =
  "LOT 번호 규칙은 반제품 · 완제품만 고릅니다 — 사 오는 품목은 입고 때 거래처 LOT 를 넣습니다";
export const DEFECT_WAREHOUSE = "불량창고는 기본 창고로 고르지 못합니다";

/**
 * 고른 규칙 · 창고를 DB 의 목록에 대어 보고, 맞으면 저장할 칸(창고는 번호)을 돌려준다. skip 에 든 칸은 보지 않는다(이미 까닭이 있는 칸).
 * itemType 을 모르면(유형을 못 읽었으면) 규칙은 보지 않는다 — 유형의 까닭 하나만 알린다.
 */
export function resolveStock(
  input: {
    itemType: string | undefined;
    lotRuleCode: string | null;
    defaultInWarehouse: string | null;
    defaultOutWarehouse: string | null;
  },
  lists: StockLists,
  current?: StockColumns,
  skip: ReadonlySet<string> = new Set(),
): { ok: true; value: StockColumns } | { ok: false; errors: Partial<Record<StockField, string>> } {
  const errors: Partial<Record<StockField, string>> = {};

  const rule = input.lotRuleCode;
  if (rule && !skip.has("lotRuleCode") && input.itemType) {
    const found = lists.rules.find((r) => r.code === rule);
    if (!isMadeType(input.itemType)) errors.lotRuleCode = RULE_NOT_MADE;
    else if (!found) errors.lotRuleCode = "없는 LOT 번호 규칙입니다 — 목록에서 고르세요";
    else if (!found.active && rule !== current?.lotRuleCode)
      errors.lotRuleCode = "「사용 안 함」인 규칙입니다 — 다른 규칙을 고르세요";
  }

  const warehouseId = (field: "defaultInWarehouse" | "defaultOutWarehouse", now: number | null | undefined) => {
    const code = input[field];
    if (!code || skip.has(field)) return null;
    const found = lists.warehouses.find((w) => w.code === code);
    if (!found) errors[field] = "없는 창고입니다 — 목록에서 고르세요";
    else if (found.isDefect) errors[field] = DEFECT_WAREHOUSE;
    else if (!found.active && found.id !== now) errors[field] = "「사용 안 함」인 창고입니다 — 다른 창고를 고르세요";
    else return found.id;
    return null;
  };
  const inId = warehouseId("defaultInWarehouse", current?.defaultInWarehouseId);
  const outId = warehouseId("defaultOutWarehouse", current?.defaultOutWarehouseId);

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { lotRuleCode: rule, defaultInWarehouseId: inId, defaultOutWarehouseId: outId } };
}

/** 창고 번호 → 코드(목록에 없으면 빈 글자) — 화면 · 시트가 품목의 지금 값을 코드로 보인다. */
export const warehouseCodeOf = (lists: Pick<StockLists, "warehouses">, id: number | null) =>
  (id !== null && lists.warehouses.find((w) => w.id === id)?.code) || "";
