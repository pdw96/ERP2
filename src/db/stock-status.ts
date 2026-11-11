import { sql, type SQL } from "drizzle-orm";
import { formatMilli } from "@/lib/move-input";
import { PAGE_SIZE, type ItemStockQuery, type ItemStockSort } from "@/lib/stock-query";
import { likeLiteral } from "./master-shared";
import { milliOf, stockBucket } from "./stock";
import type { Page } from "./stock-history";
import type { Db } from "./types";

// 재고 현황 — 잔액(stock_balances)을 묶어 더하기만 한다(조각 「재고 현황」 설계 ②, ADR 0023).
// - 따로 계산하지 않는다: 수불 줄이나 다른 표에서 재고를 다시 세지 않고, 불량 · 검사대기 · 가용은 재고 계산의 stockBucket 한 곳으로 가른다.
// - 쓰지 않는다: 이 파일에는 DB 에 쓰는 문장이 없다. 재고를 바꾸는 길은 src/db/stock.ts 하나다.

// postgres 드라이버는 행의 배열을, PGlite 는 { rows } 를 돌려준다.
function rowsOf<T>(result: unknown): T[] {
  return (Array.isArray(result) ? result : (result as { rows: T[] }).rows) as T[];
}

const fmt = (v: string | number | null) => (v === null ? null : formatMilli(milliOf(v)));

/** 쪽 — 마지막 쪽을 넘으면 마지막 쪽. */
function clampPage(page: number, total: number) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return { page: Math.min(page, pages), pages };
}

/** 네 칸 — 실재고 · 검사대기 · 불량 · 가용재고(ADR 0023 의 2). 실재고 = 검사대기 + 불량 + 가용재고. */
export type StockQty = { onHand: string; qc: string; defect: string; available: string };

/** 잔액을 묶어 네 칸으로 더하는 식 — `b` 는 잔액, `w` 는 그 창고. */
const bucket = stockBucket("b", "w");
const FOUR = sql`
  sum(b.qty) as on_hand,
  coalesce(sum(b.qty) filter (where ${bucket} = 'QC'), 0) as qc,
  coalesce(sum(b.qty) filter (where ${bucket} = 'DEFECT'), 0) as defect,
  coalesce(sum(b.qty) filter (where ${bucket} = 'AVAILABLE'), 0) as available`;

// ── 품목별 재고 ─────────────────────────────────────────

export type ItemStockRow = StockQty & {
  itemCode: string;
  itemName: string;
  spec: string;
  itemTypeName: string;
  unit: string;
  active: boolean;
  /** 안전재고 — 품목의 칸(처음 값 0). */
  safety: string;
  /** 모자란 수량(안전재고 − 가용재고) — 미달일 때만, 아니면 null(ADR 0023 의 4). */
  short: string | null;
};

/**
 * 품목마다 한 줄 — 「사용」인 품목은 재고가 0 이어도, 「사용 안 함」 품목은 재고가 있을 때만(ADR 0023 의 5).
 * 미달은 안전재고 > 0 이고 가용재고 < 안전재고(ADR 0023 의 4).
 */
const ITEM_STOCK = sql`
  select i.code as item_code, i.name as item_name, i.spec, i.item_type, ct.sort_order as type_order,
    coalesce(ct.name, i.item_type) as item_type_name, i.unit, i.active, i.safety_stock,
    coalesce(s.on_hand, 0) as on_hand, coalesce(s.qc, 0) as qc, coalesce(s.defect, 0) as defect,
    coalesce(s.available, 0) as available,
    case when i.safety_stock > 0 and coalesce(s.available, 0) < i.safety_stock
      then i.safety_stock - coalesce(s.available, 0) end as short
  from items i
  left join (
    select b.item_id, ${FOUR}
    from stock_balances b
    join warehouses w on w.id = b.warehouse_id
    group by b.item_id
  ) s on s.item_id = i.id
  left join codes ct on ct.group_code = i.item_type_group and ct.code = i.item_type
  where i.active or coalesce(s.on_hand, 0) > 0`;

/** 칸 머리로 세우는 값 — 빈 값은 null 로 두어 어느 방향이든 맨 뒤다. 값이 같으면 품목코드 차례. */
const ITEM_STOCK_KEY: Record<ItemStockSort, SQL> = {
  item: sql`x.item_code`,
  itemName: sql`x.item_name`,
  spec: sql`nullif(x.spec, '')`,
  type: sql`x.type_order`,
  unit: sql`x.unit`,
  onHand: sql`x.on_hand`,
  qc: sql`x.qc`,
  defect: sql`x.defect`,
  available: sql`x.available`,
  safety: sql`x.safety_stock`,
  short: sql`x.short`,
};

function itemStockWhere(q: ItemStockQuery): SQL {
  const where: SQL[] = [sql`true`];
  if (q.q) {
    const like = likeLiteral(q.q);
    where.push(sql`(x.item_code ilike ${like} or x.item_name ilike ${like})`);
  }
  if (q.itemType) where.push(sql`x.item_type = ${q.itemType}`);
  if (q.shortOnly) where.push(sql`x.short is not null`);
  return sql.join(where, sql` and `);
}

/** 품목별 재고 — 거르고, 칸 머리의 차례로 세워 100줄씩(조각 「재고 현황」 성공 기준 3 · 4 · 11). */
export async function listItemStock(db: Db, q: ItemStockQuery): Promise<Page<ItemStockRow>> {
  const where = itemStockWhere(q);
  const [{ n }] = rowsOf<{ n: number }>(
    await db.execute(sql`select count(*)::int as n from (${ITEM_STOCK}) x where ${where}`),
  );
  const total = Number(n);
  const { page, pages } = clampPage(q.page, total);
  const order = sql`${ITEM_STOCK_KEY[q.sort]} ${sql.raw(q.dir)} nulls last, x.item_code asc`;
  const rows = rowsOf<{
    item_code: string;
    item_name: string;
    spec: string;
    item_type_name: string;
    unit: string;
    active: boolean;
    safety_stock: string;
    on_hand: string;
    qc: string;
    defect: string;
    available: string;
    short: string | null;
  }>(
    await db.execute(sql`
      select x.item_code, x.item_name, x.spec, x.item_type_name, x.unit, x.active,
        x.safety_stock::text as safety_stock, x.on_hand::text as on_hand, x.qc::text as qc, x.defect::text as defect,
        x.available::text as available, x.short::text as short
      from (${ITEM_STOCK}) x
      where ${where}
      order by ${order}
      limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`),
  );
  return {
    total,
    page,
    pages,
    rows: rows.map((r) => ({
      itemCode: r.item_code,
      itemName: r.item_name,
      spec: r.spec,
      itemTypeName: r.item_type_name,
      unit: r.unit,
      active: r.active === true || String(r.active) === "true",
      onHand: fmt(r.on_hand)!,
      qc: fmt(r.qc)!,
      defect: fmt(r.defect)!,
      available: fmt(r.available)!,
      safety: fmt(r.safety_stock)!,
      short: fmt(r.short),
    })),
  };
}
