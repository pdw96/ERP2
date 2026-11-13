import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import {
  BOM_SUBS_MAX,
  codeOf,
  formatLossRate,
  isUntouchedNewBom,
  ITEM_CODE,
  parseBom,
  type BomTreeValues,
  type BomErrors,
  type BomInquiryNotice,
  type BomInquiryQuery,
  type BomMode,
  type BomLineErrors,
  type BomValues,
  type ParsedBom,
  type ParsedBomLine,
} from "@/lib/bom-input";
import { eun, iga } from "@/lib/josa";
import { formatMilli, THOUSAND, ZERO, type Milli } from "@/lib/move-input";
import { limitMessage, REGISTER_LOCK, STALE, touched, VERSION, versionIs, versionOf } from "./master-shared";
import { bomChanges, bomLines, boms, items, unitSpecs } from "./schema";
import { milliOf } from "./stock";
import type { Db } from "./types";

// BOM 의 목록 · 열기 · 저장 · 지우기(조각 「BOM」 PR A, 설계 ② · ③, ADR 0026). 화면(src/app/production/bom/)은 이 함수만 부른다.
// - 부모는 반제품 · 완제품, 자품목은 원자재 · 반제품 · 부자재다. 소모품 · 완제품은 자품목이 되지 않는다(ADR 0026 의 3 · 7).
// - 저장은 머리와 줄 전체를 한 트랜잭션에서 바꾼다 — 화면이 보낸 줄이 그 BOM 의 줄이 된다(줄 지우기는 화면에서 줄을 빼고 저장).
// - 저장 · 지우기는 BOM 의 잠금(REGISTER_LOCK.bom)을 쥐고 돈다. 돌고 도는 BOM 은 그 잠금 아래 BOM 전체를 따라가 막는다 — 같은 순간의 두 저장
//   (A 아래 B · B 아래 A)이 함께 서지 못한다. 품목의 단위를 바꾸는 고침도 같은 잠금을 쥐고 BOM 에 든 품목인지 센다(src/db/items.ts).

/** BOM 줄 전체의 등록 상한(설계 ②) — 매일 밤 되돌림이 샘플 수로 줄인다. BOM 머리는 품목마다 하나라 품목 상한을 넘지 않는다. */
export const BOM_LINE_LIMIT = 20000;

const PARENT_TYPES = ["SF", "FG"] as const;
const CHILD_TYPES = ["RM", "SF", "SM"] as const;
const isParentType = (t: string) => (PARENT_TYPES as readonly string[]).includes(t);
const isChildType = (t: string) => (CHILD_TYPES as readonly string[]).includes(t);

/** 품목 한 줄 — 단위의 소수 자릿수까지. */
export type BomItem = {
  id: number;
  code: string;
  name: string;
  spec: string;
  itemType: string;
  unit: string;
  decimals: number;
  active: boolean;
};

const itemColumns = {
  id: items.id,
  code: items.code,
  name: items.name,
  spec: items.spec,
  itemType: items.itemType,
  unit: items.unit,
  decimals: sql<number>`coalesce(${unitSpecs.decimals}, 3)`,
  active: items.active,
};

/** 천분의 일 단위의 수량을 입력칸의 글자로 — 쉼표 없이(1500 → 「1.5」, 1000000 → 「1000」). */
export function plainMilli(q: Milli): string {
  const int = q / THOUSAND;
  const frac = String(q % THOUSAND)
    .padStart(3, "0")
    .replace(/0+$/, "");
  return frac ? `${int}.${frac}` : String(int);
}

/** DB 의 numeric 칸에 넣는 글자 — 소수 셋째 자리까지 그대로. */
const numericOf = (q: Milli) => `${q / THOUSAND}.${String(q % THOUSAND).padStart(3, "0")}`;
/** 로스율(백분의 일 단위)을 DB 의 numeric 칸에 넣는 글자. */
const lossNumericOf = (h: number) => `${Math.trunc(h / 100)}.${String(h % 100).padStart(2, "0")}`;
/** DB 의 로스율(5.25 따위)을 백분의 일 단위로. */
const lossOf = (v: number | string) => Math.round(Number(v) * 100);

const decimalsRule = (unit: string, d: number) =>
  d === 0 ? `단위 ${eun(unit)} 정수로 넣습니다` : `단위 ${eun(unit)} 소수 ${d}자리까지 넣습니다`;

