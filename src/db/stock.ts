import { and, asc, count, desc, eq, gt, inArray, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { eun } from "@/lib/josa";
import { isMadeType, moveTypeName, type MoveType } from "@/lib/master-codes";
import {
  formatMilli,
  parseMove,
  THOUSAND,
  WAREHOUSE_CODE,
  ZERO,
  type Milli,
  type MoveErrors,
  type MoveLineErrors,
  type MoveValues,
  type ParsedLine,
} from "@/lib/move-input";
import { REGISTER_LOCK, constraintOf, limitMessage, pgError, touched } from "./master-shared";
import { issueLotNumber, ruleForItem } from "./number-rules";
import { codes, items, stockBalances, stockMoveLines, stockMoves, unitSpecs, warehouses } from "./schema";
import type { Db } from "./types";

// 재고 계산의 한 곳(조각 「재고 수불」 설계 ② 「재고 계산은 한 곳이다」, ADR 0015 · 0016 · 0018).
// 수불을 남기는 길은 이 파일의 저장 하나다 — 화면 · 샘플 · 뒤 조각(실사 · 구매 · 생산실적 따위)이 잔액 표를 따로 고치지 않는다.
// - 전표 단위: 줄이 하나라도 틀리면 그 전표의 줄 · 잔액 · 전표 번호 · LOT 일련이 하나도 바뀌지 않는다(한 트랜잭션).
// - 차례: 저장 · 취소는 모두 한 DB 잠금(REGISTER_LOCK.stock)을 쥐고 돈다 — 등록 상한 · 전표 번호 · 음수 검사가 동시에 저장해도 어긋나지 않는다.
//   그 안에서 잔액 행도 정한 차례(품목 → 창고 → LOT → 상태)로 잠근다(ADR 0018).
// - 음수: 줄을 먼저 넣고, 나가는 쪽 키마다 (일자, 줄 번호) 차례의 누계에서 그 전표의 일자부터의 가장 작은 누계를 본다 — 0 밑이면 통째로
//   되돌리고 모자란 수량을 그 키의 줄에 보인다(설계 「2026-11-09 — PR C 를 열기 전에 정한 것」). 잔액의 DB 검사(0 이상)가 뒤를 받친다.
// 화면의 입력 꼴은 src/lib/move-input.ts 가 먼저 본다.

/** 수불 전표 · 수불 줄의 등록 상한(설계 「2026-11-09 — PR C 를 열기 전에 정한 것」). 매일 밤 되돌림이 샘플 수로 줄인다. */
export const MOVE_LIMIT = 5000;
export const MOVE_LINE_LIMIT = 50000;

export type StockStatus = "AVAILABLE" | "QC";

/** 재고 계산이 남기는 줄 하나 — 품목 단위의 수량(천분의 일 단위, 늘 0 보다 큼). */
export type StockLine = {
  itemId: number;
  lot: string;
  status: StockStatus;
  fromWarehouseId: number | null;
  toWarehouseId: number | null;
  qty: Milli;
  enteredQty: Milli;
  enteredUnit: string;
  /** 만드는 품목의 LOT 를 비웠으면 이 규칙으로 저절로 받는다(ADR 0016). */
  autoLot?: { itemType: string; lotRuleCode: string | null };
};

export type StockMove = {
  moveDate: string;
  moveType: MoveType;
  reason: string | null;
  note: string;
  cancelsMoveId?: number;
  lines: StockLine[];
};

/** 음수 검사에 걸린 키와 모자란 수량. 던져 트랜잭션을 되돌린다. */
class ShortageError extends Error {
  constructor(readonly shortages: readonly { key: string; short: Milli }[]) {
    super("재고가 모자란다");
  }
}

/** 상한에 닿았다. 던져 트랜잭션을 되돌린다. */
class LimitError extends Error {
  constructor(readonly what: "move" | "line") {
    super("수불 등록 상한");
  }
}

const keyOf = (itemId: number, warehouseId: number, lot: string, status: string) =>
  `${itemId}|${warehouseId}|${lot}|${status}`;

/** 천분의 일 단위 → DB 의 numeric 글자(「1234.500」). */
const plain = (q: Milli) => {
  const neg = q < ZERO;
  const abs = neg ? -q : q;
  return `${neg ? "-" : ""}${abs / THOUSAND}.${String(abs % THOUSAND).padStart(3, "0")}`;
};
const toNumber = (q: Milli) => Number(plain(q));
/** DB 의 numeric(글자 · 수) → 천분의 일 단위. */
export function milliOf(v: string | number): Milli {
  const text = typeof v === "number" ? v.toFixed(3) : v;
  const neg = text.startsWith("-");
  const [int, frac = ""] = (neg ? text.slice(1) : text).split(".");
  const q = BigInt(int || "0") * THOUSAND + BigInt(frac.slice(0, 3).padEnd(3, "0"));
  return neg ? -q : q;
}

// postgres 드라이버는 행의 배열을, PGlite 는 { rows } 를 돌려준다.
function rowsOf<T>(result: unknown): T[] {
  return (Array.isArray(result) ? result : (result as { rows: T[] }).rows) as T[];
}

/**
 * 전표 하나를 남긴다 — 부르는 쪽이 트랜잭션 안에서 잠금(REGISTER_LOCK.stock)을 쥔 뒤 부른다. 등록 상한 · 전표 번호 · LOT 번호 · 줄 ·
 * 음수 검사 · 잔액을 차례로 한다. 모자라면 ShortageError, 상한이면 LimitError 를 던진다(부르는 쪽의 트랜잭션이 통째로 되돌아간다).
 */
async function recordMove(tx: Db, move: StockMove): Promise<{ id: number; code: string; lots: string[] }> {
  const [{ moves, lines }] = rowsOf<{ moves: number; lines: number }>(
    await tx.execute(
      sql`select (select count(*) from stock_moves)::int as moves, (select count(*) from stock_move_lines)::int as lines`,
    ),
  );
  if (Number(moves) >= MOVE_LIMIT) throw new LimitError("move");
  if (Number(lines) + move.lines.length > MOVE_LINE_LIMIT) throw new LimitError("line");

  // 전표 번호 — 그날의 가장 큰 일련 + 1(ADR 0016 · 0018). 잠금 안이라 겹치지 않는다.
  const prefix = `IV-${move.moveDate.replaceAll("-", "")}-`;
  const [{ max }] = await tx
    .select({ max: sql<number | string | null>`max(substring(${stockMoves.code} from 13)::int)` })
    .from(stockMoves)
    .where(sql`${stockMoves.code} like ${`${prefix}%`}`);
  const code = `${prefix}${String(Number(max ?? 0) + 1).padStart(3, "0")}`;

  // 비운 LOT 를 규칙으로 받는다 — 그 품목에 이미 있는 번호와 이 전표에서 쓴 번호는 건너뛴다(ADR 0016).
  const lots: string[] = [];
  for (const line of move.lines) {
    if (line.autoLot && !line.lot) {
      const rule = await ruleForItem(tx, line.autoLot);
      if (!rule) throw new Error("LOT 번호 규칙이 없다");
      line.lot = await issueLotNumber(tx, rule, move.moveDate, async (lot) => {
        if (move.lines.some((l) => l.itemId === line.itemId && l.lot === lot)) return true;
        const [hit] = await tx
          .select({ id: stockMoveLines.id })
          .from(stockMoveLines)
          .where(and(eq(stockMoveLines.itemId, line.itemId), eq(stockMoveLines.lot, lot)))
          .limit(1);
        return !!hit;
      });
    }
    lots.push(line.lot);
  }

  // 잔액이 움직이는 키 — 든 것은 +, 나간 것은 −.
  const deltas = new Map<string, { itemId: number; warehouseId: number; lot: string; status: StockStatus; d: Milli }>();
  const add = (warehouseId: number | null, line: StockLine, d: Milli) => {
    if (warehouseId === null) return;
    const key = keyOf(line.itemId, warehouseId, line.lot, line.status);
    const now = deltas.get(key) ?? { itemId: line.itemId, warehouseId, lot: line.lot, status: line.status, d: ZERO };
    now.d += d;
    deltas.set(key, now);
  };
  for (const line of move.lines) {
    add(line.toWarehouseId, line, line.qty);
    add(line.fromWarehouseId, line, -line.qty);
  }
  const keys = [...deltas.values()].sort(
    (a, b) =>
      a.itemId - b.itemId ||
      a.warehouseId - b.warehouseId ||
      (a.lot < b.lot ? -1 : a.lot > b.lot ? 1 : 0) ||
      (a.status < b.status ? -1 : a.status > b.status ? 1 : 0),
  );
  const values = (rows: typeof keys) =>
    sql.join(
      rows.map((k) => sql`(${k.itemId}::int, ${k.warehouseId}::int, ${k.lot}::text, ${k.status}::text)`),
      sql`, `,
    );

  // 잔액 행을 정한 차례로 잠근다(ADR 0018).
  await tx.execute(
    sql`select id from stock_balances where (item_id, warehouse_id, lot, status) in (${values(keys)})
        order by item_id, warehouse_id, lot, status for update`,
  );

  const [saved] = await tx
    .insert(stockMoves)
    .values({
      code,
      moveDate: move.moveDate,
      moveType: move.moveType,
      reason: move.reason,
      note: move.note,
      cancelsMoveId: move.cancelsMoveId ?? null,
    })
    .returning({ id: stockMoves.id });
  await tx.insert(stockMoveLines).values(
    move.lines.map((l, i) => ({
      moveId: saved.id,
      lineNo: i + 1,
      moveDate: move.moveDate,
      itemId: l.itemId,
      lot: l.lot,
      status: l.status,
      fromWarehouseId: l.fromWarehouseId,
      toWarehouseId: l.toWarehouseId,
      qty: toNumber(l.qty),
      enteredQty: toNumber(l.enteredQty),
      enteredUnit: l.enteredUnit,
    })),
  );

  // 음수 검사 — 나가는 쪽 키마다 (일자, 줄 번호) 차례의 누계에서, 이 전표의 일자부터의 가장 작은 누계(ADR 0015 · 0018).
  const outKeys = keys.filter((k) =>
    move.lines.some(
      (l) => l.fromWarehouseId === k.warehouseId && l.itemId === k.itemId && l.lot === k.lot && l.status === k.status,
    ),
  );
  if (outKeys.length) {
    const short = rowsOf<{ item_id: number; warehouse_id: number; lot: string; status: string; m: string }>(
      await tx.execute(sql`
        with k(item_id, warehouse_id, lot, status) as (values ${values(outKeys)}),
        eff as (
          select k.item_id, k.warehouse_id, k.lot, k.status, l.move_date as d, l.id as lid, l.qty as q
          from k join stock_move_lines l
            on l.item_id = k.item_id and l.to_warehouse_id = k.warehouse_id and l.lot = k.lot and l.status = k.status
          union all
          select k.item_id, k.warehouse_id, k.lot, k.status, l.move_date, l.id, -l.qty
          from k join stock_move_lines l
            on l.item_id = k.item_id and l.from_warehouse_id = k.warehouse_id and l.lot = k.lot and l.status = k.status
        ),
        run as (
          select item_id, warehouse_id, lot, status, d,
            sum(q) over (partition by item_id, warehouse_id, lot, status order by d, lid rows unbounded preceding) as r
          from eff
        )
        select item_id, warehouse_id, lot, status, min(r)::text as m
        from run where d >= ${move.moveDate}::date
        group by item_id, warehouse_id, lot, status
        having min(r) < 0`),
    );
    if (short.length)
      throw new ShortageError(
        short.map((s) => ({
          key: keyOf(Number(s.item_id), Number(s.warehouse_id), s.lot, s.status),
          short: -milliOf(s.m),
        })),
      );
  }

  for (const k of keys) {
    if (k.d === ZERO) continue;
    // 줄이는 키는 고치기만 한다 — 넣는 행의 검사(0 이상)가 겹침을 보기 전에 걸린다. 음수 검사를 지났으니 행이 있다.
    if (k.d < ZERO) {
      await tx
        .update(stockBalances)
        .set({ qty: sql`${stockBalances.qty} + ${plain(k.d)}::numeric`, updatedAt: touched() })
        .where(
          and(
            eq(stockBalances.itemId, k.itemId),
            eq(stockBalances.warehouseId, k.warehouseId),
            eq(stockBalances.lot, k.lot),
            eq(stockBalances.status, k.status),
          ),
        );
      continue;
    }
    await tx
      .insert(stockBalances)
      .values({ itemId: k.itemId, warehouseId: k.warehouseId, lot: k.lot, status: k.status, qty: toNumber(k.d) })
      .onConflictDoUpdate({
        target: [stockBalances.itemId, stockBalances.warehouseId, stockBalances.lot, stockBalances.status],
        set: { qty: sql`${stockBalances.qty} + ${plain(k.d)}::numeric`, updatedAt: touched() },
      });
  }
  return { id: saved.id, code, lots };
}

/** 재고의 잠금 — 저장 · 취소와 재고에 기대는 고침이 차례로 돈다. 트랜잭션이 끝나면 풀린다. */
export const lockStock = (tx: Db) => tx.execute(sql`select pg_advisory_xact_lock(${REGISTER_LOCK.stock})`);

/** 잠금을 쥐고 부른다 — 품목 · 창고 · 단위의 고침이 재고와 어긋나지 않게(재고가 있는가를 센 뒤 그 사이 수불이 들지 않게). */
export async function withStockLock<T>(db: Db, work: (tx: Db) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await lockStock(tx);
    return work(tx);
  });
}

