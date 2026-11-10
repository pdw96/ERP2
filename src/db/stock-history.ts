import { asc, sql, type SQL } from "drizzle-orm";
import { formatMilli } from "@/lib/move-input";
import { moveTypeName } from "@/lib/master-codes";
import {
  PAGE_SIZE,
  type HistoryQuery,
  type HistorySort,
  type LedgerQuery,
  type LedgerSort,
  type Period,
  type SortDir,
} from "@/lib/stock-query";
import { items, warehouses } from "./schema";
import { milliOf } from "./stock";
import type { Db } from "./types";

// 수불 이력 · 수불부 — 수불 줄을 읽기만 한다(조각 「재고 수불」 성공 기준 8 · 9, 설계 「2026-11-09 — PR D 를 열기 전에 정한 것」).
// 재고를 바꾸는 길은 src/db/stock.ts 하나이고, 여기는 그 줄을 거르고 세우고 더한다.
// - 줄의 차례: 일자 → 전표 번호(그날의 일련) → 줄 번호. 칸 머리로 세우면 그 칸이 먼저이고, 값이 같으면 이 차례(오래된 것부터)다.
// - 수불부의 칸: 취소 줄은 보내는 · 받는 창고를 바꾼 줄이라(설계 「PR C 에서 정한 것」) 창고를 원래 쪽으로 되돌려 원래 유형의 칸에서 뺀다.
//   기초 + 입고 계 − 출고 계 = 기말이 늘 맞는다 — 줄마다 잔액에 주는 몫과 칸에 주는 몫이 같다.

// postgres 드라이버는 행의 배열을, PGlite 는 { rows } 를 돌려준다.
function rowsOf<T>(result: unknown): T[] {
  return (Array.isArray(result) ? result : (result as { rows: T[] }).rows) as T[];
}

/** 그날의 전표 일련 — `IV-YYYYMMDD-NNN` 의 NNN(세 자리를 넘을 수 있어 글자로 세우지 않는다). */
const codeSeq = sql`substring(m.code from 13)::int`;
/** 줄의 차례 — 일자 → 전표 번호 → 줄 번호. */
const lineOrder = (dir: SortDir) => {
  const d = sql.raw(dir);
  return sql`ml.move_date ${d}, ${codeSeq} ${d}, ml.line_no ${d}`;
};

const fmt = (v: string | number | null) => (v === null ? null : formatMilli(milliOf(v)));

// ── 수불 이력 ───────────────────────────────────────────

export type HistoryRow = {
  id: number;
  moveDate: string;
  code: string;
  moveTypeName: string;
  reasonName: string | null;
  itemCode: string;
  itemName: string;
  lot: string;
  /** 출고창고 · 입고창고 — 취소 전표는 원래 전표의 쪽(두 창고를 되돌린 쪽)으로 보인다. */
  from: string | null;
  to: string | null;
  /** 입고수량 · 출고수량 — 취소 전표는 원래 쪽 칸에 「−20」. 이동은 창고로 거르면 그 창고 쪽만, 아니면 둘 다. */
  inQty: string | null;
  outQty: string | null;
  unit: string;
  /** 품목 단위와 다른 단위로 넣었으면 「500 G」. */
  entered: string | null;
  /** 이 전표가 취소한 전표 · 이 전표를 취소한 전표. */
  cancels: string | null;
  canceledBy: string | null;
  /** 이 전표를 만든 재고 실사 — 「실사 차이」 조정 전표만(조각 「재고 수불」 PR E). */
  count: string | null;
  note: string;
};

export type Page<Row> = { rows: Row[]; total: number; page: number; pages: number };

/** 부호 있는 수량 — 취소 줄은 원래 쪽 칸에서 뺀다(수불부와 같은 셈). */
const signedQty = sql`(case when m.is_cancel then -ml.qty else ml.qty end)`;
/**
 * 입고수량 · 출고수량 — 원래 쪽(취소 줄은 두 창고를 되돌린 쪽)의 입고창고가 있으면 입고, 출고창고가 있으면 출고.
 * 창고로 거르면 그 창고 쪽 칸만 채운다 — 이동은 출고창고에서는 출고, 입고창고에서는 입고다(저자 판정).
 */
