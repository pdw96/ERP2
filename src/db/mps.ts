import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { ITEM_CODE } from "@/lib/bom-input";
import { planMps, type MpsCalcWeek } from "@/lib/mps-calc";
import { MPS_SAVE_MAX_CELLS, mpsCellKey, parseMpsQty, type MpsCellInput, type MpsConfirmInput } from "@/lib/mps-input";
import type { Milli } from "@/lib/move-input";
import { addWeeks, EDIT_WEEKS, isMonday, mondayOf, pageWeeks } from "@/lib/weeks";
import { limitMessage, STALE, touched } from "./master-shared";
import { canon, canonText, lockSalesPlans, salesPlanDemand } from "./sales-plans";
import { items, mpsChanges, mpsFixed, unitSpecs } from "./schema";
import { milliOf } from "./stock";
import { availableByItem } from "./stock-status";
import type { Db } from "./types";

// MPS 의 열기 · 저장 · 확정 · 확정 취소 · 고친 이력 · MRP 가 읽는 공급량(메뉴 「MPS」). 화면과 MRP 는 이 함수만 부른다.
// - 칸 하나 = 완제품 × 주(월요일). DB 에는 고정한 칸만 있다(수량 0 포함). 고정하지 않은 주의 수량은 「안」이고, 열 때마다 지금의 수요 · 재고로 계산한다.
// - 계산은 한 곳(computeMps)이다 — 화면(openMps)과 MRP(mpsSupply)가 같은 함수로 같은 값을 읽는다. 계산 범위는 늘 이번 주 ~ 51주 뒤(52주)이고,
//   처음 재고는 지금 가용재고, 수요는 확정한 판매계획의 품목 × 주 합(salesPlanDemand)이다. 지난 주는 확정 수요 합과 고정 칸만 읽기 전용으로 보인다.
// - 저장은 화면이 보낸 바뀐 칸만 한 트랜잭션에서 바꾼다. 칸마다 화면이 본 고정 수량(before)을 지금과 견줘, 하나라도 다르면 아무것도 쓰지 않는다.
//   [확정]은 화면이 본 안을 그대로 고정한다(안을 다시 계산해 견주지 않는다) — 그 칸이 지금 고정이면 거절. [확정 취소]는 화면이 본 고정 수량과 같을 때만 푼다.
// - 저장 · 확정 · 확정 취소는 판매계획의 잠금(lockSalesPlans)을 쥐고 돈다 — 판매계획의 확정 취소가 MPS 고정 칸을 대어 보는 것과 한 차례가 되게.

/** 고정 칸 전체의 등록 상한 — 매일 밤 되돌림이 샘플로 되돌린다. */
export const MPS_FIXED_LIMIT = 20000;
/** 고친 이력 전체의 등록 상한 — 매일 밤 되돌림이 비운다. */
export const MPS_CHANGE_LIMIT = 50000;
/** 화면에서 보이는 고친 이력의 줄 수 상한. */
export const MPS_HISTORY_SHOWN = 100;

const FORM = "저장하지 못했습니다 — 화면을 새로 여세요";
const NO_ITEM = "없는 품목입니다";
const NOT_FG = "MPS 는 완제품에만 있습니다";
const NOT_MONDAY = "월요일이 아닌 주입니다";
const PAST_WEEK = "지난 주는 고치지 못합니다";
const FAR_WEEK = "51주 뒤까지만 넣습니다";
const NO_PROPOSAL = "확정할 안이 없습니다";

const ZERO = BigInt(0);

/** 천분의 일 단위의 수량을 정규 글자로 — 음수는 절댓값의 정규 글자에 「-」(판매계획의 canon 은 음수에서 틀린다). */
function qtyText(qty: Milli): string {
  return qty < ZERO ? `-${canon(-qty)}` : canon(qty);
}

const ro = { isolationLevel: "repeatable read", accessMode: "read only" } as const;

// postgres 드라이버는 행의 배열을, PGlite 는 { rows } 를 돌려준다.
function rowsOf<T>(result: unknown): T[] {
  return (Array.isArray(result) ? result : (result as { rows: T[] }).rows) as T[];
}