// ── 수불 등록 ───────────────────────────────────────────

export type MoveSaveResult =
  { ok: true; code: string } | { ok: false; errors: MoveErrors; formError?: string; values: MoveValues };

type ItemRow = {
  id: number;
  code: string;
  name: string;
  itemType: string;
  unit: string;
  lotManaged: boolean;
  lotRuleCode: string | null;
  active: boolean;
};
type WarehouseRow = { id: number; code: string; name: string; isDefect: boolean; active: boolean };
type UnitRow = {
  code: string;
  active: boolean;
  baseUnit: string | null;
  factor: number | null;
  decimals: number | null;
};

const OVERFLOW = "수량이 너무 커 저장하지 못했습니다 — 잔액이 999억을 넘습니다";
const BIG = BigInt("99999999999999"); // numeric(14,3) 의 끝 — 천분의 일 단위.

/** 소수 자릿수의 말 — 0 이면 정수. */
const decimalsRule = (unit: string, d: number) =>
  d === 0 ? `${eun(unit)} 정수로 넣습니다` : `${eun(unit)} 소수 ${d}자리까지 넣습니다`;

/**
 * 넣은 수량을 품목 단위로 바꾼다 — 같은 기준의 단위 사이만(ADR 0017). 반올림하지 않는다: 품목 단위의 자릿수에 맞지 않으면 거절한다.
 * 배수는 소수 여섯째 자리까지라 백만 배 정수로 견준다 — 수(float)로 셈하지 않는다.
 */
