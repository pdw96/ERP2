import { and, asc, count, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { ITEM_TYPES, PROC_TYPES, type ItemType } from "@/lib/master-codes";
import { parseItemUpdate, parseNewItem, type ItemErrors, type ItemField, type ItemValues } from "@/lib/item-input";
import { nextCode } from "./numbering";
import { codes, items } from "./schema";
import type { Db } from "./types";

// 품목의 목록 · 등록 · 수정(조각 「기준정보」 PR C). 화면(src/app/master/items/)은 이 함수만 부른다.
// 입력 검사는 src/lib/item-input.ts, 단위가 「사용 안 함」이 아닌지 · 등록 상한 · 코드 번호는 여기서 본다.

/** 품목의 등록 상한(설계 「PR B 를 열기 전에 정한 것」) — 매일 밤 되돌림이 샘플 수로 줄인다. */
export const ITEM_LIMIT = 2000;

/** 등록의 차례를 지키는 DB 잠금 번호 — 테이블마다 하나(배포 빌드의 잠금 20261102 와 겹치지 않게). */
export const REGISTER_LOCK = { items: 2026110301 } as const;

export type Item = typeof items.$inferSelect;

// ── 목록 ─────────────────────────────────────────────

export type ItemFilter = {
  q: string;
  itemType?: ItemType;
  procurement?: "BUY" | "MAKE";
  includeInactive: boolean;
};

export type FilterNotice = { field: "q" | "itemType" | "procurement"; message: string };

type Params = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** 주소의 거르기 값을 읽는다. 닫힌 목록 밖의 값은 거르지 않고 알린다. */
export function parseItemFilter(params: Params): { filter: ItemFilter; notices: FilterNotice[] } {
  const notices: FilterNotice[] = [];
  const filter: ItemFilter = { q: "", includeInactive: first(params.inactive) === "1" };

  const q = (first(params.q) ?? "").trim();
  if (Array.from(q).length > 50) notices.push({ field: "q", message: "찾을 글자는 50자까지입니다 — 찾지 않았습니다" });
  else filter.q = q;

  const type = first(params.type) ?? "";
  if (ITEM_TYPES.some((t) => t.code === type)) filter.itemType = type as ItemType;
  else if (type) notices.push({ field: "itemType", message: "없는 유형이라 거르지 않았습니다" });

  const proc = first(params.proc) ?? "";
  if (PROC_TYPES.some((t) => t.code === proc)) filter.procurement = proc as "BUY" | "MAKE";
  else if (proc) notices.push({ field: "procurement", message: "없는 조달구분이라 거르지 않았습니다" });

  return { filter, notices };
}

// LIKE 의 특수 글자(% _ \)를 글자 그대로 찾게 한다.
const likeLiteral = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

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

type PgError = { code?: string; constraint?: string; constraint_name?: string };
function pgError(error: unknown): PgError {
  const e = (error ?? {}) as PgError & { cause?: unknown };
  return (e.cause && typeof e.cause === "object" ? e.cause : e) as PgError;
}
const constraintOf = (error: unknown) => {
  const e = pgError(error);
  return e.constraint ?? e.constraint_name;
};

/** 제약 위반이면 칸의 거절로 바꾸고, 아니면 그대로 던진다(부르는 쪽이 코드만 남기고 알린다). */
function asRejection(error: unknown, values: ItemValues): SaveResult {
  const field = CONSTRAINT_FIELD[constraintOf(error) ?? ""];
  if (field) return { ok: false, errors: { [field]: "받을 수 없는 값입니다" }, values };
  if (pgError(error).code === "23514")
    return { ok: false, errors: {}, formError: "받을 수 없는 값이 있습니다 — 수량은 0 이상입니다", values };
  throw error;
}

/** 등록 — 유형 머리의 다음 번호를 붙인다. 두 사람이 같은 번호를 받으면 한 번 더 받아 넣는다. */
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

  const limitReached: SaveResult = {
    ok: false,
    errors: {},
    formError: `품목은 ${ITEM_LIMIT.toLocaleString("ko-KR")}개까지 등록됩니다 — 매일 밤 샘플 데이터로 돌아간 뒤 다시 등록하세요`,
    values,
  };
  const collided: SaveResult = {
    ok: false,
    errors: {},
    formError: "같은 때 등록한 사람이 있어 저장하지 못했습니다 — 다시 저장하세요",
    values,
  };

  // 세기 · 번호 받기 · 넣기를 한 트랜잭션에서 잠금을 쥐고 한다 — 동시에 등록해도 상한을 넘지 않고 번호가 겹치지 않는다.
  // 잠금은 트랜잭션이 끝나면 저절로 풀린다(연결 풀을 거쳐도 남지 않는다).
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(${REGISTER_LOCK.items})`);
        const [{ n }] = await tx.select({ n: count() }).from(items);
        if (n >= ITEM_LIMIT) return limitReached;
        const code = await nextCode(tx, parsed.value.itemType);
        await tx.insert(items).values({ ...parsed.value, code });
        return { ok: true, code } as const;
      });
    } catch (error) {
      if (constraintOf(error) === "items_code_unique") {
        if (attempt === 0) continue;
        return collided;
      }
      return asRejection(error, values);
    }
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