// ── 품목 ─────────────────────────────────────────────

export type MpsItem = { code: string; name: string; spec: string; unit: string; decimals: number; active: boolean };

/** 단위의 소수 자릿수 — 단위의 사양이 없으면 0. unit_specs 를 left join 해서 읽는다. */
const decimalsCol = sql<number>`coalesce(${unitSpecs.decimals}, 0)`.mapWith(Number);

type FgItem = MpsItem & { id: number; safety: Milli; minLot: Milli; multiple: Milli };

/** 완제품 전체(「사용 안 함」 포함) — 품목 코드 차례. */
async function fgItems(db: Db): Promise<FgItem[]> {
  const rows = await db
    .select({
      id: items.id,
      code: items.code,
      name: items.name,
      spec: items.spec,
      unit: items.unit,
      active: items.active,
      decimals: decimalsCol,
      safety: sql<string>`${items.safetyStock}::text`,
      minLot: sql<string>`${items.minLot}::text`,
      multiple: sql<string>`${items.lotMultiple}::text`,
    })
    .from(items)
    .leftJoin(unitSpecs, eq(unitSpecs.unit, items.unit))
    .where(eq(items.itemType, "FG"))
    .orderBy(asc(items.code));
  return rows.map((r) => ({
    ...r,
    safety: milliOf(r.safety),
    minLot: milliOf(r.minLot),
    multiple: milliOf(r.multiple),
  }));
}

const itemOf = (i: FgItem): MpsItem => ({
  code: i.code,
  name: i.name,
  spec: i.spec,
  unit: i.unit,
  decimals: i.decimals,
  active: i.active,
});

/** 두 끝을 포함한 주 범위의 고정 칸 — 수량은 DB 의 numeric 글자. */
async function fixedBetween(db: Db, from: string, to: string) {
  return db
    .select({ itemId: mpsFixed.itemId, week: mpsFixed.weekStart, qty: sql<string>`${mpsFixed.qty}::text` })
    .from(mpsFixed)
    .where(sql`${mpsFixed.weekStart} between ${from}::date and ${to}::date`);
}

// ── 계산(한 곳) ───────────────────────────────────────────

type Computed = { item: FgItem; available: Milli; plan: MpsCalcWeek[] };

/** 계산 범위 — 이번 주부터 52주. */
const calcWeeks = (thisWeek: string) => Array.from({ length: EDIT_WEEKS }, (_, i) => addWeeks(thisWeek, i));

/**
 * 완제품마다 계산 범위의 MPS — 가용재고 · 확정 수요 · 고정 칸을 읽어 planMps 를 돌린다. 부르는 쪽이 읽기 전용 REPEATABLE READ 트랜잭션에서 부른다
 * (재고 · 수요 · 고정이 한 스냅숏에서 나와, 화면과 MRP 가 같은 순간이면 같은 값을 읽는다).
 */
async function computeMps(tx: Db, thisWeek: string): Promise<Computed[]> {
  const weeks = calcWeeks(thisWeek);
  const last = weeks[weeks.length - 1];
  const fg = await fgItems(tx);
  if (!fg.length) return [];
  const available = await availableByItem(
    tx,
    fg.map((i) => i.id),
  );
  const demandOf = new Map<string, Map<string, Milli>>();
  for (const d of await salesPlanDemand(tx, thisWeek, last)) {
    const m = demandOf.get(d.item) ?? new Map<string, Milli>();
    m.set(d.week, milliOf(d.qty));
    demandOf.set(d.item, m);
  }
  const fixedOf = new Map<number, Map<string, Milli>>();
  for (const f of await fixedBetween(tx, thisWeek, last)) {
    const m = fixedOf.get(f.itemId) ?? new Map<string, Milli>();
    m.set(f.week, milliOf(f.qty));
    fixedOf.set(f.itemId, m);
  }
  return fg.map((item) => {
    const start = available.get(item.id) ?? ZERO;
    return {
      item,
      available: start,
      plan: planMps({
        weeks,
        available: start,
        safety: item.safety,
        minLot: item.minLot,
        multiple: item.multiple,
        decimals: item.decimals,
        demand: demandOf.get(item.code) ?? new Map(),
        fixed: fixedOf.get(item.id) ?? new Map(),
      }),
    };
  });
}