function convert(
  qty: Milli,
  entered: { code: string; baseUnit: string; factor: number },
  item: { code: string; baseUnit: string; factor: number; decimals: number },
): { ok: true; qty: Milli } | { ok: false; message: string } {
  if (entered.code === item.code) return { ok: true, qty };
  if (entered.baseUnit !== item.baseUnit)
    return {
      ok: false,
      message: `품목 단위(${item.code})와 기준이 다른 단위입니다 — ${item.code} 나 기준이 같은 단위로 넣으세요`,
    };
  const fe = BigInt(Math.round(entered.factor * 1e6));
  const fi = BigInt(Math.round(item.factor * 1e6));
  const num = qty * fe; // 천분의 일 × 백만
  const step = fi * BigInt(10) ** BigInt(3 - item.decimals); // 품목 단위의 한 자리(가장 작은 수)
  if (num % step !== ZERO) {
    const exact = Number(num) / Number(fi) / 1000;
    return {
      ok: false,
      message: `품목 단위로 바꾸면 ${exact} ${item.code} 입니다 — ${decimalsRule(item.code, item.decimals)}`,
    };
  }
  return { ok: true, qty: num / fi };
}

/** 이 전표의 줄을 DB 에 대어 본다 — 품목 · 창고 · 단위 · LOT. 잠금 안에서 부른다(LOT 의 잔액을 보므로). */
async function resolveLines(
  tx: Db,
  move: { moveType: MoveType; lines: ParsedLine[] },
): Promise<
  { ok: true; lines: (StockLine & { index: number })[] } | { ok: false; lines: Record<number, MoveLineErrors> }