const inQtyOf = (warehouse?: string) =>
  sql`(case when tw.id is not null ${warehouse ? sql`and tw.code = ${warehouse}` : sql``} then ${signedQty} end)`;
const outQtyOf = (warehouse?: string) =>
  sql`(case when fw.id is not null ${warehouse ? sql`and fw.code = ${warehouse}` : sql``} then ${signedQty} end)`;

/** 칸 머리로 세우는 값 — 빈 값은 null 로 두어 어느 방향이든 맨 뒤다. */
const HISTORY_KEY: Record<Exclude<HistorySort, "date" | "code" | "inQty" | "outQty">, SQL> = {
  type: sql`mt.sort_order`,
  reason: sql`rc.name`,
  item: sql`i.code`,
  itemName: sql`i.name`,
  lot: sql`nullif(ml.lot, '')`,
  from: sql`fw.code`,
  to: sql`tw.code`,
  unit: sql`i.unit`,
  entered: sql`case when ml.entered_unit <> i.unit then ml.entered_qty end`,
  cancel: sql`case when m.is_cancel then 1 when cb.id is not null then 2 end`,
  ref: sql`coalesce(og.code, cb.code, sc.code)`,
  note: sql`nullif(m.note, '')`,
};

function historyOrder(q: HistoryQuery): SQL {
  const { sort, dir } = q;
  // 일자 · 전표 번호는 줄의 차례 그 자체다(전표 번호가 일자를 든다).
  if (sort === "date" || sort === "code") return lineOrder(dir);
  const key = sort === "inQty" ? inQtyOf(q.warehouse) : sort === "outQty" ? outQtyOf(q.warehouse) : HISTORY_KEY[sort];
  return sql`${key} ${sql.raw(dir)} nulls last, ${lineOrder("asc")}`;
}

const HISTORY_FROM = sql`
  from stock_move_lines ml
  join stock_moves m on m.id = ml.move_id
  join items i on i.id = ml.item_id
  left join warehouses fw on fw.id = (case when m.is_cancel then ml.to_warehouse_id else ml.from_warehouse_id end)
  left join warehouses tw on tw.id = (case when m.is_cancel then ml.from_warehouse_id else ml.to_warehouse_id end)
  left join codes mt on mt.group_code = m.move_type_group and mt.code = m.move_type
  left join codes rc on rc.group_code = m.reason_group and rc.code = m.reason
  left join stock_moves cb on cb.cancels_move_id = m.id
  left join stock_moves og on og.id = m.cancels_move_id
  left join stock_counts sc on sc.adjust_move_id = m.id`;

function historyWhere(q: HistoryQuery): SQL {
  const where: SQL[] = [sql`ml.move_date between ${q.from} and ${q.to}`];
  if (q.item) where.push(sql`i.code = ${q.item}`);
  // 창고는 보내는 쪽이든 받는 쪽이든 — 이동은 두 창고에서 다 보인다.
  if (q.warehouse) where.push(sql`(fw.code = ${q.warehouse} or tw.code = ${q.warehouse})`);
  if (q.lot) where.push(sql`ml.lot = ${q.lot}`);
  if (q.moveType) where.push(sql`m.move_type = ${q.moveType}`);
  return sql.join(where, sql` and `);
}

/** 쪽 — 마지막 쪽을 넘으면 마지막 쪽. */
function clampPage(page: number, total: number) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return { page: Math.min(page, pages), pages };
}

