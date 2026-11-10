import { and, asc, count, eq, getTableColumns, max, sql } from "drizzle-orm";
import { GROUP_CODE, MINOR_CODE, UNIT_GROUP } from "@/lib/code-fields";
import { parseCodeUpdate, parseNewCode, type CodeErrors, type CodeField, type CodeValues } from "@/lib/code-input";
import { isAlwaysActive } from "@/lib/master-codes";
import { parseNewUnitSpec, parseUnitDecimals, type UnitSpecInput } from "@/lib/unit-input";
import {
  REGISTER_LOCK,
  STALE,
  VERSION,
  constraintOf,
  limitMessage,
  touched,
  versionIs,
  versionOf,
} from "./master-shared";
import { codeGroups, codes, unitSpecs } from "./schema";
import { lockStock, unitQuantitiesFit } from "./stock";
import type { Db } from "./types";

// 시스템 관리 › 공통코드의 목록 · 값 추가 · 수정(조각 「기준정보」 PR E). 화면(src/app/system/codes/)은 이 함수만 부른다.
// 입력 검사는 src/lib/code-input.ts, 묶음의 가름(시스템 · 사용자) · 묶음 안의 겹침 · 등록 상한은 여기서 본다.
// 묶음(Major)을 만들거나 고치는 길은 없다 — 묶음은 그것을 쓰는 조각의 PR 이 더한다(ADR 0009).

/** 묶음마다 값의 등록 상한(설계 「PR B 를 열기 전에 정한 것」). 매일 밤 되돌림이 샘플 수로 줄인다. */
export const CODE_LIMIT = 100;

export type CodeGroup = typeof codeGroups.$inferSelect;
export type Code = typeof codes.$inferSelect;
/** 공통코드 값과 그 버전(마지막으로 고친 때) — 수정 화면이 들고 있다가 저장할 때 돌려준다(PR J). */
export type CodeWithVersion = Code & { version: string };
export type CodeGroupRow = Pick<CodeGroup, "code" | "name" | "isSystem"> & { values: number };
export type UnitSpec = Pick<typeof unitSpecs.$inferSelect, "unit" | "baseUnit" | "factor" | "decimals">;
/** 기준 단위로 고를 수 있는 단위 — 자신이 기준이고 「사용」인 단위. */
export type BaseUnitOption = { code: string; name: string };

// ── 목록 ─────────────────────────────────────────────

/** 묶음 — 코드 순으로, 값의 수와 함께. */
export async function listCodeGroups(db: Db): Promise<CodeGroupRow[]> {
  return db
    .select({ code: codeGroups.code, name: codeGroups.name, isSystem: codeGroups.isSystem, values: count(codes.id) })
    .from(codeGroups)
    .leftJoin(codes, eq(codes.groupCode, codeGroups.code))
    .groupBy(codeGroups.id)
    .orderBy(asc(codeGroups.code));
}

export async function getCodeGroup(db: Db, group: string): Promise<CodeGroup | undefined> {
  if (!GROUP_CODE.test(group)) return undefined;
  const [row] = await db.select().from(codeGroups).where(eq(codeGroups.code, group));
  return row;
}

/** 한 묶음의 값 — 「사용 안 함」까지 모두, 정렬 순서 · 코드 순으로(묶음마다 100개 안이라 거르지 않는다). */
export async function listCodes(db: Db, group: string): Promise<Code[]> {
  return db.select().from(codes).where(eq(codes.groupCode, group)).orderBy(asc(codes.sortOrder), asc(codes.code));
}

export async function getCode(db: Db, group: string, code: string): Promise<CodeWithVersion | undefined> {
  if (!GROUP_CODE.test(group) || !MINOR_CODE.test(code)) return undefined;
  const [row] = await db
    .select({ ...getTableColumns(codes), version: versionOf(codes.updatedAt) })
    .from(codes)
    .where(and(eq(codes.groupCode, group), eq(codes.code, code)));
  return row;
}

/** 새 값의 정렬 순서 기본값 — 묶음의 가장 큰 정렬 순서 + 10(999 까지). 값이 없으면 10. */
export async function nextSortOrder(db: Db, group: string): Promise<number> {
  const [row] = await db
    .select({ max: max(codes.sortOrder) })
    .from(codes)
    .where(eq(codes.groupCode, group));
  return Math.min((row?.max ?? 0) + 10, 999);
}

// ── 단위 사양(조각 「재고 수불」 PR A, ADR 0017) ─────────────────

const specColumns = {
  unit: unitSpecs.unit,
  baseUnit: unitSpecs.baseUnit,
  factor: unitSpecs.factor,
  decimals: unitSpecs.decimals,
};

/** 단위마다의 사양 — 단위 코드로 찾는다. 공통코드 화면의 UNIT 표가 쓴다. */
export async function listUnitSpecs(db: Db): Promise<Record<string, UnitSpec>> {
  const rows = await db.select(specColumns).from(unitSpecs);
  return Object.fromEntries(rows.map((r) => [r.unit, r]));
}