/** BOM 을 고치는 저장 · 지우기 · 품목 단위 고침이 쥐는 잠금 — 트랜잭션이 끝나면 저절로 풀린다. */
export async function lockBom(tx: Db): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(${REGISTER_LOCK.bom})`);
}

/** 이 품목들 가운데 BOM 에 든 것(부모 · 자품목) — 단위를 바꾸지 못한다(ADR 0026 의 11). 부르는 쪽이 lockBom 을 쥔 뒤 부른다. */
export async function itemsInBoms(tx: Db, itemIds: readonly number[]): Promise<Set<number>> {
  if (itemIds.length === 0) return new Set();
  const asParent = await tx
    .select({ id: boms.itemId })
    .from(boms)
    .where(inArray(boms.itemId, [...itemIds]));
  const asChild = await tx
    .selectDistinct({ id: bomLines.childItemId })
    .from(bomLines)
    .where(inArray(bomLines.childItemId, [...itemIds]));
  return new Set([...asParent, ...asChild].map((r) => r.id));
}

/**
 * 이 단위의 BOM 수량이 소수 decimals 자리에 다 맞는가 — 부모가 이 단위인 BOM 의 기준수량, 자품목이 이 단위인 줄의 소요량.
 * 단위의 자릿수를 줄이는 고침(src/db/codes.ts)이 부른다 — 부르는 쪽이 lockBom 을 쥔 뒤 부른다.
 */
export async function bomQuantitiesFit(tx: Db, unit: string, decimals: number): Promise<boolean> {
  const [{ heads }] = await tx
    .select({ heads: count() })
    .from(boms)
    .innerJoin(items, eq(items.id, boms.itemId))
    .where(and(eq(items.unit, unit), sql`${boms.baseQty} <> round(${boms.baseQty}, ${decimals}::int)`));
  const [{ lines }] = await tx
    .select({ lines: count() })
    .from(bomLines)
    .innerJoin(items, eq(items.id, bomLines.childItemId))
    .where(and(eq(items.unit, unit), sql`${bomLines.qty} <> round(${bomLines.qty}, ${decimals}::int)`));
  return heads === 0 && lines === 0;
}

// ── 목록 ─────────────────────────────────────────────

export type BomListRow = {
  code: string;
  name: string;
  spec: string;
  itemType: string;
  unit: string;
  active: boolean;
  baseQty: string;
  lines: number;
};

/** BOM 이 있는 부모 품목 — 품목코드 차례. */
export async function listBoms(db: Db): Promise<BomListRow[]> {
  const rows = await db
    .select({
      code: items.code,
      name: items.name,
      spec: items.spec,
      itemType: items.itemType,
      unit: items.unit,
      active: items.active,
      baseQty: boms.baseQty,
      lines: sql<number>`(select count(*) from ${bomLines} where ${bomLines.bomId} = ${boms.id})::int`,
    })
    .from(boms)
    .innerJoin(items, eq(items.id, boms.itemId))
    .orderBy(asc(items.code));
  return rows.map((r) => ({ ...r, baseQty: formatMilli(milliOf(r.baseQty)), lines: Number(r.lines) }));
}

export type BomItemOption = Omit<BomItem, "id">;

/** 새 BOM 의 부모(BOM 이 아직 없는 「사용」 반제품 · 완제품)와 자품목으로 고를 품목(「사용」 원자재 · 반제품 · 부자재). */
export async function bomFormOptions(db: Db): Promise<{ newParents: BomItemOption[]; children: BomItemOption[] }> {
  const all = await db
    .select({ ...itemColumns, hasBom: sql<boolean>`${boms.id} is not null` })
    .from(items)
    .leftJoin(unitSpecs, eq(unitSpecs.unit, items.unit))
    .leftJoin(boms, eq(boms.itemId, items.id))
    .where(eq(items.active, true))
    .orderBy(asc(items.code));
  const option = (i: (typeof all)[number]): BomItemOption => ({
    code: i.code,
    name: i.name,
    spec: i.spec,
    itemType: i.itemType,
    unit: i.unit,
    decimals: Number(i.decimals),
    active: i.active,
  });
  return {
    newParents: all.filter((i) => isParentType(i.itemType) && !i.hasBom).map(option),
    children: all.filter((i) => isChildType(i.itemType)).map(option),
  };
}

// ── 열기 ─────────────────────────────────────────────

export type BomSheetLine = {
  /** 저장된 줄 번호 — 화면이 원래 번호로 돌려보내 고친 이력에서 줄을 가른다(PR C). */
  lineNo: number;
  childCode: string;
  childName: string;
  childType: string;
  unit: string;
  active: boolean;
  qty: string;
  lossRate: string;
  validFrom: string;
  validTo: string;
  note: string;
};

/** 한 BOM 의 입력 — 있으면 버전 · 기준수량 · 줄, 없으면(새 BOM) 버전이 없다. */
export type BomSheet = {
  parent: BomItemOption;
  version: string | null;
  baseQty: string;
  lines: BomSheetLine[];
};

async function itemByCode(db: Db, code: string): Promise<BomItem | undefined> {
  if (!ITEM_CODE.test(code)) return undefined;
  const [row] = await db
    .select(itemColumns)
    .from(items)
    .leftJoin(unitSpecs, eq(unitSpecs.unit, items.unit))
    .where(eq(items.code, code));
  return row && { ...row, decimals: Number(row.decimals) };
}

async function headerOf(db: Db, itemId: number) {
  const [row] = await db
    .select({ id: boms.id, baseQty: boms.baseQty, version: versionOf(boms.updatedAt) })
    .from(boms)
    .where(eq(boms.itemId, itemId));
  return row;
}

/** 부모 품목의 BOM 을 연다 — 없는 품목 · 부모가 될 수 없는 품목은 까닭을 돌려준다. */
export async function openBomSheet(
  db: Db,
  code: string,
): Promise<{ ok: true; sheet: BomSheet } | { ok: false; message: string }> {
  const parent = await itemByCode(db, code);
  if (!parent) return { ok: false, message: "없는 품목입니다" };
  if (!isParentType(parent.itemType))
    return {
      ok: false,
      message: "BOM 은 반제품 · 완제품에만 있습니다 — 원자재 · 부자재 · 소모품은 BOM 의 부모가 되지 않습니다",
    };
  const { id: parentId, ...parentOption } = parent;
  const header = await headerOf(db, parentId);
  if (!header) {
    if (!parent.active) return { ok: false, message: "「사용 안 함」 품목이라 새 BOM 을 만들지 못합니다" };
    return { ok: true, sheet: { parent: parentOption, version: null, baseQty: "", lines: [] } };
  }
  const rows = await db
    .select({
      lineNo: bomLines.lineNo,
      childCode: items.code,
      childName: items.name,
      childType: items.itemType,
      unit: items.unit,
      active: items.active,
      qty: bomLines.qty,
      lossRate: bomLines.lossRate,
      validFrom: bomLines.validFrom,
      validTo: bomLines.validTo,
      note: bomLines.note,
    })
    .from(bomLines)
    .innerJoin(items, eq(items.id, bomLines.childItemId))
    .where(eq(bomLines.bomId, header.id))
    .orderBy(asc(bomLines.lineNo));
  return {
    ok: true,
    sheet: {
      parent: parentOption,
      version: header.version,
      baseQty: plainMilli(milliOf(header.baseQty)),
      lines: rows.map((r) => ({
        ...r,
        qty: plainMilli(milliOf(r.qty)),
        lossRate: formatLossRate(lossOf(r.lossRate)),
        validTo: r.validTo ?? "",
      })),
    },
  };
}

// ── 저장 ─────────────────────────────────────────────
// 한 BOM 화면의 저장은 맨 위 BOM 과 펼친 반제품 BOM 들을 한 트랜잭션에서 한다(조각 「BOM」 PR C, ADR 0028 의 1 · 2). 하나라도 틀리면 아무것도 저장하지
// 않는다. 바꾸지 않은 BOM 은 버전도 이력도 그대로 두고, 바꾼 BOM 마다 고친 이력을 같은 트랜잭션에서 남긴다(ADR 0028 의 3).

/** 고친 이력 전체의 등록 상한(설계 「2026-11-13 — 범위에 더한 것」 ②) — 매일 밤 되돌림이 비운다. */
export const BOM_CHANGE_LIMIT = 50000;

export type BomSaveResult =
  { ok: true; code: string; version: string } | { ok: false; errors: BomErrors; formError?: string; values: BomValues };

/** 펼친 반제품 BOM 하나의 거절 — 칸마다의 까닭과 BOM 전체의 까닭. */
export type BomSubFailure = { errors: BomErrors; formError?: string };

export type BomTreeSaveResult =
  | { ok: true; code: string; version: string; changed: string[] }
  | {
      ok: false;
      errors: BomErrors;
      formError?: string;
      /** 펼친 반제품 BOM 의 거절 — 부모 품목코드마다. */
      subs: Record<string, BomSubFailure>;
      values: BomTreeValues;
    };

const NOT_PARENT = "BOM 의 부모는 반제품 · 완제품입니다";
const childTypeError = (type: string) =>
  type === "CS"
    ? "소모품은 BOM 에 넣지 않습니다"
    : type === "FG"
      ? "완제품은 자품목이 되지 않습니다"
      : "자품목은 원자재 · 반제품 · 부자재입니다";

const overlaps = (a: ParsedBomLine, b: ParsedBomLine) =>
  (a.validTo === null || a.validTo >= b.validFrom) && (b.validTo === null || b.validTo >= a.validFrom);

/** 같은 자품목의 줄끼리 적용 기간이 겹치면 뒤 줄에 까닭을 붙인다(ADR 0026 의 4 · 9 — 종료일은 그날까지). */
function overlapErrors(lines: readonly ParsedBomLine[], errors: Record<number, BomLineErrors>) {
  lines.forEach((l, i) => {
    const before = lines.slice(0, i).find((p) => p.childCode === l.childCode && overlaps(p, l));
    if (before)
      errors[l.index] = {
        ...errors[l.index],
        validFrom: `같은 자품목의 줄 ${before.index + 1}과 적용 기간이 겹칩니다 — 옛 줄에 종료일을 넣거나 시작일을 뒤로 미루세요`,
      };
  });
}

/**
 * 고친 BOM 들의 새 줄을 두면 돌고 도는가 — DB 의 다른 BOM 의 모든 줄(적용일자와 상관없이, ADR 0026 의 8)과 이 저장이 고치는 BOM 들의 새 줄(edits —
 * 부모 → 새 자품목들)을 함께 따라간다. 고치는 BOM 마다, 새 자품목에서 그 부모로 돌아오는 가장 짧은 길(부모에서 시작해 부모로 끝남)을 자품목마다 돌려준다.
 * 부르는 쪽이 lockBom 을 쥔 뒤 부른다.
 */
async function cyclesOf(
  tx: Db,
  edits: ReadonlyMap<number, readonly number[]>,
): Promise<Map<number, Map<number, number[]>>> {
  const edited = [...edits.keys()];
  const edges = await tx
    .select({ from: bomLines.parentItemId, to: bomLines.childItemId })
    .from(bomLines)
    .where(edited.length ? sql`${bomLines.parentItemId} not in (${sql.join(edited, sql`, `)})` : sql`true`);
  const next = new Map<number, Set<number>>();
  const link = (from: number, to: number) => {
    if (!next.has(from)) next.set(from, new Set());
    next.get(from)!.add(to);
  };
  for (const e of edges) link(e.from, e.to);
  for (const [from, tos] of edits) for (const to of tos) link(from, to);

  const found = new Map<number, Map<number, number[]>>();
  for (const [parentId, childIds] of edits) {
    for (const start of new Set(childIds)) {
      // 넓이 우선으로 start 에서 parent 까지 — 가장 짧은 길.
      const prev = new Map<number, number>([[start, start]]);
      const queue = [start];
      while (queue.length && !prev.has(parentId)) {
        const at = queue.shift()!;
        for (const to of next.get(at) ?? []) {
          if (prev.has(to)) continue;
          prev.set(to, at);
          queue.push(to);
        }
      }
      if (start !== parentId && !prev.has(parentId)) continue;
      // prev 를 거꾸로 따라 parent ← … ← start 를 모은 뒤 뒤집으면 start → … → parent 다. 길은 부모 → start → … → 부모.
      const back = [parentId];
      for (let at = parentId; at !== start;) {
        at = prev.get(at)!;
        back.push(at);
      }
      if (!found.has(parentId)) found.set(parentId, new Map());
      found.get(parentId)!.set(start, [parentId, ...back.reverse()]);
    }
  }
  return found;
}

/** 저장할 BOM 하나 — 맨 위(code 가 맨 위 품목) 또는 펼친 반제품. */
type Plan = {
  key: string;
  isRoot: boolean;
  values: BomValues;
  parsed: ParsedBom;
  parent?: BomItem;
  header?: { id: number; baseQty: number; version: string };
  errors: BomErrors;
  formError?: string;
};

type StoredLine = {
  lineNo: number;
  childItemId: number;
  qty: Milli;
  lossRate: number;
  validFrom: string;
  validTo: string | null;
  note: string;
};

async function storedLines(tx: Db, bomId: number): Promise<StoredLine[]> {
  const rows = await tx
    .select({
      lineNo: bomLines.lineNo,
      childItemId: bomLines.childItemId,
      qty: bomLines.qty,
      lossRate: bomLines.lossRate,
      validFrom: bomLines.validFrom,
      validTo: bomLines.validTo,
      note: bomLines.note,
    })
    .from(bomLines)
    .where(eq(bomLines.bomId, bomId))
    .orderBy(asc(bomLines.lineNo));
  return rows.map((r) => ({ ...r, qty: milliOf(r.qty), lossRate: lossOf(r.lossRate) }));
}

type ChangeRow = {
  parentItemId: number;
  kind: "BOM_ADD" | "BOM_DEL" | "BASE" | "LINE_ADD" | "LINE_DEL" | "LINE_EDIT";
  childItemId?: number;
  lineNo?: number;
  before?: Record<string, string>;
  after?: Record<string, string>;
};

/** 고친 이력에 남기는 줄의 칸 — 보이는 글자 그대로(소요량은 쉼표, 로스율은 %, 종료일은 비면 빈 글자). */
const lineFields = (l: { qty: Milli; lossRate: number; validFrom: string; validTo: string | null; note: string }) => ({
  qty: formatMilli(l.qty),
  lossRate: formatLossRate(l.lossRate),
  validFrom: l.validFrom,
  validTo: l.validTo ?? "",
  note: l.note,
});

/** 이력에 남길 때의 단위 — 부모 단위(기준수량)와 자품목마다의 단위(소요량). */
type ChangeUnits = { parent: string; child: (childItemId: number) => string };

/**
 * 이력의 전 · 후에 그때의 단위(`unit`)를 함께 남긴다 — 품목이 BOM 에서 빠진 뒤 단위가 바뀌어도 옛 수량의 뜻이 그대로다(PR C 리뷰 1회차, 설계 「경계를 정했다
 * (2026-11-13, PR C 1회차)」). 기준수량의 구분은 부모 단위, 줄의 구분은 자품목 단위다.
 */
function withUnits(rows: ChangeRow[], units: ChangeUnits): ChangeRow[] {
  return rows.map((r) => {
    const unit = r.childItemId === undefined ? units.parent : units.child(r.childItemId);
    return {
      ...r,
      before: r.before && { ...r.before, unit },
      after: r.after && { ...r.after, unit },
    };
  });
}

/**
 * 고친 이력 — 옛 머리 · 줄(없으면 새 BOM)과 새 머리 · 줄을 견준다. 새 줄의 원래 번호(origLineNo)가 옛 줄을 가리키고 자품목이 같으면 「줄 고침」(바뀐 칸만),
 * 아니면 「줄 더함」이고, 가리켜지지 않은 옛 줄은 「줄 뺌」이다. 바뀐 것이 없으면 빈 목록이다. 전 · 후마다 그때의 단위가 붙는다.
 */
export function changesOf(
  parentItemId: number,
  old: { baseQty: Milli; lines: readonly StoredLine[] } | undefined,
  next: { baseQty: Milli; lines: readonly (ParsedBomLine & { childItemId: number })[] },
  units: ChangeUnits,
): ChangeRow[] {
  return withUnits(diffOf(parentItemId, old, next), units);
}

function diffOf(
  parentItemId: number,
  old: { baseQty: Milli; lines: readonly StoredLine[] } | undefined,
  next: { baseQty: Milli; lines: readonly (ParsedBomLine & { childItemId: number })[] },
): ChangeRow[] {
  const rows: ChangeRow[] = [];
  if (!old) {
    rows.push({ parentItemId, kind: "BOM_ADD", after: { baseQty: formatMilli(next.baseQty) } });
    next.lines.forEach((l, i) =>
      rows.push({ parentItemId, kind: "LINE_ADD", childItemId: l.childItemId, lineNo: i + 1, after: lineFields(l) }),
    );
    return rows;
  }
  if (old.baseQty !== next.baseQty)
    rows.push({
      parentItemId,
      kind: "BASE",
      before: { baseQty: formatMilli(old.baseQty) },
      after: { baseQty: formatMilli(next.baseQty) },
    });
  const byNo = new Map(old.lines.map((l) => [l.lineNo, l] as const));
  const used = new Set<number>();
  next.lines.forEach((l, i) => {
    const was = l.origLineNo === null ? undefined : byNo.get(l.origLineNo);
    if (was && !used.has(was.lineNo) && was.childItemId === l.childItemId) {
      used.add(was.lineNo);
      const [a, b] = [lineFields(was), lineFields(l)];
      const keys = (Object.keys(a) as (keyof typeof a)[]).filter((k) => a[k] !== b[k]);
      if (keys.length)
        rows.push({
          parentItemId,
          kind: "LINE_EDIT",
          childItemId: l.childItemId,
          lineNo: i + 1,
          before: Object.fromEntries(keys.map((k) => [k, a[k]])),
          after: Object.fromEntries(keys.map((k) => [k, b[k]])),
        });
      return;
    }
    rows.push({ parentItemId, kind: "LINE_ADD", childItemId: l.childItemId, lineNo: i + 1, after: lineFields(l) });
  });
  for (const l of old.lines)
    if (!used.has(l.lineNo))
      rows.push({
        parentItemId,
        kind: "LINE_DEL",
        childItemId: l.childItemId,
        lineNo: l.lineNo,
        before: lineFields(l),
      });
  return rows;
}

/** 옛 BOM 과 새 BOM 이 같은가 — 기준수량과 줄(차례 · 자품목 · 소요량 · 로스율 · 적용일자 · 비고)이 다 같으면 바꾸지 않은 것이다. */
function sameBom(
  old: { baseQty: Milli; lines: readonly StoredLine[] },
  next: { baseQty: Milli; lines: readonly (ParsedBomLine & { childItemId: number })[] },
): boolean {
  return (
    old.baseQty === next.baseQty &&
    old.lines.length === next.lines.length &&
    old.lines.every((o, i) => {
      const n = next.lines[i];
      return (
        o.childItemId === n.childItemId &&
        o.qty === n.qty &&
        o.lossRate === n.lossRate &&
        o.validFrom === n.validFrom &&
        o.validTo === n.validTo &&
        o.note === n.note
      );
    })
  );
}

/** 지금 고친 이력의 줄 수가 상한 안에 더 들어가는가. */
async function changeRoom(tx: Db, adding: number): Promise<boolean> {
  const [{ n }] = await tx.select({ n: count() }).from(bomChanges);
  return n + adding <= BOM_CHANGE_LIMIT;
}

async function recordChanges(tx: Db, rows: readonly ChangeRow[]) {
  if (rows.length)
    await tx.insert(bomChanges).values(
      rows.map((r) => ({
        parentItemId: r.parentItemId,
        kind: r.kind,
        childItemId: r.childItemId ?? null,
        lineNo: r.lineNo ?? null,
        before: r.before ?? null,
        after: r.after ?? null,
      })),
    );
}

/**
 * 한 BOM 화면의 저장 — 맨 위 BOM 과 펼친 반제품 BOM 들(ADR 0028 의 1). 모두 한 트랜잭션에서, BOM 마다 PR A 의 검사(유형 · 「사용 안 함」 · 단위 자릿수 ·
 * 적용 기간 · 버전 · 상한)를 그대로 하고, 돌고 도는 BOM 은 고치는 BOM 들의 새 줄을 함께 넣어 본다. 펼친 반제품은 맨 위나 다른 펼친 BOM 의 자품목이어야 한다.
 * 바꾸지 않은 BOM 은 고치지 않고(버전 · 이력 그대로), 화면을 연 뒤 남이 고친 BOM 을 바꾸려 하면 통째로 거절한다.
 */
export async function saveBoms(db: Db, tree: BomTreeValues): Promise<BomTreeSaveResult> {
  const subsFailed: Record<string, BomSubFailure> = {};
  const fail = (errors: BomErrors, formError?: string): BomTreeSaveResult => ({
    ok: false,
    errors,
    formError,
    subs: subsFailed,
    values: tree,
  });
  const empty = (): BomErrors => ({ header: {}, lines: {} });

  const rootParsed = parseBom(tree.root);
  const subValues = tree.subs.filter((v) => !isUntouchedNewBom(v));
  if (subValues.length > BOM_SUBS_MAX)
    return fail(empty(), `반제품 BOM 은 한 번에 ${BOM_SUBS_MAX}개까지 함께 저장합니다`);
  const subsParsed = subValues.map((v, k) => {
    const r = parseBom(v);
    const key = codeOf((v.parent ?? "").trim()) || `#${k + 1}`;
    if (!r.ok) subsFailed[key] = { errors: r.errors, formError: r.formError };
    return { key, values: v, r };
  });
  if (!rootParsed.ok || Object.keys(subsFailed).length)
    return fail(rootParsed.ok ? empty() : rootParsed.errors, rootParsed.ok ? undefined : rootParsed.formError);

  const plans: Plan[] = [
    { key: rootParsed.value.parentCode, isRoot: true, values: tree.root, parsed: rootParsed.value, errors: empty() },
    ...subsParsed.map(({ key, values, r }) => ({
      key,
      isRoot: false,
      values,
      parsed: (r as Extract<typeof r, { ok: true }>).value,
      errors: empty(),
    })),
  ];
  const seen = new Set<string>();
  for (const p of plans) {
    if (p.parsed.version && !VERSION.test(p.parsed.version)) p.formError = STALE;
    if (seen.has(p.key)) p.formError = "같은 반제품의 BOM 을 두 번 펼쳤습니다 — 화면을 새로 여세요";
    seen.add(p.key);
  }
  // 펼친 반제품은 이 저장의 어느 BOM 의 자품목 줄에 있어야 한다 — 맨 위 BOM 과 상관없는 BOM 을 이 입구로 고치지 못한다.
  const childCodes = new Set(plans.flatMap((p) => p.parsed.lines.map((l) => l.childCode)));
  for (const p of plans)
    if (!p.isRoot && !childCodes.has(p.key))
      p.formError ??= "이 반제품이 위 BOM 의 자품목 줄에 없습니다 — 줄을 지웠으면 펼친 BOM 도 저장되지 않습니다";

  const collect = (): BomTreeSaveResult | undefined => {
    for (const p of plans.slice(1))
      if (p.formError || Object.keys(p.errors.header).length || Object.keys(p.errors.lines).length)
        subsFailed[p.key] = { errors: p.errors, formError: p.formError };
    const root = plans[0];
    const rootBad = !!root.formError || Object.keys(root.errors.header).length || Object.keys(root.errors.lines).length;
    if (rootBad || Object.keys(subsFailed).length) return fail(root.errors, root.formError);
    return undefined;
  };
  const early = collect();
  if (early) return early;

  return db.transaction(async (tx): Promise<BomTreeSaveResult> => {
    await lockBom(tx);

    const codes = [...new Set([...plans.map((p) => p.parsed.parentCode), ...childCodes])];
    const known = new Map<string, BomItem>();
    for (const c of await tx
      .select(itemColumns)
      .from(items)
      .leftJoin(unitSpecs, eq(unitSpecs.unit, items.unit))
      .where(inArray(items.code, codes)))
      known.set(c.code, { ...c, decimals: Number(c.decimals) });

    for (const p of plans) {
      const v = p.parsed;
      const e = p.errors;
      const parent = known.get(v.parentCode);
      if (!parent) e.header.parent = "없는 품목입니다 — 목록에서 고르세요";
      else if (!isParentType(parent.itemType)) e.header.parent = NOT_PARENT;
      if (!parent || e.header.parent) continue;
      p.parent = parent;
      p.header = await headerOf(tx, parent.id);
      if (!p.header && v.version) p.formError ??= "BOM 이 그 사이 지워졌습니다 — 화면을 새로 열어 다시 넣으세요";
      if (!p.header && !parent.active) e.header.parent = "「사용 안 함」 품목이라 새 BOM 을 만들지 못합니다";
      if (v.baseQtyDecimals > parent.decimals) e.header.baseQty = decimalsRule(parent.unit, parent.decimals);

      const already = new Set<number>(
        p.header
          ? (await tx.select({ id: bomLines.childItemId }).from(bomLines).where(eq(bomLines.bomId, p.header.id))).map(
              (r) => r.id,
            )
          : [],
      );
      for (const l of v.lines) {
        const c = known.get(l.childCode);
        const le: BomLineErrors = {};
        if (!c) le.child = "없는 품목입니다 — 목록에서 고르세요";
        else if (!isChildType(c.itemType)) le.child = childTypeError(c.itemType);
        else if (!c.active && !already.has(c.id)) le.child = "「사용 안 함」 품목은 새로 넣지 못합니다";
        else if (l.qtyDecimals > c.decimals) le.qty = decimalsRule(c.unit, c.decimals);
        if (Object.keys(le).length) e.lines[l.index] = le;
      }
      overlapErrors(v.lines, e.lines);
    }

    // 돌고 도는 BOM — 고치는 BOM 들의 새 줄을 함께 넣고 본다(같은 저장에서 A 아래 B · B 아래 A 도 잡힌다).
    const edits = new Map<number, number[]>();
    for (const p of plans)
      if (p.parent)
        edits.set(
          p.parent.id,
          p.parsed.lines.filter((l) => !p.errors.lines[l.index]?.child).map((l) => known.get(l.childCode)!.id),
        );
    const cycles = await cyclesOf(tx, edits);
    if (cycles.size) {
      const ids = [...new Set([...cycles.values()].flatMap((m) => [...m.values()].flat()))];
      const names = new Map(
        (await tx.select({ id: items.id, name: items.name }).from(items).where(inArray(items.id, ids))).map(
          (r) => [r.id, r.name] as const,
        ),
      );
      for (const p of plans) {
        const found = p.parent && cycles.get(p.parent.id);
        if (!found) continue;
        const parentName = p.parent!.name;
        for (const l of p.parsed.lines) {
          const child = known.get(l.childCode);
          const path = child && found.get(child.id);
          if (!path) continue;
          p.errors.lines[l.index] = {
            ...p.errors.lines[l.index],
            child: `${l.childCode === p.parsed.parentCode ? "" : `「${child!.name}」 아래에 `}「${parentName}」${iga(parentName).slice(parentName.length)} 있어 돌고 돕니다 — ${path.map((id) => names.get(id)).join(" → ")}`,
          };
        }
      }
    }
    const checked = collect();
    if (checked) return checked;

    // 바꾼 BOM 만 고친다. 바꾸려는 BOM 이 화면을 연 뒤 남에게 고쳐졌으면 통째로 거절한다.
    type Write = {
      plan: Plan;
      lines: (ParsedBomLine & { childItemId: number })[];
      old?: { baseQty: Milli; lines: StoredLine[] };
    };
    const writes: Write[] = [];
    for (const p of plans) {
      const lines = p.parsed.lines.map((l) => ({ ...l, childItemId: known.get(l.childCode)!.id }));
      const next = { baseQty: p.parsed.baseQty, lines };
      if (!p.header) {
        writes.push({ plan: p, lines });
        continue;
      }
      const old = { baseQty: milliOf(p.header.baseQty), lines: await storedLines(tx, p.header.id) };
      if (sameBom(old, next)) continue;
      if (p.header.version !== p.parsed.version) p.formError = STALE;
      writes.push({ plan: p, lines, old });
    }
    const stale = collect();
    if (stale) return stale;

    const writtenIds = writes.flatMap((w) => (w.plan.header ? [w.plan.header.id] : []));
    const [{ n }] = await tx
      .select({ n: count() })
      .from(bomLines)
      .where(writtenIds.length ? sql`${bomLines.bomId} not in (${sql.join(writtenIds, sql`, `)})` : sql`true`);
    if (n + writes.reduce((s, w) => s + w.lines.length, 0) > BOM_LINE_LIMIT)
      return fail(plans[0].errors, limitMessage("BOM 줄", BOM_LINE_LIMIT));
    // 자품목의 단위 — 새 줄은 이미 읽은 품목, 뺀 줄의 자품목은 따로 읽는다.
    const unitById = new Map([...known.values()].map((i) => [i.id, i.unit] as const));
    const missing = [...new Set(writes.flatMap((w) => (w.old?.lines ?? []).map((l) => l.childItemId)))].filter(
      (id) => !unitById.has(id),
    );
    if (missing.length)
      for (const r of await tx.select({ id: items.id, unit: items.unit }).from(items).where(inArray(items.id, missing)))
        unitById.set(r.id, r.unit);
    const changes = writes.flatMap((w) =>
      changesOf(
        w.plan.parent!.id,
        w.old,
        { baseQty: w.plan.parsed.baseQty, lines: w.lines },
        { parent: w.plan.parent!.unit, child: (id) => unitById.get(id)! },
      ),
    );
    if (!(await changeRoom(tx, changes.length)))
      return fail(plans[0].errors, limitMessage("BOM 고친 이력", BOM_CHANGE_LIMIT));

    for (const { plan, lines } of writes) {
      const parent = plan.parent!;
      const base = numericOf(plan.parsed.baseQty) as unknown as number;
      let bomId: number;
      if (plan.header) {
        await tx
          .update(boms)
          .set({ baseQty: base, updatedAt: touched() })
          .where(and(eq(boms.id, plan.header.id), versionIs(boms.updatedAt, plan.header.version)));
        await tx.delete(bomLines).where(eq(bomLines.bomId, plan.header.id));
        bomId = plan.header.id;
      } else {
        const [made] = await tx
          .insert(boms)
          .values({ itemId: parent.id, baseQty: base, updatedAt: touched() })
          .returning({ id: boms.id });
        bomId = made.id;
      }
      await tx.insert(bomLines).values(
        lines.map((l, i) => ({
          bomId,
          parentItemId: parent.id,
          lineNo: i + 1,
          childItemId: l.childItemId,
          qty: numericOf(l.qty) as unknown as number,
          lossRate: lossNumericOf(l.lossRate) as unknown as number,
          validFrom: l.validFrom,
          validTo: l.validTo,
          note: l.note,
        })),
      );
    }
    await recordChanges(tx, changes);
    const root = plans[0].parent!;
    const saved = await headerOf(tx, root.id);
    return { ok: true, code: root.code, version: saved!.version, changed: writes.map((w) => w.plan.parent!.code) };
  });
}

