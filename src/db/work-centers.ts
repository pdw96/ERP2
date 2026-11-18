import { and, asc, count, eq, getTableColumns, ilike, or, sql, type SQL } from "drizzle-orm";
import { PROCESS_CODE } from "@/lib/process-input";
import {
  parseNewWorkCenter,
  parseWorkCenterUpdate,
  WORK_CENTER_CODE,
  type WorkCenterErrors,
  type WorkCenterField,
  type WorkCenterValues,
} from "@/lib/work-center-input";
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
import { processes, workCenters } from "./schema";
import type { Db } from "./types";

// 작업장(메뉴 「작업장 등록」)의 목록 · 등록 · 수정. 화면(src/app/production/work-centers/)은 이 함수만 부른다.
// 입력 검사는 src/lib/work-center-input.ts, 등록 상한 · 코드 겹침 · 공정 확인은 여기서 본다.

/** 작업장의 등록 상한 — 「사용 안 함」도 센다. 매일 밤 되돌림이 샘플 수로 줄인다. */
export const WORK_CENTER_LIMIT = 100;

/** 작업장 한 줄 — 공정의 코드 · 이름을 함께 든다. */
export type WorkCenterRow = typeof workCenters.$inferSelect & { processCode: string; processName: string };
/** 작업장과 그 버전(마지막으로 고친 때) — 수정 화면이 들고 있다가 저장할 때 돌려준다. */
export type WorkCenterWithVersion = WorkCenterRow & { version: string };

const columns = {
  ...getTableColumns(workCenters),
  processCode: processes.code,
  processName: processes.name,
};

// ── 목록 ─────────────────────────────────────────────

const UNKNOWN_PROCESS_NOTICE = "받지 않는 공정 값이라 거르지 않았습니다";

/** process 가 빈 글자면 모든 공정. */
export type WorkCenterFilter = { q: string; process: string; includeInactive: boolean };
export type WorkCenterFilterNotice = { field: "q" | "process"; message: string };

/** 주소의 거르기 값을 읽는다. 받지 않은 값은 거르지 않고 알린다. */
export function parseWorkCenterFilter(params: Params): {
  filter: WorkCenterFilter;
  notices: WorkCenterFilterNotice[];
} {
  const search = searchText(params);
  const notices: WorkCenterFilterNotice[] = search.notice ? [{ field: "q", message: search.notice }] : [];
  const rawProcess = (first(params.process) ?? "").trim();
  let process = "";
  if (rawProcess) {
    if (PROCESS_CODE.test(rawProcess)) process = rawProcess;
    else notices.push({ field: "process", message: UNKNOWN_PROCESS_NOTICE });
  }
  return { filter: { q: search.q, process, includeInactive: first(params.inactive) === "1" }, notices };
}

/** 꼴은 맞지만 없는 공정이면 꼴이 틀린 때처럼 거르지 않고(모든 공정) 알린다 — 빈 목록이 「작업장이 없다」로 읽히지 않게. */
export function dropUnknownProcess(
  filter: WorkCenterFilter,
  notices: WorkCenterFilterNotice[],
  options: readonly ProcessOption[],
): { filter: WorkCenterFilter; notices: WorkCenterFilterNotice[] } {
  if (!filter.process || options.some((o) => o.code === filter.process)) return { filter, notices };
  return {
    filter: { ...filter, process: "" },
    notices: [...notices, { field: "process", message: UNKNOWN_PROCESS_NOTICE }],
  };
}

/** 코드 순으로. 찾기는 코드 · 작업장명에 글자가 들어 있는지만 본다(대소문자 무시). */
export async function listWorkCenters(db: Db, filter: WorkCenterFilter): Promise<WorkCenterRow[]> {
  const where: SQL[] = [];
  if (filter.q)
    where.push(or(ilike(workCenters.code, likeLiteral(filter.q)), ilike(workCenters.name, likeLiteral(filter.q)))!);
  if (filter.process) where.push(eq(processes.code, filter.process));
  if (!filter.includeInactive) where.push(eq(workCenters.active, true));
  return db
    .select(columns)
    .from(workCenters)
    .innerJoin(processes, eq(workCenters.processId, processes.id))
    .where(and(...where))
    .orderBy(asc(workCenters.code));
}

/** 작업장 하나와 그 버전 — 한 쿼리로 읽어, 보인 값과 버전이 어긋나지 않는다. 꼴이 틀린 코드는 DB 에 묻지 않는다. */
export async function getWorkCenter(db: Db, code: string): Promise<WorkCenterWithVersion | undefined> {
  if (!WORK_CENTER_CODE.test(code)) return undefined;
  const [row] = await db
    .select({ ...columns, version: versionOf(workCenters.updatedAt) })
    .from(workCenters)
    .innerJoin(processes, eq(workCenters.processId, processes.id))
    .where(eq(workCenters.code, code));
  return row;
}

export type ProcessOption = { code: string; name: string; active: boolean };

