import { and, asc, count, desc, eq, max, sql, type SQL } from "drizzle-orm";
import { THOUSAND, type Milli } from "@/lib/move-input";
import { planMrp, type MrpItem } from "@/lib/mrp-calc";
import { ITEM_TYPES } from "@/lib/master-codes";
import { PAGE_SIZE } from "@/lib/stock-query";
import { koreaToday } from "@/lib/today";
import { addWeeks, EDIT_WEEKS, mondayOf, PAGE_WEEKS, pageWeeks } from "@/lib/weeks";
import { first, limitMessage, type Params } from "./master-shared";
import { mpsSupplyIn } from "./mps";
import {
  bomLines,
  boms,
  items,
  mrpGross,
  mrpPlannedOrders,
  mrpRunItems,
  mrpRuns,
  mrpSettingChanges,
  mrpSettings as mrpSettingsTable,
  unitSpecs,
} from "./schema";
import { canon, canonText } from "./sales-plans";
import { milliOf } from "./stock";
import { availableByItem } from "./stock-status";
import type { Db } from "./types";

// MRP 의 완성일 기준 요일 설정과 그 이력, [MRP 실행](메뉴 「MRP」).
// - 실행은 한 트랜잭션에서 품목 · BOM · 가용재고 · MPS 공급량 · 기준 요일을 한 스냅숏으로 읽어 planMrp 를 돌리고, 지난 실행의 결과(계획오더 ·
//   품목 머리 · 총소요)를 지운 뒤 새 결과를 넣는다. 실행 줄은 지우지 않는다 — 같은 날의 seq_end 가 계획오더 번호의 일련을 잇는다(밤 되돌림이 비움).

/** 완성일 기준 요일을 바꾼 이력 전체의 등록 상한 — 매일 밤 되돌림이 비운다. */
export const MRP_SETTING_CHANGE_LIMIT = 1000;
/** 화면에서 보이는 이력의 줄 수 상한. */
export const MRP_SETTING_HISTORY_SHOWN = 20;

const BAD_WEEKDAY = "완성일 기준 요일을 고르세요";

/**
 * MRP 를 고치는 일(실행 · 완성일 기준 요일 저장 · 밤 되돌림)이 쥐는 잠금 — 실행 기록 표(mrp_runs)의 표 잠금이고, 트랜잭션이 끝나면 저절로 풀린다.
 * 다른 잠금처럼 권고 잠금(pg_advisory_xact_lock)으로 두지 않은 까닭: REPEATABLE READ 트랜잭션은 첫 SELECT 가 시작할 때 스냅숏을 잡는데,
 * 권고 잠금도 SELECT 라 잠금을 기다리기 전에 스냅숏이 잡혀, 기다리는 동안 앞 실행이 넣은 실행 줄 · 계획오더를 보지 못한다(같은 번호 · 남는 계획오더).
 * LOCK TABLE 은 스냅숏을 잡지 않으므로 트랜잭션의 첫 문장으로 쥐면 그 뒤 첫 읽기의 스냅숏이 앞 실행의 커밋을 본다(PostgreSQL 문서 「LOCK」).
 * SHARE ROW EXCLUSIVE 는 같은 잠금끼리와 그 표의 쓰기를 막고, 화면의 읽기는 막지 않는다.
 */
export async function lockMrp(tx: Db): Promise<void> {
  await tx.execute(sql`lock table ${mrpRuns} in share row exclusive mode`);
}

export type MrpSettingChange = { changedAt: Date; before: number; after: number };

/** 지금의 완성일 기준 요일(줄이 없으면 1 = 월)과 가장 새 이력 20줄, 이력 전체 줄 수. */
export async function mrpSettings(db: Db): Promise<{ dueWeekday: number; changes: MrpSettingChange[]; total: number }> {
  const [row] = await db
    .select({ dueWeekday: mrpSettingsTable.dueWeekday })
    .from(mrpSettingsTable)
    .where(eq(mrpSettingsTable.id, 1));
  const changes = await db
    .select({
      changedAt: mrpSettingChanges.changedAt,
      before: mrpSettingChanges.before,
      after: mrpSettingChanges.after,
    })
    .from(mrpSettingChanges)
    .orderBy(desc(mrpSettingChanges.changedAt), desc(mrpSettingChanges.id))
    .limit(MRP_SETTING_HISTORY_SHOWN);
  const [{ n }] = await db.select({ n: count() }).from(mrpSettingChanges);
  return { dueWeekday: row?.dueWeekday ?? 1, changes, total: n };
}

