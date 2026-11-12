import { and, asc, count, eq, inArray, ne, sql } from "drizzle-orm";
import {
  formatLossRate,
  ITEM_CODE,
  parseBom,
  type BomErrors,
  type BomInquiryNotice,
  type BomInquiryQuery,
  type BomMode,
  type BomLineErrors,
  type BomValues,
  type ParsedBomLine,
} from "@/lib/bom-input";
import { eun, iga } from "@/lib/josa";
import { formatMilli, THOUSAND, ZERO, type Milli } from "@/lib/move-input";
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
