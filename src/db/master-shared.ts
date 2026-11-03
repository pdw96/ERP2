import { count, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { eun } from "@/lib/josa";
import { nextCode, type CodePrefix } from "./numbering";
import type { Db } from "./types";

// 기준정보 화면(품목 · 창고 · 거래처)이 같이 쓰는 것 — 주소의 거르기 값 읽기, 찾기, DB 거절 읽기, 잠금 안의 등록.

/** 등록의 차례를 지키는 DB 잠금 번호 — 테이블마다 하나(배포 빌드의 잠금 20261102 와 겹치지 않게). */
export const REGISTER_LOCK = { items: 2026110301, warehouses: 2026110302, partners: 2026110303 } as const;

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