/** 등록 화면의 공정 고르기 — 모든 공정을 코드 순으로(「사용 안 함」은 화면이 가린다). */
export async function listProcessOptions(db: Db): Promise<ProcessOption[]> {
  return db
    .select({ code: processes.code, name: processes.name, active: processes.active })
    .from(processes)
    .orderBy(asc(processes.code));
}

// ── 등록 · 수정 ─────────────────────────────────────────

export type WorkCenterSaveResult =
  { ok: true; code: string } | { ok: false; errors: WorkCenterErrors; formError?: string; values: WorkCenterValues };

const DUPLICATE = "이미 있는 작업장코드입니다";
const DUPLICATE_INACTIVE =
  "「사용 안 함」으로 있는 작업장입니다 — 목록에서 「사용 안 함 포함」을 켜고 그 작업장을 「사용」으로 바꾸세요";
const NO_PROCESS = "없는 공정입니다 — 목록에서 고르세요";
const INACTIVE_PROCESS = "「사용 안 함」인 공정입니다 — 다른 공정을 고르세요";

// DB 제약에 걸린 것(서버의 검사를 빠뜨렸을 때)을 칸으로 가른다.
const CONSTRAINT_FIELD: Record<string, WorkCenterField> = {
  work_centers_code_format: "code",
  work_centers_name_length: "name",
  work_centers_note_length: "note",
  work_centers_process_id_processes_id_fk: "process",
};

/** 제약 위반이면 칸의 거절로 바꾸고, 아니면 그대로 던진다(부르는 쪽이 코드만 남기고 알린다). */
function asRejection(error: unknown, values: WorkCenterValues): WorkCenterSaveResult {
  const field = CONSTRAINT_FIELD[constraintOf(error) ?? ""];
  if (field) return { ok: false, errors: { [field]: "받을 수 없는 값입니다" }, values };
  throw error;
}

/** 등록 — 세기 · 공정 찾기 · 넣기를 한 트랜잭션에서 잠금을 쥐고 한다 — 동시에 더해도 상한을 넘지 않는다. */
export async function createWorkCenter(db: Db, values: WorkCenterValues): Promise<WorkCenterSaveResult> {
  const parsed = parseNewWorkCenter(values);
  if (!parsed.ok) return { ok: false, errors: parsed.errors, values };
  const { process: processCode, ...fields } = parsed.value;
  try {
    return await db.transaction(async (tx): Promise<WorkCenterSaveResult> => {
      await tx.execute(sql`select pg_advisory_xact_lock(${REGISTER_LOCK.workCenters})`);
      const [{ n }] = await tx.select({ n: count() }).from(workCenters);
      if (n >= WORK_CENTER_LIMIT)
        return { ok: false, errors: {}, formError: limitMessage("작업장", WORK_CENTER_LIMIT), values };
      const [found] = await tx
        .select({ id: processes.id, active: processes.active })
        .from(processes)
        .where(eq(processes.code, processCode));
      if (!found) return { ok: false, errors: { process: NO_PROCESS }, values };
      if (!found.active) return { ok: false, errors: { process: INACTIVE_PROCESS }, values };
      await tx.insert(workCenters).values({ ...fields, processId: found.id });
      return { ok: true, code: fields.code };
    });
  } catch (error) {
    if (constraintOf(error) === "work_centers_code_unique") {
      // 실패한 트랜잭션 밖에서 그 코드의 행을 읽어 「사용 안 함」인지 본다.
      const same = await getWorkCenter(db, fields.code);
      return { ok: false, errors: { code: same && !same.active ? DUPLICATE_INACTIVE : DUPLICATE }, values };
    }
    return asRejection(error, values);
  }
}

/**
 * 수정 — 코드 · 공정은 바꾸지 않는다. 작업장명 · 비고 · 사용 여부.
 * version 은 화면을 연 때의 버전이다 — 그 사이 다른 사람이 고쳤으면 저장하지 않는다. 주지 않으면 버전을 보지 않는다(서버 안의 시험용).
 */
export async function updateWorkCenter(
  db: Db,
  code: string,
  values: WorkCenterValues,
  version?: string,
): Promise<WorkCenterSaveResult | { ok: false; notFound: true }> {
  const current = await getWorkCenter(db, code);
  if (!current) return { ok: false, notFound: true };
  const parsed = parseWorkCenterUpdate(values);
  if (!parsed.ok) return { ok: false, errors: parsed.errors, values };
  if (version !== undefined && !VERSION.test(version)) return { ok: false, errors: {}, formError: STALE, values };
  try {
    const done = await db
      .update(workCenters)
      .set({ ...parsed.value, updatedAt: touched() })
      .where(
        version === undefined
          ? eq(workCenters.id, current.id)
          : and(eq(workCenters.id, current.id), versionIs(workCenters.updatedAt, version)),
      )
      .returning({ id: workCenters.id });
    if (done.length === 0) return { ok: false, errors: {}, formError: STALE, values };
    return { ok: true, code };
  } catch (error) {
    return asRejection(error, values);
  }
}
