import { and, asc, count, eq, getTableColumns, ilike, inArray, or, type SQL } from "drizzle-orm";
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
import { itemSheetRow, readItemEditRow, readItemRow, type CodeOption } from "@/lib/sheet-input";
import {
  CODE_KEY,
  ROW_ERROR,
  SHEET_MAX_ROWS,
  VERSION_KEY,
  isBlankRow,
  isLoadedRow,
  type SheetErrors,
  type SheetResult,
  type SheetRow,
} from "@/lib/sheet";
import {
  COLLIDED,
  DUPLICATE_ROW,
  REGISTER_LOCK,
  STALE,
  STALE_ROW,
  VERSION,
  constraintOf,
  first,
  likeLiteral,
  limitMessage,
  pgError,
  registerRowsWithCode,
  registerWithCode,
  savedCode,
  searchText,
  touched,
  updateRowsWithVersion,
  versionIs,
  versionOf,
  type Params,
  type RegisteredRow,
  type UpdatedRow,
} from "./master-shared";
import { nextCode } from "./numbering";
import { codes, items } from "./schema";
import type { Db } from "./types";

// 품목의 목록 · 등록 · 수정(조각 「기준정보」 PR C). 화면(src/app/master/items/)은 이 함수만 부른다.
// 입력 검사는 src/lib/item-input.ts, 단위 · 분류가 「사용 안 함」이 아닌지 · 등록 상한 · 코드 번호는 여기서 본다.

/** 품목의 등록 상한(설계 「PR B 를 열기 전에 정한 것」) — 매일 밤 되돌림이 샘플 수로 줄인다. */
export const ITEM_LIMIT = 2000;

export type Item = typeof items.$inferSelect;
/** 품목과 그 버전(마지막으로 고친 때) — 고치는 화면 · 시트가 들고 있다가 저장할 때 돌려준다(PR J). */
export type ItemWithVersion = Item & { version: string };
const WITH_VERSION = { ...getTableColumns(items), version: versionOf(items.updatedAt) };

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

function itemWhere(filter: ItemFilter, scope: SearchScope) {
  const where: SQL[] = [];
  if (filter.q) where.push(or(...SEARCHED[scope].map((c) => ilike(c, likeLiteral(filter.q))))!);
  if (filter.itemType) where.push(eq(items.itemType, filter.itemType));
  if (filter.procurement) where.push(eq(items.procurement, filter.procurement));
  for (const { field } of ITEM_CLASSES) if (filter[field]) where.push(eq(items[field], filter[field]));
  if (!filter.includeInactive) where.push(eq(items.active, true));
  return and(...where);
}

/** 코드 순으로. 찾기는 그 칸들에 글자가 들어 있는지 본다(대소문자 무시) — 등록의 목록은 코드 · 품명, 조회는 글 칸 전체. */
export async function listItems(db: Db, filter: ItemFilter, scope: SearchScope = "codeName"): Promise<Item[]> {
  return db.select().from(items).where(itemWhere(filter, scope)).orderBy(asc(items.code));
}

/**
 * 시트에 불러오기(PR J) — 등록의 목록과 같은 찾기 · 거르기로, 코드 순 앞 100건을 시트의 줄로(저자 판정 2026-11-05).
 * 찾은 건수(total)도 돌려준다 — 100건을 넘으면 화면이 「앞 100건만」을 알린다.
 */
export async function loadItemsForSheet(db: Db, filter: ItemFilter): Promise<{ rows: SheetRow[]; total: number }> {
  const where = itemWhere(filter, "codeName");
  const [found, [{ n }]] = await Promise.all([
    db.select(WITH_VERSION).from(items).where(where).orderBy(asc(items.code)).limit(SHEET_MAX_ROWS),
    db.select({ n: count() }).from(items).where(where),
  ]);
  return { rows: found.map(itemSheetRow), total: n };
}

export const ITEM_CODE = /^(RM|SF|FG)-[0-9]{4,}$/;

