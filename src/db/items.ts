import { and, asc, eq, ilike, or, type SQL } from "drizzle-orm";
import { ITEM_TYPES, PROC_TYPES, type ItemType } from "@/lib/master-codes";
import { parseItemUpdate, parseNewItem, type ItemErrors, type ItemField, type ItemValues } from "@/lib/item-input";
import {
  COLLIDED,
  REGISTER_LOCK,
  constraintOf,
  first,
  likeLiteral,
  limitMessage,
  pgError,
  registerWithCode,
  searchText,
  type Params,
} from "./master-shared";
import { nextCode } from "./numbering";
import { codes, items } from "./schema";
import type { Db } from "./types";

// 품목의 목록 · 등록 · 수정(조각 「기준정보」 PR C). 화면(src/app/master/items/)은 이 함수만 부른다.
// 입력 검사는 src/lib/item-input.ts, 단위가 「사용 안 함」이 아닌지 · 등록 상한 · 코드 번호는 여기서 본다.

/** 품목의 등록 상한(설계 「PR B 를 열기 전에 정한 것」) — 매일 밤 되돌림이 샘플 수로 줄인다. */
export const ITEM_LIMIT = 2000;

export type Item = typeof items.$inferSelect;

// ── 목록 ─────────────────────────────────────────────

export type ItemFilter = {
  q: string;
  itemType?: ItemType;
  procurement?: "BUY" | "MAKE";
  includeInactive: boolean;
};

export type FilterNotice = { field: "q" | "itemType" | "procurement"; message: string };

/** 주소의 거르기 값을 읽는다. 닫힌 목록 밖의 값은 거르지 않고 알린다. */
export function parseItemFilter(params: Params): { filter: ItemFilter; notices: FilterNotice[] } {
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

  return { filter, notices };
}

/** 코드 순으로. 찾기는 코드 · 품명에 글자가 들어 있는지만 본다(대소문자 무시). */
export async function listItems(db: Db, filter: ItemFilter): Promise<Item[]> {
  const where: SQL[] = [];
  if (filter.q) where.push(or(ilike(items.code, likeLiteral(filter.q)), ilike(items.name, likeLiteral(filter.q)))!);
  if (filter.itemType) where.push(eq(items.itemType, filter.itemType));
  if (filter.procurement) where.push(eq(items.procurement, filter.procurement));
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

async function unitState(db: Db, unit: string): Promise<"active" | "inactive" | "missing"> {
  const [row] = await db
    .select({ active: codes.active })
    .from(codes)
    .where(and(eq(codes.groupCode, "UNIT"), eq(codes.code, unit)));
  return !row ? "missing" : row.active ? "active" : "inactive";
}

// DB 제약에 걸린 것(서버의 검사를 빠뜨렸을 때)을 칸으로 가른다 — 제약 이름이 `<테이블>_<무엇>` 꼴이다.
const CONSTRAINT_FIELD: Record<string, ItemField> = {
  items_name_length: "name",
  items_spec_length: "spec",
  items_lead_time_range: "leadTimeDays",
  items_unit_fk: "unit",
  items_procurement_fk: "procurement",
  items_item_type_fk: "itemType",
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
  const unit = values.unit ?? "";
  if (!errors.unit && unit) {
    const state = await unitState(db, unit);
    if (state === "inactive") errors.unit = INACTIVE_UNIT;
    if (state === "missing") errors.unit = NO_UNIT;
  }
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
  const unit = values.unit ?? "";
  if (!errors.unit && unit && unit !== current.unit) {
    const state = await unitState(db, unit);
    if (state === "inactive") errors.unit = INACTIVE_UNIT;
    if (state === "missing") errors.unit = NO_UNIT;
  }
  if (!parsed.ok || Object.keys(errors).length) return { ok: false, errors, values };

  try {
    await db.update(items).set(parsed.value).where(eq(items.id, current.id));
    return { ok: true, code };
  } catch (error) {
    return asRejection(error, values);
  }
}
