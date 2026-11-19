import { and, asc, count, desc, eq, ilike, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import { ITEM_CODE } from "@/lib/bom-input";
import { PROCESS_CODE } from "@/lib/process-input";
import { WORK_CENTER_CODE } from "@/lib/work-center-input";
import {
  formatRunMs,
  parseRouting,
  seqOf,
  type ParsedRoutingStep,
  type RoutingErrors,
  type RoutingStepErrors,
  type RoutingValues,
} from "@/lib/routing-input";
import {
  first,
  likeLiteral,
  limitMessage,
  REGISTER_LOCK,
  searchText,
  STALE,
  touched,
  VERSION,
  versionIs,
  versionOf,
  type Params,
} from "./master-shared";
import {
  bomLines,
  boms,
  items,
  processes,
  routingChanges,
  routingMaterials,
  routings,
  routingSteps,
  workCenters,
} from "./schema";
import type { Db } from "./types";

// 라우팅의 열기 · 저장 · 지우기 · 고친 이력(메뉴 「라우팅」). 화면(src/app/production/routings/)과 매일 밤 되돌림은 이 함수만 부른다.
// - 라우팅은 반제품 · 완제품마다 하나 — 공정 줄(순번 10 · 20 … 은 저장할 때 서버가 매김)과 줄마다 붙인 투입 자재.
// - 저장은 머리 · 줄 · 자재를 한 트랜잭션에서 바꾼다 — 화면이 보낸 줄이 그 라우팅의 줄이 된다. 바꾼 것이 없으면 버전도 이력도 그대로 둔다.
// - 저장 · 지우기는 라우팅의 잠금(REGISTER_LOCK.routings)을 쥐고 돈다 — 공정 줄 전체 · 고친 이력의 상한을 세고 넣는 사이에 남이 끼지 못한다.

/** 공정 줄 전체의 등록 상한 — 매일 밤 되돌림이 샘플 수로 줄인다. 머리는 품목마다 하나라 품목 상한을 넘지 않는다. */
export const ROUTING_STEP_LIMIT = 5000;
/** 고친 이력 전체의 등록 상한 — 매일 밤 되돌림이 비운다. */
export const ROUTING_CHANGE_LIMIT = 50000;
/** 한 라우팅 화면에서 보이는 고친 이력의 줄 수 상한 — 그 품목의 이력 줄 수는 따로 센다. */
export const ROUTING_HISTORY_SHOWN = 100;

const ROUTING_TYPES = ["SF", "FG"] as const;
const isRoutingType = (t: string) => (ROUTING_TYPES as readonly string[]).includes(t);

const NO_ITEM = "없는 품목입니다";
const NOT_ROUTING_TYPE = "라우팅은 반제품 · 완제품에만 있습니다";
const INACTIVE_ITEM = "「사용 안 함」 품목이라 새 라우팅을 만들지 못합니다";

/** 라우팅을 고치는 저장 · 지우기가 쥐는 잠금 — 트랜잭션이 끝나면 저절로 풀린다. */
export async function lockRouting(tx: Db): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(${REGISTER_LOCK.routings})`);
}

export type RoutingItem = { code: string; name: string; spec: string; itemType: string; unit: string; active: boolean };
type ItemRow = RoutingItem & { id: number };

const itemColumns = {
  id: items.id,
  code: items.code,
  name: items.name,
  spec: items.spec,
  itemType: items.itemType,
  unit: items.unit,
  active: items.active,
};

async function itemByCode(db: Db, code: string): Promise<ItemRow | undefined> {
  if (!ITEM_CODE.test(code)) return undefined;
  const [row] = await db.select(itemColumns).from(items).where(eq(items.code, code));
  return row;
}

async function headOf(db: Db, itemId: number): Promise<{ id: number; version: string } | undefined> {
  const [row] = await db
    .select({ id: routings.id, version: versionOf(routings.updatedAt) })
    .from(routings)
    .where(eq(routings.itemId, itemId));
  return row;
}

const itemOf = (i: ItemRow): RoutingItem => ({
  code: i.code,
  name: i.name,
  spec: i.spec,
  itemType: i.itemType,
  unit: i.unit,
  active: i.active,
});

// ── 고를 것 ───────────────────────────────────────────

export type WorkCenterChoice = { code: string; name: string; active: boolean };
export type ProcessChoice = { code: string; name: string; active: boolean; workCenters: WorkCenterChoice[] };

/** 공정마다 그 작업장을 붙인다 — 둘 다 코드 차례. */
async function processChoices(db: Db, activeOnly: boolean): Promise<ProcessChoice[]> {
  const procs = await db
    .select({ id: processes.id, code: processes.code, name: processes.name, active: processes.active })
    .from(processes)
    .where(activeOnly ? eq(processes.active, true) : undefined)
    .orderBy(asc(processes.code));
  const centers = await db
    .select({
      processId: workCenters.processId,
      code: workCenters.code,
      name: workCenters.name,
      active: workCenters.active,
    })
    .from(workCenters)
    .where(activeOnly ? eq(workCenters.active, true) : undefined)
    .orderBy(asc(workCenters.code));
  return procs.map(({ id, ...p }) => ({
    ...p,
    workCenters: centers
      .filter((c) => c.processId === id)
      .map((c) => ({ code: c.code, name: c.name, active: c.active })),
  }));
}

/** 새 라우팅의 품목(라우팅이 없는 「사용」 SF · FG)과 고를 공정(「사용」 공정 · 그 「사용」 작업장, 코드 차례). */
export async function routingFormOptions(db: Db): Promise<{ newItems: RoutingItem[]; processes: ProcessChoice[] }> {
  const newItems = await db
    .select({
      code: items.code,
      name: items.name,
      spec: items.spec,
      itemType: items.itemType,
      unit: items.unit,
      active: items.active,
    })
    .from(items)
    .leftJoin(routings, eq(routings.itemId, items.id))
    .where(and(eq(items.active, true), inArray(items.itemType, [...ROUTING_TYPES]), sql`${routings.id} is null`))
    .orderBy(asc(items.code));
  return { newItems, processes: await processChoices(db, true) };
}

/** 목록 찾기의 공정 · 작업장 후보 — 「사용 안 함」까지 모두(그것을 쓰던 라우팅도 찾게). 코드 차례. */
export function routingFilterOptions(db: Db): Promise<ProcessChoice[]> {
  return processChoices(db, false);
}

// ── 열기 ─────────────────────────────────────────────

export type RoutingSheetStep = {
  seq: number;
  processCode: string;
  processName: string;
  processActive: boolean;
  workCenterCode: string;
  workCenterName: string;
  workCenterActive: boolean;
  setupMin: number;
  runSec: string;
  note: string;
};
/** seq — 붙은 공정의 순번, null 이면 붙이지 않음(첫 공정). inBom — 지금 BOM 의 자품목인가. */
export type RoutingSheetMaterial = {
  code: string;
  name: string;
  itemType: string;
  unit: string;
  active: boolean;
  seq: number | null;
  inBom: boolean;
};
export type RoutingSheet = {
  item: RoutingItem;
  version: string | null;
  steps: RoutingSheetStep[];
  materials: RoutingSheetMaterial[];
  hasBom: boolean;
};

/** 저장된 공정 줄 — 순번 차례. 이력에 남길 공정 · 작업장의 코드 · 이름까지. */
type StoredStep = {
  seq: number;
  processId: number;
  processCode: string;
  processName: string;
  processActive: boolean;
  workCenterId: number;
  workCenterCode: string;
  workCenterName: string;
  workCenterActive: boolean;
  setupMin: number;
  runMs: number;
  note: string;
};

async function storedSteps(db: Db, routingId: number): Promise<StoredStep[]> {
  return db
    .select({
      seq: routingSteps.seq,
      processId: routingSteps.processId,
      processCode: processes.code,
      processName: processes.name,
      processActive: processes.active,
      workCenterId: routingSteps.workCenterId,
      workCenterCode: workCenters.code,
      workCenterName: workCenters.name,
      workCenterActive: workCenters.active,
      setupMin: routingSteps.setupMin,
      runMs: routingSteps.runMs,
      note: routingSteps.note,
    })
    .from(routingSteps)
    .innerJoin(processes, eq(processes.id, routingSteps.processId))
    .innerJoin(workCenters, eq(workCenters.id, routingSteps.workCenterId))
    .where(eq(routingSteps.routingId, routingId))
    .orderBy(asc(routingSteps.seq));
}

/** 저장된 투입 자재 — 자재 품목 · 붙은 순번. */
async function storedMaterials(db: Db, routingId: number): Promise<{ itemId: number; seq: number }[]> {
  return db
    .select({ itemId: routingMaterials.itemId, seq: routingMaterials.seq })
    .from(routingMaterials)
    .where(eq(routingMaterials.routingId, routingId))
    .orderBy(asc(routingMaterials.seq), asc(routingMaterials.id));
}

/** 그 품목 BOM 의 모든 줄(적용 기간 무관)의 자품목 — 처음 나온 줄 번호 차례, 겹치면 하나. */
async function bomChildren(db: Db, itemId: number) {
  const rows = await db
    .select({
      id: items.id,
      code: items.code,
      name: items.name,
      itemType: items.itemType,
      unit: items.unit,
      active: items.active,
    })
    .from(bomLines)
    .innerJoin(items, eq(items.id, bomLines.childItemId))
    .where(eq(bomLines.parentItemId, itemId))
    .orderBy(asc(bomLines.lineNo));
  const seen = new Set<number>();
  return rows.filter((r) => !seen.has(r.id) && seen.add(r.id));
}

/** 품목의 라우팅을 연다 — 없는 품목 · 라우팅을 둘 수 없는 품목은 까닭을 돌려준다. 라우팅이 없으면 새 라우팅의 빈 줄. */
export async function openRouting(
  db: Db,
  code: string,
): Promise<{ ok: true; sheet: RoutingSheet } | { ok: false; message: string }> {
  const item = await itemByCode(db, code);
  if (!item) return { ok: false, message: NO_ITEM };
  if (!isRoutingType(item.itemType)) return { ok: false, message: NOT_ROUTING_TYPE };
  const head = await headOf(db, item.id);
  if (!head && !item.active) return { ok: false, message: INACTIVE_ITEM };

  const [bom] = await db.select({ id: boms.id }).from(boms).where(eq(boms.itemId, item.id));
  const children = await bomChildren(db, item.id);
  const steps = head ? await storedSteps(db, head.id) : [];
  const attached = head ? await storedMaterials(db, head.id) : [];
  const seqOfItem = new Map(attached.map((m) => [m.itemId, m.seq] as const));

  const inBom = new Set(children.map((c) => c.id));
  const outside = attached.filter((m) => !inBom.has(m.itemId)).map((m) => m.itemId);
  const extra = outside.length
    ? await db
        .select({
          id: items.id,
          code: items.code,
          name: items.name,
          itemType: items.itemType,
          unit: items.unit,
          active: items.active,
        })
        .from(items)
        .where(inArray(items.id, outside))
        .orderBy(asc(items.code))
    : [];

  return {
    ok: true,
    sheet: {
      item: itemOf(item),
      version: head?.version ?? null,
      hasBom: !!bom,
      steps: steps.map((s) => ({
        seq: s.seq,
        processCode: s.processCode,
        processName: s.processName,
        processActive: s.processActive,
        workCenterCode: s.workCenterCode,
        workCenterName: s.workCenterName,
        workCenterActive: s.workCenterActive,
        setupMin: s.setupMin,
        runSec: formatRunMs(s.runMs),
        note: s.note,
      })),
      materials: [
        ...children.map(({ id, ...c }) => ({ ...c, seq: seqOfItem.get(id) ?? null, inBom: true })),
        ...extra.map(({ id, ...c }) => ({ ...c, seq: seqOfItem.get(id) ?? null, inBom: false })),
      ],
    },
  };
}

// ── 고친 이력 ──────────────────────────────────────────

export type RoutingChangeKind =
  "ROUTING_ADD" | "ROUTING_DEL" | "STEP_ADD" | "STEP_DEL" | "STEP_EDIT" | "MAT_ADD" | "MAT_MOVE" | "MAT_DEL";

type ChangeRow = {
  itemId: number;
  kind: RoutingChangeKind;
  /** 줄 일은 새 순번(뺌은 옛 순번), 라우팅 · 자재 일은 없음. */
  seq?: number;
  materialItemId?: number;
  before?: Record<string, string>;
  after?: Record<string, string>;
};

/** 이력에 견주는 공정 줄의 칸 — 공정 · 작업장(번호 · 코드 · 이름) · 준비시간(분) · 개당 작업시간(밀리초) · 비고. */
type StepLike = {
  processId: number;
  processCode: string;
  processName: string;
  workCenterId: number;
  workCenterCode: string;
  workCenterName: string;
  setupMin: number;
  runMs: number;
  note: string;
};

/** 고친 이력에 남기는 줄의 칸 — 보이는 글자 그대로(「DA 다이 본딩」 · 「2.400」). */
const stepFields = (seq: number, s: StepLike) => ({
  seq: String(seq),
  process: `${s.processCode} ${s.processName}`,
  workCenter: `${s.workCenterCode} ${s.workCenterName}`,
  setupMin: String(s.setupMin),
  runSec: formatRunMs(s.runMs),
  note: s.note,
});

/** 자재가 붙은 줄의 이름 — 「20 MD 몰딩」. */
const stepLabel = (seq: number, s: StepLike) => `${seq} ${s.processCode} ${s.processName}`;

type NextStep = StepLike & { origSeq: number | null };
/** 새 투입 자재 — 자재 품목과 붙일 줄의 차례(0 부터). */
type NextMaterial = { itemId: number; stepPos: number };
type Stored = { steps: StoredStep[]; materials: { itemId: number; seq: number }[] };

/**
 * 고친 이력 — 옛 라우팅(없으면 새 라우팅)과 새 라우팅을 견준다. 새 줄의 원래 순번(origSeq)이 옛 줄을 가리키면 같은 줄이다(공정이 바뀌었어도 — 옛 줄 하나는
 * 한 번만 짝). 같은 줄은 바뀐 칸만 「공정 고침」, 짝 없는 새 줄은 「공정 더함」, 짝 없는 옛 줄은 「공정 뺌」. 자재는 품목으로 견주어 붙임 · 뗌, 그리고 짝이 아닌
 * 줄로 간 것만 옮김이다 — 줄을 옮기거나 그 줄의 공정을 바꿔도 자재는 줄을 따라가 옮김이 아니다.
 */
function diffOf(itemId: number, old: Stored | undefined, steps: readonly NextStep[], mats: readonly NextMaterial[]) {
  const rows: ChangeRow[] = [];
  if (!old) {
    rows.push({ itemId, kind: "ROUTING_ADD" });
    steps.forEach((s, i) => rows.push({ itemId, kind: "STEP_ADD", seq: seqOf(i), after: stepFields(seqOf(i), s) }));
    for (const m of mats)
      rows.push({
        itemId,
        kind: "MAT_ADD",
        materialItemId: m.itemId,
        after: { step: stepLabel(seqOf(m.stepPos), steps[m.stepPos]) },
      });
    return rows;
  }

  const bySeq = new Map(old.steps.map((s) => [s.seq, s] as const));
  /** 옛 순번 → 짝이 된 새 줄의 차례. */
  const pairOf = new Map<number, number>();
  steps.forEach((s, i) => {
    const was = s.origSeq === null ? undefined : bySeq.get(s.origSeq);
    if (was && !pairOf.has(was.seq)) {
      pairOf.set(was.seq, i);
      const [a, b] = [stepFields(was.seq, was), stepFields(seqOf(i), s)];
      const keys = (Object.keys(a) as (keyof typeof a)[]).filter((k) => a[k] !== b[k]);
      if (keys.length)
        rows.push({
          itemId,
          kind: "STEP_EDIT",
          seq: seqOf(i),
          before: Object.fromEntries(keys.map((k) => [k, a[k]])),
          after: Object.fromEntries(keys.map((k) => [k, b[k]])),
        });
      return;
    }
    rows.push({ itemId, kind: "STEP_ADD", seq: seqOf(i), after: stepFields(seqOf(i), s) });
  });
  for (const s of old.steps)
    if (!pairOf.has(s.seq)) rows.push({ itemId, kind: "STEP_DEL", seq: s.seq, before: stepFields(s.seq, s) });

  const oldSeqOf = new Map(old.materials.map((m) => [m.itemId, m.seq] as const));
  const newPosOf = new Map(mats.map((m) => [m.itemId, m.stepPos] as const));
  const newLabel = (pos: number) => stepLabel(seqOf(pos), steps[pos]);
  const oldLabel = (seq: number) => stepLabel(seq, bySeq.get(seq)!);
  for (const m of mats) {
    const was = oldSeqOf.get(m.itemId);
    if (was === undefined)
      rows.push({ itemId, kind: "MAT_ADD", materialItemId: m.itemId, after: { step: newLabel(m.stepPos) } });
    else if (pairOf.get(was) !== m.stepPos)
      rows.push({
        itemId,
        kind: "MAT_MOVE",
        materialItemId: m.itemId,
        before: { step: oldLabel(was) },
        after: { step: newLabel(m.stepPos) },
      });
  }
  for (const m of old.materials)
    if (!newPosOf.has(m.itemId))
      rows.push({ itemId, kind: "MAT_DEL", materialItemId: m.itemId, before: { step: oldLabel(m.seq) } });
  return rows;
}

/**
 * 옛 라우팅과 새 라우팅이 같은가 — 줄(차례 · 공정 · 작업장 · 준비시간 · 개당 작업시간 · 비고)과 자재가 붙은 줄의 차례가 다 같으면 바꾸지 않은 것이다.
 * 줄을 옮겨 순번이 다시 매겨지면 차례가 달라 바뀐 것이다.
 */
function sameRouting(old: Stored, steps: readonly NextStep[], mats: readonly NextMaterial[]): boolean {
  if (old.steps.length !== steps.length || old.materials.length !== mats.length) return false;
  const sameSteps = old.steps.every((o, i) => {
    const n = steps[i];
    return (
      o.seq === seqOf(i) &&
      o.processId === n.processId &&
      o.workCenterId === n.workCenterId &&
      o.setupMin === n.setupMin &&
      o.runMs === n.runMs &&
      o.note === n.note
    );
  });
  const posOf = new Map(mats.map((m) => [m.itemId, m.stepPos] as const));
  return sameSteps && old.materials.every((m) => posOf.has(m.itemId) && seqOf(posOf.get(m.itemId)!) === m.seq);
}

// postgres 드라이버는 행의 배열을, PGlite 는 { rows } 를 돌려준다.
function rowsOf<T>(result: unknown): T[] {
  return (Array.isArray(result) ? result : (result as { rows: T[] }).rows) as T[];
}

/** 지금 고친 이력의 줄 수가 상한 안에 더 들어가는가. */
async function changeRoom(tx: Db, adding: number): Promise<boolean> {
  const [{ n }] = await tx.select({ n: count() }).from(routingChanges);
  return n + adding <= ROUTING_CHANGE_LIMIT;
}

/**
 * 고친 이력을 남긴다 — 일시는 잠금을 쥔 뒤에 읽은 한 시각을 줄마다 같이 쓴다. 칸의 기본값(now())은 트랜잭션을 연 시각이라, 잠금을 기다린 저장이
 * 먼저 끝난 저장보다 이른 일시로 남아 이력의 차례가 뒤집힌다. 잠금을 쥔 트랜잭션 안에서만 부른다.
 */
async function recordChanges(tx: Db, rows: readonly ChangeRow[]) {
  if (!rows.length) return;
  const [{ at }] = rowsOf<{ at: string }>(await tx.execute(sql`select clock_timestamp()::text as at`));
  await tx.insert(routingChanges).values(
    rows.map((r) => ({
      itemId: r.itemId,
      savedAt: sql`${at}::timestamptz`,
      kind: r.kind,
      seq: r.seq ?? null,
      materialItemId: r.materialItemId ?? null,
      before: r.before ?? null,
      after: r.after ?? null,
    })),
  );
}

// ── 저장 ─────────────────────────────────────────────

export type RoutingSaveResult =
  | { ok: true; code: string; version: string; changed: number }
  | { ok: false; errors: RoutingErrors; formError?: string; values: RoutingValues };

/**
 * 라우팅의 저장 — 한 트랜잭션에서 라우팅의 잠금을 쥐고 품목 → 버전 → 공정 · 작업장 → 투입 자재 → 상한 차례로 보고, 하나라도 틀리면 아무것도 저장하지 않는다.
 * 「사용 안 함」 공정 · 작업장은 그것을 쓰던 그 줄(원래 순번)에만, BOM 에서 빠진 자재는 이 품목의 저장된 라우팅에 이미 있던 것만 다시 저장된다. 바꾼 것이 없으면 쓰지 않는다(버전 · 이력 그대로).
 * 바꿨으면 줄 · 자재를 지우고 다시 넣고(순번 10 · 20 …), 고친 이력을 같은 트랜잭션에서 남긴다. changed 는 남긴 이력 줄 수다.
 */
export async function saveRouting(db: Db, values: RoutingValues): Promise<RoutingSaveResult> {
  const fail = (errors: RoutingErrors, formError?: string): RoutingSaveResult => ({
    ok: false,
    errors,
    formError,
    values,
  });
  const empty = (): RoutingErrors => ({ steps: {}, materials: {} });

  const parsed = parseRouting(values);
  if (!parsed.ok) return fail(parsed.errors, parsed.formError);
  const v = parsed.value;

  return db.transaction(async (tx): Promise<RoutingSaveResult> => {
    await lockRouting(tx);

    const item = await itemByCode(tx, v.itemCode);
    const head = item && (await headOf(tx, item.id));
    const itemError = !item
      ? NO_ITEM
      : !isRoutingType(item.itemType)
        ? NOT_ROUTING_TYPE
        : !head && !item.active
          ? INACTIVE_ITEM
          : undefined;
    if (!item || itemError) return fail({ ...empty(), item: itemError });

    // 새 라우팅인데 머리가 있으면 남이 먼저 만든 것, 있던 라우팅인데 머리가 없거나 버전이 다르면 남이 고치거나 지운 것.
    if (v.version ? !VERSION.test(v.version) || !head || head.version !== v.version : !!head)
      return fail(empty(), STALE);

    const old: Stored | undefined = head && {
      steps: await storedSteps(tx, head.id),
      materials: await storedMaterials(tx, head.id),
    };
    const errors = empty();

    // 공정 · 작업장 — 코드로 한 번씩 찾는다.
    const procs = new Map(
      (
        await tx
          .select({ id: processes.id, code: processes.code, name: processes.name, active: processes.active })
          .from(processes)
          .where(inArray(processes.code, [...new Set(v.steps.map((s) => s.processCode))]))
      ).map((p) => [p.code, p] as const),
    );
    const centers = new Map(
      (
        await tx
          .select({
            id: workCenters.id,
            code: workCenters.code,
            name: workCenters.name,
            processId: workCenters.processId,
            active: workCenters.active,
          })
          .from(workCenters)
          .where(inArray(workCenters.code, [...new Set(v.steps.map((s) => s.workCenterCode))]))
      ).map((w) => [w.code, w] as const),
    );
    // 「사용 안 함」 공정 · 작업장은 그것을 쓰던 그 줄에만 다시 저장된다 — 원래 순번이 옛 줄을 가리키고(옛 줄 하나는 처음 가리킨 줄과만 짝, 고친 이력과
    // 같다) 옛 줄의 공정(작업장)이 같을 때. 새 줄 · 다른 줄은 같은 라우팅의 다른 줄이 쓰고 있어도 넣지 못한다.
    const oldBySeq = new Map(old?.steps.map((s) => [s.seq, s] as const));
    const paired = new Set<number>();
    const steps: NextStep[] = [];
    const stepOf = (s: ParsedRoutingStep) => {
      const e: RoutingStepErrors = {};
      const was = s.origSeq === null || paired.has(s.origSeq) ? undefined : oldBySeq.get(s.origSeq);
      if (was) paired.add(was.seq);
      const p = procs.get(s.processCode);
      if (!p) e.process = "없는 공정입니다 — 목록에서 고르세요";
      else if (!p.active && was?.processId !== p.id) e.process = "「사용 안 함」인 공정입니다 — 다른 공정을 고르세요";
      const w = centers.get(s.workCenterCode);
      if (!w) e.workCenter = "없는 작업장입니다 — 목록에서 고르세요";
      else if (!w.active && was?.workCenterId !== w.id)
        e.workCenter = "「사용 안 함」인 작업장입니다 — 다른 작업장을 고르세요";
      else if (p && w.processId !== p.id) e.workCenter = "그 공정의 작업장이 아닙니다 — 이 공정의 작업장에서 고르세요";
      if (Object.keys(e).length) {
        errors.steps[s.index] = e;
        return;
      }
      steps.push({
        processId: p!.id,
        processCode: p!.code,
        processName: p!.name,
        workCenterId: w!.id,
        workCenterCode: w!.code,
        workCenterName: w!.name,
        setupMin: s.setupMin,
        runMs: s.runMs,
        note: s.note,
        origSeq: s.origSeq,
      });
    };
    v.steps.forEach(stepOf);

    // 투입 자재 — 이 품목 BOM 의 자품목(모든 줄)이거나 저장된 라우팅에 이미 붙어 있던 자재만.
    const matCodes = [...new Set(v.materials.map((m) => m.itemCode))];
    const matIds = new Map(
      matCodes.length
        ? (await tx.select({ id: items.id, code: items.code }).from(items).where(inArray(items.code, matCodes))).map(
            (r) => [r.code, r.id] as const,
          )
        : [],
    );
    const inBom = new Set(
      (
        await tx.selectDistinct({ id: bomLines.childItemId }).from(bomLines).where(eq(bomLines.parentItemId, item.id))
      ).map((r) => r.id),
    );
    const attachedBefore = new Set(old?.materials.map((m) => m.itemId));
    const mats: NextMaterial[] = [];
    for (const m of v.materials) {
      const id = matIds.get(m.itemCode);
      if (id === undefined) errors.materials[m.index] = NO_ITEM;
      else if (!inBom.has(id) && !attachedBefore.has(id))
        errors.materials[m.index] = "이 품목의 BOM 에 없는 자재입니다";
      else mats.push({ itemId: id, stepPos: m.stepPos });
    }
    if (Object.keys(errors.steps).length || Object.keys(errors.materials).length) return fail(errors);

    if (old && head && sameRouting(old, steps, mats))
      return { ok: true, code: item.code, version: head.version, changed: 0 };

    const [{ n }] = await tx
      .select({ n: count() })
      .from(routingSteps)
      .where(head ? ne(routingSteps.routingId, head.id) : sql`true`);
    if (n + steps.length > ROUTING_STEP_LIMIT) return fail(empty(), limitMessage("라우팅 공정 줄", ROUTING_STEP_LIMIT));
    const changes = diffOf(item.id, old, steps, mats);
    if (!(await changeRoom(tx, changes.length)))
      return fail(empty(), limitMessage("라우팅 고친 이력", ROUTING_CHANGE_LIMIT));

    let saved: { id: number; version: string };
    if (head) {
      [saved] = await tx
        .update(routings)
        .set({ updatedAt: touched() })
        .where(and(eq(routings.id, head.id), versionIs(routings.updatedAt, head.version)))
        .returning({ id: routings.id, version: versionOf(routings.updatedAt) });
      // 줄을 지우면 붙은 자재도 함께 지워진다(routing_materials_step_fk 의 cascade).
      await tx.delete(routingSteps).where(eq(routingSteps.routingId, head.id));
    } else {
      [saved] = await tx
        .insert(routings)
        .values({ itemId: item.id, updatedAt: touched() })
        .returning({ id: routings.id, version: versionOf(routings.updatedAt) });
    }
    await tx.insert(routingSteps).values(
      steps.map((s, i) => ({
        routingId: saved.id,
        seq: seqOf(i),
        processId: s.processId,
        workCenterId: s.workCenterId,
        setupMin: s.setupMin,
        runMs: s.runMs,
        note: s.note,
      })),
    );
    if (mats.length)
      await tx
        .insert(routingMaterials)
        .values(mats.map((m) => ({ routingId: saved.id, seq: seqOf(m.stepPos), itemId: m.itemId })));
    await recordChanges(tx, changes);
    return { ok: true, code: item.code, version: saved.version, changed: changes.length };
  });
}

// ── 지우기 ───────────────────────────────────────────

/** 라우팅 지우기 — 머리 · 줄 · 자재를 함께. 화면을 연 때의 버전이 맞을 때만. 지운 것을 고친 이력에 남긴다. */
export async function deleteRouting(
  db: Db,
  code: string,
  version: string,
): Promise<{ ok: true; code: string } | { ok: false; notFound: true } | { ok: false; formError: string }> {
  if (!ITEM_CODE.test(code)) return { ok: false, notFound: true };
  if (!VERSION.test(version)) return { ok: false, formError: STALE };
  return db.transaction(async (tx) => {
    await lockRouting(tx);
    const item = await itemByCode(tx, code);
    const head = item && (await headOf(tx, item.id));
    if (!item || !head) return { ok: false, notFound: true } as const;
    if (head.version !== version) return { ok: false, formError: STALE } as const;
    const steps = await storedSteps(tx, head.id);
    const mats = await storedMaterials(tx, head.id);
    const bySeq = new Map(steps.map((s) => [s.seq, s] as const));
    const changes: ChangeRow[] = [
      { itemId: item.id, kind: "ROUTING_DEL" },
      ...steps.map((s): ChangeRow => ({ itemId: item.id, kind: "STEP_DEL", seq: s.seq, before: stepFields(s.seq, s) })),
      ...mats.map((m): ChangeRow => ({
        itemId: item.id,
        kind: "MAT_DEL",
        materialItemId: m.itemId,
        before: { step: stepLabel(m.seq, bySeq.get(m.seq)!) },
      })),
    ];
    if (!(await changeRoom(tx, changes.length)))
      return { ok: false, formError: limitMessage("라우팅 고친 이력", ROUTING_CHANGE_LIMIT) } as const;
    // 줄 · 자재는 머리를 따라 지워진다(cascade).
    await tx.delete(routings).where(eq(routings.id, head.id));
    await recordChanges(tx, changes);
    return { ok: true, code } as const;
  });
}

// ── 고친 이력 읽기 ──────────────────────────────────────

export type RoutingChangeEntry = {
  id: number;
  /** 한국 시각의 일시(YYYY-MM-DD HH:mm) — 보이는 글자. */
  savedAt: string;
  /** 한 저장을 가르는 열쇠 — 일시 전체(같은 분의 두 저장도 갈린다). */
  saveKey: string;
  kind: RoutingChangeKind;
  seq?: number;
  material?: { code: string; name: string };
  before: Record<string, string>;
  after: Record<string, string>;
};

/** 한 품목의 라우팅 고친 이력 — 최근 저장부터, 한 저장 안은 남긴 차례로. 지운 라우팅의 이력도 든다. */
export async function routingHistory(db: Db, code: string): Promise<{ total: number; entries: RoutingChangeEntry[] }> {
  const item = await itemByCode(db, code);
  if (!item) return { total: 0, entries: [] };
  const [{ total }] = await db
    .select({ total: count() })
    .from(routingChanges)
    .where(eq(routingChanges.itemId, item.id));
  const rows = await db
    .select({
      id: routingChanges.id,
      savedAt: sql<string>`to_char(${routingChanges.savedAt} at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI')`,
      saveKey: sql<string>`${routingChanges.savedAt}::text`,
      kind: routingChanges.kind,
      seq: routingChanges.seq,
      before: routingChanges.before,
      after: routingChanges.after,
      materialCode: items.code,
      materialName: items.name,
    })
    .from(routingChanges)
    .leftJoin(items, eq(items.id, routingChanges.materialItemId))
    .where(eq(routingChanges.itemId, item.id))
    .orderBy(desc(routingChanges.savedAt), asc(routingChanges.id))
    .limit(ROUTING_HISTORY_SHOWN);
  return {
    total,
    entries: rows.map((r) => ({
      id: r.id,
      savedAt: r.savedAt,
      saveKey: r.saveKey,
      kind: r.kind as RoutingChangeKind,
      seq: r.seq ?? undefined,
      material: r.materialCode ? { code: r.materialCode, name: r.materialName! } : undefined,
      before: r.before ?? {},
      after: r.after ?? {},
    })),
  };
}