export async function getUnitSpec(db: Db, unit: string): Promise<UnitSpec | undefined> {
  if (!MINOR_CODE.test(unit)) return undefined;
  const [row] = await db.select(specColumns).from(unitSpecs).where(eq(unitSpecs.unit, unit));
  return row;
}

/** 새 단위의 기준으로 고를 수 있는 단위 — 자신이 기준(배수 1)이고 「사용」인 단위, 정렬 순서대로. */
export async function baseUnitOptions(db: Db): Promise<BaseUnitOption[]> {
  return db
    .select({ code: codes.code, name: codes.name })
    .from(unitSpecs)
    .innerJoin(codes, and(eq(codes.groupCode, unitSpecs.unitGroup), eq(codes.code, unitSpecs.unit)))
    .where(and(eq(unitSpecs.unit, unitSpecs.baseUnit), eq(codes.active, true)))
    .orderBy(asc(codes.sortOrder), asc(codes.code));
}

const NOT_BASE = "기준이 될 수 없는 단위입니다 — 목록에 있는 「사용」 단위를 고르세요";

/** 고른 기준 단위가 자신이 기준이고 「사용」인 단위인가 — 아니면 거절할 까닭. 자신이 기준이면 보지 않는다. */
async function baseUnitProblem(db: Db, code: string, spec: UnitSpecInput): Promise<string | undefined> {
  if (spec.baseUnit === code) return undefined;
  const ok = (await baseUnitOptions(db)).some((b) => b.code === spec.baseUnit);
  return ok ? undefined : NOT_BASE;
}

// ── 추가 · 수정 ─────────────────────────────────────────

export type CodeSaveResult =
  { ok: true; code: string } | { ok: false; errors: CodeErrors; formError?: string; values: CodeValues };
export type CodeNotFound = { ok: false; notFound: true };

export const SYSTEM_LOCKED = "시스템 코드라 화면에서 바꿀 수 없습니다 — 프로그램이 이 값에 기댑니다";
const DUPLICATE = "이 묶음에 이미 있는 코드입니다";
export const ALWAYS_ACTIVE_MESSAGE = "프로그램이 기대는 값이라 「사용 안 함」으로 바꿀 수 없습니다";
const UNIQUE = "codes_group_code_code_unique";
const DUPLICATE_INACTIVE = "이 묶음에 「사용 안 함」으로 있는 코드입니다 — 목록에서 그 값을 「사용」으로 바꾸세요";

// DB 제약에 걸린 것(서버의 검사를 빠뜨렸을 때)을 칸으로 가른다.
const CONSTRAINT_FIELD: Record<string, CodeField> = {
  codes_code_format: "code",
  codes_name_length: "name",
  codes_sort_order_range: "sortOrder",
  unit_specs_base_fk: "baseUnit",
  unit_specs_factor_positive: "factor",
  unit_specs_base_factor_one: "factor",
  unit_specs_decimals_range: "decimals",
};

/** 제약 위반이면 칸의 거절로 바꾸고, 아니면 그대로 던진다(부르는 쪽이 코드만 남기고 알린다). */
function asRejection(error: unknown, values: CodeValues): CodeSaveResult {
  const field = CONSTRAINT_FIELD[constraintOf(error) ?? ""];
  if (field) return { ok: false, errors: { [field]: "받을 수 없는 값입니다" }, values };
  throw error;
}

/**
 * 값 추가 — 사용자 코드 묶음에만. 세기 · 넣기를 한 트랜잭션에서 공통코드의 잠금을 쥐고 한다
 * (설계 「경계를 정했다 (PR C 1회차)」) — 동시에 더해도 묶음의 상한을 넘지 않는다.
 * 묶음 안의 겹침은 DB 의 유일 제약이 막고, 거절되면 겹친 값이 「사용 안 함」인지 보고 알린다.
 */
export async function createCode(db: Db, group: string, values: CodeValues): Promise<CodeSaveResult | CodeNotFound> {
  const g = await getCodeGroup(db, group);
  if (!g) return { ok: false, notFound: true };
  if (g.isSystem) return { ok: false, errors: {}, formError: SYSTEM_LOCKED, values };
  const parsed = parseNewCode(values);
  // 단위 묶음이면 사양(기준 단위 · 배수 · 소수 자릿수)도 함께 받는다 — 단위마다 사양이 하나씩 있다(ADR 0017).
  const isUnit = g.code === UNIT_GROUP;
  const spec = isUnit
    ? parseNewUnitSpec(values, parsed.ok ? parsed.value.code : (values.code ?? "").trim())
    : undefined;
  const errors: CodeErrors = { ...(parsed.ok ? {} : parsed.errors), ...(spec && !spec.ok ? spec.errors : {}) };
  if (parsed.ok && spec?.ok) {
    const problem = await baseUnitProblem(db, parsed.value.code, spec.value);
    if (problem) errors.baseUnit = problem;
  }
  if (!parsed.ok || (spec && !spec.ok) || Object.keys(errors).length) return { ok: false, errors, values };

  try {
    return await db.transaction(async (tx): Promise<CodeSaveResult> => {
      await tx.execute(sql`select pg_advisory_xact_lock(${REGISTER_LOCK.codes})`);
      const [{ n }] = await tx.select({ n: count() }).from(codes).where(eq(codes.groupCode, g.code));
      if (n >= CODE_LIMIT)
        return { ok: false, errors: {}, formError: limitMessage("한 묶음의 값", CODE_LIMIT), values };
      await tx.insert(codes).values({ ...parsed.value, groupCode: g.code });
      if (spec?.ok) await tx.insert(unitSpecs).values({ unit: parsed.value.code, ...spec.value });
      return { ok: true, code: parsed.value.code };
    });
  } catch (error) {
    if (constraintOf(error) === UNIQUE) {
      const same = await getCode(db, g.code, parsed.value.code);
      return { ok: false, errors: { code: same && !same.active ? DUPLICATE_INACTIVE : DUPLICATE }, values };
    }
    return asRejection(error, values);
  }
}