/** 수불 줄 한 건마다 — 거르고, 칸 머리의 차례로 세워 100줄씩(성공 기준 8). */
export async function listHistory(db: Db, q: HistoryQuery): Promise<Page<HistoryRow>> {
  const where = historyWhere(q);
  const [{ n }] = rowsOf<{ n: number }>(
    await db.execute(sql`select count(*)::int as n ${HISTORY_FROM} where ${where}`),
  );
  const total = Number(n);
  const { page, pages } = clampPage(q.page, total);
  const rows = rowsOf<{
    id: number;
    move_date: string;
    code: string;
    move_type: string;
    reason_name: string | null;
    item_code: string;
    item_name: string;
    lot: string;
    from_code: string | null;
    from_name: string | null;
    to_code: string | null;
    to_name: string | null;
    in_qty: string | null;
    out_qty: string | null;
    unit: string;
    entered_qty: string;
    entered_unit: string;
    cancels: string | null;
    canceled_by: string | null;
    count_code: string | null;
    note: string;
  }>(
    await db.execute(sql`
      select ml.id, ml.move_date::text as move_date, m.code, m.move_type, rc.name as reason_name,
        i.code as item_code, i.name as item_name, ml.lot,
        fw.code as from_code, fw.name as from_name, tw.code as to_code, tw.name as to_name,
        ${inQtyOf(q.warehouse)}::text as in_qty, ${outQtyOf(q.warehouse)}::text as out_qty, i.unit, ml.entered_qty::text as entered_qty, ml.entered_unit,
        og.code as cancels, cb.code as canceled_by, sc.code as count_code, m.note
      ${HISTORY_FROM}
      where ${where}
      order by ${historyOrder(q)}
      limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`),
  );
  return {
    total,
    page,
    pages,
    rows: rows.map((r) => ({
      id: Number(r.id),
      moveDate: r.move_date,
      code: r.code,
      moveTypeName: moveTypeName(r.move_type),
      reasonName: r.reason_name,
      itemCode: r.item_code,
      itemName: r.item_name,
      lot: r.lot,
      from: r.from_code === null ? null : `${r.from_code} ${r.from_name}`,
      to: r.to_code === null ? null : `${r.to_code} ${r.to_name}`,
      inQty: fmt(r.in_qty),
      outQty: fmt(r.out_qty),
      unit: r.unit,
      entered: r.entered_unit === r.unit ? null : `${fmt(r.entered_qty)} ${r.entered_unit}`,
      cancels: r.cancels,
      canceledBy: r.canceled_by,
      count: r.count_code,
      note: r.note,
    })),
  };
}

// ── 수불부 ─────────────────────────────────────────────

/**
 * 수불 줄을 수불부의 쪽으로 편다 — 창고 하나(warehouse)를 고르면 그 창고의 들고 남, 고르지 않으면 모든 창고의 합(이동은 들고 나가 빠진다).
 * - 잔액의 몫: 받는 창고가 그 창고면 +, 보내는 창고면 −(기초).
 * - 칸의 몫: 원래 쪽(취소 줄은 두 창고를 되돌린 쪽)이 받는 쪽이면 입고의 칸, 보내는 쪽이면 출고의 칸에 부호 있는 수량(취소는 −)을 더한다.
 */
function ledgerLines(itemCode: string | undefined, to: string, warehouse: string | undefined): SQL {
  const wid = warehouse ? sql`(select id from warehouses where code = ${warehouse})` : null;
  const inActual = wid ? sql`tw_ = ${wid}` : sql`(tw_ is not null and fw_ is null)`;
  const outActual = wid ? sql`fw_ = ${wid}` : sql`(fw_ is not null and tw_ is null)`;
  const inOrig = wid ? sql`ot = ${wid}` : sql`(ot is not null and of_ is null)`;
  const outOrig = wid ? sql`of_ = ${wid}` : sql`(of_ is not null and ot is null)`;
  return sql`
    with raw as (
      select ml.id, ml.item_id, ml.move_date, ml.line_no, m.code, m.move_type as t, ml.qty as q,
        ml.from_warehouse_id as fw_, ml.to_warehouse_id as tw_,
        case when m.is_cancel then ml.to_warehouse_id else ml.from_warehouse_id end as of_,
        case when m.is_cancel then ml.from_warehouse_id else ml.to_warehouse_id end as ot,
        case when m.is_cancel then -ml.qty else ml.qty end as sq
      from stock_move_lines ml
      join stock_moves m on m.id = ml.move_id
      join items i on i.id = ml.item_id
      where ml.move_date <= ${to} ${itemCode ? sql`and i.code = ${itemCode}` : sql``}
    ), l as (
      select raw.*,
        case when ${inActual} then q when ${outActual} then -q else 0 end as bal,
        case when ${inOrig} then sq end as in_q,
        case when ${outOrig} then sq end as out_q
      from raw
    )`;
}