> {
  const itemCodes = [...new Set(move.lines.map((l) => l.itemCode))];
  const itemRows: ItemRow[] = itemCodes.length
    ? await tx
        .select({
          id: items.id,
          code: items.code,
          name: items.name,
          itemType: items.itemType,
          unit: items.unit,
          lotManaged: items.lotManaged,
          lotRuleCode: items.lotRuleCode,
          active: items.active,
        })
        .from(items)
        .where(inArray(items.code, itemCodes))
    : [];
  const whRows: WarehouseRow[] = await tx
    .select({
      id: warehouses.id,
      code: warehouses.code,
      name: warehouses.name,
      isDefect: warehouses.isDefect,
      active: warehouses.active,
    })
    .from(warehouses);
  const unitRows: UnitRow[] = await tx
    .select({
      code: codes.code,
      active: codes.active,
      baseUnit: unitSpecs.baseUnit,
      factor: unitSpecs.factor,
      decimals: unitSpecs.decimals,
    })
    .from(codes)
    .leftJoin(unitSpecs, eq(unitSpecs.unit, codes.code))
    .where(eq(codes.groupCode, "UNIT"));

  const errors: Record<number, MoveLineErrors> = {};
  const out: (StockLine & { index: number })[] = [];
  const reduces = (l: ParsedLine) => move.moveType === "OUT" || move.moveType === "XFER" || l.qty < ZERO;

  for (const l of move.lines) {
    const e: MoveLineErrors = {};
    const item = itemRows.find((i) => i.code === l.itemCode);
    if (!item) e.item = "없는 품목입니다 — 목록에서 고르세요";
    else if (!item.active) e.item = "「사용 안 함」인 품목입니다 — 다른 품목을 고르세요";

    const wh = whRows.find((w) => w.code === l.warehouse);
    if (!wh) e.warehouse = "없는 창고입니다 — 목록에서 고르세요";
    else if (!wh.active) e.warehouse = "「사용 안 함」인 창고입니다 — 다른 창고를 고르세요";
    else if (wh.isDefect && (move.moveType === "OUT" || move.moveType === "XFER"))
      e.warehouse = "불량창고에서는 내보내지 못합니다 — 불량의 처분은 품질에서 합니다";
    let to: WarehouseRow | undefined;
    if (l.toWarehouse) {
      to = whRows.find((w) => w.code === l.toWarehouse);
      if (!to) e.toWarehouse = "없는 창고입니다 — 목록에서 고르세요";
      else if (!to.active) e.toWarehouse = "「사용 안 함」인 창고입니다 — 다른 창고를 고르세요";
    }

    let qty: Milli | undefined;
    const abs = l.qty < ZERO ? -l.qty : l.qty;
    if (item) {
      const itemUnit = unitRows.find((u) => u.code === item.unit);
      const enteredCode = l.unit ?? item.unit;
      const entered = unitRows.find((u) => u.code === enteredCode);
      if (!entered) e.unit = "없는 단위입니다 — 목록에서 고르세요";
      else if (!entered.active && entered.code !== item.unit)
        e.unit = "「사용 안 함」인 단위입니다 — 다른 단위를 고르세요";
      else if (!itemUnit || itemUnit.decimals === null || entered.decimals === null || entered.baseUnit === null)
        e.unit = "단위의 사양이 없습니다 — 시스템 관리 › 공통코드 › 단위에서 넣으세요";
      else if (l.qtyDecimals > entered.decimals) e.qty = decimalsRule(entered.code, entered.decimals);
      else {
        const c = convert(
          abs,
          { code: entered.code, baseUnit: entered.baseUnit, factor: entered.factor! },
          { code: itemUnit.code, baseUnit: itemUnit.baseUnit!, factor: itemUnit.factor!, decimals: itemUnit.decimals },
        );
        if (!c.ok) e.unit = c.message;
        else if (c.qty > BIG) e.qty = OVERFLOW;
        else qty = c.qty;
      }

      // LOT — 켠 품목은 반드시, 끈 품목은 비운다(ADR 0015). 사 오는 품목의 입고는 거래처 LOT 를 반드시, 만드는 품목은 비우면 저절로.
      if (!item.lotManaged && l.lot) e.lot = "LOT 관리를 하지 않는 품목입니다 — LOT 를 비우세요";
      else if (item.lotManaged && !l.lot) {
        if (reduces(l)) e.lot = "LOT 를 고르세요";
        else if (!isMadeType(item.itemType))
          e.lot = move.moveType === "IN" ? "거래처 LOT 를 넣어 주세요" : "사 오는 품목은 LOT 를 넣어 주세요";
      }
    }

    if (Object.keys(e).length || !item || !wh || qty === undefined) {
      errors[l.index] = e;
      continue;
    }
    const inbound = !reduces(l);
    out.push({
      index: l.index,
      itemId: item.id,
      lot: l.lot,
      status: "AVAILABLE",
      fromWarehouseId: inbound ? null : wh.id,
      toWarehouseId: move.moveType === "XFER" ? to!.id : inbound ? wh.id : null,
      qty,
      enteredQty: abs,
      enteredUnit: l.unit ?? item.unit,
      autoLot:
        item.lotManaged && !l.lot && inbound ? { itemType: item.itemType, lotRuleCode: item.lotRuleCode } : undefined,
    });
  }

  // 줄이는 줄의 LOT 는 그 창고에 잔액이 있는 것이어야 한다(설계 ③).
  const reducing = out.filter((l) => l.fromWarehouseId !== null && l.lot);
  if (reducing.length) {
    const held = await tx
      .select({ itemId: stockBalances.itemId, warehouseId: stockBalances.warehouseId, lot: stockBalances.lot })
      .from(stockBalances)
      .where(
        and(
          eq(stockBalances.status, "AVAILABLE"),
          gt(stockBalances.qty, 0),
          or(
            ...reducing.map((l) =>
              and(eq(stockBalances.itemId, l.itemId), eq(stockBalances.warehouseId, l.fromWarehouseId!)),
            ),
          ),
        ),
      );
    for (const l of reducing) {
      if (!held.some((h) => h.itemId === l.itemId && h.warehouseId === l.fromWarehouseId && h.lot === l.lot))
        errors[l.index] = { ...errors[l.index], lot: "그 창고에 가용 재고가 없는 LOT 입니다 — 목록에서 고르세요" };
    }
  }

  return Object.keys(errors).length ? { ok: false, lines: errors } : { ok: true, lines: out };
}