/** 1 ~ 7 의 정수(또는 그 글자)만 받는다 — 앞뒤 공백 · 소수 · 빈 글자는 받지 않는다. */
function weekdayOf(input: unknown): number | null {
  const n = typeof input === "string" && /^[1-7]$/.test(input) ? Number(input) : input;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 7 ? n : null;
}

/** 완성일 기준 요일을 저장한다 — 같은 값이면 쓰지 않고, 바뀌면 이력 한 줄을 남긴다. */
export async function saveMrpSettings(
  db: Db,
  dueWeekday: unknown,
): Promise<{ ok: true; changed: boolean } | { ok: false; formError: string }> {
  const next = weekdayOf(dueWeekday);
  if (next === null) return { ok: false, formError: BAD_WEEKDAY };

  return db.transaction(async (tx) => {
    await lockMrp(tx);
    // 잠금을 쥔 뒤 지금 값을 읽는다 — 앞에서 본 뒤 남이 바꿨을 수 있다.
    const [row] = await tx
      .select({ dueWeekday: mrpSettingsTable.dueWeekday })
      .from(mrpSettingsTable)
      .where(eq(mrpSettingsTable.id, 1));
    const before = row?.dueWeekday ?? 1;
    if (before === next) return { ok: true as const, changed: false };

    const [{ n }] = await tx.select({ n: count() }).from(mrpSettingChanges);
    if (n + 1 > MRP_SETTING_CHANGE_LIMIT)
      return { ok: false as const, formError: limitMessage("완성일 기준 요일의 고친 이력", MRP_SETTING_CHANGE_LIMIT) };

    await tx
      .insert(mrpSettingsTable)
      .values({ id: 1, dueWeekday: next })
      .onConflictDoUpdate({ target: mrpSettingsTable.id, set: { dueWeekday: next, updatedAt: new Date() } });
    await tx.insert(mrpSettingChanges).values({ before, after: next });
    return { ok: true as const, changed: true };
  });
}

// ── [MRP 실행] ─────────────────────────────────────────────

/** 한 실행의 계획오더 상한 — 넘으면 실행을 거절하고 아무것도 바꾸지 않는다. */
export const MRP_ORDER_LIMIT = 20000;
/** 실행 기록 전체의 등록 상한 — 매일 밤 되돌림이 비운다. */
export const MRP_RUN_LIMIT = 1000;

const OVER_ORDERS = `계획오더가 ${MRP_ORDER_LIMIT.toLocaleString("ko-KR")}건을 넘어 실행하지 못했습니다 — BOM · MPS 를 확인하세요`;

/** 한 번에 넣는 줄 수 — 쿼리 하나의 인자 수 상한(65,535)을 넘지 않게 나눠 넣는다. */
const INSERT_CHUNK = 1000;

export type MrpRunResult = { ok: true; orders: number } | { ok: false; formError: string };

/** 계획오더 수가 한 실행의 상한을 넘는가. */
export function overOrderLimit(n: number): boolean {
  return n > MRP_ORDER_LIMIT;
}

const OVER_QTY = "계획량이 너무 커서 실행하지 못했습니다 — BOM 의 소요량과 MPS 수량을 확인하세요";

/** numeric(15,3) 이 담는 가장 큰 수 999,999,999,999.999 (천분의 일 단위). */
const NUMERIC_MAX = BigInt("999999999999999");

/** 천분의 일 단위의 수량이 numeric(15,3) 에 안 들어가는가(절댓값이 끝을 넘음). */
export function overNumericLimit(q: Milli): boolean {
  return (q < BigInt(0) ? -q : q) > NUMERIC_MAX;
}

