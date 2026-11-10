import { and, asc, count, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { eun } from "@/lib/josa";
import { isMadeType } from "@/lib/master-codes";
import {
  COUNT_CODE,
  COUNT_MAX_LINES,
  countStatusName,
  parseCount,
  type CountErrors,
  type CountLineErrors,
  type CountValues,
  type ParsedCountLine,
} from "@/lib/count-input";
import { formatMilli, WAREHOUSE_CODE, ZERO, type Milli } from "@/lib/move-input";
import { limitMessage, STALE, touched, versionIs, versionOf } from "./master-shared";
import {
  items,
  stockBalances,
  stockCountLines,
  stockCounts,
  stockMoveLines,
  stockMoves,
  unitSpecs,
  warehouses,
} from "./schema";
import {
  LimitError,
  lockStock,
  milliOf,
  MOVE_LIMIT,
  MOVE_LINE_LIMIT,
  recordCountAdjustment,
  ShortageError,
  type StockLine,
} from "./stock";
import type { Db } from "./types";

// 재고 실사(조각 「재고 수불」 성공 기준 7, 설계 「2026-11-09 — PR E 를 열기 전에 정한 것」, ADR 0015 · 0021).
// - 창고를 고르면 작성 중 실사가, 없으면 그 창고의 장부(잔액이 0 보다 큰 품목 · LOT · 상태)를 불러온 새 실사가 열린다. 처음 저장할 때 번호가 붙는다.
// - 확정은 실사 줄만 확정하는 순간의 장부와 견주고, 차이를 「실사 차이」 조정 전표 한 장으로 남긴다 — 재고 계산의 저장(src/db/stock.ts)을
//   같은 트랜잭션에서 불러 음수 검사 · 잠금 · 상한을 똑같이 지난다. 실사 줄 밖의 재고는 손대지 않는다(저자 판정).
// - 저장 · 취소 · 확정은 수불과 같은 잠금(REGISTER_LOCK.stock)을 쥐고 돈다 — 확정의 장부와 수불이 엇갈리지 않는다.

/** 실사 · 실사 줄의 등록 상한(설계 「PR E 를 열기 전에 정한 것」). 매일 밤 되돌림이 샘플 수로 줄인다. */
export const COUNT_LIMIT = 500;
export const COUNT_LINE_LIMIT = 50000;

export type CountWarehouse = { code: string; name: string; isDefect: boolean };

/** 입력 화면의 줄 하나 — 장부는 지금의 장부(작성 중) · 확정 때의 장부(확정)다. */
export type CountSheetLine = {
  itemCode: string;
  itemName: string;
  unit: string;
  decimals: number;
  itemType: string;
  lotManaged: boolean;
  lot: string;
  status: "AVAILABLE" | "QC";
  added: boolean;
  /** 장부 수량(보이는 글자) — 장부에 없으면 「0」. */
  book: string;
  /** 실물 수량(보이는 글자) — 비웠으면 빈 글자. */
  counted: string;
};

/** 창고를 골라 연 입력 — 작성 중 실사(번호 · 버전이 있음)나, 장부를 불러온 새 실사(번호가 없음). */
export type CountSheet = {
  warehouse: CountWarehouse;
  code: string | null;
  countDate: string | null;
  version: string | null;
  baseline: number;
  lines: CountSheetLine[];
};

export type CountItemOption = {
  code: string;
  name: string;
  unit: string;
  decimals: number;
  itemType: string;
  lotManaged: boolean;
};

// postgres 드라이버는 행의 배열을, PGlite 는 { rows } 를 돌려준다.
function rowsOf<T>(result: unknown): T[] {
  return (Array.isArray(result) ? result : (result as { rows: T[] }).rows) as T[];
}

const keyOf = (itemId: number, lot: string, status: string) => `${itemId}|${lot}|${status}`;
const fmt = (q: Milli | null) => (q === null ? "" : formatMilli(q));
const numberOf = (q: Milli) => {
  const abs = q < ZERO ? -q : q;
  return Number(`${q < ZERO ? "-" : ""}${abs / BigInt(1000)}.${String(abs % BigInt(1000)).padStart(3, "0")}`);
};

/** 마지막 수불 줄 번호 — 장부를 불러온 때. 확정 화면은 그 뒤 그 창고에 닿은 수불을 경고한다. */
async function lastLineId(db: Db): Promise<number> {
  const [{ max }] = await db
    .select({ max: sql<number | string | null>`max(${stockMoveLines.id})` })
    .from(stockMoveLines);
  return Number(max ?? 0);
}

/** 한 창고의 장부 — 품목 · LOT · 상태마다 잔액(0 보다 큰 것). */
async function bookOf(db: Db, warehouseId: number) {
  const rows = await db
    .select({
      itemId: stockBalances.itemId,
      lot: stockBalances.lot,
      status: stockBalances.status,
      qty: stockBalances.qty,
    })
    .from(stockBalances)
    .where(and(eq(stockBalances.warehouseId, warehouseId), gt(stockBalances.qty, 0)));
  return new Map(rows.map((r) => [keyOf(r.itemId, r.lot, r.status), milliOf(r.qty)]));
}

const itemColumns = {
  id: items.id,
  code: items.code,
  name: items.name,
  unit: items.unit,
  itemType: items.itemType,
  lotManaged: items.lotManaged,
  active: items.active,
  decimals: unitSpecs.decimals,
};

async function warehouseByCode(db: Db, code: string) {
  if (!WAREHOUSE_CODE.test(code)) return undefined;
  const [wh] = await db
    .select({
      id: warehouses.id,
      code: warehouses.code,
      name: warehouses.name,
      isDefect: warehouses.isDefect,
      active: warehouses.active,
    })
    .from(warehouses)
    .where(eq(warehouses.code, code));
  return wh;
}

// ── 입력 화면이 읽는 것 ─────────────────────────────────────

/** 실사 입력의 고르는 목록 — 「사용」인 창고와, 더할 줄에 고를 「사용」인 품목(단위의 자릿수를 함께). */
export async function countFormOptions(db: Db): Promise<{ warehouses: CountWarehouse[]; items: CountItemOption[] }> {
  const [whRows, itemRows] = await Promise.all([
    db
      .select({ code: warehouses.code, name: warehouses.name, isDefect: warehouses.isDefect })
      .from(warehouses)
      .where(eq(warehouses.active, true))
      .orderBy(asc(warehouses.code)),
    db
      .select(itemColumns)
      .from(items)
      .leftJoin(unitSpecs, eq(unitSpecs.unit, items.unit))
      .where(eq(items.active, true))
      .orderBy(asc(items.code)),
  ]);
  return {
    warehouses: whRows,
    items: itemRows.map((i) => ({
      code: i.code,
      name: i.name,
      unit: i.unit,
      decimals: i.decimals ?? 3,
      itemType: i.itemType,
      lotManaged: i.lotManaged,
    })),
  };
}

export type OpenResult = { ok: true; sheet: CountSheet } | { ok: false; message: string };

/**
 * 창고를 골라 입력을 연다(저자 판정 — 메뉴의 첫 화면은 바로 입력) — 작성 중 실사가 있으면 그것을 지금의 장부와 함께, 없으면 그 창고의 장부를
 * 줄로 불러온 새 실사(아직 번호 없음)를 돌려준다. 읽기만 한다 — 창고를 눌러 보기만 해서는 실사가 생기지 않는다.
 */
export async function openCountSheet(db: Db, warehouseCode: string): Promise<OpenResult> {
  const wh = await warehouseByCode(db, warehouseCode);
  if (!wh) return { ok: false, message: "없는 창고입니다 — 목록에서 고르세요" };
  const warehouse = { code: wh.code, name: wh.name, isDefect: wh.isDefect };
  const [draft] = await db
    .select({
      id: stockCounts.id,
      code: stockCounts.code,
      countDate: stockCounts.countDate,
      baseline: stockCounts.baselineLineId,
      version: versionOf(stockCounts.updatedAt),
    })
    .from(stockCounts)
    .where(and(eq(stockCounts.warehouseId, wh.id), eq(stockCounts.status, "DRAFT")));
  if (draft) {
    const book = await bookOf(db, wh.id);
    const lines = await db
      .select({
        ...itemColumns,
        lot: stockCountLines.lot,
        status: stockCountLines.status,
        added: stockCountLines.added,
        counted: stockCountLines.countedQty,
      })
      .from(stockCountLines)
      .innerJoin(items, eq(items.id, stockCountLines.itemId))
      .leftJoin(unitSpecs, eq(unitSpecs.unit, items.unit))
      .where(eq(stockCountLines.countId, draft.id))
      .orderBy(asc(stockCountLines.lineNo));
    return {
      ok: true,
      sheet: {
        warehouse,
        code: draft.code,
        countDate: draft.countDate,
        version: draft.version,
        baseline: draft.baseline,
        lines: lines.map((l) => ({
          itemCode: l.code,
          itemName: l.name,
          unit: l.unit,
          decimals: l.decimals ?? 3,
          itemType: l.itemType,
          lotManaged: l.lotManaged,
          lot: l.lot,
          status: l.status === "QC" ? "QC" : "AVAILABLE",
          added: l.added,
          book: formatMilli(book.get(keyOf(l.id, l.lot, l.status)) ?? ZERO),
          counted: l.counted === null ? "" : fmt(milliOf(l.counted)),
        })),
      },
    };
  }
  if (!wh.active) return { ok: false, message: "「사용 안 함」인 창고입니다 — 다른 창고를 고르세요" };
  const baseline = await lastLineId(db);
  const rows = await db
    .select({ ...itemColumns, lot: stockBalances.lot, status: stockBalances.status, qty: stockBalances.qty })
    .from(stockBalances)
    .innerJoin(items, eq(items.id, stockBalances.itemId))
    .leftJoin(unitSpecs, eq(unitSpecs.unit, items.unit))
    .where(and(eq(stockBalances.warehouseId, wh.id), gt(stockBalances.qty, 0)))
    .orderBy(asc(items.code), asc(stockBalances.lot), asc(stockBalances.status));
  if (rows.length > COUNT_MAX_LINES)
    return {
      ok: false,
      message: `이 창고의 장부가 ${rows.length}줄이라 실사를 열지 못합니다 — 실사 한 건은 ${COUNT_MAX_LINES}줄까지입니다`,
    };
  return {
    ok: true,
    sheet: {
      warehouse,
      code: null,
      countDate: null,
      version: null,
      baseline,
      lines: rows.map((r) => ({
        itemCode: r.code,
        itemName: r.name,
        unit: r.unit,
        decimals: r.decimals ?? 3,
        itemType: r.itemType,
        lotManaged: r.lotManaged,
        lot: r.lot,
        status: r.status === "QC" ? "QC" : "AVAILABLE",
        added: false,
        book: formatMilli(milliOf(r.qty)),
        counted: "",
      })),
    },
  };
}

// ── 저장(작성 중) ─────────────────────────────────────────

export type CountSaveResult =
  | { ok: true; code: string; version: string }
  | { ok: false; errors: CountErrors; formError?: string; values: CountValues };

type ResolvedLine = ParsedCountLine & { itemId: number };

/** 실사 줄을 DB 에 대어 본다 — 품목 · LOT · 상태 · 자릿수. 잠금 안에서 부른다. */
async function resolveCountLines(
  tx: Db,
  warehouseId: number,
  lines: ParsedCountLine[],
): Promise<{ ok: true; lines: ResolvedLine[] } | { ok: false; lines: Record<number, CountLineErrors> }> {
  const codes = [...new Set(lines.map((l) => l.itemCode))];
  const itemRows = codes.length
    ? await tx
        .select(itemColumns)
        .from(items)
        .leftJoin(unitSpecs, eq(unitSpecs.unit, items.unit))
        .where(inArray(items.code, codes))
    : [];
  // 검사대기 줄은 장부에서 불려 온 줄뿐이다 — 그 키의 잔액 행이 있어야 한다(이 조각은 검사대기를 만들지 않는다, 설계 ②).
  const qcRows = await tx
    .select({ itemId: stockBalances.itemId, lot: stockBalances.lot })
    .from(stockBalances)
    .where(and(eq(stockBalances.warehouseId, warehouseId), eq(stockBalances.status, "QC")));
  const errors: Record<number, CountLineErrors> = {};
  const out: ResolvedLine[] = [];
  for (const l of lines) {
    const e: CountLineErrors = {};
    const item = itemRows.find((i) => i.code === l.itemCode);
    if (!item) e.item = "없는 품목입니다 — 목록에서 고르세요";
    else {
      if (l.added && !item.active) e.item = "「사용 안 함」인 품목입니다 — 다른 품목을 고르세요";
      if (!item.lotManaged && l.lot) e.lot = "LOT 관리를 하지 않는 품목입니다 — LOT 를 비우세요";
      else if (item.lotManaged && !l.lot && !isMadeType(item.itemType)) e.lot = "사 오는 품목은 LOT 를 넣어 주세요";
      const decimals = item.decimals ?? 3;
      if (l.counted !== null && l.countedDecimals > decimals)
        e.counted =
          decimals === 0 ? `${eun(item.unit)} 정수로 넣습니다` : `${eun(item.unit)} 소수 ${decimals}자리까지 넣습니다`;
      if (l.status === "QC" && !qcRows.some((q) => q.itemId === item.id && q.lot === l.lot))
        e.row = "장부에 없는 검사대기 줄입니다 — 더한 줄은 가용입니다";
    }
    if (Object.keys(e).length || !item) errors[l.index] = e;
    else out.push({ ...l, itemId: item.id });
  }
  return Object.keys(errors).length ? { ok: false, lines: errors } : { ok: true, lines: out };
}

/**
 * 실사를 작성 중으로 저장한다 — 새 실사면 번호(`PI-<오늘>-NNN`)를 받고, 작성 중 실사면 줄을 통째로 바꾼다. 실물 수량은 비워도 된다.
 * 버전이 다르면(그 사이 다른 사람이 저장 · 확정 · 취소) 거절한다. 누구나 부르는 입구라 화면의 검사를 믿지 않는다.
 */
export async function saveCount(db: Db, values: CountValues, today: string): Promise<CountSaveResult> {
  const parsed = parseCount(values);
  if (!parsed.ok) return { ok: false, errors: parsed.errors, formError: parsed.formError, values };
  const p = parsed.value;
  const fail = (formError: string | undefined, lines: Record<number, CountLineErrors> = {}): CountSaveResult => ({
    ok: false,
    errors: { lines },
    formError,
    values,
  });
  return db
    .transaction(async (tx): Promise<CountSaveResult> => {
      await lockStock(tx);
      const wh = await warehouseByCode(tx, p.warehouse);
      if (!wh) return fail("없는 창고입니다 — 목록에서 고르세요");

      let countId: number;
      let code: string;
      let oldLines = 0;
      if (p.code) {
        const [head] = await tx
          .select({ id: stockCounts.id, status: stockCounts.status, warehouseId: stockCounts.warehouseId })
          .from(stockCounts)
          .where(eq(stockCounts.code, p.code));
        if (!head || head.warehouseId !== wh.id) return fail("없는 실사입니다 — 화면을 새로 여세요");
        if (head.status !== "DRAFT")
          return fail(`이미 ${countStatusName(head.status)}한 실사입니다 — 고치지 못합니다. 화면을 새로 여세요`);
        const [fresh] = await tx
          .select({ id: stockCounts.id })
          .from(stockCounts)
          .where(and(eq(stockCounts.id, head.id), versionIs(stockCounts.updatedAt, p.version)));
        if (!fresh) return fail(STALE);
        countId = head.id;
        code = p.code;
        [{ n: oldLines }] = await tx
          .select({ n: count() })
          .from(stockCountLines)
          .where(eq(stockCountLines.countId, head.id));
      } else {
        if (!wh.active) return fail("「사용 안 함」인 창고입니다 — 다른 창고를 고르세요");
        const [draft] = await tx
          .select({ code: stockCounts.code })
          .from(stockCounts)
          .where(and(eq(stockCounts.warehouseId, wh.id), eq(stockCounts.status, "DRAFT")));
        if (draft) return fail(`이 창고에 작성 중인 실사 ${draft.code} 가 있습니다 — 화면을 새로 열어 이어 넣으세요`);
        const [{ n }] = await tx.select({ n: count() }).from(stockCounts);
        if (n >= COUNT_LIMIT) return fail(limitMessage("재고 실사", COUNT_LIMIT));
        const prefix = `PI-${today.replaceAll("-", "")}-`;
        const [{ max }] = await tx
          .select({ max: sql<number | string | null>`max(substring(${stockCounts.code} from 13)::int)` })
          .from(stockCounts)
          .where(sql`${stockCounts.code} like ${`${prefix}%`}`);
        code = `${prefix}${String(Number(max ?? 0) + 1).padStart(3, "0")}`;
        // 장부를 불러온 때의 줄 번호 — 화면이 보낸 값이 지금보다 크면(꾸민 값) 지금으로 둔다.
        const baseline = Math.min(p.baseline, await lastLineId(tx));
        const [saved] = await tx
          .insert(stockCounts)
          .values({ code, countDate: today, warehouseId: wh.id, baselineLineId: baseline })
          .returning({ id: stockCounts.id });
        countId = saved.id;
      }

      const [{ n: allLines }] = await tx.select({ n: count() }).from(stockCountLines);
      if (allLines - oldLines + p.lines.length > COUNT_LINE_LIMIT)
        throw new CountRollback(fail(limitMessage("재고 실사 줄", COUNT_LINE_LIMIT)));

      const r = await resolveCountLines(tx, wh.id, p.lines);
      if (!r.ok) throw new CountRollback(fail(undefined, r.lines));

      await tx.delete(stockCountLines).where(eq(stockCountLines.countId, countId));
      await tx.insert(stockCountLines).values(
        r.lines.map((l, i) => ({
          countId,
          lineNo: i + 1,
          itemId: l.itemId,
          lot: l.lot,
          status: l.status,
          added: l.added,
          countedQty: l.counted === null ? null : numberOf(l.counted),
        })),
      );
      const [{ version }] = await tx
        .update(stockCounts)
        .set({ updatedAt: touched() })
        .where(eq(stockCounts.id, countId))
        .returning({ version: versionOf(stockCounts.updatedAt) });
      return { ok: true, code, version };
    })
    .catch((error: unknown) => {
      if (error instanceof CountRollback) return error.result;
      throw error;
    });
}

/** 새 실사를 넣은 뒤 줄이 틀렸다 — 던져 번호까지 되돌린다. */
class CountRollback extends Error {
  constructor(readonly result: CountSaveResult) {
    super("실사 저장 되돌림");
  }
}

// ── 취소 ───────────────────────────────────────────────

export type CountActionResult =
  { ok: true; code: string } | { ok: false; formError: string } | { ok: false; notFound: true };

/** 작성 중 실사를 「취소」로 남긴다(저자 판정) — 수불이 바뀌지 않아 반대 전표는 없다. 확정한 실사는 취소하지 못한다. */
export async function cancelCount(db: Db, code: string): Promise<CountActionResult> {
  if (!COUNT_CODE.test(code)) return { ok: false, notFound: true };
  return db.transaction(async (tx): Promise<CountActionResult> => {
    await lockStock(tx);
    const [head] = await tx
      .select({ id: stockCounts.id, status: stockCounts.status, adjustMoveId: stockCounts.adjustMoveId })
      .from(stockCounts)
      .where(eq(stockCounts.code, code));
    if (!head) return { ok: false, notFound: true };
    if (head.status === "CONFIRMED")
      return { ok: false, formError: "확정한 실사는 취소하지 못합니다 — 바로잡으려면 그 조정 전표를 취소하세요" };
    if (head.status === "CANCELED") return { ok: false, formError: "이미 취소한 실사입니다" };
    await tx.update(stockCounts).set({ status: "CANCELED", updatedAt: touched() }).where(eq(stockCounts.id, head.id));
    return { ok: true, code };
  });
}

// ── 확정 ───────────────────────────────────────────────

export type ConfirmLine = {
  lineNo: number;
  itemCode: string;
  itemName: string;
  unit: string;
  lot: string;
  status: "AVAILABLE" | "QC";
  book: string;
  counted: string;
  /** 실물 − 장부(보이는 글자, + · −) — 차이가 없으면 null. */
  diff: string | null;
};

export type ConfirmPreview = {
  code: string;
  version: string;
  warehouse: CountWarehouse;
  countDate: string;
  /** 차이가 있는 줄 — 확정하면 이 줄들이 조정 전표 한 장이 된다. */
  diffs: ConfirmLine[];
  /** 실물 수량을 비운 줄 — 하나라도 있으면 확정하지 못한다(저자 판정). */
  blanks: { lineNo: number; itemCode: string; itemName: string; lot: string }[];
  /** 실사를 연 뒤 그 창고에 닿은 수불 전표(성공 기준 7 의 경고). */
  movesAfter: string[];
  /** 실사 줄 밖의 장부 재고 — 손대지 않는다(저자 판정), 경고로만. */
  outside: { itemCode: string; itemName: string; unit: string; lot: string; status: "AVAILABLE" | "QC"; qty: string }[];
};

type DraftLine = {
  id: number;
  lineNo: number;
  itemId: number;
  itemCode: string;
  itemName: string;
  unit: string;
  itemType: string;
  lotManaged: boolean;
  lot: string;
  status: string;
  counted: Milli | null;
};

async function draftOf(db: Db, code: string) {
  if (!COUNT_CODE.test(code)) return undefined;
  const [head] = await db
    .select({
      id: stockCounts.id,
      code: stockCounts.code,
      status: stockCounts.status,
      countDate: stockCounts.countDate,
      baseline: stockCounts.baselineLineId,
      version: versionOf(stockCounts.updatedAt),
      warehouseId: warehouses.id,
      warehouseCode: warehouses.code,
      warehouseName: warehouses.name,
      isDefect: warehouses.isDefect,
    })
    .from(stockCounts)
    .innerJoin(warehouses, eq(warehouses.id, stockCounts.warehouseId))
    .where(eq(stockCounts.code, code));
  if (!head) return undefined;
  const rows = await db
    .select({
      id: stockCountLines.id,
      lineNo: stockCountLines.lineNo,
      itemId: items.id,
      itemCode: items.code,
      itemName: items.name,
      unit: items.unit,
      itemType: items.itemType,
      lotManaged: items.lotManaged,
      lot: stockCountLines.lot,
      status: stockCountLines.status,
      counted: stockCountLines.countedQty,
    })
    .from(stockCountLines)
    .innerJoin(items, eq(items.id, stockCountLines.itemId))
    .where(eq(stockCountLines.countId, head.id))
    .orderBy(asc(stockCountLines.lineNo));
  const lines: DraftLine[] = rows.map((r) => ({ ...r, counted: r.counted === null ? null : milliOf(r.counted) }));
  return { head, lines };
}

const asStatus = (s: string): "AVAILABLE" | "QC" => (s === "QC" ? "QC" : "AVAILABLE");
const signed = (q: Milli) => (q > ZERO ? `+${formatMilli(q)}` : formatMilli(q));

/** 확정 화면 — 저장한 실사를 지금의 장부와 견준 차이와 경고(연 뒤의 수불 · 줄 밖의 재고 · 비운 줄). 읽기만 한다. */
export async function previewConfirm(
  db: Db,
  code: string,
): Promise<ConfirmPreview | { notFound: true } | { formError: string }> {
  const d = await draftOf(db, code);
  if (!d) return { notFound: true };
  if (d.head.status !== "DRAFT") return { formError: `이미 ${countStatusName(d.head.status)}한 실사입니다` };
  const book = await bookOf(db, d.head.warehouseId);
  const diffs: ConfirmLine[] = [];
  for (const l of d.lines) {
    if (l.counted === null) continue;
    const b = book.get(keyOf(l.itemId, l.lot, l.status)) ?? ZERO;
    if (l.counted === b) continue;
    diffs.push({
      lineNo: l.lineNo,
      itemCode: l.itemCode,
      itemName: l.itemName,
      unit: l.unit,
      lot: l.lot,
      status: asStatus(l.status),
      book: formatMilli(b),
      counted: formatMilli(l.counted),
      diff: signed(l.counted - b),
    });
  }
  const inLines = new Set(d.lines.map((l) => keyOf(l.itemId, l.lot, l.status)));
  const outsideRows = await db
    .select({
      itemId: items.id,
      itemCode: items.code,
      itemName: items.name,
      unit: items.unit,
      lot: stockBalances.lot,
      status: stockBalances.status,
      qty: stockBalances.qty,
    })
    .from(stockBalances)
    .innerJoin(items, eq(items.id, stockBalances.itemId))
    .where(and(eq(stockBalances.warehouseId, d.head.warehouseId), gt(stockBalances.qty, 0)))
    .orderBy(asc(items.code), asc(stockBalances.lot));
  const after = rowsOf<{ code: string }>(
    await db.execute(sql`
      select m.code from stock_moves m
      where exists (select 1 from stock_move_lines l where l.move_id = m.id and l.id > ${d.head.baseline}
        and (l.from_warehouse_id = ${d.head.warehouseId} or l.to_warehouse_id = ${d.head.warehouseId}))
      order by m.id`),
  );
  return {
    code: d.head.code,
    version: d.head.version,
    warehouse: { code: d.head.warehouseCode, name: d.head.warehouseName, isDefect: d.head.isDefect },
    countDate: d.head.countDate,
    diffs,
    blanks: d.lines
      .filter((l) => l.counted === null)
      .map((l) => ({ lineNo: l.lineNo, itemCode: l.itemCode, itemName: l.itemName, lot: l.lot })),
    movesAfter: after.map((r) => r.code),
    outside: outsideRows
      .filter((r) => !inLines.has(keyOf(r.itemId, r.lot, r.status)))
      .map((r) => ({
        itemCode: r.itemCode,
        itemName: r.itemName,
        unit: r.unit,
        lot: r.lot,
        status: asStatus(r.status),
        qty: formatMilli(milliOf(r.qty)),
      })),
  };
}

export type ConfirmResult =
  | { ok: true; code: string; moveCode: string | null }
  | { ok: false; formError: string }
  | { ok: false; notFound: true };

/**
 * 확정(성공 기준 7, ADR 0015 · 0021) — 실사 줄마다 확정하는 순간의 장부와 견주어, 차이가 있는 줄을 「실사 차이」 조정 전표 한 장(확정한 날)으로
 * 남기고, 줄마다 그때의 장부를 적는다. 차이가 없으면 전표 없이 확정만 된다. 비운 줄이 있거나 버전이 다르면 거절한다.
 * 조정 수량 = 실물 − 장부라 조정 뒤 잔액은 실물(0 이상)이다. 그래도 재고 계산의 저장을 지나 음수 검사 · 상한을 본다.
 */
export async function confirmCount(db: Db, code: string, version: string, today: string): Promise<ConfirmResult> {
  if (!COUNT_CODE.test(code)) return { ok: false, notFound: true };
  try {
    return await db.transaction(async (tx): Promise<ConfirmResult> => {
      await lockStock(tx);
      const d = await draftOf(tx, code);
      if (!d) return { ok: false, notFound: true };
      if (d.head.status !== "DRAFT")
        return { ok: false, formError: `이미 ${countStatusName(d.head.status)}한 실사입니다` };
      if (d.head.version !== version) return { ok: false, formError: STALE };
      const blanks = d.lines.filter((l) => l.counted === null);
      if (blanks.length)
        return {
          ok: false,
          formError: `실물 수량을 비운 줄이 ${blanks.length}개 있어 확정하지 않았습니다 — 0 을 포함해 모든 줄을 넣으세요 (줄 ${blanks.map((l) => l.lineNo).join(", ")})`,
        };
      const book = await bookOf(tx, d.head.warehouseId);
      const stockLines: (StockLine & { countLineId: number })[] = [];
      const books = new Map<number, Milli>();
      for (const l of d.lines) {
        const b = book.get(keyOf(l.itemId, l.lot, l.status)) ?? ZERO;
        books.set(l.id, b);
        const diff = l.counted! - b;
        if (diff === ZERO) continue;
        const abs = diff < ZERO ? -diff : diff;
        stockLines.push({
          countLineId: l.id,
          itemId: l.itemId,
          lot: l.lot,
          status: asStatus(l.status),
          fromWarehouseId: diff < ZERO ? d.head.warehouseId : null,
          toWarehouseId: diff > ZERO ? d.head.warehouseId : null,
          qty: abs,
          enteredQty: abs,
          enteredUnit: l.unit,
          // 만드는 품목을 LOT 없이 찾았으면 번호 규칙으로 받는다(늘리는 조정과 같다, ADR 0016).
          autoLot: l.lotManaged && !l.lot && diff > ZERO ? { itemType: l.itemType, lotRuleCode: null } : undefined,
        });
      }
      // 품목의 LOT 번호 규칙 — 비운 LOT 를 받을 줄만.
      for (const s of stockLines)
        if (s.autoLot) {
          const [it] = await tx.select({ rule: items.lotRuleCode }).from(items).where(eq(items.id, s.itemId));
          s.autoLot.lotRuleCode = it?.rule ?? null;
        }
      let moveId: number | null = null;
      let moveCode: string | null = null;
      if (stockLines.length) {
        const saved = await recordCountAdjustment(tx, { date: today, note: `${code} 실사 차이`, lines: stockLines });
        moveId = saved.id;
        moveCode = saved.code;
        // 저절로 받은 LOT 를 실사 줄에도 적는다 — 실사 보기가 그 LOT 를 보인다.
        for (const s of stockLines)
          if (s.autoLot)
            await tx.update(stockCountLines).set({ lot: s.lot }).where(eq(stockCountLines.id, s.countLineId));
      }
      for (const l of d.lines)
        await tx
          .update(stockCountLines)
          .set({ bookQty: numberOf(books.get(l.id)!), updatedAt: touched() })
          .where(eq(stockCountLines.id, l.id));
      await tx
        .update(stockCounts)
        .set({ status: "CONFIRMED", confirmedDate: today, adjustMoveId: moveId, updatedAt: touched() })
        .where(eq(stockCounts.id, d.head.id));
      return { ok: true, code, moveCode };
    });
  } catch (error) {
    if (error instanceof ShortageError)
      return { ok: false, formError: "확정하면 재고가 0 밑으로 갑니다 — 화면을 새로 열어 다시 확정하세요" };
    if (error instanceof LimitError)
      return {
        ok: false,
        formError:
          error.what === "move" ? limitMessage("수불 전표", MOVE_LIMIT) : limitMessage("수불 줄", MOVE_LINE_LIMIT),
      };
    throw error;
  }
}

// ── 보기 · 목록 ─────────────────────────────────────────

export type CountSummary = {
  code: string;
  countDate: string;
  warehouse: string;
  status: string;
  statusName: string;
  confirmedDate: string | null;
  lines: number;
  moveCode: string | null;
};

/** 최근 실사 — 모든 창고 · 모든 상태, 등록한 차례의 거꾸로(저자 판정 — 입력 아래의 최근 실사). */
export async function listRecentCounts(db: Db, limit = 20): Promise<CountSummary[]> {
  const rows = await db
    .select({
      code: stockCounts.code,
      countDate: stockCounts.countDate,
      warehouseCode: warehouses.code,
      warehouseName: warehouses.name,
      status: stockCounts.status,
      confirmedDate: stockCounts.confirmedDate,
      lines: sql<number>`(select count(*)::int from stock_count_lines l where l.count_id = ${stockCounts.id})`,
      moveCode: stockMoves.code,
    })
    .from(stockCounts)
    .innerJoin(warehouses, eq(warehouses.id, stockCounts.warehouseId))
    .leftJoin(stockMoves, eq(stockMoves.id, stockCounts.adjustMoveId))
    .orderBy(desc(stockCounts.id))
    .limit(limit);
  return rows.map((r) => ({
    code: r.code,
    countDate: r.countDate,
    warehouse: `${r.warehouseCode} ${r.warehouseName}`,
    status: r.status,
    statusName: countStatusName(r.status),
    confirmedDate: r.confirmedDate,
    lines: Number(r.lines),
    moveCode: r.moveCode,
  }));
}

export type CountLineView = {
  lineNo: number;
  itemCode: string;
  itemName: string;
  unit: string;
  lot: string;
  status: "AVAILABLE" | "QC";
  added: boolean;
  /** 장부 — 확정한 실사는 확정 때의 장부, 작성 중은 지금의 장부, 취소한 실사는 없음. */
  book: string | null;
  counted: string | null;
  diff: string | null;
};
export type CountDetail = CountSummary & { warehouseCode: string; lineRows: CountLineView[] };

/** 실사 하나와 그 줄. */
export async function getCount(db: Db, code: string): Promise<CountDetail | undefined> {
  if (!COUNT_CODE.test(code)) return undefined;
  const [head] = await db
    .select({
      id: stockCounts.id,
      code: stockCounts.code,
      countDate: stockCounts.countDate,
      warehouseId: warehouses.id,
      warehouseCode: warehouses.code,
      warehouseName: warehouses.name,
      status: stockCounts.status,
      confirmedDate: stockCounts.confirmedDate,
      moveCode: stockMoves.code,
    })
    .from(stockCounts)
    .innerJoin(warehouses, eq(warehouses.id, stockCounts.warehouseId))
    .leftJoin(stockMoves, eq(stockMoves.id, stockCounts.adjustMoveId))
    .where(eq(stockCounts.code, code));
  if (!head) return undefined;
  const rows = await db
    .select({
      lineNo: stockCountLines.lineNo,
      itemId: items.id,
      itemCode: items.code,
      itemName: items.name,
      unit: items.unit,
      lot: stockCountLines.lot,
      status: stockCountLines.status,
      added: stockCountLines.added,
      counted: stockCountLines.countedQty,
      bookQty: stockCountLines.bookQty,
    })
    .from(stockCountLines)
    .innerJoin(items, eq(items.id, stockCountLines.itemId))
    .where(eq(stockCountLines.countId, head.id))
    .orderBy(asc(stockCountLines.lineNo));
  const live = head.status === "DRAFT" ? await bookOf(db, head.warehouseId) : undefined;
  return {
    code: head.code,
    countDate: head.countDate,
    warehouse: `${head.warehouseCode} ${head.warehouseName}`,
    warehouseCode: head.warehouseCode,
    status: head.status,
    statusName: countStatusName(head.status),
    confirmedDate: head.confirmedDate,
    lines: rows.length,
    moveCode: head.moveCode,
    lineRows: rows.map((r) => {
      const counted = r.counted === null ? null : milliOf(r.counted);
      const book =
        head.status === "CONFIRMED"
          ? r.bookQty === null
            ? null
            : milliOf(r.bookQty)
          : live
            ? (live.get(keyOf(r.itemId, r.lot, r.status)) ?? ZERO)
            : null;
      return {
        lineNo: r.lineNo,
        itemCode: r.itemCode,
        itemName: r.itemName,
        unit: r.unit,
        lot: r.lot,
        status: asStatus(r.status),
        added: r.added,
        book: book === null ? null : formatMilli(book),
        counted: counted === null ? null : formatMilli(counted),
        diff: book !== null && counted !== null && counted !== book ? signed(counted - book) : null,
      };
    }),
  };
}