/** 모자란 수량의 말 — 지난 날짜면 그 뒤 나간 수불까지 센다는 것을 덧붙인다. */
const shortMessage = (q: Milli, unit: string, past: boolean) =>
  `${formatMilli(q)} ${unit} 모자랍니다${past ? " — 그 날짜 뒤에 나간 수불까지 셉니다" : ""}`;

/**
 * 수불 등록(성공 기준 2 ~ 6 · 12) — 꼴(src/lib/move-input.ts)을 보고, 잠금 안에서 DB 에 대어 본 뒤 전표 하나를 남긴다.
 * today 는 한국 시각의 오늘이다. 누구나 부르는 입구라 화면의 검사를 믿지 않는다.
 */
export async function saveMove(db: Db, values: MoveValues, today: string): Promise<MoveSaveResult> {
  const parsed = parseMove(values, today);
  if (!parsed.ok) return { ok: false, errors: parsed.errors, formError: parsed.formError, values };
  const move = parsed.value;
  let resolved: (StockLine & { index: number })[] = [];
  try {
    return await db.transaction(async (tx): Promise<MoveSaveResult> => {
      await lockStock(tx);
      if (move.reason) {
        const [r] = await tx
          .select({ active: codes.active })
          .from(codes)
          .where(and(eq(codes.groupCode, "ADJ_REASON"), eq(codes.code, move.reason)));
        if (!r || !r.active)
          return {
            ok: false,
            errors: {
              header: {
                reason: r
                  ? "「사용 안 함」인 조정사유입니다 — 다른 조정사유를 고르세요"
                  : "목록에서 조정사유를 고르세요",
              },
              lines: {},
            },
            values,
          };
      }
      const r = await resolveLines(tx, move);
      if (!r.ok) return { ok: false, errors: { header: {}, lines: r.lines }, values };
      resolved = r.lines;
      const saved = await recordMove(tx, { ...move, lines: r.lines });
      return { ok: true, code: saved.code };
    });
  } catch (error) {
    if (error instanceof ShortageError) {
      const units = await db
        .select({ id: items.id, unit: items.unit })
        .from(items)
        .where(inArray(items.id, [...new Set(resolved.map((l) => l.itemId))]));
      const lines: Record<number, MoveLineErrors> = {};
      for (const s of error.shortages)
        for (const l of resolved)
          if (l.fromWarehouseId !== null && keyOf(l.itemId, l.fromWarehouseId, l.lot, l.status) === s.key)
            lines[l.index] = {
              row: shortMessage(s.short, units.find((u) => u.id === l.itemId)?.unit ?? "", move.moveDate < today),
            };
      return { ok: false, errors: { header: {}, lines }, formError: "재고가 모자라 저장하지 않았습니다", values };
    }
    if (error instanceof LimitError)
      return {
        ok: false,
        errors: { header: {}, lines: {} },
        formError:
          error.what === "move" ? limitMessage("수불 전표", MOVE_LIMIT) : limitMessage("수불 줄", MOVE_LINE_LIMIT),
        values,
      };
    if (pgError(error).code === "22003")
      return { ok: false, errors: { header: {}, lines: {} }, formError: OVERFLOW, values };
    throw error;
  }
}

// ── 취소 ───────────────────────────────────────────────

export const MOVE_CODE = /^IV-[0-9]{8}-[0-9]{3,}$/;

export type CancelResult =
  { ok: true; code: string } | { ok: false; formError: string } | { ok: false; notFound: true };

/**
 * 취소(성공 기준 5, ADR 0015) — 원래 전표의 반대 수량(보내는 · 받는 창고를 바꾼 줄)으로 새 전표를 남긴다. 줄은 거꾸로 된 차례다.
 * 일자는 취소하는 날(today).
 * 한 전표는 한 번만 취소되고, 취소 전표는 취소되지 않는다(DB 도 막는다). 취소도 음수 검사를 지난다.
 * 품목 · 창고가 그 사이 「사용 안 함」이 되었어도 취소는 된다 — 이미 남은 수불을 되돌리는 것이다.
 */