/** BOM 하나의 저장 — 펼친 반제품 없이 saveBoms 를 부른다(샘플 · 되돌림 · PR A 의 입구). */
export async function saveBom(db: Db, values: BomValues): Promise<BomSaveResult> {
  const r = await saveBoms(db, { root: values, subs: [] });
  if (r.ok) return { ok: true, code: r.code, version: r.version };
  return { ok: false, errors: r.errors, formError: r.formError, values };
}

// ── 지우기 ───────────────────────────────────────────

/** BOM 지우기 — 머리와 줄을 함께. 화면을 연 때의 버전이 맞을 때만(ADR 0026 의 12). 지운 것을 고친 이력에 남긴다(ADR 0028 의 3). */
export async function deleteBom(
  db: Db,
  code: string,
  version: string,
): Promise<{ ok: true; code: string } | { ok: false; notFound: true } | { ok: false; formError: string }> {
  if (!ITEM_CODE.test(code)) return { ok: false, notFound: true };
  if (!VERSION.test(version)) return { ok: false, formError: STALE };
  return db.transaction(async (tx) => {
    await lockBom(tx);
    const parent = await itemByCode(tx, code);
    const header = parent && (await headerOf(tx, parent.id));
    if (!parent || !header) return { ok: false, notFound: true } as const;
    if (header.version !== version) return { ok: false, formError: STALE } as const;
    const lines = await storedLines(tx, header.id);
    const childIds = [...new Set(lines.map((l) => l.childItemId))];
    const unitById = new Map(
      childIds.length
        ? (await tx.select({ id: items.id, unit: items.unit }).from(items).where(inArray(items.id, childIds))).map(
            (r) => [r.id, r.unit] as const,
          )
        : [],
    );
    const changes: ChangeRow[] = withUnits(
      [
        { parentItemId: parent.id, kind: "BOM_DEL", before: { baseQty: formatMilli(milliOf(header.baseQty)) } },
        ...lines.map((l): ChangeRow => ({
          parentItemId: parent.id,
          kind: "LINE_DEL",
          childItemId: l.childItemId,
          lineNo: l.lineNo,
          before: lineFields(l),
        })),
      ],
      { parent: parent.unit, child: (id) => unitById.get(id)! },
    );
    if (!(await changeRoom(tx, changes.length)))
      return { ok: false, formError: limitMessage("BOM 고친 이력", BOM_CHANGE_LIMIT) } as const;
    await tx.delete(bomLines).where(eq(bomLines.bomId, header.id));
    await tx.delete(boms).where(eq(boms.id, header.id));
    await recordChanges(tx, changes);
    return { ok: true, code } as const;
  });
}