/** 천분의 일 단위의 수량을 numeric 글자로(음수도). */
function numericText(q: Milli): string {
  const abs = q < BigInt(0) ? -q : q;
  const frac = String(abs % THOUSAND).padStart(3, "0");
  return `${q < BigInt(0) ? "-" : ""}${abs / THOUSAND}.${frac}`;
}

/** 계획오더 번호 — `PL-<실행일 여덟 자리>-<일련>`, 일련은 세 자리 이상(999 를 넘으면 자리가 는다). */
const plannedNumber = (runDate: string, seq: number) =>
  `PL-${runDate.replaceAll("-", "")}-${String(seq).padStart(3, "0")}`;

type RunItem = MrpItem & { unit: string };

/** 품목 전부(「사용 안 함」 포함) — 단위 자릿수는 단위의 사양을 left join(없으면 0). */
async function runItems(tx: Db): Promise<RunItem[]> {
  const rows = await tx
    .select({
      id: items.id,
      code: items.code,
      itemType: items.itemType,
      procurement: sql<"MAKE" | "BUY">`${items.procurement}`,
      leadTimeDays: items.leadTimeDays,
      safety: sql<string>`${items.safetyStock}::text`,
      minLot: sql<string>`${items.minLot}::text`,
      multiple: sql<string>`${items.lotMultiple}::text`,
      unit: items.unit,
      decimals: sql<number>`coalesce(${unitSpecs.decimals}, 0)`.mapWith(Number),
      active: items.active,
    })
    .from(items)
    .leftJoin(unitSpecs, eq(unitSpecs.unit, items.unit))
    .orderBy(asc(items.id));
  return rows.map((r) => ({
    ...r,
    safety: milliOf(r.safety),
    minLot: milliOf(r.minLot),
    multiple: milliOf(r.multiple),
  }));
}

/** BOM 줄 전부(적용일 무관) — 기준수량은 머리에서, 로스율은 백분의 일 정수(3.5% → 350)로. */
async function runBomLines(tx: Db) {
  const rows = await tx
    .select({
      parentId: bomLines.parentItemId,
      childId: bomLines.childItemId,
      qty: sql<string>`${bomLines.qty}::text`,
      baseQty: sql<string>`${boms.baseQty}::text`,
      lossHundredths: sql<number>`round(${bomLines.lossRate} * 100)::integer`.mapWith(Number),
      validFrom: bomLines.validFrom,
      validTo: bomLines.validTo,
    })
    .from(bomLines)
    .innerJoin(boms, eq(boms.id, bomLines.bomId))
    .orderBy(asc(bomLines.id));
  return rows.map((r) => ({ ...r, qty: milliOf(r.qty), baseQty: milliOf(r.baseQty) }));
}

async function insertInChunks<T>(rows: T[], insert: (part: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) await insert(rows.slice(i, i + INSERT_CHUNK));
}

/**
 * [MRP 실행] — 부르는 쪽이 트랜잭션(REPEATABLE READ)을 열고 lockMrp 를 쥔 뒤 부른다. today 는 실행한 날(한국 시각)이고 번호 · 늦음이 그날에 기댄다.
 * 실행 기록 상한 → 읽기 · 계산 → 계획오더 상한 차례로 보고, 거절이면 아무것도 쓰지 않는다. 그 밖에는 지난 실행들의 계획오더 · 품목 머리 · 총소요를
 * 지우고, 실행 한 줄 → 계획오더(planMrp 의 차례대로, 그날 실행들의 seq_end 최댓값 + 1 부터 번호) → 품목 머리 → 총소요를 넣는다.
 * 계산이 던지면(BOM 순환 · 없는 품목) 잡지 않는다 — 트랜잭션이 되돌아간다.
 */
