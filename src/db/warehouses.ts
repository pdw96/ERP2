import { and, asc, eq, getTableColumns, ilike, or, type SQL } from "drizzle-orm";
import {
  parseNewWarehouse,
  parseWarehouseUpdate,
  type WarehouseErrors,
  type WarehouseField,
  type WarehouseValues,
} from "@/lib/warehouse-input";
import {
  COLLIDED,
  REGISTER_LOCK,
  STALE,
  VERSION,
  constraintOf,
  first,
  likeLiteral,
  limitMessage,
  registerWithCode,
  searchText,
  touched,
  versionIs,
  versionOf,
  type Params,
} from "./master-shared";
import { nextCode } from "./numbering";
import { warehouses } from "./schema";
import type { Db } from "./types";

// 창고의 목록 · 등록 · 수정(조각 「기준정보」 PR D). 화면(src/app/inventory/warehouses/)은 이 함수만 부른다.
// 입력 검사는 src/lib/warehouse-input.ts, 등록 상한 · 코드 번호는 여기서 본다.

/** 창고의 등록 상한(설계 「PR B 를 열기 전에 정한 것」) — 두 자리 번호의 끝까지. 매일 밤 되돌림이 샘플 수로 줄인다. */
export const WAREHOUSE_LIMIT = 99;

export type Warehouse = typeof warehouses.$inferSelect;
/** 창고와 그 버전(마지막으로 고친 때) — 수정 화면이 들고 있다가 저장할 때 돌려준다(PR J). */
export type WarehouseWithVersion = Warehouse & { version: string };

// ── 목록 ─────────────────────────────────────────────

export type WarehouseFilter = { q: string; includeInactive: boolean };
export type WarehouseFilterNotice = { field: "q"; message: string };

/** 주소의 거르기 값을 읽는다. 받지 않은 값은 거르지 않고 알린다. */
export function parseWarehouseFilter(params: Params): {
  filter: WarehouseFilter;
  notices: WarehouseFilterNotice[];
} {
  const search = searchText(params);
  return {
    filter: { q: search.q, includeInactive: first(params.inactive) === "1" },
    notices: search.notice ? [{ field: "q", message: search.notice }] : [],
  };
}

/** 코드 순으로. 찾기는 코드 · 창고명에 글자가 들어 있는지만 본다(대소문자 무시). */
export async function listWarehouses(db: Db, filter: WarehouseFilter): Promise<Warehouse[]> {
  const where: SQL[] = [];
  if (filter.q)
    where.push(or(ilike(warehouses.code, likeLiteral(filter.q)), ilike(warehouses.name, likeLiteral(filter.q)))!);
  if (!filter.includeInactive) where.push(eq(warehouses.active, true));
  return db
    .select()
    .from(warehouses)
    .where(and(...where))
    .orderBy(asc(warehouses.code));
}

export const WAREHOUSE_CODE = /^WH-[0-9]{2,}$/;

/** 창고 하나와 그 버전 — 한 쿼리로 읽어, 보인 값과 버전이 어긋나지 않는다. */
export async function getWarehouse(db: Db, code: string): Promise<WarehouseWithVersion | undefined> {
  if (!WAREHOUSE_CODE.test(code)) return undefined;
  const [row] = await db
    .select({ ...getTableColumns(warehouses), version: versionOf(warehouses.updatedAt) })
    .from(warehouses)
    .where(eq(warehouses.code, code));
  return row;
}

/** 지금 등록하면 붙을 코드 — 화면의 안내용이고, 저장할 때 다시 센다. */
export const previewWarehouseCode = (db: Db) => nextCode(db, "WH");

// ── 등록 · 수정 ─────────────────────────────────────────

export type WarehouseSaveResult =
  { ok: true; code: string } | { ok: false; errors: WarehouseErrors; formError?: string; values: WarehouseValues };

// DB 제약에 걸린 것(서버의 검사를 빠뜨렸을 때)을 칸으로 가른다.
const CONSTRAINT_FIELD: Record<string, WarehouseField> = { warehouses_name_length: "name" };

/** 제약 위반이면 칸의 거절로 바꾸고, 아니면 그대로 던진다(부르는 쪽이 코드만 남기고 알린다). */
function asRejection(error: unknown, values: WarehouseValues): WarehouseSaveResult {
  const field = CONSTRAINT_FIELD[constraintOf(error) ?? ""];
  if (field) return { ok: false, errors: { [field]: "받을 수 없는 값입니다" }, values };
  throw error;
}

/** 등록 — WH 의 다음 번호를 붙인다. 등록 상한 · 번호는 잠금 안에서 센다(src/db/master-shared.ts). */
export async function createWarehouse(db: Db, values: WarehouseValues): Promise<WarehouseSaveResult> {
  const parsed = parseNewWarehouse(values);
  if (!parsed.ok) return { ok: false, errors: parsed.errors, values };
  try {
    const r = await registerWithCode(db, {
      table: warehouses,
      lock: REGISTER_LOCK.warehouses,
      limit: WAREHOUSE_LIMIT,
      prefix: "WH",
      uniqueConstraint: "warehouses_code_unique",
      insert: (tx, code) => tx.insert(warehouses).values({ ...parsed.value, code }),
    });
    if (r.ok) return r;
    return {
      ok: false,
      errors: {},
      formError: r.reason === "limit" ? limitMessage("창고", WAREHOUSE_LIMIT) : COLLIDED,
      values,
    };
  } catch (error) {
    return asRejection(error, values);
  }
}

/**
 * 수정 — 코드는 바꾸지 않는다. 창고명 · 사용 여부만.
 * version 은 화면을 연 때의 버전이다 — 그 사이 다른 사람이 고쳤으면 저장하지 않는다(저자 판정 2026-11-05 — 품목 · 거래처와 같다).
 * 주지 않으면 버전을 보지 않는다(서버 안의 시험용 — 화면의 입구는 늘 준다).
 */
export async function updateWarehouse(
  db: Db,
  code: string,
  values: WarehouseValues,
  version?: string,
): Promise<WarehouseSaveResult | { ok: false; notFound: true }> {
  const current = await getWarehouse(db, code);
  if (!current) return { ok: false, notFound: true };
  const parsed = parseWarehouseUpdate(values);
  if (!parsed.ok) return { ok: false, errors: parsed.errors, values };
  if (version !== undefined && !VERSION.test(version)) return { ok: false, errors: {}, formError: STALE, values };
  try {
    const done = await db
      .update(warehouses)
      .set({ ...parsed.value, updatedAt: touched() })
      .where(
        version === undefined
          ? eq(warehouses.id, current.id)
          : and(eq(warehouses.id, current.id), versionIs(warehouses.updatedAt, version)),
      )
      .returning({ id: warehouses.id });
    if (done.length === 0) return { ok: false, errors: {}, formError: STALE, values };
    return { ok: true, code };
  } catch (error) {
    return asRejection(error, values);
  }
}