// ── 펼쳐 넣기 · 고친 이력 읽기(조각 「BOM」 PR C) ────────────────────────

export type SubBom = {
  sheet: BomSheet;
  /** 이 반제품을 자품목으로 쓰는 BOM 의 부모 — 품목코드 차례. 여기서 고치면 그 BOM 에도 같이 바뀐다(ADR 0028 의 2). */
  usedBy: { code: string; name: string }[];
};

/** 펼칠 반제품의 BOM — 반제품만 펼친다. BOM 이 없으면 새 BOM 의 빈 칸(「사용 안 함」이면 펼치지 못함). */
export async function openSubBom(
  db: Db,
  code: string,
): Promise<{ ok: true; sub: SubBom } | { ok: false; message: string }> {
  const item = await itemByCode(db, code);
  if (!item) return { ok: false, message: "없는 품목입니다" };
  if (item.itemType !== "SF") return { ok: false, message: "펼쳐 넣는 것은 반제품의 BOM 입니다" };
  const opened = await openBomSheet(db, code);
  if (!opened.ok) return opened;
  const usedBy = await db
    .selectDistinct({ code: items.code, name: items.name })
    .from(bomLines)
    .innerJoin(items, eq(items.id, bomLines.parentItemId))
    .where(eq(bomLines.childItemId, item.id))
    .orderBy(asc(items.code));
  return { ok: true, sub: { sheet: opened.sheet, usedBy } };
}