// ── 열기 ─────────────────────────────────────────────

/** 칸 하나 — 수량은 정규 글자(음수는 「-100」). 지난 주는 mps(고정일 때만) · projected 가 null. demand 는 확정 수요가 없으면 null. */
export type MpsCell = { demand: string | null; mps: string | null; fixed: boolean; projected: string | null };
/** 품목 머리의 가용 · 안전 · 최소 · 배수와 칸(열쇠는 주). */
export type MpsRow = {
  item: MpsItem;
  available: string;
  safety: string;
  minLot: string;
  multiple: string;
  cells: Record<string, MpsCell>;
};
export type MpsSheet = { thisWeek: string; weeks: string[]; rows: MpsRow[] };

/**
 * MPS 한 쪽(13주) — 줄은 완제품 가운데 (a) 계산 범위에 0 아닌 수요 · 고정 칸(0 포함) · 0 아닌 안이 있거나, (b) 보이는 13주에 확정 수요 · 고정 칸이
 * 있는 것(「사용 안 함」 품목도), 품목 코드 차례. 칸은 13주 모두 — 이번 주 이후는 계산값, 지난 주는 확정 수요 합과 고정 칸만.
 * from 이 월요일이 아니면 이번 주부터 연다. 보이는 쪽이 미래여도 계산은 이번 주부터 이어서 한다.
 */
export async function openMps(db: Db, opts: { from: string }, today: string): Promise<MpsSheet> {
  const thisWeek = mondayOf(today);
  const weeks = pageWeeks(isMonday(opts.from) ? opts.from : thisWeek);
  const lastCalc = addWeeks(thisWeek, EDIT_WEEKS - 1);
  const outside = weeks.filter((w) => w < thisWeek || w > lastCalc);

  return db.transaction(async (tx) => {
    const computed = await computeMps(tx, thisWeek);

    // 계산 범위 밖의 보이는 주(지난 주) — 확정 수요 합과 고정 칸만 읽는다.
    const outsideDemand = new Map<string, string>();
    const outsideFixed = new Map<string, string>();
    if (outside.length) {
      const lo = outside[0];
      const hi = outside[outside.length - 1];
      for (const d of await salesPlanDemand(tx, lo, hi)) outsideDemand.set(mpsCellKey(d.item, d.week), d.qty);
      for (const f of await fixedBetween(tx, lo, hi)) outsideFixed.set(`${f.itemId}|${f.week}`, canonText(f.qty));
    }

    const rows: MpsRow[] = [];
    for (const c of computed) {
      const planOf = new Map(c.plan.map((p) => [p.week, p] as const));
      let shown = c.plan.some((p) => p.demand !== ZERO || p.fixed || p.mps !== ZERO);
      const cells: Record<string, MpsCell> = {};
      for (const w of weeks) {
        const p = planOf.get(w);
        if (p) {
          cells[w] = {
            demand: p.demand === ZERO ? null : qtyText(p.demand),
            mps: qtyText(p.mps),
            fixed: p.fixed,
            projected: qtyText(p.projected),
          };
          continue;
        }
        const demand = outsideDemand.get(mpsCellKey(c.item.code, w)) ?? null;
        const fixed = outsideFixed.get(`${c.item.id}|${w}`);
        if (demand !== null || fixed !== undefined) shown = true;
        cells[w] = { demand, mps: fixed ?? null, fixed: fixed !== undefined, projected: null };
      }
      if (!shown) continue;
      rows.push({
        item: itemOf(c.item),
        available: qtyText(c.available),
        safety: qtyText(c.item.safety),
        minLot: qtyText(c.item.minLot),
        multiple: qtyText(c.item.multiple),
        cells,
      });
    }
    return { thisWeek, weeks, rows };
  }, ro);
}