export async function cancelMove(db: Db, code: string, today: string): Promise<CancelResult> {
  if (!MOVE_CODE.test(code)) return { ok: false, notFound: true };
  try {
    return await db.transaction(async (tx): Promise<CancelResult> => {
      await lockStock(tx);
      const [move] = await tx.select().from(stockMoves).where(eq(stockMoves.code, code));
      if (!move) return { ok: false, notFound: true };
      if (move.isCancel) return { ok: false, formError: "취소 전표는 취소하지 못합니다" };
      const [done] = await tx
        .select({ code: stockMoves.code })
        .from(stockMoves)
        .where(eq(stockMoves.cancelsMoveId, move.id));
      if (done) return { ok: false, formError: `이미 취소한 전표입니다 — 취소 전표 ${done.code}` };
      const lines = await tx
        .select()
        .from(stockMoveLines)
        .where(eq(stockMoveLines.moveId, move.id))
        .orderBy(asc(stockMoveLines.lineNo));
      const saved = await recordMove(tx, {
        moveDate: today,
        moveType: move.moveType as MoveType,
        reason: move.reason,
        note: `${code} 취소`,
        cancelsMoveId: move.id,
        // 거꾸로 된 차례로 — 한 전표 안에서 뒤 줄이 앞 줄에 기대면(자재창고 → 생산현장 → 자재창고) 뒤 줄부터 되돌려야
        // 누계가 0 밑으로 가지 않는다(리뷰 1회차).
        lines: [...lines].reverse().map((l) => ({
          itemId: l.itemId,
          lot: l.lot,
          status: l.status as StockStatus,
          fromWarehouseId: l.toWarehouseId,
          toWarehouseId: l.fromWarehouseId,
          qty: milliOf(l.qty),
          enteredQty: milliOf(l.enteredQty),
          enteredUnit: l.enteredUnit,
        })),
      });
      return { ok: true, code: saved.code };
    });
  } catch (error) {
    if (error instanceof ShortageError) {
      const parts = await Promise.all(
        error.shortages.map(async (s) => {
          const [itemId, warehouseId, lot] = s.key.split("|");
          const [row] = await db
            .select({ item: items.name, unit: items.unit, wh: warehouses.name })
            .from(items)
            .innerJoin(warehouses, eq(warehouses.id, Number(warehouseId)))
            .where(eq(items.id, Number(itemId)));
          return `${row?.item ?? ""}${lot ? ` LOT ${lot}` : ""} · ${row?.wh ?? ""} ${formatMilli(s.short)} ${row?.unit ?? ""}`;
        }),
      );
      return {
        ok: false,
        formError: `취소하면 재고가 0 밑으로 갑니다 — 이미 나간 것이 있습니다: ${parts.join(", ")} 모자람`,
      };
    }
    if (error instanceof LimitError)
      return {
        ok: false,
        formError:
          error.what === "move" ? limitMessage("수불 전표", MOVE_LIMIT) : limitMessage("수불 줄", MOVE_LINE_LIMIT),
      };
    if (constraintOf(error) === "stock_moves_cancels_move_id_unique")
      return { ok: false, formError: "이미 취소한 전표입니다" };
    throw error;
  }
}

// ── 화면이 읽는 것 ─────────────────────────────────────────

export type MoveItemOption = {
  code: string;
  name: string;
  unit: string;
  itemType: string;
  lotManaged: boolean;
  defaultIn: string;
  defaultOut: string;
};
export type MoveWarehouseOption = { code: string; name: string; isDefect: boolean };
export type MoveUnitOption = { code: string; name: string; baseUnit: string; decimals: number };
export type MoveFormOptions = {
  items: MoveItemOption[];
  warehouses: MoveWarehouseOption[];
  units: MoveUnitOption[];
  reasons: { code: string; name: string }[];
};

/** 수불 등록 화면의 고르는 목록 — 「사용」인 것만. 품목은 기본 입고 · 출고 창고(코드)를 함께 싣는다(성공 기준 2). */
export async function moveFormOptions(db: Db): Promise<MoveFormOptions> {
  const inWh = alias(warehouses, "in_wh");
  const outWh = alias(warehouses, "out_wh");
  const [itemRows, whRows, unitRows, reasonRows] = await Promise.all([
    db
      .select({
        code: items.code,
        name: items.name,
        unit: items.unit,
        itemType: items.itemType,
        lotManaged: items.lotManaged,
        defaultIn: inWh.code,
        defaultOut: outWh.code,
      })
      .from(items)
      .leftJoin(inWh, and(eq(inWh.id, items.defaultInWarehouseId), eq(inWh.active, true)))
      .leftJoin(outWh, and(eq(outWh.id, items.defaultOutWarehouseId), eq(outWh.active, true)))
      .where(eq(items.active, true))
      .orderBy(asc(items.code)),
    db
      .select({ code: warehouses.code, name: warehouses.name, isDefect: warehouses.isDefect })
      .from(warehouses)
      .where(eq(warehouses.active, true))
      .orderBy(asc(warehouses.code)),
    db
      .select({ code: codes.code, name: codes.name, baseUnit: unitSpecs.baseUnit, decimals: unitSpecs.decimals })
      .from(codes)
      .innerJoin(unitSpecs, eq(unitSpecs.unit, codes.code))
      .where(and(eq(codes.groupCode, "UNIT"), eq(codes.active, true)))
      .orderBy(asc(codes.sortOrder), asc(codes.code)),
    db
      .select({ code: codes.code, name: codes.name })
      .from(codes)
      .where(and(eq(codes.groupCode, "ADJ_REASON"), eq(codes.active, true)))
      .orderBy(asc(codes.sortOrder), asc(codes.code)),
  ]);
  return {
    items: itemRows.map((i) => ({ ...i, defaultIn: i.defaultIn ?? "", defaultOut: i.defaultOut ?? "" })),
    warehouses: whRows,
    units: unitRows,
    reasons: reasonRows,
  };
}

