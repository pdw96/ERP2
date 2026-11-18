import { and, asc, count, eq, getTableColumns, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { MINOR_CODE } from "@/lib/code-fields";
import {
  DEFECT_CLS_GROUP,
  DEFECT_TYPE_CODE,
  parseDefectTypeUpdate,
  parseNewDefectType,
  type DefectTypeErrors,
  type DefectTypeField,
  type DefectTypeValues,
} from "@/lib/defect-type-input";
import { PROCESS_CODE } from "@/lib/process-input";
import { codeState } from "./items";
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
import { codes, defectTypeProcesses, defectTypes, processes } from "./schema";
import type { Db } from "./types";
import type { ProcessOption } from "./work-centers";

// 불량 유형(메뉴 「불량 유형」)의 목록 · 등록 · 수정. 화면(src/app/quality/defect-types/)은 이 함수만 부른다.
// 입력 검사는 src/lib/defect-type-input.ts, 등록 상한 · 코드 겹침 · 대분류 · 공정 확인은 여기서 본다.

/** 불량 유형의 등록 상한 — 「사용 안 함」도 센다. 매일 밤 되돌림이 샘플 수로 줄인다. */
export const DEFECT_TYPE_LIMIT = 100;

/** 불량 유형 한 줄 — 대분류 이름과 발생 공정(공정코드 순, 없으면 공통)을 함께 든다. */
export type DefectTypeRow = typeof defectTypes.$inferSelect & {
  clsName: string;
  processes: { code: string; name: string }[];
};
/** 불량 유형과 그 버전(마지막으로 고친 때) — 수정 화면이 들고 있다가 저장할 때 돌려준다. */
export type DefectTypeWithVersion = DefectTypeRow & { version: string };

// ── 목록 ─────────────────────────────────────────────

const UNKNOWN_CLS_NOTICE = "받지 않는 대분류 값이라 거르지 않았습니다";
const UNKNOWN_PROCESS_NOTICE = "받지 않는 공정 값이라 거르지 않았습니다";

/** cls · process 가 빈 글자면 모든 값. */
export type DefectTypeFilter = { q: string; cls: string; process: string; includeInactive: boolean };
export type DefectTypeFilterNotice = { field: "q" | "cls" | "process"; message: string };

/** 주소의 거르기 값을 읽는다. 받지 않은 값은 거르지 않고 알린다. */
export function parseDefectTypeFilter(params: Params): {
  filter: DefectTypeFilter;
  notices: DefectTypeFilterNotice[];
} {
  const search = searchText(params);
  const notices: DefectTypeFilterNotice[] = search.notice ? [{ field: "q", message: search.notice }] : [];
  const rawCls = (first(params.cls) ?? "").trim();
  let cls = "";
  if (rawCls) {
    if (MINOR_CODE.test(rawCls)) cls = rawCls;
    else notices.push({ field: "cls", message: UNKNOWN_CLS_NOTICE });
  }
  const rawProcess = (first(params.process) ?? "").trim();
  let process = "";
  if (rawProcess) {
    if (PROCESS_CODE.test(rawProcess)) process = rawProcess;
    else notices.push({ field: "process", message: UNKNOWN_PROCESS_NOTICE });
  }
  return { filter: { q: search.q, cls, process, includeInactive: first(params.inactive) === "1" }, notices };
}

export type ClsOption = { code: string; name: string; active: boolean };

/** 꼴은 맞지만 없는 대분류 · 공정이면 꼴이 틀린 때처럼 거르지 않고(모두) 알린다 — 빈 목록이 「불량 유형이 없다」로 읽히지 않게. */
export function dropUnknownFilters(
  filter: DefectTypeFilter,
  notices: DefectTypeFilterNotice[],
  options: { classes: readonly ClsOption[]; processes: readonly ProcessOption[] },
): { filter: DefectTypeFilter; notices: DefectTypeFilterNotice[] } {
  let next = filter;
  const more: DefectTypeFilterNotice[] = [];
  if (next.cls && !options.classes.some((o) => o.code === next.cls)) {
    next = { ...next, cls: "" };
    more.push({ field: "cls", message: UNKNOWN_CLS_NOTICE });
  }
  if (next.process && !options.processes.some((o) => o.code === next.process)) {
    next = { ...next, process: "" };
    more.push({ field: "process", message: UNKNOWN_PROCESS_NOTICE });
  }
  return more.length ? { filter: next, notices: [...notices, ...more] } : { filter, notices };
}

const columns = { ...getTableColumns(defectTypes), clsName: codes.name };

/** 불량 유형 행에 발생 공정을 붙인다 — 잇는 표를 한 번에 읽는다. */
async function withProcesses(
  db: Db,
  rows: (typeof defectTypes.$inferSelect & { clsName: string })[],
): Promise<DefectTypeRow[]> {
  if (rows.length === 0) return [];
  const links = await db
    .select({ defectTypeId: defectTypeProcesses.defectTypeId, code: processes.code, name: processes.name })
    .from(defectTypeProcesses)
    .innerJoin(processes, eq(defectTypeProcesses.processId, processes.id))
    .where(
      inArray(
        defectTypeProcesses.defectTypeId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(processes.code));
  const byType = new Map<number, { code: string; name: string }[]>();
  for (const { defectTypeId, ...p } of links) byType.set(defectTypeId, [...(byType.get(defectTypeId) ?? []), p]);
  return rows.map((r) => ({ ...r, processes: byType.get(r.id) ?? [] }));
}

/** 코드 순으로. 찾기는 코드 · 불량유형명에 글자가 들어 있는지만 본다(대소문자 무시). 쿼리는 두 번 — 불량 유형, 그리고 잇는 표. */
export async function listDefectTypes(db: Db, filter: DefectTypeFilter): Promise<DefectTypeRow[]> {
  const where: SQL[] = [];
  if (filter.q)
    where.push(or(ilike(defectTypes.code, likeLiteral(filter.q)), ilike(defectTypes.name, likeLiteral(filter.q)))!);
  if (filter.cls) where.push(eq(defectTypes.cls, filter.cls));
  if (filter.process)
    // 그 공정에 붙은 것 + 공정이 하나도 없는 공통.
    where.push(sql`(exists (select 1 from ${defectTypeProcesses} join ${processes}
        on ${processes.id} = ${defectTypeProcesses.processId}
        where ${defectTypeProcesses.defectTypeId} = ${defectTypes.id} and ${processes.code} = ${filter.process})
      or not exists (select 1 from ${defectTypeProcesses} where ${defectTypeProcesses.defectTypeId} = ${defectTypes.id}))`);
  if (!filter.includeInactive) where.push(eq(defectTypes.active, true));
  const rows = await db
    .select(columns)
    .from(defectTypes)
    .innerJoin(codes, and(eq(codes.groupCode, defectTypes.clsGroup), eq(codes.code, defectTypes.cls)))
    .where(and(...where))
    .orderBy(asc(defectTypes.code));
  return withProcesses(db, rows);
}

/** 불량 유형 하나와 그 버전 — 보인 값과 버전이 어긋나지 않게 불량 유형은 한 쿼리로 읽는다. 꼴이 틀린 코드는 DB 에 묻지 않는다. */
export async function getDefectType(db: Db, code: string): Promise<DefectTypeWithVersion | undefined> {
  if (!DEFECT_TYPE_CODE.test(code)) return undefined;
  const [row] = await db
    .select({ ...columns, version: versionOf(defectTypes.updatedAt) })
    .from(defectTypes)
    .innerJoin(codes, and(eq(codes.groupCode, defectTypes.clsGroup), eq(codes.code, defectTypes.cls)))
    .where(eq(defectTypes.code, code));
  if (!row) return undefined;
  const [withLinks] = await withProcesses(db, [row]);
  return { ...withLinks, version: row.version };
}

/** 화면의 대분류 고르기 — 공통코드 DEFECT_CLS 의 값 전부를 정렬 순 · 코드 순으로(「사용 안 함」은 화면이 가린다). */
export async function listClsOptions(db: Db): Promise<ClsOption[]> {
  return db
    .select({ code: codes.code, name: codes.name, active: codes.active })
    .from(codes)
    .where(eq(codes.groupCode, DEFECT_CLS_GROUP))
    .orderBy(asc(codes.sortOrder), asc(codes.code));
}

// ── 등록 · 수정 ─────────────────────────────────────────

export type DefectTypeSaveResult =
  { ok: true; code: string } | { ok: false; errors: DefectTypeErrors; formError?: string; values: DefectTypeValues };

const DUPLICATE = "이미 있는 불량유형코드입니다";
const DUPLICATE_INACTIVE =
  "「사용 안 함」으로 있는 불량 유형입니다 — 목록에서 「사용 안 함 포함」을 켜고 그 불량 유형을 「사용」으로 바꾸세요";
const NO_CLS = "대분류를 목록에서 고르세요";
const INACTIVE_CLS = "「사용 안 함」인 대분류입니다 — 다른 값을 고르세요";
const NO_PROCESS = "없는 공정입니다 — 목록에서 고르세요";
const INACTIVE_PROCESS = "「사용 안 함」인 공정입니다 — 다른 공정을 고르세요";

// DB 제약에 걸린 것(서버의 검사를 빠뜨렸을 때)을 칸으로 가른다.
const CONSTRAINT_FIELD: Record<string, DefectTypeField> = {
  defect_types_code_format: "code",
  defect_types_name_length: "name",
  defect_types_note_length: "note",
  defect_types_cls_fk: "cls",
  defect_type_processes_process_id_processes_id_fk: "processes",
};

/** 제약 위반이면 칸의 거절로 바꾸고, 아니면 그대로 던진다(부르는 쪽이 코드만 남기고 알린다). */
function asRejection(error: unknown, values: DefectTypeValues): DefectTypeSaveResult {
  const field = CONSTRAINT_FIELD[constraintOf(error) ?? ""];
  if (field) return { ok: false, errors: { [field]: "받을 수 없는 값입니다" }, values };
  throw error;
}

/** 대분류 확인 — 공통코드에 있고 「사용 안 함」이 아닌지. 거절하는 까닭 하나, 괜찮으면 없다. */
async function clsProblem(db: Db, cls: string): Promise<string | undefined> {
  const state = await codeState(db, DEFECT_CLS_GROUP, cls);
  return state === "missing" ? NO_CLS : state === "inactive" ? INACTIVE_CLS : undefined;
}

/** 공정 확인 — 모두 있고 「사용 안 함」이 아닌지. 없는 것이 하나라도 있으면 없다는 말을 먼저. 공정의 id 도 돌려준다. */
async function resolveProcesses(
  db: Db,
  wanted: string[],
  skipInactive: ReadonlySet<string> = new Set(),
): Promise<{ ids: number[] } | { error: string }> {
  if (wanted.length === 0) return { ids: [] };
  const found = await db
    .select({ id: processes.id, code: processes.code, active: processes.active })
    .from(processes)
    .where(inArray(processes.code, wanted));
  if (found.length !== wanted.length) return { error: NO_PROCESS };
  if (found.some((p) => !p.active && !skipInactive.has(p.code))) return { error: INACTIVE_PROCESS };
  return { ids: found.map((p) => p.id) };
}

/** 등록 — 세기 · 대분류 · 공정 찾기 · 넣기를 한 트랜잭션에서 잠금을 쥐고 한다 — 동시에 더해도 상한을 넘지 않는다. */
export async function createDefectType(db: Db, values: DefectTypeValues): Promise<DefectTypeSaveResult> {
  const parsed = parseNewDefectType(values);
  if (!parsed.ok) return { ok: false, errors: parsed.errors, values };
  const { processes: processCodes, ...fields } = parsed.value;
  try {
    return await db.transaction(async (tx): Promise<DefectTypeSaveResult> => {
      await tx.execute(sql`select pg_advisory_xact_lock(${REGISTER_LOCK.defectTypes})`);
      const [{ n }] = await tx.select({ n: count() }).from(defectTypes);
      if (n >= DEFECT_TYPE_LIMIT)
        return { ok: false, errors: {}, formError: limitMessage("불량 유형", DEFECT_TYPE_LIMIT), values };
      const clsError = await clsProblem(tx, fields.cls);
      if (clsError) return { ok: false, errors: { cls: clsError }, values };
      const resolved = await resolveProcesses(tx, processCodes);
      if ("error" in resolved) return { ok: false, errors: { processes: resolved.error }, values };
      const [made] = await tx.insert(defectTypes).values(fields).returning({ id: defectTypes.id });
      if (resolved.ids.length)
        await tx
          .insert(defectTypeProcesses)
          .values(resolved.ids.map((processId) => ({ defectTypeId: made.id, processId })));
      return { ok: true, code: fields.code };
    });
  } catch (error) {
    if (constraintOf(error) === "defect_types_code_unique") {
      // 실패한 트랜잭션 밖에서 그 코드의 행을 읽어 「사용 안 함」인지 본다.
      const same = await getDefectType(db, fields.code);
      return { ok: false, errors: { code: same && !same.active ? DUPLICATE_INACTIVE : DUPLICATE }, values };
    }
    return asRejection(error, values);
  }
}

/** 한 트랜잭션 안에서 거절을 알려 되돌리는 막대 — 앞서 한 버전 조건부 UPDATE 도 함께 되돌아간다. */
class Rejected extends Error {
  constructor(readonly result: DefectTypeSaveResult) {
    super("rejected");
  }
}

/**
 * 수정 — 코드는 바꾸지 않는다. 불량유형명 · 대분류 · 발생 공정 · 비고 · 사용 여부.
 * 한 트랜잭션에서 버전 조건부 UPDATE 를 먼저 하고(0행이면 아무것도 건드리지 않고 STALE), 새로 고른 대분류 · 공정만 확인한 뒤 잇기를 지우고 다시 넣는다.
 * 대분류가 지금 값 그대로거나 이미 붙은 공정이면 「사용 안 함」이어도 남을 수 있다.
 * version 은 화면을 연 때의 버전이다 — 주지 않으면 버전을 보지 않는다(서버 안의 시험용).
 */
export async function updateDefectType(
  db: Db,
  code: string,
  values: DefectTypeValues,
  version?: string,
): Promise<DefectTypeSaveResult | { ok: false; notFound: true }> {
  const current = await getDefectType(db, code);
  if (!current) return { ok: false, notFound: true };
  const parsed = parseDefectTypeUpdate(values);
  if (!parsed.ok) return { ok: false, errors: parsed.errors, values };
  if (version !== undefined && !VERSION.test(version)) return { ok: false, errors: {}, formError: STALE, values };
  const { processes: processCodes, ...fields } = parsed.value;
  try {
    return await db.transaction(async (tx): Promise<DefectTypeSaveResult> => {
      const done = await tx
        .update(defectTypes)
        .set({ ...fields, updatedAt: touched() })
        .where(
          version === undefined
            ? eq(defectTypes.id, current.id)
            : and(eq(defectTypes.id, current.id), versionIs(defectTypes.updatedAt, version)),
        )
        .returning({ id: defectTypes.id });
      if (done.length === 0) return { ok: false, errors: {}, formError: STALE, values };
      if (fields.cls !== current.cls) {
        const clsError = await clsProblem(tx, fields.cls);
        if (clsError) throw new Rejected({ ok: false, errors: { cls: clsError }, values });
      }
      const attached = new Set(current.processes.map((p) => p.code));
      const resolved = await resolveProcesses(tx, processCodes, attached);
      if ("error" in resolved) throw new Rejected({ ok: false, errors: { processes: resolved.error }, values });
      await tx.delete(defectTypeProcesses).where(eq(defectTypeProcesses.defectTypeId, current.id));
      if (resolved.ids.length)
        await tx
          .insert(defectTypeProcesses)
          .values(resolved.ids.map((processId) => ({ defectTypeId: current.id, processId })));
      return { ok: true, code };
    });
  } catch (error) {
    if (error instanceof Rejected) return error.result;
    // 없는 대분류는 버전 조건부 UPDATE 의 참조 제약에서 먼저 걸린다 — 등록과 같은 말로 알린다.
    if (constraintOf(error) === "defect_types_cls_fk") return { ok: false, errors: { cls: NO_CLS }, values };
    return asRejection(error, values);
  }
}