export type BomChangeKind = ChangeRow["kind"];

export type BomChangeEntry = {
  id: number;
  /** 한국 시각의 일시(YYYY-MM-DD HH:mm) — 보이는 글자. */
  savedAt: string;
  /** 한 저장을 가르는 열쇠 — 일시 전체(같은 분의 두 저장도 갈린다). */
  saveKey: string;
  kind: BomChangeKind;
  child?: { code: string; name: string; unit: string };
  lineNo?: number;
  before: Record<string, string>;
  after: Record<string, string>;
};

/** 한 BOM 화면에서 보이는 고친 이력의 줄 수 상한 — 그 품목의 이력 줄 수는 따로 센다. */
export const BOM_HISTORY_SHOWN = 100;

/** 한 품목의 BOM 고친 이력 — 최근 저장부터, 한 저장 안은 남긴 차례로(ADR 0028 의 3). 지운 BOM 의 이력도 든다. */
export async function bomHistory(db: Db, code: string): Promise<{ total: number; entries: BomChangeEntry[] }> {
  const item = await itemByCode(db, code);
  if (!item) return { total: 0, entries: [] };
  const [{ total }] = await db.select({ total: count() }).from(bomChanges).where(eq(bomChanges.parentItemId, item.id));
  const rows = await db
    .select({
      id: bomChanges.id,
      savedAt: sql<string>`to_char(${bomChanges.savedAt} at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI')`,
      saveKey: sql<string>`${bomChanges.savedAt}::text`,
      kind: bomChanges.kind,
      lineNo: bomChanges.lineNo,
      before: bomChanges.before,
      after: bomChanges.after,
      childCode: items.code,
      childName: items.name,
      childUnit: items.unit,
    })
    .from(bomChanges)
    .leftJoin(items, eq(items.id, bomChanges.childItemId))
    .where(eq(bomChanges.parentItemId, item.id))
    .orderBy(desc(bomChanges.savedAt), asc(bomChanges.id))
    .limit(BOM_HISTORY_SHOWN);
  return {
    total,
    entries: rows.map((r) => ({
      id: r.id,
      savedAt: r.savedAt,
      saveKey: r.saveKey,
      kind: r.kind as BomChangeKind,
      child: r.childCode ? { code: r.childCode, name: r.childName!, unit: r.childUnit! } : undefined,
      lineNo: r.lineNo ?? undefined,
      before: r.before ?? {},
      after: r.after ?? {},
    })),
  };
}