export type OnHand = { lot: string; qty: string };

/**
 * 한 품목 · 창고의 가용 재고(LOT 마다) — 출고 · 이동 · 줄이는 조정의 LOT 고르기가 가용 수량과 함께 보인다(성공 기준 3).
 * 검사대기는 빼고, 불량창고면 그 창고의 재고(불량)를 보인다 — 불량창고 안의 조정(실사 차이)은 받는다(ADR 0015).
 */
export async function onHand(db: Db, itemCode: string, warehouseCode: string): Promise<OnHand[]> {
  if (!WAREHOUSE_CODE.test(warehouseCode)) return [];
  const rows = await db
    .select({ lot: stockBalances.lot, qty: stockBalances.qty })
    .from(stockBalances)
    .innerJoin(items, eq(items.id, stockBalances.itemId))
    .innerJoin(warehouses, eq(warehouses.id, stockBalances.warehouseId))
    .where(
      and(
        eq(items.code, itemCode),
        eq(warehouses.code, warehouseCode),
        eq(stockBalances.status, "AVAILABLE"),
        gt(stockBalances.qty, 0),
      ),
    )
    .orderBy(asc(stockBalances.lot));
  return rows.map((r) => ({ lot: r.lot, qty: formatMilli(milliOf(r.qty)) }));
}

/** 창고 현재고의 한 줄 — 품목 · LOT · 상태마다. `pickable` 은 등록 화면이 줄로 넣을 수 있는가(가용이고 「사용」인 품목). */
export type WarehouseStockRow = {
  itemCode: string;
  itemName: string;
  unit: string;
  lot: string;
  status: "AVAILABLE" | "QC";
  qty: string;
  pickable: boolean;
};

/**
 * 한 창고의 현재고 — 잔액이 0 보다 큰 품목 · LOT · 상태마다 한 줄, 품목코드 · LOT 차례(ADR 0020 의 「PR F 검토 중 정한 것」).
 * 기타출고 · 재고이동 · 재고조정 등록이 그 창고의 재고를 보며 골라 줄로 넣는다. 읽기만 한다 — 상태별 · 창고별로 보는 메뉴는 조각 「재고 현황」이다.
 */
export async function warehouseStock(db: Db, warehouseCode: string): Promise<WarehouseStockRow[]> {
  if (!WAREHOUSE_CODE.test(warehouseCode)) return [];
  const rows = await db
    .select({
      itemCode: items.code,
      itemName: items.name,
      unit: items.unit,
      active: items.active,
      lot: stockBalances.lot,
      status: stockBalances.status,
      qty: stockBalances.qty,
    })
    .from(stockBalances)
    .innerJoin(items, eq(items.id, stockBalances.itemId))
    .innerJoin(warehouses, eq(warehouses.id, stockBalances.warehouseId))
    .where(and(eq(warehouses.code, warehouseCode), gt(stockBalances.qty, 0)))
    .orderBy(asc(items.code), asc(stockBalances.lot), asc(stockBalances.status));
  return rows.map((r) => ({
    itemCode: r.itemCode,
    itemName: r.itemName,
    unit: r.unit,
    lot: r.lot,
    status: r.status === "QC" ? "QC" : "AVAILABLE",
    qty: formatMilli(milliOf(r.qty)),
    pickable: r.status === "AVAILABLE" && r.active,
  }));
}

export type MoveSummary = {
  code: string;
  moveDate: string;
  moveType: string;
  moveTypeName: string;
  reason: string | null;
  note: string;
  lines: number;
  canceledBy: string | null;
  cancels: string | null;
};

const cancelOf = alias(stockMoves, "cancel_of");
const original = alias(stockMoves, "original");

/**
 * 최근 전표 — 등록한 차례의 거꾸로. 등록 메뉴는 그 수불구분만 본다(취소 전표는 원래 전표의 구분이라 함께 든다, ADR 0020).
 * 거르기 · 기간은 메뉴 「수불 이력」이 든다.
 */
export async function listRecentMoves(db: Db, limit = 20, moveType?: MoveType): Promise<MoveSummary[]> {
  const rows = await db
    .select({
      code: stockMoves.code,
      moveDate: stockMoves.moveDate,
      moveType: stockMoves.moveType,
      reason: stockMoves.reason,
      note: stockMoves.note,
      lines: sql<number>`(select count(*)::int from stock_move_lines l where l.move_id = ${stockMoves.id})`,
      canceledBy: cancelOf.code,
      cancels: original.code,
    })
    .from(stockMoves)
    .leftJoin(cancelOf, eq(cancelOf.cancelsMoveId, stockMoves.id))
    .leftJoin(original, eq(original.id, stockMoves.cancelsMoveId))
    .where(moveType ? eq(stockMoves.moveType, moveType) : undefined)
    .orderBy(desc(stockMoves.id))
    .limit(limit);
  return rows.map((r) => ({ ...r, lines: Number(r.lines), moveTypeName: moveTypeName(r.moveType) }));
}

