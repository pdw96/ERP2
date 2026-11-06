import { count, sql } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import { eun } from "@/lib/josa";
import { CODE_KEY, type SheetRow } from "@/lib/sheet";
import { nextCode, type CodePrefix } from "./numbering";
import type { Db } from "./types";

// 기준정보 화면(품목 · 창고 · 거래처 · 공통코드)이 같이 쓰는 것 — 주소의 거르기 값 읽기, 찾기, DB 거절 읽기, 잠금 안의 등록.

/** 등록의 차례를 지키는 DB 잠금 번호 — 테이블마다 하나(배포 빌드의 잠금 20261102 와 겹치지 않게). */
export const REGISTER_LOCK = {
  items: 2026110301,
  warehouses: 2026110302,
  partners: 2026110303,
  codes: 2026110304,
  numberRules: 2026110601,
} as const;

export type Params = Record<string, string | string[] | undefined>;

export const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** 찾을 글자 — 50자까지. 넘으면 찾지 않고 알린다. */
export function searchText(params: Params): { q: string; notice?: string } {
  const q = (first(params.q) ?? "").trim();
  if (Array.from(q).length > 50) return { q: "", notice: "찾을 글자는 50자까지입니다 — 찾지 않았습니다" };
  return { q };
}

/** LIKE 의 특수 글자(% _ \)를 글자 그대로 찾게 한다. */
export const likeLiteral = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

type PgError = { code?: string; constraint?: string; constraint_name?: string };

/** Drizzle 이 감싼 안쪽의 PostgreSQL 오류. */
export function pgError(error: unknown): PgError {
  const e = (error ?? {}) as PgError & { cause?: unknown };
  return (e.cause && typeof e.cause === "object" ? e.cause : e) as PgError;
}

/** 거절한 제약의 이름 — `<테이블>_<무엇>` 꼴이라 칸으로 가를 수 있다. */
export const constraintOf = (error: unknown) => {
  const e = pgError(error);
  return e.constraint ?? e.constraint_name;
};

export type Registered = { ok: true; code: string } | { ok: false; reason: "limit" | "collided" };

/**
 * 등록 — 세기 · 번호 받기 · 넣기를 한 트랜잭션에서 테이블의 잠금을 쥐고 한다(설계 「경계를 정했다 (PR C 1회차)」).
 * 동시에 등록해도 상한을 넘지 않고 번호가 겹치지 않는다. 잠금은 트랜잭션이 끝나면 저절로 풀린다(연결 풀을 거쳐도 남지 않는다).
 * 그래도 번호가 겹치면(잠금 밖에서 넣은 행) 한 번 더 받아 넣고, 또 겹치면 「collided」. 그 밖의 거절은 던진다.
 */
export async function registerWithCode(
  db: Db,
  spec: {
    table: PgTable;
    lock: number;
    limit: number;
    prefix: CodePrefix;
    uniqueConstraint: string;
    insert: (tx: Db, code: string) => Promise<unknown>;
  },
): Promise<Registered> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(${spec.lock})`);
        const [{ n }] = await tx.select({ n: count() }).from(spec.table);
        if (n >= spec.limit) return { ok: false, reason: "limit" } as const;
        const code = await nextCode(tx, spec.prefix);
        await spec.insert(tx, code);
        return { ok: true, code } as const;
      });
    } catch (error) {
      if (constraintOf(error) === spec.uniqueConstraint) {
        if (attempt === 0) continue;
        return { ok: false, reason: "collided" };
      }
      throw error;
    }
  }
}

export const COLLIDED = "같은 때 등록한 사람이 있어 저장하지 못했습니다 — 다시 저장하세요";
export const limitMessage = (what: string, limit: number) =>
  `${eun(what)} ${limit.toLocaleString("ko-KR")}개까지 등록됩니다 — 매일 밤 샘플 데이터로 돌아간 뒤 다시 등록하세요`;

export type RegisteredRow =
  | { ok: true; code: string }
  | { ok: false; reason: "limit" }
  | { ok: false; reason: "collided" }
  | { ok: false; reason: "rejected"; error: unknown };

/**
 * 여러 줄의 등록(시트형 등록, PR F) — 한 트랜잭션에서 테이블의 잠금을 쥐고 줄 차례대로 센다 · 번호를 받는다 · 넣는다.
 * 코드는 줄 차례로 붙고, 상한에 닿은 뒤의 줄은 「limit」으로 남는다(동시에 등록해도 넘지 않는다 — PR C 1회차의 경계).
 * 줄마다 저장점(savepoint) 안에서 넣어, DB 제약에 걸린 줄은 「rejected」로 남고 앞뒤 줄은 그대로 저장된다.
 * 제약 위반(23xxx)이 아닌 실패는 던진다 — 트랜잭션이 통째로 되돌아가 아무것도 저장되지 않는다.
 * 저장한 뒤 읽을 것(거래처의 같은 사업자번호 따위)은 afterAll 로 같은 트랜잭션 안에서 읽는다 — 저장이 끝난 뒤 바깥에서 읽다
 * 실패하면 저장한 줄을 「저장하지 못함」으로 알리게 된다(리뷰 1회차). afterAll 이 실패하면 아무것도 저장되지 않는다.
 */
export async function registerRowsWithCode(
  db: Db,
  spec: {
    table: PgTable;
    lock: number;
    limit: number;
    uniqueConstraint: string;
    rows: readonly { prefix: CodePrefix; insert: (tx: Db, code: string) => Promise<unknown> }[];
    afterAll?: (tx: Db, results: readonly RegisteredRow[]) => Promise<void>;
  },
): Promise<RegisteredRow[]> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${spec.lock})`);
    let [{ n }] = await tx.select({ n: count() }).from(spec.table);
    const results: RegisteredRow[] = [];
    for (const row of spec.rows) {
      if (n >= spec.limit) {
        results.push({ ok: false, reason: "limit" });
        continue;
      }
      const code = await nextCode(tx, row.prefix);
      try {
        await tx.transaction((sp) => row.insert(sp, code).then(() => undefined));
        results.push({ ok: true, code });
        n++;
      } catch (error) {
        if (constraintOf(error) === spec.uniqueConstraint) results.push({ ok: false, reason: "collided" });
        else if (pgError(error).code?.startsWith("23")) results.push({ ok: false, reason: "rejected", error });
        else throw error;
      }
    }
    await spec.afterAll?.(tx, results);
    return results;
  });
}