/**
 * MRP 가 읽는 공급량 — 품목 × 주(이번 주 ~ toWeek)의 고정 수량 + 미확정 안, 0 은 뺀다. 품목 코드 · 주 차례, 수량은 정규 글자.
 * 화면과 같은 계산(computeMps)이라 같은 순간이면 openMps 의 같은 칸과 같다. 계산 범위(51주 뒤)를 넘는 주는 없다.
 */
export async function mpsSupply(
  db: Db,
  toWeek: string,
  today: string,
): Promise<{ item: string; week: string; qty: string; fixed: boolean }[]> {
  const thisWeek = mondayOf(today);
  return db.transaction(async (tx) => {
    const out: { item: string; week: string; qty: string; fixed: boolean }[] = [];
    for (const c of await computeMps(tx, thisWeek))
      for (const p of c.plan)
        if (p.week <= toWeek && p.mps !== ZERO)
          out.push({ item: c.item.code, week: p.week, qty: qtyText(p.mps), fixed: p.fixed });
    return out;
  }, ro);
}

// ── 칸 대어 보기 ──────────────────────────────────────────

export type MpsResult =
  { ok: true; changed: number } | { ok: false; errors: Record<string, string>; formError?: string };

type TargetItem = { id: number; code: string; itemType: string; decimals: number };
type Target = { item: string; week: string };
type Found<T extends Target> = { key: string; input: T; item: TargetItem; week: string };

const fieldsAreText = (v: unknown, fields: readonly string[]) =>
  typeof v === "object" && v !== null && fields.every((f) => typeof (v as Record<string, unknown>)[f] === "string");

const CELL_FIELDS = ["item", "week", "before", "after"] as const;
const CONFIRM_FIELDS = ["item", "week", "qty"] as const;
const isCellInput = (v: unknown): v is MpsCellInput => fieldsAreText(v, CELL_FIELDS);
const isConfirmInput = (v: unknown): v is MpsConfirmInput => fieldsAreText(v, CONFIRM_FIELDS);

/**
 * 칸마다 품목 · 주를 DB 에 대어 본다. 칸의 오류는 하나만(품목 → 주 차례). 수량은 보지 않는다.
 * 저장 · 확정 · 확정 취소가 함께 쓴다 — 지난 주 · 51주 넘는 주의 칸은 바꾸지 못한다.
 */
async function checkTargets<T extends Target>(
  db: Db,
  cells: readonly T[],
  thisWeek: string,
): Promise<{ errors: Record<string, string>; found: Found<T>[] }> {
  const codes = [...new Set(cells.map((c) => c.item).filter((c) => ITEM_CODE.test(c)))];
  const byCode = new Map(
    (codes.length
      ? await db
          .select({ id: items.id, code: items.code, itemType: items.itemType, decimals: decimalsCol })
          .from(items)
          .leftJoin(unitSpecs, eq(unitSpecs.unit, items.unit))
          .where(inArray(items.code, codes))
      : []
    ).map((i) => [i.code, i] as const),
  );
  const lastWeek = addWeeks(thisWeek, EDIT_WEEKS - 1);

  const errors: Record<string, string> = {};
  const found: Found<T>[] = [];
  for (const c of cells) {
    const key = mpsCellKey(c.item, c.week);
    const item = ITEM_CODE.test(c.item) ? byCode.get(c.item) : undefined;
    if (!item) errors[key] = NO_ITEM;
    else if (item.itemType !== "FG") errors[key] = NOT_FG;
    else if (!isMonday(c.week)) errors[key] = NOT_MONDAY;
    else if (c.week < thisWeek) errors[key] = PAST_WEEK;
    else if (c.week > lastWeek) errors[key] = FAR_WEEK;
    else found.push({ key, input: c, item, week: c.week });
  }
  return { errors, found };
}

/** 대어 본 저장 칸 — before · after 는 정규 글자, 고정 아님(풀기)은 null. */
type CheckedCell = Found<MpsCellInput> & { before: string | null; after: string | null };