export async function runMrpIn(tx: Db, now: Date, today: string = koreaToday(now)): Promise<MrpRunResult> {
  const [{ runs }] = await tx.select({ runs: count() }).from(mrpRuns);
  if (runs + 1 > MRP_RUN_LIMIT) return { ok: false, formError: limitMessage("MRP 실행 기록", MRP_RUN_LIMIT) };

  const thisWeek = mondayOf(today);
  const weeks = Array.from({ length: EDIT_WEEKS }, (_, i) => addWeeks(thisWeek, i));
  const all = await runItems(tx);
  const itemById = new Map(all.map((i) => [i.id, i]));
  const idByCode = new Map(all.map((i) => [i.code, i.id]));
  const available = await availableByItem(
    tx,
    all.map((i) => i.id),
  );
  const mps = (await mpsSupplyIn(tx, weeks[weeks.length - 1], today)).map((s) => ({
    itemId: idByCode.get(s.item)!,
    week: s.week,
    qty: milliOf(s.qty),
  }));
  const [setting] = await tx
    .select({ dueWeekday: mrpSettingsTable.dueWeekday })
    .from(mrpSettingsTable)
    .where(eq(mrpSettingsTable.id, 1));
  const dueWeekday = setting?.dueWeekday ?? 1;

  const plan = planMrp({ today, dueWeekday, weeks, items: all, bomLines: await runBomLines(tx), available, mps });
  if (overOrderLimit(plan.orders.length)) return { ok: false, formError: OVER_ORDERS };
  // 넣을 수량이 numeric(15,3) 의 끝을 넘으면 쓰기 전에 거절한다 — 넘는 채로 넣으면 22003 오류가 나 「잠시 뒤 다시」로 보인다.
  const tooLarge =
    plan.orders.some((o) => overNumericLimit(o.qty)) ||
    plan.items.some(
      (p) =>
        overNumericLimit(p.available) ||
        overNumericLimit(p.safety) ||
        overNumericLimit(itemById.get(p.itemId)!.minLot) ||
        overNumericLimit(itemById.get(p.itemId)!.multiple) ||
        [...p.gross.values()].some(overNumericLimit),
    );
  if (tooLarge) return { ok: false, formError: OVER_QTY };

  const [{ last }] = await tx
    .select({ last: max(mrpRuns.seqEnd) })
    .from(mrpRuns)
    .where(eq(mrpRuns.runDate, today));
  const firstSeq = (last ?? 0) + 1;

  // 지난 실행들의 결과를 지운다 — 실행 줄은 남긴다.
  await tx.delete(mrpGross);
  await tx.delete(mrpPlannedOrders);
  await tx.delete(mrpRunItems);

  const [{ runId }] = await tx
    .insert(mrpRuns)
    .values({
      ranAt: now,
      runDate: today,
      dueWeekday,
      seqEnd: firstSeq - 1 + plan.orders.length,
      orderCount: plan.orders.length,
    })
    .returning({ runId: mrpRuns.id });

  const itemOf = (id: number) => itemById.get(id)!;
  const numbered = plan.orders.map((o, i) => ({ ...o, number: plannedNumber(today, firstSeq + i) }));
  await insertInChunks(numbered, (part) =>
    tx.insert(mrpPlannedOrders).values(
      part.map((o) => ({
        runId,
        number: o.number,
        kind: o.kind,
        itemId: o.itemId,
        qty: sql`${numericText(o.qty)}::numeric`,
        unit: itemOf(o.itemId).unit,
        decimals: itemOf(o.itemId).decimals,
        dueDate: o.dueDate,
        plannedStart: o.plannedStart,
        startDate: o.startDate,
        lateDays: o.lateDays,
        noBom: o.noBom,
      })),
    ),
  );
  await insertInChunks(plan.items, (part) =>
    tx.insert(mrpRunItems).values(
      part.map((p) => {
        const item = itemOf(p.itemId);
        return {
          runId,
          itemId: p.itemId,
          fromMps: p.fromMps,
          available: sql`${numericText(p.available)}::numeric`,
          safety: sql`${numericText(p.safety)}::numeric`,
          minLot: sql`${numericText(item.minLot)}::numeric`,
          lotMultiple: sql`${numericText(item.multiple)}::numeric`,
          leadTimeDays: item.leadTimeDays,
          unit: item.unit,
          decimals: item.decimals,
          active: item.active,
        };
      }),
    ),
  );
  const gross = plan.items.flatMap((p) => [...p.gross].map(([week, qty]) => ({ itemId: p.itemId, week, qty })));
  await insertInChunks(gross, (part) =>
    tx
      .insert(mrpGross)
      .values(
        part.map((g) => ({ runId, itemId: g.itemId, weekStart: g.week, qty: sql`${numericText(g.qty)}::numeric` })),
      ),
  );
  return { ok: true, orders: plan.orders.length };
}