// ── 고침의 버전(PR J) ─────────────────────────────────────

/**
 * 행의 버전 — 마지막으로 고친 때(updated_at)를 마이크로초 정수 글자로. 불러온 화면 · 시트가 들고 있다가 저장할 때 돌려준다.
 * 그 사이 다른 사람이 고쳤으면 버전이 달라 저장을 거절한다(저자 판정 2026-11-05 — 시트 · 한 건 수정 다 막음).
 */
export const versionOf = (updatedAt: AnyPgColumn) =>
  sql<string>`(extract(epoch from ${updatedAt}) * 1000000)::bigint::text`;

/** 버전의 꼴 — 숫자만. 다르면 DB 에 묻지 않고 「다른 사람이 먼저 고쳤다」로 본다. */
export const VERSION = /^[0-9]{1,20}$/;

/**
 * 그 행의 버전이 이것인가 — 고침의 WHERE 에 붙인다. 받은 값을 수로 바꾸지 않고 글자로 견준다 — bigint 를 넘는 20자리 수가
 * 와도 DB 가 거절(22003)하지 않고 「다른 사람이 먼저 고쳤다」가 된다. 그렇지 않으면 시트 전체가 저장되지 않는다(대장 NC-9).
 */
export const versionIs = (updatedAt: AnyPgColumn, version: string) =>
  sql`(extract(epoch from ${updatedAt}) * 1000000)::bigint::text = ${version}`;

/** 고친 때 — 마이크로초까지 남겨 같은 밀리초의 두 고침도 버전이 갈린다. */
export const touched = () => sql`clock_timestamp()`;

export const STALE = "다른 사람이 먼저 고쳤습니다 — 화면을 새로 열어 다시 고치세요";
export const STALE_ROW = "불러온 뒤 다른 사람이 먼저 고쳤습니다 — 이 행을 지우고 다시 불러오세요";

export type UpdatedRow =
  { ok: true } | { ok: false; reason: "stale" } | { ok: false; reason: "rejected"; error: unknown };

/**
 * 여러 줄의 고침(시트, PR J) — 부르는 쪽의 트랜잭션 안에서 줄마다 저장점(savepoint) 안에서 고친다. update 는 버전이 맞을 때만
 * 고치고 고친 행 수를 돌려준다 — 0 이면 그 사이 다른 사람이 고친 것(「stale」). DB 제약에 걸린 줄은 「rejected」로 남고 앞뒤 줄은
 * 그대로다. 제약 위반(23xxx)이 아닌 실패는 던진다 — 트랜잭션이 통째로 되돌아간다(시트형 등록과 같은 규칙).
 */
export async function updateRowsWithVersion(
  tx: Db,
  rows: readonly { update: (sp: Db) => Promise<number> }[],
): Promise<UpdatedRow[]> {
  const results: UpdatedRow[] = [];
  for (const row of rows) {
    try {
      const n = await tx.transaction((sp) => row.update(sp));
      results.push(n > 0 ? { ok: true } : { ok: false, reason: "stale" });
    } catch (error) {
      if (pgError(error).code?.startsWith("23")) results.push({ ok: false, reason: "rejected", error });
      else throw error;
    }
  }
  return results;
}

export const DUPLICATE_ROW = "같은 코드의 행이 시트에 둘 이상입니다 — 한 행만 남기세요";

/** 저장한 줄의 코드 — 고침은 그 줄의 코드, 새 등록은 붙은 코드. */
export const savedCode = (
  r: { kind: "new" | "edit"; row: SheetRow },
  done: { ok: true } | { ok: true; code: string },
): { code: string; updated?: true } =>
  r.kind === "edit" ? { code: r.row[CODE_KEY], updated: true } : { code: (done as { code: string }).code };