// ── 목록 ─────────────────────────────────────────────

/** process · workCenter 가 빈 글자면 모든 공정 · 작업장. */
export type RoutingFilter = { q: string; process: string; workCenter: string };
export type RoutingFilterNotice = { field: "q" | "process" | "workCenter"; message: string };

/** 주소의 거르기 값을 읽는다. 꼴이 틀린 값은 거르지 않고 알린다. */
export function parseRoutingFilter(params: Params): { filter: RoutingFilter; notices: RoutingFilterNotice[] } {
  const search = searchText(params);
  const notices: RoutingFilterNotice[] = search.notice ? [{ field: "q", message: search.notice }] : [];
  const read = (raw: string | string[] | undefined, re: RegExp, field: "process" | "workCenter", label: string) => {
    const v = (first(raw) ?? "").trim();
    if (!v) return "";
    if (re.test(v)) return v;
    notices.push({ field, message: `받지 않는 ${label} 값이라 거르지 않았습니다` });
    return "";
  };
  const process = read(params.process, PROCESS_CODE, "process", "공정");
  const workCenter = read(params.workCenter, WORK_CENTER_CODE, "workCenter", "작업장");
  return { filter: { q: search.q, process, workCenter }, notices };
}

const FILTER_FIELDS = ["q", "process", "workCenter"] as const;

