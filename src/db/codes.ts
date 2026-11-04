import { and, asc, count, eq, max, sql } from "drizzle-orm";
import { GROUP_CODE, MINOR_CODE } from "@/lib/code-fields";
import { parseCodeUpdate, parseNewCode, type CodeErrors, type CodeField, type CodeValues } from "@/lib/code-input";
import { isAlwaysActive } from "@/lib/master-codes";
import { REGISTER_LOCK, constraintOf, limitMessage } from "./master-shared";
import { codeGroups, codes } from "./schema";
import type { Db } from "./types";

// 시스템 관리 › 공통코드의 목록 · 값 추가 · 수정(조각 「기준정보」 PR E). 화면(src/app/system/codes/)은 이 함수만 부른다.
// 입력 검사는 src/lib/code-input.ts, 묶음의 가름(시스템 · 사용자) · 묶음 안의 겹침 · 등록 상한은 여기서 본다.
// 묶음(Major)을 만들거나 고치는 길은 없다 — 묶음은 그것을 쓰는 조각의 PR 이 더한다(ADR 0009).

/** 묶음마다 값의 등록 상한(설계 「PR B 를 열기 전에 정한 것」). 매일 밤 되돌림이 샘플 수로 줄인다. */
export const CODE_LIMIT = 100;

export type CodeGroup = typeof codeGroups.$inferSelect;
export type Code = typeof codes.$inferSelect;
export type CodeGroupRow = Pick<CodeGroup, "code" | "name" | "isSystem"> & { values: number };

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

export async function getCode(db: Db, group: string, code: string): Promise<Code | undefined> {
  if (!GROUP_CODE.test(group) || !MINOR_CODE.test(code)) return undefined;
  const [row] = await db
    .select()
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
  if (!parsed.ok) return { ok: false, errors: parsed.errors, values };

  try {
    return await db.transaction(async (tx): Promise<CodeSaveResult> => {
      await tx.execute(sql`select pg_advisory_xact_lock(${REGISTER_LOCK.codes})`);
      const [{ n }] = await tx.select({ n: count() }).from(codes).where(eq(codes.groupCode, g.code));
      if (n >= CODE_LIMIT)
        return { ok: false, errors: {}, formError: limitMessage("한 묶음의 값", CODE_LIMIT), values };
      await tx.insert(codes).values({ ...parsed.value, groupCode: g.code });
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
 */
export async function updateCode(
  db: Db,
  group: string,
  code: string,
  values: CodeValues,
): Promise<CodeSaveResult | CodeNotFound> {
  const g = await getCodeGroup(db, group);
  const current = g && (await getCode(db, g.code, code));
  if (!g || !current) return { ok: false, notFound: true };
  if (g.isSystem) return { ok: false, errors: {}, formError: SYSTEM_LOCKED, values };
  const parsed = parseCodeUpdate(values);
  const errors: CodeErrors = parsed.ok ? {} : { ...parsed.errors };
  if (!errors.active && values.active === "N" && isAlwaysActive(g.code, current.code))
    errors.active = ALWAYS_ACTIVE_MESSAGE;
  if (!parsed.ok || Object.keys(errors).length) return { ok: false, errors, values };
  try {
    await db.update(codes).set(parsed.value).where(eq(codes.id, current.id));
    return { ok: true, code };
  } catch (error) {
    return asRejection(error, values);
  }
}