/** 품목 하나와 그 버전 — 한 쿼리로 읽어, 보인 값과 버전이 어긋나지 않는다. */
export async function getItem(db: Db, code: string): Promise<ItemWithVersion | undefined> {
  if (!ITEM_CODE.test(code)) return undefined;
  const [row] = await db.select(WITH_VERSION).from(items).where(eq(items.code, code));
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

/**
 * 수정 — 코드 · 유형은 바꾸지 않는다. 단위를 바꾸면 사용 중인 단위만, 그대로면 「사용 안 함」 단위도 남는다.
 * version 은 화면을 연 때의 버전이다 — 그 사이 다른 사람이 고쳤으면 저장하지 않는다(저자 판정 2026-11-05).
 * 주지 않으면 버전을 보지 않는다(서버 안의 시험용 — 화면의 입구는 늘 준다).
 */
export async function updateItem(
  db: Db,
  code: string,
  values: ItemValues,
  version?: string,
): Promise<SaveResult | { ok: false; notFound: true }> {
  const current = await getItem(db, code);
  if (!current) return { ok: false, notFound: true };

  const parsed = parseItemUpdate(values);
  const errors: ItemErrors = parsed.ok ? {} : { ...parsed.errors };
  await checkCodes(db, values, errors, current);
  if (!parsed.ok || Object.keys(errors).length) return { ok: false, errors, values };
  if (version !== undefined && !VERSION.test(version)) return { ok: false, errors: {}, formError: STALE, values };

  try {
    const done = await db
      .update(items)
      .set({ ...parsed.value, updatedAt: touched() })
      .where(
        version === undefined
          ? eq(items.id, current.id)
          : and(eq(items.id, current.id), versionIs(items.updatedAt, version)),
      )
      .returning({ id: items.id });
    if (done.length === 0) return { ok: false, errors: {}, formError: STALE, values };
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

/** 저장하지 못한 줄의 까닭 — 등록 상한 · 겹침 · 버전 · DB 제약. */
function rowRejection(r: RegisteredRow | UpdatedRow): SheetErrors {
  if (r.ok) return {};
  if (r.reason === "limit") return { [ROW_ERROR]: limitMessage("품목", ITEM_LIMIT) };
  if (r.reason === "collided") return { [ROW_ERROR]: COLLIDED };
  if (r.reason === "stale") return { [ROW_ERROR]: STALE_ROW };
  const field = CONSTRAINT_FIELD[constraintOf(r.error) ?? ""];
  return field
    ? { [field]: "받을 수 없는 값입니다" }
    : { [ROW_ERROR]: "받을 수 없는 값이 있습니다 — 수량은 0 이상입니다" };
}

/** 시트가 고치려는 품목들 — 코드의 꼴이 맞는 것만 DB 에 묻는다. */
async function itemsByCode(db: Db, rows: readonly SheetRow[]): Promise<Map<string, Item>> {
  const wanted = [...new Set(rows.map((r) => r[CODE_KEY]).filter((c) => ITEM_CODE.test(c)))];
  if (wanted.length === 0) return new Map();
  const found = await db.select().from(items).where(inArray(items.code, wanted));
  return new Map(found.map((i) => [i.code, i]));
}

/**
 * 시트형 등록 · 고침(성공 기준 11 · 15) — 맞는 줄만 저장한다. 틀린 줄은 넣은 글자 그대로 까닭과 함께 돌려준다.
 * 코드가 없는 줄은 새 등록이다 — 코드를 줄 차례로 붙이고, 등록 상한(2,000)을 넘는 줄은 남는다.
 * 코드가 있는 줄(불러온 줄)은 고침이다 — 한 건 수정의 규칙으로 보고, 불러온 뒤 다른 사람이 고쳤으면 그 줄만 남는다.
 * 빈 줄은 건너뛴다. 줄 수(100)는 부르는 쪽이 먼저 본다. 고침과 등록은 한 트랜잭션이다 — 제약 위반이 아닌 실패면 아무것도 저장되지 않는다.
 */
export async function saveItemRows(db: Db, rows: readonly SheetRow[]): Promise<SheetResult> {
  const filled = rows.filter((r) => !isBlankRow(r));
  const [units, classes, currents] = await Promise.all([allUnits(db), allItemClasses(db), itemsByCode(db, filled)]);
  const seen = new Map<string, number>();
  for (const r of filled) if (isLoadedRow(r)) seen.set(r[CODE_KEY], (seen.get(r[CODE_KEY]) ?? 0) + 1);

  type Read =
    | { row: SheetRow; kind: "rejected"; errors: SheetErrors }
    | { row: SheetRow; kind: "new"; value: ReturnType<typeof readItemRow> & { ok: true } }
    | { row: SheetRow; kind: "edit"; current: Item; value: ReturnType<typeof readItemEditRow> & { ok: true } };
  const read: Read[] = filled.map((row) => {
    if (!isLoadedRow(row)) {
      const r = readItemRow(row, units, classes);
      return r.ok ? { row, kind: "new", value: r } : { row, kind: "rejected", errors: r.errors };
    }
    const current = currents.get(row[CODE_KEY]);
    if (!current) return { row, kind: "rejected", errors: { [ROW_ERROR]: "없는 품목입니다 — 이 줄을 지우세요" } };
    if (seen.get(row[CODE_KEY])! > 1) return { row, kind: "rejected", errors: { [ROW_ERROR]: DUPLICATE_ROW } };
    if (!VERSION.test(row[VERSION_KEY] ?? "")) return { row, kind: "rejected", errors: { [ROW_ERROR]: STALE_ROW } };
    const r = readItemEditRow(row, units, classes, current);
    return r.ok ? { row, kind: "edit", current, value: r } : { row, kind: "rejected", errors: r.errors };
  });
  const edits = read.flatMap((r) => (r.kind === "edit" ? [r] : []));
  const news = read.flatMap((r) => (r.kind === "new" ? [r] : []));

  const outcome = await db.transaction(async (tx) => {
    const updated = await updateRowsWithVersion(
      tx,
      edits.map((r) => ({
        update: async (sp: Db) =>
          (
            await sp
              .update(items)
              .set({ ...r.value.value, updatedAt: touched() })
              .where(and(eq(items.id, r.current.id), versionIs(items.updatedAt, r.row[VERSION_KEY])))
              .returning({ id: items.id })
          ).length,
      })),
    );
    const registered = news.length
      ? await registerRowsWithCode(tx, {
          table: items,
          lock: REGISTER_LOCK.items,
          limit: ITEM_LIMIT,
          uniqueConstraint: "items_code_unique",
          rows: news.map((r) => ({
            prefix: r.value.value.itemType,
            insert: (sp: Db, code: string) => sp.insert(items).values({ ...r.value.value, code }),
          })),
        })
      : [];
    return { updated, registered };
  });

  const result: SheetResult = { saved: [], rejected: [] };
  for (const r of read) {
    if (r.kind === "rejected") {
      result.rejected.push({ row: r.row, errors: r.errors });
      continue;
    }
    const done = r.kind === "edit" ? outcome.updated[edits.indexOf(r)] : outcome.registered[news.indexOf(r)];
    if (!done.ok) result.rejected.push({ row: r.row, errors: rowRejection(done) });
    else result.saved.push({ ...savedCode(r, done), name: r.value.value.name });
  }
  return result;
}
