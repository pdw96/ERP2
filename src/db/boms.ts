import { and, asc, count, eq, inArray, ne, sql } from "drizzle-orm";
import {
  formatLossRate,
  ITEM_CODE,
  parseBom,
  type BomErrors,
  type BomLineErrors,
  type BomValues,
  type ParsedBomLine,
} from "@/lib/bom-input";
import { eun, iga } from "@/lib/josa";
import { formatMilli, THOUSAND, type Milli } from "@/lib/move-input";
import { limitMessage, REGISTER_LOCK, STALE, touched, VERSION, versionIs, versionOf } from "./master-shared";
import { bomLines, boms, items, unitSpecs } from "./schema";
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

export type BomSaveResult =
  { ok: true; code: string; version: string } | { ok: false; errors: BomErrors; formError?: string; values: BomValues };

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
 * 부모 아래에 새 자품목들을 두면 돌고 도는가 — 다른 BOM 의 모든 줄(적용일자와 상관없이, ADR 0026 의 8)과 새 줄을 따라가 부모로 돌아오는 길을 찾는다.
 * 돌아오면 그 자품목마다 길(품목 번호의 차례, 부모에서 시작해 부모로 끝남)을 돌려준다. 부르는 쪽이 lockBom 을 쥔 뒤 부른다.
 */
async function cyclesOf(tx: Db, parentId: number, childIds: readonly number[]): Promise<Map<number, number[]>> {
  const edges = await tx
    .select({ from: bomLines.parentItemId, to: bomLines.childItemId })
    .from(bomLines)
    .where(ne(bomLines.parentItemId, parentId));
  const next = new Map<number, Set<number>>();
  for (const e of edges) {
    if (!next.has(e.from)) next.set(e.from, new Set());
    next.get(e.from)!.add(e.to);
  }
  const found = new Map<number, number[]>();
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
    found.set(start, [parentId, ...back.reverse()]);
  }
  return found;
}

/**
 * BOM 저장 — 머리와 줄 전체를 한 트랜잭션에서 바꾼다(한 저장은 통째로). 틀린 칸이 하나라도 있으면 아무것도 저장하지 않고 칸마다 까닭을 돌려준다.
 * 새 BOM(버전 없음)은 부모가 「사용」이어야 하고, 있는 BOM 은 화면을 연 때의 버전이 맞을 때만 고친다. 「사용 안 함」 자품목은 이미 그 BOM 에 든
 * 품목일 때만 남는다. 기준수량 · 소요량은 단위의 자릿수를, 줄 수는 상한을 지킨다.
 */
