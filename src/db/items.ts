import { and, asc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";
import { eul } from "@/lib/josa";
import { ITEM_TYPES, PROC_TYPES, type ItemType } from "@/lib/master-codes";
import {
  ITEM_CLASSES,
  type ItemClassField,
  parseItemUpdate,
  parseNewItem,
  type ItemErrors,
  type ItemField,
  type ItemValues,
} from "@/lib/item-input";
import { readItemRow, type CodeOption } from "@/lib/sheet-input";
import { ROW_ERROR, isBlankRow, type SheetResult, type SheetRow } from "@/lib/sheet";
import {
  COLLIDED,
  REGISTER_LOCK,
  constraintOf,
  first,
  likeLiteral,
  limitMessage,
  pgError,
  registerRowsWithCode,
  registerWithCode,
  searchText,
  type Params,
} from "./master-shared";
import { nextCode } from "./numbering";
import { codes, items } from "./schema";
import type { Db } from "./types";

// 품목의 목록 · 등록 · 수정(조각 「기준정보」 PR C). 화면(src/app/master/items/)은 이 함수만 부른다.
// 입력 검사는 src/lib/item-input.ts, 단위 · 분류가 「사용 안 함」이 아닌지 · 등록 상한 · 코드 번호는 여기서 본다.

/** 품목의 등록 상한(설계 「PR B 를 열기 전에 정한 것」) — 매일 밤 되돌림이 샘플 수로 줄인다. */
export const ITEM_LIMIT = 2000;

export type Item = typeof items.$inferSelect;

// ── 목록 ─────────────────────────────────────────────

export type ItemFilter = {
  q: string;
  itemType?: ItemType;
  procurement?: "BUY" | "MAKE";
  /** 분류 — 셋은 함께 걸린다(그리고). 「사용 안 함」 값으로도 거른다 — 이미 쓴 품목을 찾을 수 있게. */
  cls1?: string;
  cls2?: string;
  cls3?: string;
  includeInactive: boolean;
};

export type FilterNotice = { field: "q" | "itemType" | "procurement" | ItemClassField; message: string };

/** 분류 묶음마다의 값 — 「사용 안 함」까지, 정렬 순서대로. */
export type ItemClassOptions = Record<ItemClassField, CodeOption[]>;

/**
 * 주소의 거르기 값을 읽는다. 닫힌 목록 밖의 값은 거르지 않고 알린다.
 * 분류는 공통코드의 값(classes)에 있는 것만 거른다 — 주지 않으면 분류는 거르지 않는다.
 */
export function parseItemFilter(
  params: Params,
  classes?: ItemClassOptions,
): { filter: ItemFilter; notices: FilterNotice[] } {
  const notices: FilterNotice[] = [];
  const filter: ItemFilter = { q: "", includeInactive: first(params.inactive) === "1" };

  const search = searchText(params);
  if (search.notice) notices.push({ field: "q", message: search.notice });
  filter.q = search.q;

  const type = first(params.type) ?? "";
  if (ITEM_TYPES.some((t) => t.code === type)) filter.itemType = type as ItemType;
  else if (type) notices.push({ field: "itemType", message: "없는 유형이라 거르지 않았습니다" });

  const proc = first(params.proc) ?? "";
  if (PROC_TYPES.some((t) => t.code === proc)) filter.procurement = proc as "BUY" | "MAKE";
  else if (proc) notices.push({ field: "procurement", message: "없는 조달구분이라 거르지 않았습니다" });

  for (const { field, label } of ITEM_CLASSES) {
    const code = first(params[field]) ?? "";
    if (!code || !classes) continue;
    if (classes[field].some((c) => c.code === code)) filter[field] = code;
    else notices.push({ field, message: `없는 ${label}라 거르지 않았습니다` });
  }

  return { filter, notices };
}

/** 찾기가 보는 칸 — 등록의 목록은 코드 · 품명, 조회는 글 칸 전체(저자 판정 2026-11-04, 설계 「PR I 를 열기 전에 정한 것」). */
const SEARCHED = {
  codeName: [items.code, items.name],
  allText: [items.code, items.name, items.spec, items.note],
} as const;
export type SearchScope = keyof typeof SEARCHED;

/** 코드 순으로. 찾기는 그 칸들에 글자가 들어 있는지 본다(대소문자 무시) — 등록의 목록은 코드 · 품명, 조회는 글 칸 전체. */
export async function listItems(db: Db, filter: ItemFilter, scope: SearchScope = "codeName"): Promise<Item[]> {
  const where: SQL[] = [];
  if (filter.q) where.push(or(...SEARCHED[scope].map((c) => ilike(c, likeLiteral(filter.q))))!);
  if (filter.itemType) where.push(eq(items.itemType, filter.itemType));
  if (filter.procurement) where.push(eq(items.procurement, filter.procurement));
  for (const { field } of ITEM_CLASSES) if (filter[field]) where.push(eq(items[field], filter[field]));
  if (!filter.includeInactive) where.push(eq(items.active, true));
  return db
    .select()
    .from(items)
    .where(and(...where))
    .orderBy(asc(items.code));
}

export const ITEM_CODE = /^(RM|SF|FG)-[0-9]{4,}$/;

export async function getItem(db: Db, code: string): Promise<Item | undefined> {
  if (!ITEM_CODE.test(code)) return undefined;
  const [row] = await db.select().from(items).where(eq(items.code, code));
  return row;
}

// ── 입력 화면이 고르는 값 ────────────────────────────────

export type UnitOption = { code: string; name: string; active: boolean };

/** 단위 목록 — 사용 중인 것을 정렬 순서대로. 수정 화면은 그 품목의 단위가 「사용 안 함」이어도 넣어 보인다. */
export async function unitOptions(db: Db, current?: string): Promise<UnitOption[]> {
  const rows = await db
    .select({ code: codes.code, name: codes.name, active: codes.active })
    .from(codes)
    .where(eq(codes.groupCode, "UNIT"))
    .orderBy(asc(codes.sortOrder), asc(codes.code));
  return rows.filter((r) => r.active || r.code === current);
}

/** 분류 묶음 셋의 값 — 「사용 안 함」까지. 목록의 거르기 · 이름과 시트가 쓴다. */
export async function allItemClasses(db: Db): Promise<ItemClassOptions> {
  const rows = await db
    .select({ group: codes.groupCode, code: codes.code, name: codes.name, active: codes.active })
    .from(codes)
    .where(
      inArray(
        codes.groupCode,
        ITEM_CLASSES.map((c) => c.group),
      ),
    )
    .orderBy(asc(codes.sortOrder), asc(codes.code));
  const byGroup = (group: string) =>
    rows.filter((r) => r.group === group).map((r) => ({ code: r.code, name: r.name, active: r.active }));
  return { cls1: byGroup("ITEM_CLS1"), cls2: byGroup("ITEM_CLS2"), cls3: byGroup("ITEM_CLS3") };
}

/** 입력 화면의 분류 목록 — 사용 중인 것과, 수정이면 그 품목의 지금 값(「사용 안 함」이어도). */
export async function itemClassOptions(db: Db, current?: Pick<Item, ItemClassField>): Promise<ItemClassOptions> {
  const all = await allItemClasses(db);
  const keep = (field: ItemClassField) => all[field].filter((c) => c.active || c.code === current?.[field]);
  return { cls1: keep("cls1"), cls2: keep("cls2"), cls3: keep("cls3") };
}

/** 유형마다 지금 등록하면 붙을 코드 — 화면의 안내용이고, 저장할 때 다시 센다. */
export async function previewCodes(db: Db): Promise<Record<ItemType, string>> {
  const [RM, SF, FG] = await Promise.all(ITEM_TYPES.map((t) => nextCode(db, t.code)));
  return { RM, SF, FG };
}

// ── 등록 · 수정 ─────────────────────────────────────────

export type SaveResult =
  { ok: true; code: string } | { ok: false; errors: ItemErrors; formError?: string; values: ItemValues };

const INACTIVE_UNIT = "「사용 안 함」인 단위입니다 — 다른 단위를 고르세요";
const NO_UNIT = "단위를 고르세요";

async function codeState(db: Db, group: string, code: string): Promise<"active" | "inactive" | "missing"> {
  const [row] = await db
    .select({ active: codes.active })
    .from(codes)
    .where(and(eq(codes.groupCode, group), eq(codes.code, code)));
  return !row ? "missing" : row.active ? "active" : "inactive";
}

/**
 * 단위 · 분류가 공통코드에 있고 「사용 안 함」이 아닌지 — 새로 고르는 값만 본다. 수정에서 그대로 둔 값은 「사용 안 함」이어도 남는다.
 * 분류는 칸마다 따로 보고, 비우면 보지 않는다(설계 「PR H 를 열기 전에 정한 것」).
 */
async function checkCodes(db: Db, values: ItemValues, errors: ItemErrors, current?: Item) {
  const unit = values.unit ?? "";
  if (!errors.unit && unit && unit !== current?.unit) {
    const state = await codeState(db, "UNIT", unit);
    if (state === "inactive") errors.unit = INACTIVE_UNIT;
    if (state === "missing") errors.unit = NO_UNIT;
  }
  for (const { field, group, label } of ITEM_CLASSES) {
    const code = (values[field] ?? "").trim();
    if (errors[field] || !code || code === (current?.[field] ?? "")) continue;
    const state = await codeState(db, group, code);
    if (state === "inactive") errors[field] = `「사용 안 함」인 ${label}입니다 — 다른 값을 고르세요`;
    if (state === "missing") errors[field] = `${eul(label)} 목록에서 고르세요`;
  }
}

// DB 제약에 걸린 것(서버의 검사를 빠뜨렸을 때)을 칸으로 가른다 — 제약 이름이 `<테이블>_<무엇>` 꼴이다.
const CONSTRAINT_FIELD: Record<string, ItemField> = {
  items_name_length: "name",
  items_spec_length: "spec",
  items_lead_time_range: "leadTimeDays",
  items_unit_fk: "unit",
  items_procurement_fk: "procurement",
  items_item_type_fk: "itemType",
  items_cls1_fk: "cls1",
  items_cls2_fk: "cls2",
  items_cls3_fk: "cls3",
  items_note_length: "note",
};

/** 제약 위반이면 칸의 거절로 바꾸고, 아니면 그대로 던진다(부르는 쪽이 코드만 남기고 알린다). */
function asRejection(error: unknown, values: ItemValues): SaveResult {
  const field = CONSTRAINT_FIELD[constraintOf(error) ?? ""];
  if (field) return { ok: false, errors: { [field]: "받을 수 없는 값입니다" }, values };
  if (pgError(error).code === "23514")
    return { ok: false, errors: {}, formError: "받을 수 없는 값이 있습니다 — 수량은 0 이상입니다", values };
  throw error;
}

/** 등록 — 유형 머리의 다음 번호를 붙인다. 등록 상한 · 번호는 잠금 안에서 센다(src/db/master-shared.ts). */
export async function createItem(db: Db, values: ItemValues): Promise<SaveResult> {
  const parsed = parseNewItem(values);
  const errors: ItemErrors = parsed.ok ? {} : { ...parsed.errors };
  await checkCodes(db, values, errors);
  if (!parsed.ok || Object.keys(errors).length) return { ok: false, errors, values };

  try {
    const r = await registerWithCode(db, {
      table: items,
      lock: REGISTER_LOCK.items,
      limit: ITEM_LIMIT,
      prefix: parsed.value.itemType,
      uniqueConstraint: "items_code_unique",
      insert: (tx, code) => tx.insert(items).values({ ...parsed.value, code }),
    });
    if (r.ok) return r;
    return {
      ok: false,
      errors: {},
      formError: r.reason === "limit" ? limitMessage("품목", ITEM_LIMIT) : COLLIDED,
      values,
    };
  } catch (error) {
    return asRejection(error, values);
  }
}

/** 수정 — 코드 · 유형은 바꾸지 않는다. 단위를 바꾸면 사용 중인 단위만, 그대로면 「사용 안 함」 단위도 남는다. */
export async function updateItem(
  db: Db,
  code: string,
  values: ItemValues,
): Promise<SaveResult | { ok: false; notFound: true }> {
  const current = await getItem(db, code);
  if (!current) return { ok: false, notFound: true };

  const parsed = parseItemUpdate(values);
  const errors: ItemErrors = parsed.ok ? {} : { ...parsed.errors };
  await checkCodes(db, values, errors, current);
  if (!parsed.ok || Object.keys(errors).length) return { ok: false, errors, values };

  try {
    await db.update(items).set(parsed.value).where(eq(items.id, current.id));
    return { ok: true, code };
  } catch (error) {
    return asRejection(error, values);
  }
}

// ── 시트형 등록(PR F) ────────────────────────────────────

/** 단위의 공통코드 — 「사용 안 함」까지. 시트는 이름 · 코드 둘 다 받고, 「사용 안 함」 단위는 거절한다. */
async function allUnits(db: Db): Promise<CodeOption[]> {
  return db
    .select({ code: codes.code, name: codes.name, active: codes.active })
    .from(codes)
    .where(eq(codes.groupCode, "UNIT"))
    .orderBy(asc(codes.sortOrder), asc(codes.code));
}

/**
 * 시트형 등록 — 맞는 줄만 저장하고 코드를 줄 차례로 붙인다. 틀린 줄은 넣은 글자 그대로 까닭과 함께 돌려준다(성공 기준 11).
 * 빈 줄은 건너뛴다. 등록 상한(2,000)을 넘는 줄은 저장되지 않고 남는다. 줄 수(100)는 부르는 쪽이 먼저 본다.
 */
export async function createItemRows(db: Db, rows: readonly SheetRow[]): Promise<SheetResult> {
  const [units, classes] = await Promise.all([allUnits(db), allItemClasses(db)]);
  const filled = rows.filter((r) => !isBlankRow(r));
  const read = filled.map((row) => ({ row, ...readItemRow(row, units, classes) }));
  const valid = read.flatMap((r) => (r.ok ? [r] : []));

  const results = await registerRowsWithCode(db, {
    table: items,
    lock: REGISTER_LOCK.items,
    limit: ITEM_LIMIT,
    uniqueConstraint: "items_code_unique",
    rows: valid.map((r) => ({
      prefix: r.value.itemType,
      insert: (tx: Db, code: string) => tx.insert(items).values({ ...r.value, code }),
    })),
  });

  const result: SheetResult = { saved: [], rejected: [] };
  const byRow = new Map(valid.map((r, i) => [r, results[i]]));
  for (const r of read) {
    if (!r.ok) {
      result.rejected.push({ row: r.row, errors: r.errors });
      continue;
    }
    const saved = byRow.get(r)!;
    if (saved.ok) result.saved.push({ code: saved.code, name: r.value.name });
    else if (saved.reason === "limit")
      result.rejected.push({ row: r.row, errors: { [ROW_ERROR]: limitMessage("품목", ITEM_LIMIT) } });
    else if (saved.reason === "collided") result.rejected.push({ row: r.row, errors: { [ROW_ERROR]: COLLIDED } });
    else {
      const field = CONSTRAINT_FIELD[constraintOf(saved.error) ?? ""];
      result.rejected.push({
        row: r.row,
        errors: field
          ? { [field]: "받을 수 없는 값입니다" }
          : { [ROW_ERROR]: "받을 수 없는 값이 있습니다 — 수량은 0 이상입니다" },
      });
    }
  }
  return result;
}