/** [MRP 실행] — 잠금을 쥔 뒤 첫 읽기가 스냅숏이 되도록 REPEATABLE READ 트랜잭션에서 lockMrp 를 첫 문장으로 쥐고 runMrpIn 을 부른다. */
export async function runMrp(db: Db, now: Date = new Date()): Promise<MrpRunResult> {
  return db.transaction(
    async (tx) => {
      await lockMrp(tx);
      return runMrpIn(tx, now);
    },
    { isolationLevel: "repeatable read" },
  );
}

// ── [결과 읽기] ────────────────────────────────────────────

const ro = { isolationLevel: "repeatable read", accessMode: "read only" } as const;

/** 가장 새 실행(id 가 가장 큰 줄)만 결과가 남는다 — 실행 줄이 없으면 null. */
export type MrpRunInfo = { ranAt: Date; runDate: string; dueWeekday: number; orders: number };

type LatestRun = MrpRunInfo & { id: number };

async function latestRun(tx: Db): Promise<LatestRun | null> {
  const [r] = await tx
    .select({
      id: mrpRuns.id,
      ranAt: mrpRuns.ranAt,
      runDate: mrpRuns.runDate,
      dueWeekday: mrpRuns.dueWeekday,
      orders: mrpRuns.orderCount,
    })
    .from(mrpRuns)
    .orderBy(desc(mrpRuns.id))
    .limit(1);
  return r ? { ...r, dueWeekday: r.dueWeekday ?? 1 } : null;
}

const infoOf = (r: LatestRun): MrpRunInfo => ({
  ranAt: r.ranAt,
  runDate: r.runDate,
  dueWeekday: r.dueWeekday,
  orders: r.orders,
});

/** 쪽 — 마지막 쪽을 넘으면 마지막 쪽. */
function clampPage(page: number, total: number) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return { page: Math.min(page, pages), pages };
}

type MrpItemInfo = { code: string; name: string; spec: string; itemType: string; active: boolean };

// ── 계획오더 목록 ──

export type MrpOrderQuery = { kind: "MAKE" | "BUY" | null; itemType: string | null; lateOnly: boolean; page: number };

/** 주소의 값 — 알 수 없는 값은 기본값(전체 · 첫 쪽)으로. */
export function parseMrpOrderQuery(params: Params): MrpOrderQuery {
  const kind = first(params.kind);
  const type = first(params.type);
  const page = first(params.page);
  return {
    kind: kind === "MAKE" || kind === "BUY" ? kind : null,
    itemType: type !== undefined && ITEM_TYPES.some((t) => t.code === type) ? type : null,
    lateOnly: first(params.late) === "1",
    page: page !== undefined && /^[1-9][0-9]{0,8}$/.test(page) ? Number(page) : 1,
  };
}

export type MrpOrderRow = {
  number: string;
  kind: "MAKE" | "BUY";
  item: MrpItemInfo;
  qty: string;
  unit: string;
  startDate: string;
  dueDate: string;
  lateDays: number;
  noBom: boolean;
};

