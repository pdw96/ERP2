import { and, asc, count, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { ITEM_CODE } from "@/lib/bom-input";
import { THOUSAND, type Milli } from "@/lib/move-input";
import {
  cellKey,
  CUSTOMER_CODE,
  FG_CODE,
  parseSalesPlanQty,
  SALES_PLAN_SAVE_MAX_CELLS,
  type SalesPlanCellInput,
} from "@/lib/sales-plan-input";
import { addWeeks, EDIT_WEEKS, isMonday, mondayOf, pageWeeks } from "@/lib/weeks";
import { first, limitMessage, REGISTER_LOCK, STALE, touched, type Params } from "./master-shared";
import { items, partners, salesPlanChanges, salesPlans, unitSpecs } from "./schema";
import type { Db } from "./types";

// 판매계획의 열기 · 저장 · 고친 이력 · 품목 합계(메뉴 「판매계획」). 화면(src/app/sales/plans/)과 MPS 는 이 함수만 부른다.
// - 칸 하나 = 고객 × 완제품 × 주(월요일). 수량이 있는 칸만 DB 에 있다 — 빈 칸 · 0 은 그 칸을 지운다.
// - 저장은 화면이 보낸 바뀐 칸만 한 트랜잭션에서 바꾼다. 칸마다 화면을 연 때의 값(before)을 지금 값과 견줘, 하나라도 다르면 아무것도 쓰지 않는다.
// - 저장은 판매계획의 잠금(REGISTER_LOCK.salesPlans)을 쥐고 돈다 — 칸 전체 · 고친 이력의 상한을 세고 넣는 사이에 남이 끼지 못한다.

/** 판매계획 칸 전체의 등록 상한 — 매일 밤 되돌림이 샘플로 되돌린다. */
export const SALES_PLAN_CELL_LIMIT = 20000;
/** 고친 이력 전체의 등록 상한 — 매일 밤 되돌림이 비운다. */
export const SALES_PLAN_CHANGE_LIMIT = 50000;
/** 화면에서 보이는 고친 이력의 줄 수 상한 — 거르기 범위의 이력 줄 수는 따로 센다. */
export const SALES_PLAN_HISTORY_SHOWN = 100;

const FORM = "저장하지 못했습니다 — 화면을 새로 여세요";
const NO_CUSTOMER = "없는 고객입니다";
const NO_ITEM = "없는 품목입니다";
const NOT_FG = "판매계획은 완제품에만 있습니다";
const NOT_MONDAY = "월요일이 아닌 주입니다";
const PAST_WEEK = "지난 주는 고치지 못합니다";
const FAR_WEEK = "51주 뒤까지만 넣습니다";
const NEW_ROW_CUSTOMER = "「사용 안 함」이거나 매출처가 아닌 거래처라 새 줄을 넣지 못합니다";
const NEW_ROW_ITEM = "「사용 안 함」 품목이라 새 줄을 넣지 못합니다";

/** 판매계획을 고치는 저장이 쥐는 잠금 — 트랜잭션이 끝나면 저절로 풀린다. */
export async function lockSalesPlans(tx: Db): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(${REGISTER_LOCK.salesPlans})`);
}

// ── 수량의 글자 ─────────────────────────────────────────

/** 천분의 일 단위의 수량을 정규 글자로 — 쉼표 없음, 끝 0 · 소수점 없음(1500 → 「1.5」, 3000000 → 「3000」). */
function canon(qty: Milli): string {
  const frac = String(qty % THOUSAND)
    .padStart(3, "0")
    .replace(/0+$/, "");
  return `${qty / THOUSAND}${frac ? `.${frac}` : ""}`;
}

/** DB 의 numeric 글자(「3000.000」)를 정규 글자로. 합계는 아홉 자리를 넘을 수 있어 수로 바꾸지 않고 글자로 다룬다. */
function canonText(text: string): string {
  return text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text;
}

const qtyText = (col: typeof salesPlans.qty) => sql<string>`${col}::text`;

// ── 고객 · 품목 ─────────────────────────────────────────

export type PlanCustomer = { code: string; name: string; active: boolean; isCustomer: boolean };
export type PlanItem = { code: string; name: string; spec: string; unit: string; decimals: number; active: boolean };

type CustomerRow = PlanCustomer & { id: number };
type ItemRow = PlanItem & { id: number; itemType: string };

const customerColumns = {
  id: partners.id,
  code: partners.code,
  name: partners.name,
  active: partners.active,
  isCustomer: partners.isCustomer,
};

/** 품목과 그 단위의 소수 자릿수 — 단위의 사양이 없으면 0(정수만 받는다). unit_specs 를 left join 해서 읽는다. */
const itemColumns = {
  id: items.id,
  code: items.code,
  name: items.name,
  spec: items.spec,
  unit: items.unit,
  itemType: items.itemType,
  active: items.active,
  decimals: sql<number>`coalesce(${unitSpecs.decimals}, 0)`.mapWith(Number),
};

const customerOf = (c: CustomerRow): PlanCustomer => ({
  code: c.code,
  name: c.name,
  active: c.active,
  isCustomer: c.isCustomer,
});
const itemOf = (i: ItemRow): PlanItem => ({
  code: i.code,
  name: i.name,
  spec: i.spec,
  unit: i.unit,
  decimals: i.decimals,
  active: i.active,
});

async function itemsWhere(db: Db, where: SQL | undefined): Promise<ItemRow[]> {
  return db
    .select(itemColumns)
    .from(items)
    .leftJoin(unitSpecs, eq(unitSpecs.unit, items.unit))
    .where(where)
    .orderBy(asc(items.code));
}

/** 새 줄에 고를 것 — 「사용」 매출처 · 「사용」 완제품, 코드 차례. */
export async function salesPlanOptions(db: Db): Promise<{ customers: PlanCustomer[]; items: PlanItem[] }> {
  const customers = await db
    .select(customerColumns)
    .from(partners)
    .where(and(eq(partners.active, true), eq(partners.isCustomer, true)))
    .orderBy(asc(partners.code));
  const fg = await itemsWhere(db, and(eq(items.active, true), eq(items.itemType, "FG")));
  return { customers: customers.map(customerOf), items: fg.map(itemOf) };
}

// ── 거르기 ──────────────────────────────────────────────

/** 비운 값은 거르지 않는다(모든 고객 · 모든 품목). */
export type SalesPlanFilter = { customer?: string; item?: string };

/** 주소의 거르기 값을 읽는다. 꼴이 틀린 값은 버린다(거르지 않는다). */
export function parseSalesPlanFilter(params: Params): SalesPlanFilter {
  const filter: SalesPlanFilter = {};
  const customer = (first(params.customer) ?? "").trim();
  const item = (first(params.item) ?? "").trim();
  if (CUSTOMER_CODE.test(customer)) filter.customer = customer;
  if (FG_CODE.test(item)) filter.item = item;
  return filter;
}

const filterWhere = (filter: SalesPlanFilter): SQL | undefined =>
  and(
    filter.customer ? eq(partners.code, filter.customer) : undefined,
    filter.item ? eq(items.code, filter.item) : undefined,
  );

// ── 열기 ─────────────────────────────────────────────

/** 칸 값은 정규 글자(「3000」 · 「1.5」), 열쇠는 주(월요일). */
export type SalesPlanRow = { customer: PlanCustomer; item: PlanItem; cells: Record<string, string> };
export type SalesPlanTotal = { item: PlanItem; cells: Record<string, string> };
export type SalesPlanSheet = {
  thisWeek: string;
  weeks: string[];
  rows: SalesPlanRow[];
  totals: SalesPlanTotal[];
  /** 거르기가 걸렸는가 — 줄은 거른 것만, 합계는 전체 고객. */
  filtered: boolean;
};

/**
 * 판매계획 한 쪽(13주) — 줄은 DB 에 칸이 하나라도 있는(어느 주든) 고객 × 품목 가운데 거르기를 따른 것, 고객 코드 · 품목 코드 차례.
 * 칸은 그 13주 것만. 품목 합계는 거르기와 상관없이 모든 고객의 합이고, 그 13주에 계획이 있는 품목만 품목 코드 차례로.
 * from 이 월요일이 아니면 이번 주부터 연다.
 */
export async function openSalesPlan(
  db: Db,
  opts: { from: string; filter: SalesPlanFilter },
  today: string,
): Promise<SalesPlanSheet> {
  const thisWeek = mondayOf(today);
  const weeks = pageWeeks(isMonday(opts.from) ? opts.from : thisWeek);
  const from = weeks[0];
  const to = weeks[weeks.length - 1];
  const where = filterWhere(opts.filter);

  const pairs = await db
    .selectDistinct({ partnerId: salesPlans.partnerId, itemId: salesPlans.itemId })
    .from(salesPlans)
    .innerJoin(partners, eq(partners.id, salesPlans.partnerId))
    .innerJoin(items, eq(items.id, salesPlans.itemId))
    .where(where);

  const rows: SalesPlanRow[] = [];
  if (pairs.length) {
    const partnerIds = [...new Set(pairs.map((p) => p.partnerId))];
    const itemIds = [...new Set(pairs.map((p) => p.itemId))];
    const customerById = new Map(
      (await db.select(customerColumns).from(partners).where(inArray(partners.id, partnerIds))).map(
        (c) => [c.id, c] as const,
      ),
    );
    const itemById = new Map((await itemsWhere(db, inArray(items.id, itemIds))).map((i) => [i.id, i] as const));
    const cells = await db
      .select({
        partnerId: salesPlans.partnerId,
        itemId: salesPlans.itemId,
        week: salesPlans.weekStart,
        qty: qtyText(salesPlans.qty),
      })
      .from(salesPlans)
      .innerJoin(partners, eq(partners.id, salesPlans.partnerId))
      .innerJoin(items, eq(items.id, salesPlans.itemId))
      .where(and(where, sql`${salesPlans.weekStart} between ${from}::date and ${to}::date`));
    const cellsOf = new Map<string, Record<string, string>>();
    for (const c of cells) {
      const k = `${c.partnerId}|${c.itemId}`;
      const row = cellsOf.get(k) ?? {};
      row[c.week] = canonText(c.qty);
      cellsOf.set(k, row);
    }
    for (const p of pairs) {
      const customer = customerById.get(p.partnerId)!;
      const item = itemById.get(p.itemId)!;
      rows.push({
        customer: customerOf(customer),
        item: itemOf(item),
        cells: cellsOf.get(`${p.partnerId}|${p.itemId}`) ?? {},
      });
    }
    rows.sort((a, b) =>
      a.customer.code === b.customer.code
        ? a.item.code < b.item.code
          ? -1
          : 1
        : a.customer.code < b.customer.code
          ? -1
          : 1,
    );
  }

  const demand = await salesPlanDemand(db, from, to);
  const totals: SalesPlanTotal[] = [];
  if (demand.length) {
    const codes = [...new Set(demand.map((d) => d.item))];
    for (const item of await itemsWhere(db, inArray(items.code, codes))) {
      const cells: Record<string, string> = {};
      for (const d of demand) if (d.item === item.code) cells[d.week] = d.qty;
      totals.push({ item: itemOf(item), cells });
    }
  }

  return {
    thisWeek,
    weeks,
    rows,
    totals,
    filtered: !!(opts.filter.customer || opts.filter.item),
  };
}

/**
 * 품목 합계 — 품목 × 주의 수량 합(모든 고객, fromWeek · toWeek 두 끝 포함), 품목 코드 · 주 차례. 수량은 정규 글자. MPS 가 수요로 읽는다.
 */
export async function salesPlanDemand(
  db: Db,
  fromWeek: string,
  toWeek: string,
): Promise<{ item: string; week: string; qty: string }[]> {
  const rows = await db
    .select({
      item: items.code,
      week: salesPlans.weekStart,
      qty: sql<string>`sum(${salesPlans.qty})::text`,
    })
    .from(salesPlans)
    .innerJoin(items, eq(items.id, salesPlans.itemId))
    .where(sql`${salesPlans.weekStart} between ${fromWeek}::date and ${toWeek}::date`)
    .groupBy(items.code, salesPlans.weekStart)
    .orderBy(asc(items.code), asc(salesPlans.weekStart));
  return rows.map((r) => ({ item: r.item, week: r.week, qty: canonText(r.qty) }));
}

// ── 저장 ─────────────────────────────────────────────

export type SalesPlanSaveResult =
  { ok: true; changed: number } | { ok: false; errors: Record<string, string>; formError?: string };

const CELL_FIELDS = ["customer", "item", "week", "before", "after"] as const;

const isCellInput = (v: unknown): v is SalesPlanCellInput =>
  typeof v === "object" &&
  v !== null &&
  CELL_FIELDS.every((f) => typeof (v as Record<string, unknown>)[f] === "string");

/** 대어 본 칸 하나 — before · after 는 정규 글자, 없음은 null. */
type CheckedCell = {
  key: string;
  input: SalesPlanCellInput;
  customer: CustomerRow;
  item: ItemRow;
  week: string;
  before: string | null;
  after: string | null;
};

/**
 * 칸마다 고객 · 품목 · 주 · 수량을 DB 에 대어 본다. 칸의 오류는 하나만(고객 → 품목 → 주 → 고친 값 → 연 때의 값 차례).
 * 저장의 앞(바뀐 칸 가리기)과 잠금을 쥔 뒤(그 사이 품목 · 단위가 바뀌었을 수 있다) 두 번 부른다.
 */
async function checkCells(
  db: Db,
  cells: readonly SalesPlanCellInput[],
  thisWeek: string,
): Promise<{ errors: Record<string, string>; checked: CheckedCell[] }> {
  const customerCodes = [...new Set(cells.map((c) => c.customer).filter((c) => CUSTOMER_CODE.test(c)))];
  const itemCodes = [...new Set(cells.map((c) => c.item).filter((c) => ITEM_CODE.test(c)))];
  const customerByCode = new Map(
    (customerCodes.length
      ? await db.select(customerColumns).from(partners).where(inArray(partners.code, customerCodes))
      : []
    ).map((c) => [c.code, c] as const),
  );
  const itemByCode = new Map(
    (itemCodes.length ? await itemsWhere(db, inArray(items.code, itemCodes)) : []).map((i) => [i.code, i] as const),
  );
  const lastWeek = addWeeks(thisWeek, EDIT_WEEKS - 1);

  const errors: Record<string, string> = {};
  const checked: CheckedCell[] = [];
  for (const c of cells) {
    const key = cellKey(c.customer, c.item, c.week);
    const customer = CUSTOMER_CODE.test(c.customer) ? customerByCode.get(c.customer) : undefined;
    const item = ITEM_CODE.test(c.item) ? itemByCode.get(c.item) : undefined;
    if (!customer) {
      errors[key] = NO_CUSTOMER;
      continue;
    }
    if (!item) {
      errors[key] = NO_ITEM;
      continue;
    }
    if (item.itemType !== "FG") {
      errors[key] = NOT_FG;
      continue;
    }
    if (!isMonday(c.week)) {
      errors[key] = NOT_MONDAY;
      continue;
    }
    if (c.week < thisWeek) {
      errors[key] = PAST_WEEK;
      continue;
    }
    if (c.week > lastWeek) {
      errors[key] = FAR_WEEK;
      continue;
    }
    const after = parseSalesPlanQty(c.after, item.decimals);
    if (!after.ok) {
      errors[key] = after.message;
      continue;
    }
    const before = parseSalesPlanQty(c.before, item.decimals);
    if (!before.ok) {
      errors[key] = before.message;
      continue;
    }
    checked.push({
      key,
      input: c,
      customer,
      item,
      week: c.week,
      before: before.qty === null ? null : canon(before.qty),
      after: after.qty === null ? null : canon(after.qty),
    });
  }
  return { errors, checked };
}

// postgres 드라이버는 행의 배열을, PGlite 는 { rows } 를 돌려준다.
function rowsOf<T>(result: unknown): T[] {
  return (Array.isArray(result) ? result : (result as { rows: T[] }).rows) as T[];
}

const cellTuple = (c: CheckedCell) => sql`(${c.customer.id}::integer, ${c.item.id}::integer, ${c.week}::date)`;
const inCells = (cells: readonly CheckedCell[]) =>
  sql`(${salesPlans.partnerId}, ${salesPlans.itemId}, ${salesPlans.weekStart}) in (${sql.join(cells.map(cellTuple), sql`, `)})`;

/**
 * 판매계획의 저장 — 화면이 보낸 바뀐 칸들. 꼴 → 칸마다 대어 보기 → 바뀐 것만 남김 → (잠금) 지금 값과 견줌 → 새 줄의 고객 · 품목 → 상한 차례로 보고,
 * 하나라도 틀리면 아무것도 쓰지 않는다. 바뀐 것이 없으면 잠금도 쥐지 않고 아무것도 쓰지 않는다.
 * 쓰기는 지움 · 새로 · 고침을 한 트랜잭션에서, 고친 이력은 바뀐 칸마다 한 줄 — 일시는 잠금을 쥔 뒤 읽은 한 시각이다
 * (칸의 기본값 now() 는 트랜잭션을 연 시각이라, 잠금을 기다린 저장이 먼저 끝난 저장보다 이른 일시로 남는다 — BOM 과 같은 까닭).
 * changed 는 바꾼 칸 수(= 남긴 이력 줄 수)다. today 는 한국 시각의 오늘(YYYY-MM-DD).
 */
export async function saveSalesPlan(db: Db, cells: SalesPlanCellInput[], today: string): Promise<SalesPlanSaveResult> {
  const formFail = (formError: string): SalesPlanSaveResult => ({ ok: false, errors: {}, formError });

  if (!Array.isArray(cells) || !cells.every(isCellInput)) return formFail(FORM);
  const keys = new Set(cells.map((c) => cellKey(c.customer, c.item, c.week)));
  if (keys.size !== cells.length) return formFail(FORM);
  if (cells.length > SALES_PLAN_SAVE_MAX_CELLS)
    return formFail(`한 번에 ${SALES_PLAN_SAVE_MAX_CELLS.toLocaleString("ko-KR")}칸까지 저장합니다 — 나눠 저장하세요`);

  const thisWeek = mondayOf(today);
  const pre = await checkCells(db, cells, thisWeek);
  if (Object.keys(pre.errors).length) return { ok: false, errors: pre.errors };
  const changing = pre.checked.filter((c) => c.before !== c.after).map((c) => c.input);
  if (!changing.length) return { ok: true, changed: 0 };

  return db.transaction(async (tx): Promise<SalesPlanSaveResult> => {
    await lockSalesPlans(tx);

    // 잠금을 쥔 뒤 다시 대어 본다 — 앞에서 본 뒤 품목의 구분 · 단위 · 단위 자릿수가 바뀌었을 수 있다.
    const again = await checkCells(tx, changing, thisWeek);
    if (Object.keys(again.errors).length) return { ok: false, errors: again.errors };
    const changed = again.checked;

    // 지금 값과 견준다 — 화면을 연 뒤 남이 고친 칸이 하나라도 있으면 아무것도 쓰지 않는다.
    const now = await tx
      .select({
        partnerId: salesPlans.partnerId,
        itemId: salesPlans.itemId,
        week: salesPlans.weekStart,
        qty: qtyText(salesPlans.qty),
      })
      .from(salesPlans)
      .where(inCells(changed));
    const nowOf = new Map(now.map((r) => [`${r.partnerId}|${r.itemId}|${r.week}`, canonText(r.qty)] as const));
    const current = (c: CheckedCell) => nowOf.get(`${c.customer.id}|${c.item.id}|${c.week}`) ?? null;
    if (changed.some((c) => current(c) !== c.before)) return formFail(STALE);

    // 새 줄(DB 에 칸이 하나도 없는 고객 × 품목)은 「사용」 매출처 · 「사용」 품목만.
    const partnerIds = [...new Set(changed.map((c) => c.customer.id))];
    const itemIds = [...new Set(changed.map((c) => c.item.id))];
    const pairs = await tx
      .selectDistinct({ partnerId: salesPlans.partnerId, itemId: salesPlans.itemId })
      .from(salesPlans)
      .where(and(inArray(salesPlans.partnerId, partnerIds), inArray(salesPlans.itemId, itemIds)));
    const existing = new Set(pairs.map((p) => `${p.partnerId}|${p.itemId}`));
    const errors: Record<string, string> = {};
    for (const c of changed) {
      if (existing.has(`${c.customer.id}|${c.item.id}`)) continue;
      if (!c.customer.active || !c.customer.isCustomer) errors[c.key] = NEW_ROW_CUSTOMER;
      else if (!c.item.active) errors[c.key] = NEW_ROW_ITEM;
    }
    if (Object.keys(errors).length) return { ok: false, errors };

    // 상한 — 저장 뒤 칸 수, 고친 이력 수.
    const adds = changed.filter((c) => c.before === null);
    const removes = changed.filter((c) => c.after === null);
    const edits = changed.filter((c) => c.before !== null && c.after !== null);
    const [{ cellsNow }] = await tx.select({ cellsNow: count() }).from(salesPlans);
    if (cellsNow + adds.length - removes.length > SALES_PLAN_CELL_LIMIT)
      return formFail(limitMessage("판매계획 칸", SALES_PLAN_CELL_LIMIT));
    const [{ changesNow }] = await tx.select({ changesNow: count() }).from(salesPlanChanges);
    if (changesNow + changed.length > SALES_PLAN_CHANGE_LIMIT)
      return formFail(limitMessage("판매계획 고친 이력", SALES_PLAN_CHANGE_LIMIT));

    const [{ at }] = rowsOf<{ at: string }>(await tx.execute(sql`select clock_timestamp()::text as at`));

    if (removes.length) await tx.delete(salesPlans).where(inCells(removes));
    if (adds.length)
      await tx.insert(salesPlans).values(
        adds.map((c) => ({
          partnerId: c.customer.id,
          itemId: c.item.id,
          weekStart: c.week,
          qty: sql`${c.after}::numeric`,
        })),
      );
    if (edits.length) {
      const values = edits.map(
        (c) => sql`(${c.customer.id}::integer, ${c.item.id}::integer, ${c.week}::date, ${c.after}::numeric)`,
      );
      await tx.execute(sql`
        update ${salesPlans} set qty = v.qty, updated_at = ${touched()}
        from (values ${sql.join(values, sql`, `)}) as v(partner_id, item_id, week_start, qty)
        where ${salesPlans.partnerId} = v.partner_id and ${salesPlans.itemId} = v.item_id
          and ${salesPlans.weekStart} = v.week_start`);
    }
    await tx.insert(salesPlanChanges).values(
      changed.map((c) => ({
        partnerId: c.customer.id,
        itemId: c.item.id,
        weekStart: c.week,
        savedAt: sql`${at}::timestamptz`,
        before: c.before === null ? null : sql`${c.before}::numeric`,
        after: c.after === null ? null : sql`${c.after}::numeric`,
      })),
    );
    return { ok: true, changed: changed.length };
  });
}

// ── 고친 이력 ───────────────────────────────────────────

export type SalesPlanChangeRow = {
  /** 한국 시각의 일시(YYYY-MM-DD HH:mm). */
  savedAt: string;
  customer: { code: string; name: string };
  item: { code: string; name: string };
  week: string;
  /** 정규 글자, 없음(새로 넣음 · 지움)은 null. */
  before: string | null;
  after: string | null;
};

/** 거르기 범위의 고친 이력 — 최근 것부터(같은 일시면 나중에 남긴 것부터) 100줄, total 은 그 범위의 전체 줄 수. */
export async function salesPlanHistory(
  db: Db,
  filter: SalesPlanFilter,
): Promise<{ rows: SalesPlanChangeRow[]; total: number }> {
  const where = filterWhere(filter);
  const [{ total }] = await db
    .select({ total: count() })
    .from(salesPlanChanges)
    .innerJoin(partners, eq(partners.id, salesPlanChanges.partnerId))
    .innerJoin(items, eq(items.id, salesPlanChanges.itemId))
    .where(where);
  const rows = await db
    .select({
      savedAt: sql<string>`to_char(${salesPlanChanges.savedAt} at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI')`,
      customerCode: partners.code,
      customerName: partners.name,
      itemCode: items.code,
      itemName: items.name,
      week: salesPlanChanges.weekStart,
      before: sql<string | null>`${salesPlanChanges.before}::text`,
      after: sql<string | null>`${salesPlanChanges.after}::text`,
    })
    .from(salesPlanChanges)
    .innerJoin(partners, eq(partners.id, salesPlanChanges.partnerId))
    .innerJoin(items, eq(items.id, salesPlanChanges.itemId))
    .where(where)
    .orderBy(desc(salesPlanChanges.savedAt), desc(salesPlanChanges.id))
    .limit(SALES_PLAN_HISTORY_SHOWN);
  return {
    total,
    rows: rows.map((r) => ({
      savedAt: r.savedAt,
      customer: { code: r.customerCode, name: r.customerName },
      item: { code: r.itemCode, name: r.itemName },
      week: r.week,
      before: r.before === null ? null : canonText(r.before),
      after: r.after === null ? null : canonText(r.after),
    })),
  };
}

// ── 단위를 바꿀 때(품목 · 단위 자릿수의 고침이 판매계획의 잠금을 쥐고 부른다) ──────────

/** 이 품목들 가운데 판매계획 칸이 하나라도 있는 것. */
export async function itemsInSalesPlans(tx: Db, itemIds: number[]): Promise<Set<number>> {
  if (!itemIds.length) return new Set();
  const rows = await tx
    .selectDistinct({ itemId: salesPlans.itemId })
    .from(salesPlans)
    .where(inArray(salesPlans.itemId, itemIds));
  return new Set(rows.map((r) => r.itemId));
}

/** 그 단위를 쓰는 품목의 판매계획 수량이 모두 소수 decimals 자리 안에 드는가. */
export async function salesPlanQuantitiesFit(tx: Db, unit: string, decimals: number): Promise<boolean> {
  const [{ n }] = await tx
    .select({ n: count() })
    .from(salesPlans)
    .innerJoin(items, eq(items.id, salesPlans.itemId))
    .where(and(eq(items.unit, unit), sql`${salesPlans.qty} <> round(${salesPlans.qty}, ${decimals}::integer)`));
  return n === 0;
}