/** 칸마다 품목 · 주 · 수량을 대어 본다(품목 → 주 → 넣은 글자 → 화면이 본 고정 수량 차례). 잠금 앞 · 뒤 두 번 부른다. */
async function checkCells(
  db: Db,
  cells: readonly MpsCellInput[],
  thisWeek: string,
): Promise<{ errors: Record<string, string>; checked: CheckedCell[] }> {
  const { errors, found } = await checkTargets(db, cells, thisWeek);
  const checked: CheckedCell[] = [];
  for (const f of found) {
    const after = parseMpsQty(f.input.after, f.item.decimals);
    if (!after.ok) {
      errors[f.key] = after.message;
      continue;
    }
    const before = parseMpsQty(f.input.before, f.item.decimals);
    if (!before.ok) {
      errors[f.key] = before.message;
      continue;
    }
    checked.push({
      ...f,
      before: before.qty === null ? null : canon(before.qty),
      after: after.qty === null ? null : canon(after.qty),
    });
  }
  return { errors, checked };
}

type CellIds = { item: { id: number }; week: string };
const inCells = (cells: readonly CellIds[]) =>
  sql`(${mpsFixed.itemId}, ${mpsFixed.weekStart}) in (${sql.join(
    cells.map((c) => sql`(${c.item.id}::integer, ${c.week}::date)`),
    sql`, `,
  )})`;

/** 그 칸들의 지금 고정 수량(정규 글자) — 고정이 아니면 null. */
async function readFixed(db: Db, cells: readonly CellIds[]): Promise<(c: CellIds) => string | null> {
  const rows = await db
    .select({ itemId: mpsFixed.itemId, week: mpsFixed.weekStart, qty: sql<string>`${mpsFixed.qty}::text` })
    .from(mpsFixed)
    .where(inCells(cells));
  const byIds = new Map(rows.map((r) => [`${r.itemId}|${r.week}`, canonText(r.qty)] as const));
  return (c) => byIds.get(`${c.item.id}|${c.week}`) ?? null;
}

const countOf = async (tx: Db, t: typeof mpsFixed | typeof mpsChanges) =>
  (await tx.select({ n: count() }).from(t))[0].n;

const nowText = async (tx: Db) =>
  rowsOf<{ at: string }>(await tx.execute(sql`select clock_timestamp()::text as at`))[0].at;

// ── 저장 ─────────────────────────────────────────────

/**
 * MPS 의 저장 — 화면이 보낸 바뀐 칸들. 꼴 → 칸마다 대어 보기 → 바뀐 것만 남김 → (잠금) 다시 대어 보기 → 지금 고정 수량과 견줌(STALE)
 * → 상한 차례로 보고, 하나라도 틀리면 아무것도 쓰지 않는다. 바뀐 것이 없으면 잠금도 쥐지 않고 아무것도 쓰지 않는다.
 * 넣은 글자가 있으면 그 수량으로 고정(0 도 고정), 빈 칸이면 고정을 푼다. 고친 이력은 칸마다 한 줄 — 풀면 UNCONFIRM, 아니면 EDIT.
 * 고정한 일시 · 이력의 일시는 잠금을 쥔 뒤 읽은 한 시각이다. changed 는 바꾼 칸 수. today 는 한국 시각의 오늘(YYYY-MM-DD).
 */