/** 가장 새 실행의 계획오더 — 번호 차례, 쪽당 PAGE_SIZE. 수량은 정규 글자. */
export async function openMrpOrders(
  db: Db,
  q: MrpOrderQuery,
): Promise<{ run: MrpRunInfo | null; total: number; page: number; pages: number; rows: MrpOrderRow[] }> {
  return db.transaction(async (tx) => {
    const run = await latestRun(tx);
    if (!run) return { run: null, total: 0, page: 1, pages: 1, rows: [] };
    const conds: SQL[] = [eq(mrpPlannedOrders.runId, run.id)];
    if (q.kind) conds.push(eq(mrpPlannedOrders.kind, q.kind));
    if (q.itemType) conds.push(eq(items.itemType, q.itemType));
    if (q.lateOnly) conds.push(sql`${mrpPlannedOrders.lateDays} > 0`);
    const where = and(...conds);
    const [{ n }] = await tx
      .select({ n: count() })
      .from(mrpPlannedOrders)
      .innerJoin(items, eq(items.id, mrpPlannedOrders.itemId))
      .where(where);
    const p = clampPage(q.page, n);
    const rows = await tx
      .select({
        number: mrpPlannedOrders.number,
        kind: sql<"MAKE" | "BUY">`${mrpPlannedOrders.kind}`,
        code: items.code,
        name: items.name,
        spec: items.spec,
        itemType: items.itemType,
        active: items.active,
        qty: sql<string>`${mrpPlannedOrders.qty}::text`,
        unit: mrpPlannedOrders.unit,
        startDate: mrpPlannedOrders.startDate,
        dueDate: mrpPlannedOrders.dueDate,
        lateDays: mrpPlannedOrders.lateDays,
        noBom: mrpPlannedOrders.noBom,
      })
      .from(mrpPlannedOrders)
      .innerJoin(items, eq(items.id, mrpPlannedOrders.itemId))
      .where(where)
      .orderBy(asc(mrpPlannedOrders.id)) // 번호 차례로 넣었으므로 id 차례 = 번호의 수 차례(글자 차례는 1000 부터 어긋난다)
      .limit(PAGE_SIZE)
      .offset((p.page - 1) * PAGE_SIZE);
    return {
      run: infoOf(run),
      total: n,
      ...p,
      rows: rows.map((r) => ({
        number: r.number,
        kind: r.kind,
        item: { code: r.code, name: r.name, spec: r.spec, itemType: r.itemType, active: r.active },
        qty: canonText(r.qty),
        unit: r.unit,
        startDate: r.startDate,
        dueDate: r.dueDate,
        lateDays: r.lateDays,
        noBom: r.noBom,
      })),
    };
  }, ro);
}

// ── 품목별 MRP 표 ──

export type MrpGridCell = {
  gross: string | null;
  receipt: string | null;
  projected: string | null;
  release: string | null;
};
export type MrpGridRow = {
  item: MrpItemInfo;
  unit: string;
  fromMps: boolean;
  available: string;
  safety: string;
  minLot: string;
  multiple: string;
  leadTimeDays: number;
  cells: Record<string, MrpGridCell>;
};

/** 주소의 쪽 값 — 실행 주 + 13주 × k(k = 0 ~ 3)이면 그대로, 아니면 실행 주. */
export function parseMrpGridFrom(param: string | undefined, runWeek: string): string {
  const starts = Array.from({ length: 4 }, (_, k) => addWeeks(runWeek, PAGE_WEEKS * k));
  return param !== undefined && starts.includes(param) ? param : runWeek;
}

const ZERO = BigInt(0);

/** 0 은 null, 아니면 정규 글자(음수는 절댓값의 정규 글자에 「-」). */
function cellText(q: Milli): string | null {
  if (q === ZERO) return null;
  return q < ZERO ? `-${canon(-q)}` : canon(q);
}

/**
 * 가장 새 실행의 품목별 MRP 표 한 쪽(13주) — 줄은 그 실행의 품목 머리 전부(코드 차례).
 * 입고 = 그 주에 완성일이, 착수 = 시작일이 드는 계획오더 수량 합. 예상재고는 보이는 쪽이 뒤여도 실행 주부터 이어서
 * 「가용재고 + 입고 − 총소요」로 셈한다(완제품은 총소요 · 예상재고 없음). 칸의 0 은 null.
 */
