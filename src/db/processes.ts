import { and, asc, count, eq, getTableColumns, ilike, or, sql, type SQL } from "drizzle-orm";
import {
  parseNewProcess,
  parseProcessUpdate,
  PROCESS_CODE,
  type ProcessErrors,
  type ProcessField,
  type ProcessValues,
} from "@/lib/process-input";
import {
  REGISTER_LOCK,
  STALE,
  VERSION,
  constraintOf,
  first,
  likeLiteral,
  limitMessage,
  searchText,
  touched,
  versionIs,
  versionOf,
  type Params,
} from "./master-shared";
import { processes } from "./schema";
import type { Db } from "./types";

// 공정(메뉴 「공정 등록」)의 목록 · 등록 · 수정. 화면(src/app/production/processes/)은 이 함수만 부른다.
// 입력 검사는 src/lib/process-input.ts, 등록 상한 · 코드 겹침은 여기서 본다.

/** 공정의 등록 상한 — 「사용 안 함」도 센다. 매일 밤 되돌림이 샘플 수로 줄인다. */
export const PROCESS_LIMIT = 50;

export type Process = typeof processes.$inferSelect;
/** 공정과 그 버전(마지막으로 고친 때) — 수정 화면이 들고 있다가 저장할 때 돌려준다. */
export type ProcessWithVersion = Process & { version: string };

// ── 목록 ─────────────────────────────────────────────

export type ProcessFilter = { q: string; includeInactive: boolean };
export type ProcessFilterNotice = { field: "q"; message: string };

/** 주소의 거르기 값을 읽는다. 받지 않은 값은 거르지 않고 알린다. */
export function parseProcessFilter(params: Params): { filter: ProcessFilter; notices: ProcessFilterNotice[] } {
  const search = searchText(params);
  return {
    filter: { q: search.q, includeInactive: first(params.inactive) === "1" },
    notices: search.notice ? [{ field: "q", message: search.notice }] : [],
  };
}

/** 코드 순으로. 찾기는 코드 · 공정명에 글자가 들어 있는지만 본다(대소문자 무시). */
export async function listProcesses(db: Db, filter: ProcessFilter): Promise<Process[]> {
  const where: SQL[] = [];
  if (filter.q)
    where.push(or(ilike(processes.code, likeLiteral(filter.q)), ilike(processes.name, likeLiteral(filter.q)))!);
  if (!filter.includeInactive) where.push(eq(processes.active, true));
  return db
    .select()
    .from(processes)
    .where(and(...where))
    .orderBy(asc(processes.code));
}

/** 공정 하나와 그 버전 — 한 쿼리로 읽어, 보인 값과 버전이 어긋나지 않는다. 꼴이 틀린 코드는 DB 에 묻지 않는다. */
export async function getProcess(db: Db, code: string): Promise<ProcessWithVersion | undefined> {
  if (!PROCESS_CODE.test(code)) return undefined;
  const [row] = await db
    .select({ ...getTableColumns(processes), version: versionOf(processes.updatedAt) })
    .from(processes)
    .where(eq(processes.code, code));
  return row;
}

// ── 등록 · 수정 ─────────────────────────────────────────

export type ProcessSaveResult =
  { ok: true; code: string } | { ok: false; errors: ProcessErrors; formError?: string; values: ProcessValues };

const DUPLICATE = "이미 있는 공정코드입니다";
const DUPLICATE_INACTIVE =
  "「사용 안 함」으로 있는 공정입니다 — 목록에서 「사용 안 함 포함」을 켜고 그 공정을 「사용」으로 바꾸세요";

// DB 제약에 걸린 것(서버의 검사를 빠뜨렸을 때)을 칸으로 가른다.
const CONSTRAINT_FIELD: Record<string, ProcessField> = {
  processes_code_format: "code",
  processes_name_length: "name",
  processes_note_length: "note",
};

/** 제약 위반이면 칸의 거절로 바꾸고, 아니면 그대로 던진다(부르는 쪽이 코드만 남기고 알린다). */
function asRejection(error: unknown, values: ProcessValues): ProcessSaveResult {
  const field = CONSTRAINT_FIELD[constraintOf(error) ?? ""];
  if (field) return { ok: false, errors: { [field]: "받을 수 없는 값입니다" }, values };
  throw error;
}

/** 등록 — 세기 · 넣기를 한 트랜잭션에서 잠금을 쥐고 한다 — 동시에 더해도 상한을 넘지 않는다. */
export async function createProcess(db: Db, values: ProcessValues): Promise<ProcessSaveResult> {
  const parsed = parseNewProcess(values);
  if (!parsed.ok) return { ok: false, errors: parsed.errors, values };
  try {
    return await db.transaction(async (tx): Promise<ProcessSaveResult> => {
      await tx.execute(sql`select pg_advisory_xact_lock(${REGISTER_LOCK.processes})`);
      const [{ n }] = await tx.select({ n: count() }).from(processes);
      if (n >= PROCESS_LIMIT) return { ok: false, errors: {}, formError: limitMessage("공정", PROCESS_LIMIT), values };
      await tx.insert(processes).values(parsed.value);
      return { ok: true, code: parsed.value.code };
    });
  } catch (error) {
    if (constraintOf(error) === "processes_code_unique") {
      // 실패한 트랜잭션 밖에서 그 코드의 행을 읽어 「사용 안 함」인지 본다.
      const same = await getProcess(db, parsed.value.code);
      return { ok: false, errors: { code: same && !same.active ? DUPLICATE_INACTIVE : DUPLICATE }, values };
    }
    return asRejection(error, values);
  }
}

/**
 * 수정 — 코드는 바꾸지 않는다. 공정명 · 비고 · 사용 여부.
 * version 은 화면을 연 때의 버전이다 — 그 사이 다른 사람이 고쳤으면 저장하지 않는다. 주지 않으면 버전을 보지 않는다(서버 안의 시험용).
 */
export async function updateProcess(
  db: Db,
  code: string,
  values: ProcessValues,
  version?: string,
): Promise<ProcessSaveResult | { ok: false; notFound: true }> {
  const current = await getProcess(db, code);
  if (!current) return { ok: false, notFound: true };
  const parsed = parseProcessUpdate(values);
  if (!parsed.ok) return { ok: false, errors: parsed.errors, values };
  if (version !== undefined && !VERSION.test(version)) return { ok: false, errors: {}, formError: STALE, values };
  try {
    const done = await db
      .update(processes)
      .set({ ...parsed.value, updatedAt: touched() })
      .where(
        version === undefined
          ? eq(processes.id, current.id)
          : and(eq(processes.id, current.id), versionIs(processes.updatedAt, version)),
      )
      .returning({ id: processes.id });
    if (done.length === 0) return { ok: false, errors: {}, formError: STALE, values };
    return { ok: true, code };
  } catch (error) {
    return asRejection(error, values);
  }
}