/**
 * 수정 — 사용자 코드 묶음의 값만. 이름 · 정렬 순서 · 사용 여부를 바꾸고, 코드는 바꾸지 않는다.
 * 프로그램이 기대는 값(국가 KR — src/lib/master-codes.ts)은 「사용 안 함」으로 바꾸지 못한다.
 * version 은 화면을 연 때의 버전이다 — 그 사이 다른 사람이 고쳤으면 저장하지 않는다(저자 판정 2026-11-05 — 품목 · 거래처와 같다).
 * 주지 않으면 버전을 보지 않는다(서버 안의 시험용 — 화면의 입구는 늘 준다).
 */
export async function updateCode(
  db: Db,
  group: string,
  code: string,
  values: CodeValues,
  version?: string,
): Promise<CodeSaveResult | CodeNotFound> {
  const g = await getCodeGroup(db, group);
  const current = g && (await getCode(db, g.code, code));
  if (!g || !current) return { ok: false, notFound: true };
  if (g.isSystem) return { ok: false, errors: {}, formError: SYSTEM_LOCKED, values };
  const parsed = parseCodeUpdate(values);
  // 단위 묶음이면 소수 자릿수도 고친다 — 기준 단위 · 배수는 등록 뒤 바뀌지 않는다(ADR 0017).
  // 자릿수를 줄이는 것은 그 단위의 수불 수량이 다 맞을 때만이다(설계 「PR A 를 열기 전에 정한 것」 — PR C 가 더함).
  // 자릿수를 보내지 않으면 그대로 둔다.
  const decimals = g.code === UNIT_GROUP && values.decimals !== undefined ? parseUnitDecimals(values) : undefined;
  const errors: CodeErrors = {
    ...(parsed.ok ? {} : parsed.errors),
    ...(decimals && !decimals.ok ? decimals.errors : {}),
  };
  if (!errors.active && values.active === "N" && isAlwaysActive(g.code, current.code))
    errors.active = ALWAYS_ACTIVE_MESSAGE;
  if (!parsed.ok || (decimals && !decimals.ok) || Object.keys(errors).length) return { ok: false, errors, values };
  if (version !== undefined && !VERSION.test(version)) return { ok: false, errors: {}, formError: STALE, values };
  try {
    // 값과 사양을 한 트랜잭션에서 고친다 — 버전이 어긋나면 둘 다 바뀌지 않는다.
    return await db.transaction(async (tx): Promise<CodeSaveResult> => {
      // 자릿수를 줄이는 것은 그 단위의 수불 수량이 다 맞을 때만이다(ADR 0017) — 재고의 잠금을 쥐고 본다. 잠금은 표를 고치기 전에
      // 쥔다 — 수불 저장 · 매일 밤 되돌림과 같은 차례(잠금 → 표). 고친 뒤 쥐면 되돌림과 교착한다(PR C 리뷰 2회차).
      if (decimals?.ok) {
        await lockStock(tx);
        if (!(await unitQuantitiesFit(tx, current.code, decimals.value.decimals)))
          throw new DecimalsMisfit(decimals.value.decimals);
      }
      const done = await tx
        .update(codes)
        .set({ ...parsed.value, updatedAt: touched() })
        .where(
          version === undefined
            ? eq(codes.id, current.id)
            : and(eq(codes.id, current.id), versionIs(codes.updatedAt, version)),
        )
        .returning({ id: codes.id });
      if (done.length === 0) return { ok: false, errors: {}, formError: STALE, values };
      if (decimals?.ok)
        await tx
          .update(unitSpecs)
          .set({ decimals: decimals.value.decimals, updatedAt: touched() })
          .where(eq(unitSpecs.unit, current.code));
      return { ok: true, code };
    });
  } catch (error) {
    if (error instanceof DecimalsMisfit)
      return {
        ok: false,
        errors: {
          decimals: `이 단위의 수불 수량 · 작성 중 실사의 실물 수량 가운데 소수 ${error.decimals}자리에 맞지 않는 것이 있어 줄이지 못합니다`,
        },
        values,
      };
    return asRejection(error, values);
  }
}

/** 자릿수를 줄이면 남은 수불 수량이 맞지 않는다 — 던져 고침을 되돌린다. */
class DecimalsMisfit extends Error {
  constructor(readonly decimals: number) {
    super("단위 자릿수를 줄이지 못한다");
  }
}