export async function openMrpGrid(
  db: Db,
  from: string,
): Promise<{ run: MrpRunInfo | null; runWeek: string | null; weeks: string[]; rows: MrpGridRow[] }> {
  const weeks = pageWeeks(from);
  return db.transaction(async (tx) => {
    const run = await latestRun(tx);
    if (!run) return { run: null, runWeek: null, weeks, rows: [] };
    const runWeek = mondayOf(run.runDate);
    const last = weeks[weeks.length - 1];
    const lo = weeks[0];

    const heads = await tx
      .select({
        itemId: mrpRunItems.itemId,
        code: items.code,
        name: items.name,
        spec: items.spec,
        itemType: items.itemType,
        fromMps: mrpRunItems.fromMps,
        available: sql<string>`${mrpRunItems.available}::text`,
        safety: sql<string>`${mrpRunItems.safety}::text`,
        minLot: sql<string>`${mrpRunItems.minLot}::text`,
        multiple: sql<string>`${mrpRunItems.lotMultiple}::text`,
        leadTimeDays: mrpRunItems.leadTimeDays,
        unit: mrpRunItems.unit,
        active: mrpRunItems.active,
      })
      .from(mrpRunItems)
      .innerJoin(items, eq(items.id, mrpRunItems.itemId))
      .where(eq(mrpRunItems.runId, run.id))
      .orderBy(asc(items.code));

    // 품목 × 주의 합 — 입고 · 총소요는 실행 주부터 보이는 마지막 주까지, 착수는 보이는 주만.
    const key = (itemId: number, week: string) => `${itemId}|${week}`;
    const dueWeek = sql<string>`date_trunc('week', ${mrpPlannedOrders.dueDate}::timestamp)::date::text`;
    const startWeek = sql<string>`date_trunc('week', ${mrpPlannedOrders.startDate}::timestamp)::date::text`;
    const sumQty = sql<string>`sum(${mrpPlannedOrders.qty})::text`;
    const receiptRows = await tx
      .select({ itemId: mrpPlannedOrders.itemId, week: dueWeek, qty: sumQty })
      .from(mrpPlannedOrders)
      .where(and(eq(mrpPlannedOrders.runId, run.id), sql`${dueWeek} between ${runWeek} and ${last}`))
      .groupBy(mrpPlannedOrders.itemId, dueWeek);
    const releaseRows = await tx
      .select({ itemId: mrpPlannedOrders.itemId, week: startWeek, qty: sumQty })
      .from(mrpPlannedOrders)
      .where(and(eq(mrpPlannedOrders.runId, run.id), sql`${startWeek} between ${lo} and ${last}`))
      .groupBy(mrpPlannedOrders.itemId, startWeek);
    const grossRows = await tx
      .select({ itemId: mrpGross.itemId, week: mrpGross.weekStart, qty: sql<string>`${mrpGross.qty}::text` })
      .from(mrpGross)
      .where(and(eq(mrpGross.runId, run.id), sql`${mrpGross.weekStart} between ${runWeek} and ${last}`));
    const toMap = (rows: { itemId: number; week: string; qty: string }[]) =>
      new Map(rows.map((r) => [key(r.itemId, r.week), milliOf(r.qty)] as const));
    const receipts = toMap(receiptRows);
    const releases = toMap(releaseRows);
    const grosses = toMap(grossRows);

    // 실행 주부터 보이는 마지막 주까지 이어 셈하는 주 목록.
    const chain: string[] = [];
    for (let w = runWeek; w <= last; w = addWeeks(w, 1)) chain.push(w);

    const rows: MrpGridRow[] = heads.map((h) => {
      const cells: Record<string, MrpGridCell> = {};
      const projected = new Map<string, Milli>();
      if (!h.fromMps) {
        let stock = milliOf(h.available);
        for (const w of chain) {
          stock += (receipts.get(key(h.itemId, w)) ?? ZERO) - (grosses.get(key(h.itemId, w)) ?? ZERO);
          projected.set(w, stock);
        }
      }
      for (const w of weeks) {
        const p = projected.get(w);
        cells[w] = {
          gross: h.fromMps ? null : cellText(grosses.get(key(h.itemId, w)) ?? ZERO),
          receipt: cellText(receipts.get(key(h.itemId, w)) ?? ZERO),
          projected: p === undefined ? null : (cellText(p) ?? "0"),
          release: cellText(releases.get(key(h.itemId, w)) ?? ZERO),
        };
      }
      return {
        item: { code: h.code, name: h.name, spec: h.spec, itemType: h.itemType, active: h.active },
        unit: h.unit,
        fromMps: h.fromMps,
        available: canonText(h.available),
        safety: canonText(h.safety),
        minLot: canonText(h.minLot),
        multiple: canonText(h.multiple),
        leadTimeDays: h.leadTimeDays,
        cells,
      };
    });
    return { run: infoOf(run), runWeek, weeks, rows };
  }, ro);
}