export type MoveLineView = {
  lineNo: number;
  itemCode: string;
  itemName: string;
  unit: string;
  lot: string;
  from: string | null;
  to: string | null;
  qty: string;
  entered: string | null;
};
export type MoveDetail = MoveSummary & { reasonName: string | null; lineRows: MoveLineView[] };

/** 전표 하나와 그 줄 — 보내는 · 받는 창고는 「코드 이름」, 다른 단위로 넣었으면 넣은 값도(성공 기준 8). */
export async function getMove(db: Db, code: string): Promise<MoveDetail | undefined> {
  if (!MOVE_CODE.test(code)) return undefined;
  const [head] = await db
    .select({
      id: stockMoves.id,
      code: stockMoves.code,
      moveDate: stockMoves.moveDate,
      moveType: stockMoves.moveType,
      reason: stockMoves.reason,
      reasonName: codes.name,
      note: stockMoves.note,
      canceledBy: cancelOf.code,
      cancels: original.code,
    })
    .from(stockMoves)
    .leftJoin(cancelOf, eq(cancelOf.cancelsMoveId, stockMoves.id))
    .leftJoin(original, eq(original.id, stockMoves.cancelsMoveId))
    .leftJoin(codes, and(eq(codes.groupCode, stockMoves.reasonGroup), eq(codes.code, stockMoves.reason)))
    .where(eq(stockMoves.code, code));
  if (!head) return undefined;
  const fromWh = alias(warehouses, "from_wh");
  const toWh = alias(warehouses, "to_wh");
  const rows = await db
    .select({
      lineNo: stockMoveLines.lineNo,
      itemCode: items.code,
      itemName: items.name,
      unit: items.unit,
      lot: stockMoveLines.lot,
      from: sql<
        string | null
      >`case when ${fromWh.code} is null then null else ${fromWh.code} || ' ' || ${fromWh.name} end`,
      to: sql<string | null>`case when ${toWh.code} is null then null else ${toWh.code} || ' ' || ${toWh.name} end`,
      qty: stockMoveLines.qty,
      enteredQty: stockMoveLines.enteredQty,
      enteredUnit: stockMoveLines.enteredUnit,
    })
    .from(stockMoveLines)
    .innerJoin(items, eq(items.id, stockMoveLines.itemId))
    .leftJoin(fromWh, eq(fromWh.id, stockMoveLines.fromWarehouseId))
    .leftJoin(toWh, eq(toWh.id, stockMoveLines.toWarehouseId))
    .where(eq(stockMoveLines.moveId, head.id))
    .orderBy(asc(stockMoveLines.lineNo));
  return {
    code: head.code,
    moveDate: head.moveDate,
    moveType: head.moveType,
    reason: head.reason,
    reasonName: head.reasonName,
    note: head.note,
    canceledBy: head.canceledBy,
    cancels: head.cancels,
    moveTypeName: moveTypeName(head.moveType),
    lines: rows.length,
    lineRows: rows.map((r) => ({
      lineNo: r.lineNo,
      itemCode: r.itemCode,
      itemName: r.itemName,
      unit: r.unit,
      lot: r.lot,
      from: r.from,
      to: r.to,
      qty: formatMilli(milliOf(r.qty)),
      entered: r.enteredUnit === r.unit ? null : `${formatMilli(milliOf(r.enteredQty))} ${r.enteredUnit}`,
    })),
  };
}

// ── 다른 화면이 묻는 것(품목 · 창고 · 단위의 고침) ───────────────────────

/** 수불이 있는 품목 — LOT 관리 · 단위를 바꾸지 못한다(ADR 0015). */
export async function itemsWithMoves(db: Db, itemIds: readonly number[]): Promise<Set<number>> {
  if (itemIds.length === 0) return new Set();
  const rows = await db
    .selectDistinct({ itemId: stockMoveLines.itemId })
    .from(stockMoveLines)
    .where(inArray(stockMoveLines.itemId, [...itemIds]));
  return new Set(rows.map((r) => r.itemId));
}

/** 재고(잔액)가 있는 창고인가 — 불량창고 표시를 바꾸지 못한다(설계 ③ 「창고의 새 칸」). */
export async function warehouseHasStock(db: Db, warehouseId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: stockBalances.id })
    .from(stockBalances)
    .where(and(eq(stockBalances.warehouseId, warehouseId), gt(stockBalances.qty, 0)))
    .limit(1);
  return !!row;
}

/**
 * 단위의 소수 자릿수를 decimals 로 줄여도 그 단위의 수량이 다 맞는가(ADR 0017) — 그 단위로 넣은 수량과, 그 단위를 쓰는 품목의 수량(줄).
 * 잔액은 줄의 합이라 줄이 맞으면 맞는다.
 */
export async function unitQuantitiesFit(db: Db, unit: string, decimals: number): Promise<boolean> {
  const misfit = (col: typeof stockMoveLines.qty | typeof stockMoveLines.enteredQty): SQL =>
    sql`${col} <> round(${col}, ${decimals}::int)`;
  const [{ n }] = await db
    .select({ n: count() })
    .from(stockMoveLines)
    .innerJoin(items, eq(items.id, stockMoveLines.itemId))
    .where(
      or(
        and(eq(stockMoveLines.enteredUnit, unit), misfit(stockMoveLines.enteredQty)),
        and(eq(items.unit, unit), misfit(stockMoveLines.qty)),
      ),
    );
  return n === 0;
}