export async function saveMps(db: Db, cells: MpsCellInput[], today: string): Promise<MpsResult> {
  const formFail = (formError: string): MpsResult => ({ ok: false, errors: {}, formError });

  if (!Array.isArray(cells) || !cells.every(isCellInput)) return formFail(FORM);
  if (new Set(cells.map((c) => mpsCellKey(c.item, c.week))).size !== cells.length) return formFail(FORM);
  if (cells.length > MPS_SAVE_MAX_CELLS)
    return formFail(`한 번에 ${MPS_SAVE_MAX_CELLS.toLocaleString("ko-KR")}칸까지 저장합니다 — 나눠 저장하세요`);

  const thisWeek = mondayOf(today);
  const pre = await checkCells(db, cells, thisWeek);
  if (Object.keys(pre.errors).length) return { ok: false, errors: pre.errors };
  const changing = pre.checked.filter((c) => c.before !== c.after).map((c) => c.input);
  if (!changing.length) return { ok: true, changed: 0 };

  return db.transaction(async (tx): Promise<MpsResult> => {
    await lockSalesPlans(tx);

    // 잠금을 쥔 뒤 다시 대어 본다 — 앞에서 본 뒤 품목의 구분 · 단위 · 단위 자릿수가 바뀌었을 수 있다.
    const again = await checkCells(tx, changing, thisWeek);
    if (Object.keys(again.errors).length) return { ok: false, errors: again.errors };
    const changed = again.checked;

    // 화면을 연 뒤 남이 고정 · 고침 · 풀기를 한 칸이 하나라도 있으면 아무것도 쓰지 않는다.
    const current = await readFixed(tx, changed);
    if (changed.some((c) => current(c) !== c.before)) return formFail(STALE);

    const adds = changed.filter((c) => c.before === null);
    const removes = changed.filter((c) => c.after === null);
    const edits = changed.filter((c) => c.before !== null && c.after !== null);
    if ((await countOf(tx, mpsFixed)) + adds.length - removes.length > MPS_FIXED_LIMIT)
      return formFail(limitMessage("MPS 고정 칸", MPS_FIXED_LIMIT));
    if ((await countOf(tx, mpsChanges)) + changed.length > MPS_CHANGE_LIMIT)
      return formFail(limitMessage("MPS 고친 이력", MPS_CHANGE_LIMIT));

    const at = await nowText(tx);
    if (removes.length) await tx.delete(mpsFixed).where(inCells(removes));
    if (adds.length)
      await tx.insert(mpsFixed).values(
        adds.map((c) => ({
          itemId: c.item.id,
          weekStart: c.week,
          qty: sql`${c.after}::numeric`,
          fixedAt: sql`${at}::timestamptz`,
        })),
      );
    if (edits.length) {
      const values = edits.map((c) => sql`(${c.item.id}::integer, ${c.week}::date, ${c.after}::numeric)`);
      await tx.execute(sql`
        update ${mpsFixed} set qty = v.qty, fixed_at = ${at}::timestamptz, updated_at = ${touched()}
        from (values ${sql.join(values, sql`, `)}) as v(item_id, week_start, qty)
        where ${mpsFixed.itemId} = v.item_id and ${mpsFixed.weekStart} = v.week_start`);
    }
    await tx.insert(mpsChanges).values(
      changed.map((c) => ({
        itemId: c.item.id,
        weekStart: c.week,
        savedAt: sql`${at}::timestamptz`,
        before: c.before === null ? null : sql`${c.before}::numeric`,
        after: c.after === null ? null : sql`${c.after}::numeric`,
        kind: c.after === null ? "UNCONFIRM" : "EDIT",
      })),
    );
    return { ok: true, changed: changed.length };
  });
}

// ── 확정 · 확정 취소 ───────────────────────────────────────

/** 대어 본 확정 칸 — seen 은 화면이 본 수량의 정규 글자(읽지 못하면 null — 어느 고정 수량과도 같지 않다). */
type SeenCell = Found<MpsConfirmInput> & { seen: string | null };

/** 칸마다 품목 · 주와 화면이 본 수량을 대어 본다. 확정은 본 안이 0 보다 커야 한다(아니면 그 칸에 「확정할 안이 없습니다」). */
async function checkSeen(
  db: Db,
  cells: readonly MpsConfirmInput[],
  thisWeek: string,
  confirming: boolean,
): Promise<{ errors: Record<string, string>; targets: SeenCell[] }> {
  const { errors, found } = await checkTargets(db, cells, thisWeek);
  const targets: SeenCell[] = [];
  for (const f of found) {
    const parsed = parseMpsQty(f.input.qty, f.item.decimals);
    const seen = parsed.ok && parsed.qty !== null ? parsed.qty : null;
    if (confirming && (seen === null || seen <= ZERO)) errors[f.key] = NO_PROPOSAL;
    else targets.push({ ...f, seen: seen === null ? null : canon(seen) });
  }
  return { errors, targets };
}