export type LedgerRow = {
  itemCode: string;
  itemName: string;
  unit: string;
  opening: string;
  inIn: string;
  inXfer: string;
  inAdj: string;
  inTotal: string;
  outOut: string;
  outXfer: string;
  outAdj: string;
  outTotal: string;
  closing: string;
};

const LEDGER_KEY: Record<LedgerSort, SQL> = {
  item: sql`i.code`,
  itemName: sql`i.name`,
  unit: sql`i.unit`,
  opening: sql`s.opening`,
  inIn: sql`s.in_in`,
  inXfer: sql`s.in_xfer`,
  inAdj: sql`s.in_adj`,
  inTotal: sql`s.in_total`,
  outOut: sql`s.out_out`,
  outXfer: sql`s.out_xfer`,
  outAdj: sql`s.out_adj`,
  outTotal: sql`s.out_total`,
  closing: sql`(s.opening + s.in_total - s.out_total)`,
};

/** 품목별 기초 · 입고 · 출고 · 기말 — 넷이 다 0 인 품목은 두지 않는다. 칸 머리의 차례로 세워 100줄씩(성공 기준 9). */
export async function listLedger(db: Db, q: LedgerQuery): Promise<Page<LedgerRow>> {
  const body = sql`
    ${ledgerLines(q.item, q.to, q.warehouse)}, s as (
      select item_id,
        coalesce(sum(bal) filter (where move_date < ${q.from}), 0) as opening,
        coalesce(sum(in_q) filter (where move_date >= ${q.from} and t = 'IN'), 0) as in_in,
        coalesce(sum(in_q) filter (where move_date >= ${q.from} and t = 'XFER'), 0) as in_xfer,
        coalesce(sum(in_q) filter (where move_date >= ${q.from} and t = 'ADJ'), 0) as in_adj,
        coalesce(sum(in_q) filter (where move_date >= ${q.from}), 0) as in_total,
        coalesce(sum(out_q) filter (where move_date >= ${q.from} and t = 'OUT'), 0) as out_out,
        coalesce(sum(out_q) filter (where move_date >= ${q.from} and t = 'XFER'), 0) as out_xfer,
        coalesce(sum(out_q) filter (where move_date >= ${q.from} and t = 'ADJ'), 0) as out_adj,
        coalesce(sum(out_q) filter (where move_date >= ${q.from}), 0) as out_total
      from l group by item_id
    )`;
  const shown = sql`(s.opening <> 0 or s.in_total <> 0 or s.out_total <> 0)`;
  const [{ n }] = rowsOf<{ n: number }>(await db.execute(sql`${body} select count(*)::int as n from s where ${shown}`));
  const total = Number(n);
  const { page, pages } = clampPage(q.page, total);
  const rows = rowsOf<Record<string, string>>(
    await db.execute(sql`${body}
      select i.code as item_code, i.name as item_name, i.unit,
        s.opening::text as opening, s.in_in::text as in_in, s.in_xfer::text as in_xfer, s.in_adj::text as in_adj,
        s.in_total::text as in_total, s.out_out::text as out_out, s.out_xfer::text as out_xfer,
        s.out_adj::text as out_adj, s.out_total::text as out_total,
        (s.opening + s.in_total - s.out_total)::text as closing
      from s join items i on i.id = s.item_id
      where ${shown}
      order by ${LEDGER_KEY[q.sort]} ${sql.raw(q.dir)}, i.code asc
      limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`),
  );
  return {
    total,
    page,
    pages,
    rows: rows.map((r) => ({
      itemCode: r.item_code,
      itemName: r.item_name,
      unit: r.unit,
      opening: fmt(r.opening)!,
      inIn: fmt(r.in_in)!,
      inXfer: fmt(r.in_xfer)!,
      inAdj: fmt(r.in_adj)!,
      inTotal: fmt(r.in_total)!,
      outOut: fmt(r.out_out)!,
      outXfer: fmt(r.out_xfer)!,
      outAdj: fmt(r.out_adj)!,
      outTotal: fmt(r.out_total)!,
      closing: fmt(r.closing)!,
    })),
  };
}