// ── 펼치기(조각 「BOM」 PR B, 설계 ② 「정전개의 필요량」 · 「역전개」 · 「읽기만」) ─────────────────────
// 정전개는 고른 부모에서 아래로, 역전개는 고른 품목에서 위로 — 기준일에 적용되는 줄(시작일 ≤ 기준일, 종료일이 비었거나 ≥ 기준일)만 재귀 쿼리 하나로 따라간다.
// 쿼리는 넓이 우선으로 줄을 내므로(단계 차례) 줄 상한에서 멈추면 앞 단계부터 남는다. 줄의 차례(트리 차례)와 필요량은 여기서 센다 — 필요량은 끝수를 버리지 않은
// 분수(분자 · 분모)로 이어 세고, 보일 때만 자품목 단위의 자릿수로 올린다(ADR 0026 의 13). 이 절은 DB 에 쓰지 않는다.

/** 펼치는 단계의 상한(설계 ② 「깊은 BOM」). */
export const EXPLODE_DEPTH = 20;
/** 한 번에 보이는 줄의 상한 — 같은 자재가 여러 길로 드는 BOM 은 길마다 줄이라, 엉뚱한 BOM 이 화면 · DB 를 붙잡지 않게 막는다. */
export const EXPLODE_ROWS = 2000;