export async function saveBom(db: Db, values: BomValues): Promise<BomSaveResult> {
  const parsed = parseBom(values);
  if (!parsed.ok) return { ...parsed, values };
  const v = parsed.value;
  if (v.version && !VERSION.test(v.version))
    return { ok: false, errors: { header: {}, lines: {} }, formError: STALE, values };

  return db.transaction(async (tx): Promise<BomSaveResult> => {
    await lockBom(tx);
    const errors: BomErrors = { header: {}, lines: {} };
    const fail = (formError?: string): BomSaveResult => ({ ok: false, errors, formError, values });

    const parent = await itemByCode(tx, v.parentCode);
    if (!parent) errors.header.parent = "없는 품목입니다 — 목록에서 고르세요";
    else if (!isParentType(parent.itemType)) errors.header.parent = NOT_PARENT;
    if (!parent || errors.header.parent) return fail();

    const header = await headerOf(tx, parent.id);
    if (header && header.version !== v.version) return fail(STALE);
    if (!header && v.version) return fail("BOM 이 그 사이 지워졌습니다 — 화면을 새로 열어 다시 넣으세요");
    if (!header && !parent.active) errors.header.parent = "「사용 안 함」 품목이라 새 BOM 을 만들지 못합니다";
    if (v.baseQtyDecimals > parent.decimals) errors.header.baseQty = decimalsRule(parent.unit, parent.decimals);

    const codes = [...new Set(v.lines.map((l) => l.childCode))];
    const children = new Map<string, BomItem>();
    if (codes.length)
      for (const c of await tx
        .select(itemColumns)
        .from(items)
        .leftJoin(unitSpecs, eq(unitSpecs.unit, items.unit))
        .where(inArray(items.code, codes)))
        children.set(c.code, { ...c, decimals: Number(c.decimals) });
    const already = new Set<number>(
      header
        ? (await tx.select({ id: bomLines.childItemId }).from(bomLines).where(eq(bomLines.bomId, header.id))).map(
            (r) => r.id,
          )
        : [],
    );

    for (const l of v.lines) {
      const c = children.get(l.childCode);
      const e: BomLineErrors = {};
      if (!c) e.child = "없는 품목입니다 — 목록에서 고르세요";
      else if (!isChildType(c.itemType)) e.child = childTypeError(c.itemType);
      else if (!c.active && !already.has(c.id)) e.child = "「사용 안 함」 품목은 새로 넣지 못합니다";
      else if (l.qtyDecimals > c.decimals) e.qty = decimalsRule(c.unit, c.decimals);
      if (Object.keys(e).length) errors.lines[l.index] = e;
    }
    overlapErrors(v.lines, errors.lines);

    const valid = v.lines.filter((l) => !errors.lines[l.index]?.child);
    const cycles = await cyclesOf(
      tx,
      parent.id,
      valid.map((l) => children.get(l.childCode)!.id),
    );
    if (cycles.size) {
      const ids = [...new Set([...cycles.values()].flat())];
      const names = new Map(
        (await tx.select({ id: items.id, name: items.name }).from(items).where(inArray(items.id, ids))).map(
          (r) => [r.id, r.name] as const,
        ),
      );
      for (const l of valid) {
        const path = cycles.get(children.get(l.childCode)!.id);
        if (!path) continue;
        errors.lines[l.index] = {
          ...errors.lines[l.index],
          child: `${l.childCode === v.parentCode ? "" : `「${children.get(l.childCode)!.name}」 아래에 `}「${parent.name}」${iga(parent.name).slice(parent.name.length)} 있어 돌고 돕니다 — ${path.map((id) => names.get(id)).join(" → ")}`,
        };
      }
    }

    if (Object.keys(errors.header).length || Object.keys(errors.lines).length) return fail();

    const [{ n }] = await tx
      .select({ n: count() })
      .from(bomLines)
      .where(header ? ne(bomLines.bomId, header.id) : sql`true`);
    if (n + v.lines.length > BOM_LINE_LIMIT) return fail(limitMessage("BOM 줄", BOM_LINE_LIMIT));

    let bomId: number;
    if (header) {
      await tx
        .update(boms)
        .set({ baseQty: numericOf(v.baseQty) as unknown as number, updatedAt: touched() })
        .where(and(eq(boms.id, header.id), versionIs(boms.updatedAt, v.version)));
      await tx.delete(bomLines).where(eq(bomLines.bomId, header.id));
      bomId = header.id;
    } else {
      const [made] = await tx
        .insert(boms)
        .values({ itemId: parent.id, baseQty: numericOf(v.baseQty) as unknown as number, updatedAt: touched() })
        .returning({ id: boms.id });
      bomId = made.id;
    }
    await tx.insert(bomLines).values(
      v.lines.map((l, i) => ({
        bomId,
        parentItemId: parent.id,
        lineNo: i + 1,
        childItemId: children.get(l.childCode)!.id,
        qty: numericOf(l.qty) as unknown as number,
        lossRate: lossNumericOf(l.lossRate) as unknown as number,
        validFrom: l.validFrom,
        validTo: l.validTo,
        note: l.note,
      })),
    );
    const saved = await headerOf(tx, parent.id);
    return { ok: true, code: parent.code, version: saved!.version };
  });
}

// ── 지우기 ───────────────────────────────────────────

/** BOM 지우기 — 머리와 줄을 함께. 화면을 연 때의 버전이 맞을 때만(ADR 0026 의 12). */
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
    await tx.delete(bomLines).where(eq(bomLines.bomId, header.id));
    await tx.delete(boms).where(eq(boms.id, header.id));
    return { ok: true, code } as const;
  });
}