/**
 * 확정 · 확정 취소 — 꼴 → 같은 칸 둘 → 2,000칸 → 칸마다 품목 · 주 · 본 수량 → (잠금) 다시 대어 보기
 * → 칸마다 지금 상태(확정은 고정이 없어야, 확정 취소는 고정이 있고 본 수량과 같아야 — 아니면 STALE) → 상한 차례로 보고, 하나라도 틀리면 아무것도 바꾸지 않는다.
 * 확정은 본 수량으로 고정(이력 CONFIRM, 전 없음 · 후 수량), 확정 취소는 고정을 푼다(이력 UNCONFIRM, 전 수량 · 후 없음). 일시는 잠금 뒤 읽은 한 시각.
 */
async function setFixed(
  db: Db,
  cells: MpsConfirmInput[],
  today: string,
  kind: "CONFIRM" | "UNCONFIRM",
): Promise<MpsResult> {
  const formFail = (formError: string): MpsResult => ({ ok: false, errors: {}, formError });
  const confirming = kind === "CONFIRM";
  const verb = confirming ? "확정" : "확정 취소";
  const reopen = `${confirming ? "확정하지" : "확정을 취소하지"} 못했습니다 — 화면을 새로 여세요`;

  if (!Array.isArray(cells) || !cells.every(isConfirmInput)) return formFail(reopen);
  if (new Set(cells.map((c) => mpsCellKey(c.item, c.week))).size !== cells.length) return formFail(reopen);
  if (cells.length > MPS_SAVE_MAX_CELLS)
    return formFail(`한 번에 ${MPS_SAVE_MAX_CELLS.toLocaleString("ko-KR")}칸까지 ${verb}합니다 — 나눠 ${verb}하세요`);
  if (!cells.length) return { ok: true, changed: 0 };

  const thisWeek = mondayOf(today);
  const pre = await checkSeen(db, cells, thisWeek, confirming);
  if (Object.keys(pre.errors).length) return { ok: false, errors: pre.errors };

  return db.transaction(async (tx): Promise<MpsResult> => {
    await lockSalesPlans(tx);

    const again = await checkSeen(tx, cells, thisWeek, confirming);
    if (Object.keys(again.errors).length) return { ok: false, errors: again.errors };
    const targets = again.targets;

    // 화면을 연 뒤 남이 고정 · 고침 · 풀기를 한 칸이 하나라도 있으면 아무것도 바꾸지 않는다. 확정은 안을 다시 계산해 견주지 않는다.
    const current = await readFixed(tx, targets);
    const fresh = (t: SeenCell) => {
      const now = current(t);
      return confirming ? now === null : now !== null && now === t.seen;
    };
    if (!targets.every(fresh))
      return formFail(
        `다른 사람이 먼저 바꿨습니다 — 화면을 새로 열어 다시 ${confirming ? "확정하" : "확정 취소하"}세요`,
      );

    if (confirming && (await countOf(tx, mpsFixed)) + targets.length > MPS_FIXED_LIMIT)
      return formFail(limitMessage("MPS 고정 칸", MPS_FIXED_LIMIT));
    if ((await countOf(tx, mpsChanges)) + targets.length > MPS_CHANGE_LIMIT)
      return formFail(limitMessage("MPS 고친 이력", MPS_CHANGE_LIMIT));

    const at = await nowText(tx);
    if (confirming)
      await tx.insert(mpsFixed).values(
        targets.map((t) => ({
          itemId: t.item.id,
          weekStart: t.week,
          qty: sql`${t.seen}::numeric`,
          fixedAt: sql`${at}::timestamptz`,
        })),
      );
    else await tx.delete(mpsFixed).where(inCells(targets));
    await tx.insert(mpsChanges).values(
      targets.map((t) => {
        const qty = sql`${confirming ? t.seen : current(t)}::numeric`;
        return {
          itemId: t.item.id,
          weekStart: t.week,
          savedAt: sql`${at}::timestamptz`,
          before: confirming ? null : qty,
          after: confirming ? qty : null,
          kind,
        };
      }),
    );
    return { ok: true, changed: targets.length };
  });
}