/** 끝수를 버리지 않은 수 — 분자 / 분모(둘 다 양). */
export type Ratio = { n: bigint; d: bigint };

const gcd = (a: bigint, b: bigint): bigint => {
  while (b !== ZERO) [a, b] = [b, a % b];
  return a < ZERO ? -a : a;
};
const reduced = (n: bigint, d: bigint): Ratio => {
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
};
const TEN_THOUSAND = BigInt(10000);

/** 윗 단계의 필요량 × 소요량 ÷ 기준수량 × (1 + 로스율 ÷ 100) — 소요량 · 기준수량은 천분의 일 단위, 로스율은 백분의 일 퍼센트 단위. */
export function requiredOf(upper: Ratio, qty: Milli, baseQty: Milli, lossHundredths: number): Ratio {
  return reduced(upper.n * qty * (TEN_THOUSAND + BigInt(lossHundredths)), upper.d * baseQty * TEN_THOUSAND);
}

/** 끝수를 버리지 않은 수를 소수 decimals 자리로 올려 보이는 글자로 — 0.0042 → 「0.005」(decimals 3), 2.1 → 「3」(decimals 0). */
export function ceilToDecimals(r: Ratio, decimals: number): string {
  const scale = BigInt(10) ** BigInt(decimals);
  const up = (r.n * scale + r.d - BigInt(1)) / r.d;
  return formatMilli(up * BigInt(10) ** BigInt(3 - decimals));
}

/** 펼친 줄 하나 — 정전개는 자품목, 역전개는 부모가 그 줄의 품목이다. */
export type ExplodedLine = {
  /** 경로(지나온 BOM 줄의 번호, 「/」로 이음) — 화면의 열쇠이고 위 줄을 찾는 길이다. */
  key: string;
  level: number;
  item: BomItemOption;
  /** 소요량과 그 단위(자품목의 단위). */
  qty: string;
  qtyUnit: string;
  /** 기준수량과 그 단위(부모의 단위). */
  baseQty: string;
  baseUnit: string;
  lossRate: string;
  validFrom: string;
  validTo: string;
  /** 정전개만 — 끝수를 버리지 않은 필요량과, 자품목 단위의 자릿수로 올려 보이는 글자. */
  requiredExact?: Ratio;
  required?: string;
  /** 정전개만 — 반제품인데 기준일에 적용되는 줄이 없다(BOM 이 없거나 그날 줄이 없음). 그 단계에서 멈춘다. */
  noBom?: boolean;
};

export type Explosion = {
  lines: ExplodedLine[];
  /** 줄 상한(EXPLODE_ROWS)에서 멈췄다 — 앞 단계부터 상한만큼 보인다. */
  truncated: boolean;
  /** 단계 상한(EXPLODE_DEPTH) 아래에 줄이 더 있었다. */
  depthStopped: boolean;
};

type TreeRow = {
  path: string;
  level: number;
  parent_id: number;
  child_id: number;
  line_no: number;
  qty: string;
  loss_rate: string;
  valid_from: string;
  valid_to: string | null;
  base_qty: string;
};

// postgres 드라이버는 행의 배열을, PGlite 는 { rows } 를 돌려준다.
function rowsOf<T>(result: unknown): T[] {
  return (Array.isArray(result) ? result : (result as { rows: T[] }).rows) as T[];
}

/**
 * 재귀 쿼리 하나 — down 은 부모 → 자품목, up 은 자품목 → 부모로 기준일에 적용되는 줄을 따라간다. 단계도 줄도 상한 하나 위까지 읽는다(넘친 것을
 * 알리려고). 지나온 품목이 다시 나오는 줄은 따라가지 않는다 — 저장이 돌고 도는 BOM 을 막지만(설계 ②) 펼치기가
 * 그것에 기대 끝없이 돌지 않게.
 */
async function walk(db: Db, mode: BomMode, itemId: number, date: string): Promise<TreeRow[]> {
  // 고정된 칸 이름만 고른다 — 넣은 값이 아니다.
  const from = sql.raw(mode === "down" ? "parent_item_id" : "child_item_id");
  const to = sql.raw(mode === "down" ? "child_item_id" : "parent_item_id");
  const nextOf = sql.raw(mode === "down" ? "t.child_id" : "t.parent_id");
  const applies = sql`l.valid_from <= ${date}::date and (l.valid_to is null or l.valid_to >= ${date}::date)`;
  return rowsOf<TreeRow>(
    await db.execute(sql`
      with recursive tree (path, level, parent_id, child_id, line_no, qty, loss_rate, valid_from, valid_to, base_qty, seen) as (
        select l.id::text, 1, l.parent_item_id, l.child_item_id, l.line_no, l.qty, l.loss_rate, l.valid_from, l.valid_to,
               b.base_qty, array[l.${from}, l.${to}]
        from bom_lines l join boms b on b.id = l.bom_id
        where l.${from} = ${itemId} and ${applies}
        union all
        select t.path || '/' || l.id, t.level + 1, l.parent_item_id, l.child_item_id, l.line_no, l.qty, l.loss_rate,
               l.valid_from, l.valid_to, b.base_qty, t.seen || l.${to}
        from tree t join bom_lines l on l.${from} = ${nextOf} join boms b on b.id = l.bom_id
        where t.level <= ${EXPLODE_DEPTH} and ${applies} and l.${to} <> all(t.seen)
      )
      select path, level, parent_id, child_id, line_no, qty::text as qty, loss_rate::text as loss_rate,
             valid_from::text as valid_from, valid_to::text as valid_to, base_qty::text as base_qty
      from tree
      limit ${EXPLODE_ROWS + 1}
    `),
  ).map((r) => ({
    ...r,
    level: Number(r.level),
    parent_id: Number(r.parent_id),
    child_id: Number(r.child_id),
    line_no: Number(r.line_no),
  }));
}

async function itemsById(db: Db, ids: readonly number[]): Promise<Map<number, BomItem>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select(itemColumns)
    .from(items)
    .leftJoin(unitSpecs, eq(unitSpecs.unit, items.unit))
    .where(inArray(items.id, [...new Set(ids)]));
  return new Map(rows.map((r) => [r.id, { ...r, decimals: Number(r.decimals) }] as const));
}

const optionOf = (i: BomItem): BomItemOption => ({
  code: i.code,
  name: i.name,
  spec: i.spec,
  itemType: i.itemType,
  unit: i.unit,
  decimals: i.decimals,
  active: i.active,
});