export type LedgerLine = {
  moveDate: string;
  code: string;
  moveTypeName: string;
  /** 입고 · 출고의 칸 — 취소 줄은 원래 유형 쪽 칸에 「−20」. */
  in: string | null;
  out: string | null;
  balance: string;
};

export type LedgerDetail = Page<LedgerLine> & {
  item: { code: string; name: string; unit: string };
  opening: string;
  inTotal: string;
  outTotal: string;
  closing: string;
};

/**
 * 품목 하나의 그 기간 거래 — 일자 차례로, 잔량은 기초에서 시작해 기말에서 끝난다(저자 판정). 창고를 고르지 않으면 이동은 빠진다.
 * 거래가 많으면 100줄씩 쪽을 넘기고, 잔량은 앞 쪽에서 이어진다.
 */
export async function getLedgerDetail(
  db: Db,
  itemCode: string,
  q: Period & { warehouse?: string; page: number },
): Promise<LedgerDetail | undefined> {
  const [item] = await db
    .select({ code: items.code, name: items.name, unit: items.unit })
    .from(items)
    .where(sql`${items.code} = ${itemCode}`);
  if (!item) return undefined;
  const lines = ledgerLines(itemCode, q.to, q.warehouse);
  const [sum] = rowsOf<{ opening: string; in_total: string; out_total: string; n: number }>(
    await db.execute(sql`${lines}
      select coalesce(sum(bal) filter (where move_date < ${q.from}), 0)::text as opening,
        coalesce(sum(in_q) filter (where move_date >= ${q.from}), 0)::text as in_total,
        coalesce(sum(out_q) filter (where move_date >= ${q.from}), 0)::text as out_total,
        (count(*) filter (where move_date >= ${q.from} and (in_q is not null or out_q is not null)))::int as n
      from l`),
  );
  const total = Number(sum.n);
  const { page, pages } = clampPage(q.page, total);
  const rows = rowsOf<{
    move_date: string;
    code: string;
    t: string;
    in_q: string | null;
    out_q: string | null;
    balance: string;
  }>(
    await db.execute(sql`${lines}, p as (
        select move_date, code, t, in_q, out_q, line_no,
          ${sum.opening}::numeric + sum(coalesce(in_q, 0) - coalesce(out_q, 0))
            over (order by move_date, substring(code from 13)::int, line_no) as balance
        from l
        where move_date >= ${q.from} and (in_q is not null or out_q is not null)
      )
      select move_date::text as move_date, code, t, in_q::text as in_q, out_q::text as out_q, balance::text as balance
      from p
      order by move_date, substring(code from 13)::int, line_no
      limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`),
  );
  const opening = milliOf(sum.opening);
  const inTotal = milliOf(sum.in_total);
  const outTotal = milliOf(sum.out_total);
  return {
    item,
    opening: formatMilli(opening),
    inTotal: formatMilli(inTotal),
    outTotal: formatMilli(outTotal),
    closing: formatMilli(opening + inTotal - outTotal),
    total,
    page,
    pages,
    rows: rows.map((r) => ({
      moveDate: r.move_date,
      code: r.code,
      moveTypeName: moveTypeName(r.t),
      in: fmt(r.in_q),
      out: fmt(r.out_q),
      balance: fmt(r.balance)!,
    })),
  };
}

/** 거르기의 고르는 목록 — 품목 · 창고. 지난 수불을 보는 화면이라 「사용 안 함」도 싣는다. */
export async function historyOptions(db: Db) {
  const [itemRows, whRows] = await Promise.all([
    db.select({ code: items.code, name: items.name, active: items.active }).from(items).orderBy(asc(items.code)),
    db
      .select({ code: warehouses.code, name: warehouses.name, active: warehouses.active })
      .from(warehouses)
      .orderBy(asc(warehouses.code)),
  ]);
  return { items: itemRows, warehouses: whRows };
}