/**
 * 꼴은 맞지만 없는 공정 · 작업장이면 꼴이 틀린 때처럼 거르지 않고(모든 공정 · 작업장) 알린다 — 찾기 칸은 「모든 …」인데 빈 목록이 나오지 않게.
 * options 는 routingFilterOptions(「사용 안 함」까지 모두)다. 알림은 칸 차례로.
 */
export function dropUnknownRoutingFilter(
  filter: RoutingFilter,
  notices: readonly RoutingFilterNotice[],
  options: readonly ProcessChoice[],
): { filter: RoutingFilter; notices: RoutingFilterNotice[] } {
  const next = { ...filter };
  const added: RoutingFilterNotice[] = [];
  if (next.process && !options.some((p) => p.code === next.process)) {
    next.process = "";
    added.push({ field: "process", message: "받지 않는 공정 값이라 거르지 않았습니다" });
  }
  if (next.workCenter && !options.some((p) => p.workCenters.some((w) => w.code === next.workCenter))) {
    next.workCenter = "";
    added.push({ field: "workCenter", message: "받지 않는 작업장 값이라 거르지 않았습니다" });
  }
  if (!added.length) return { filter, notices: [...notices] };
  const all = [...notices, ...added].sort((a, b) => FILTER_FIELDS.indexOf(a.field) - FILTER_FIELDS.indexOf(b.field));
  return { filter: next, notices: all };
}