/**
 * 펼친다 — 정전개(down)는 부모 itemId 에서 아래로 수량 qty(천분의 일 단위, 없으면 기준수량)로, 역전개(up)는 itemId 를 쓰는 부모를 위로.
 * 줄은 트리 차례 — 정전개는 BOM 의 줄 번호 차례, 역전개는 부모 품목코드 차례로 형제를 세운다.
 */
export async function explode(db: Db, mode: BomMode, itemId: number, date: string, qty?: Milli): Promise<Explosion> {
  // 정전개의 수량을 주지 않으면 그 BOM 의 기준수량이다(BOM 이 없으면 펼칠 줄도 없다).
  const start = mode === "down" ? (qty ?? milliOf((await headerOf(db, itemId))?.baseQty ?? 0)) : ZERO;
  const all = await walk(db, mode, itemId, date);
  const depthStopped = all.some((r) => r.level > EXPLODE_DEPTH);
  const within = all.filter((r) => r.level <= EXPLODE_DEPTH);
  const truncated = within.length > EXPLODE_ROWS;
  const rows = within.slice(0, EXPLODE_ROWS);

  const known = await itemsById(db, [itemId, ...rows.flatMap((r) => [r.parent_id, r.child_id])]);
  // 정전개 — 반제품 자품목 가운데 기준일에 적용되는 줄이 있는 것(없으면 「BOM 없음」).
  const withLines = new Set<number>();
  if (mode === "down") {
    const sf = [...new Set(rows.map((r) => r.child_id))].filter((id) => isParentType(known.get(id)!.itemType));
    if (sf.length)
      for (const r of await db
        .selectDistinct({ id: bomLines.parentItemId })
        .from(bomLines)
        .where(
          and(
            inArray(bomLines.parentItemId, sf),
            sql`${bomLines.validFrom} <= ${date}::date and (${bomLines.validTo} is null or ${bomLines.validTo} >= ${date}::date)`,
          ),
        ))
        withLines.add(r.id);
  }

  const children = new Map<string, TreeRow[]>();
  for (const r of rows) {
    const cut = r.path.lastIndexOf("/");
    const up = cut < 0 ? "" : r.path.slice(0, cut);
    children.set(up, [...(children.get(up) ?? []), r]);
  }
  const rowItem = (r: TreeRow) => known.get(mode === "down" ? r.child_id : r.parent_id)!;
  const order =
    mode === "down"
      ? (a: TreeRow, b: TreeRow) => a.line_no - b.line_no
      : (a: TreeRow, b: TreeRow) =>
          rowItem(a).code < rowItem(b).code ? -1 : rowItem(a).code > rowItem(b).code ? 1 : 0;

  const lines: ExplodedLine[] = [];
  const visit = (path: string, upper: Ratio | undefined) => {
    for (const r of (children.get(path) ?? []).sort(order)) {
      const item = rowItem(r);
      const child = known.get(r.child_id)!;
      const parent = known.get(r.parent_id)!;
      const q = milliOf(r.qty);
      const base = milliOf(r.base_qty);
      const loss = lossOf(r.loss_rate);
      const line: ExplodedLine = {
        key: r.path,
        level: r.level,
        item: optionOf(item),
        qty: formatMilli(q),
        qtyUnit: child.unit,
        baseQty: formatMilli(base),
        baseUnit: parent.unit,
        lossRate: formatLossRate(loss),
        validFrom: r.valid_from,
        validTo: r.valid_to ?? "",
      };
      let exact: Ratio | undefined;
      if (upper) {
        exact = requiredOf(upper, q, base, loss);
        line.requiredExact = exact;
        line.required = ceilToDecimals(exact, child.decimals);
        line.noBom = isParentType(child.itemType) && !withLines.has(child.id);
      }
      lines.push(line);
      visit(r.path, exact);
    }
  };
  visit("", mode === "down" ? reduced(start, THOUSAND) : undefined);
  return { lines, truncated, depthStopped };
}

// ── BOM 조회 화면 ────────────────────────────────────

export type BomInquiryView = {
  mode: BomMode;
  date: string;
  /** 고를 품목 — 정전개는 BOM 이 있는 품목, 역전개는 자품목이 될 수 있는 품목(원자재 · 반제품 · 부자재). */
  options: BomItemOption[];
  /** 펼친 품목 — 고르지 않았거나 버렸으면 없다. */
  item?: BomItemOption;
  /** 정전개만 — 그 BOM 의 기준수량과 펼친 수량(부모 단위). */
  baseQty?: string;
  qty?: string;
  explosion?: Explosion;
};

/**
 * BOM 조회 — 주소에서 읽은 값(src/lib/bom-input.ts 의 parseBomInquiry)을 DB 에 대어 보고 펼친다. 품목이 없거나 정전개에 BOM 이 없으면 버리고,
 * 정전개의 수량이 부모 단위의 자릿수를 넘으면 기준수량으로 펼친다 — 버릴 때마다 notices 에 알림을 더한다.
 */
export async function bomInquiry(db: Db, query: BomInquiryQuery, notices: BomInquiryNotice[]): Promise<BomInquiryView> {
  const { mode, date } = query;
  const options =
    mode === "down"
      ? (
          await db
            .select(itemColumns)
            .from(boms)
            .innerJoin(items, eq(items.id, boms.itemId))
            .leftJoin(unitSpecs, eq(unitSpecs.unit, items.unit))
            .orderBy(asc(items.code))
        ).map((r) => optionOf({ ...r, decimals: Number(r.decimals) }))
      : (
          await db
            .select(itemColumns)
            .from(items)
            .leftJoin(unitSpecs, eq(unitSpecs.unit, items.unit))
            .where(inArray(items.itemType, [...CHILD_TYPES]))
            .orderBy(asc(items.code))
        ).map((r) => optionOf({ ...r, decimals: Number(r.decimals) }));
  const view: BomInquiryView = { mode, date, options };
  if (!query.item) return view;

  const item = await itemByCode(db, query.item);
  if (!item) {
    notices.push({ field: "item", message: "없는 품목이라 펼치지 않았습니다 — 품목을 고르세요" });
    return view;
  }
  if (mode === "up") return { ...view, item: optionOf(item), explosion: await explode(db, "up", item.id, date) };

  const header = await headerOf(db, item.id);
  if (!header) {
    notices.push({
      field: "item",
      message: "BOM 이 없는 품목이라 펼치지 않았습니다 — BOM 이 있는 반제품 · 완제품을 고르세요",
    });
    return view;
  }
  const base = milliOf(header.baseQty);
  let qty = base;
  if (query.qty && query.qty.decimals > item.decimals)
    notices.push({
      field: "qty",
      message:
        item.decimals === 0
          ? `단위 ${eun(item.unit)} 정수라 기준수량으로 펼쳤습니다`
          : `단위 ${eun(item.unit)} 소수 ${item.decimals}자리까지라 기준수량으로 펼쳤습니다`,
    });
  else if (query.qty) qty = query.qty.qty;
  return {
    ...view,
    item: optionOf(item),
    baseQty: formatMilli(base),
    qty: formatMilli(qty),
    explosion: await explode(db, "down", item.id, date, qty),
  };
}