/** 확정 — 미확정 주를 화면이 본 안으로 고정한다. changed 는 확정한 칸 수. today 는 한국 시각의 오늘. */
export async function confirmMps(db: Db, cells: MpsConfirmInput[], today: string): Promise<MpsResult> {
  return setFixed(db, cells, today, "CONFIRM");
}

/** 확정 취소 — 고정 칸을 풀어 안으로 되돌린다. changed 는 확정 취소한 칸 수. */
export async function unconfirmMps(db: Db, cells: MpsConfirmInput[], today: string): Promise<MpsResult> {
  return setFixed(db, cells, today, "UNCONFIRM");
}

// ── 고친 이력 ───────────────────────────────────────────

export type MpsChangeRow = {
  /** 한국 시각의 일시(YYYY-MM-DD HH:mm). */
  savedAt: string;
  /** EDIT 수량을 고침 · CONFIRM 확정 · UNCONFIRM 확정 취소(빈 칸으로 저장해 풀기 포함). */
  kind: "EDIT" | "CONFIRM" | "UNCONFIRM";
  item: { code: string; name: string };
  week: string;
  /** 정규 글자, 고정 아님은 null. */
  before: string | null;
  after: string | null;
};

/** 고친 이력 — 최근 것부터(같은 일시면 나중에 남긴 것부터) 100줄, total 은 전체 줄 수. */
export async function mpsHistory(db: Db): Promise<{ rows: MpsChangeRow[]; total: number }> {
  const total = await countOf(db, mpsChanges);
  const rows = await db
    .select({
      savedAt: sql<string>`to_char(${mpsChanges.savedAt} at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI')`,
      kind: sql<MpsChangeRow["kind"]>`${mpsChanges.kind}`,
      itemCode: items.code,
      itemName: items.name,
      week: mpsChanges.weekStart,
      before: sql<string | null>`${mpsChanges.before}::text`,
      after: sql<string | null>`${mpsChanges.after}::text`,
    })
    .from(mpsChanges)
    .innerJoin(items, eq(items.id, mpsChanges.itemId))
    .orderBy(desc(mpsChanges.savedAt), desc(mpsChanges.id))
    .limit(MPS_HISTORY_SHOWN);
  return {
    total,
    rows: rows.map((r) => ({
      savedAt: r.savedAt,
      kind: r.kind,
      item: { code: r.itemCode, name: r.itemName },
      week: r.week,
      before: r.before === null ? null : canonText(r.before),
      after: r.after === null ? null : canonText(r.after),
    })),
  };
}

// ── 단위를 바꿀 때(품목 · 단위 자릿수의 고침이 판매계획의 잠금을 쥐고 부른다) ──────────

/** 이 품목들 가운데 고정 칸이 하나라도 있는 것. */
export async function itemsInMps(tx: Db, itemIds: number[]): Promise<Set<number>> {
  if (!itemIds.length) return new Set();
  const rows = await tx
    .selectDistinct({ itemId: mpsFixed.itemId })
    .from(mpsFixed)
    .where(inArray(mpsFixed.itemId, itemIds));
  return new Set(rows.map((r) => r.itemId));
}

/** 그 단위를 쓰는 품목의 고정 수량이 모두 소수 decimals 자리 안에 드는가. */
export async function mpsQuantitiesFit(tx: Db, unit: string, decimals: number): Promise<boolean> {
  const [{ n }] = await tx
    .select({ n: count() })
    .from(mpsFixed)
    .innerJoin(items, eq(items.id, mpsFixed.itemId))
    .where(and(eq(items.unit, unit), sql`${mpsFixed.qty} <> round(${mpsFixed.qty}, ${decimals}::integer)`));
  return n === 0;
}