/** 라우팅 한 줄 — flow 는 순번 차례 공정코드, runSec 은 개당 시간(밀리초) 합을 초 글자로. */
export type RoutingListRow = {
  code: string;
  name: string;
  itemType: string;
  active: boolean;
  flow: string[];
  steps: number;
  setupMin: number;
  runSec: string;
};

/** 품목코드 차례. 찾기는 품목코드 · 품명(대소문자 무시). 공정 · 작업장은 그것을 쓰는 줄이 있는 라우팅만. 쿼리 한 번. */
export async function listRoutings(db: Db, filter: RoutingFilter): Promise<RoutingListRow[]> {
  const where: SQL[] = [];
  if (filter.q) where.push(or(ilike(items.code, likeLiteral(filter.q)), ilike(items.name, likeLiteral(filter.q)))!);
  if (filter.process)
    where.push(sql`exists (select 1 from ${routingSteps} x join ${processes} xp on xp.id = x.process_id
      where x.routing_id = ${routings.id} and xp.code = ${filter.process})`);
  if (filter.workCenter)
    where.push(sql`exists (select 1 from ${routingSteps} x join ${workCenters} xw on xw.id = x.work_center_id
      where x.routing_id = ${routings.id} and xw.code = ${filter.workCenter})`);
  const rows = await db
    .select({
      code: items.code,
      name: items.name,
      itemType: items.itemType,
      active: items.active,
      flow: sql<string | null>`string_agg(${processes.code}, ',' order by ${routingSteps.seq})`,
      steps: sql<number>`count(${routingSteps.id})::int`,
      setupMin: sql<number>`coalesce(sum(${routingSteps.setupMin}), 0)::int`,
      runMs: sql<number>`coalesce(sum(${routingSteps.runMs}), 0)::int`,
    })
    .from(routings)
    .innerJoin(items, eq(items.id, routings.itemId))
    .leftJoin(routingSteps, eq(routingSteps.routingId, routings.id))
    .leftJoin(processes, eq(processes.id, routingSteps.processId))
    .where(and(...where))
    .groupBy(items.id, routings.id)
    .orderBy(asc(items.code));
  return rows.map(({ flow, runMs, ...r }) => ({ ...r, flow: flow ? flow.split(",") : [], runSec: formatRunMs(runMs) }));
}
