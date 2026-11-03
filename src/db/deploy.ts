import { sql } from "drizzle-orm";
import { resetToSample } from "./reset";
import { codeGroups } from "./schema";
import type { Db } from "./types";

// 배포 빌드가 배포 전에 부른다(ADR 0005) — 마이그레이션을 적용하고, 빈 DB 면 샘플 데이터를 넣는다.
// 실패하면 예외를 그대로 던져 빌드를 멈춘다. 그러면 배포가 나가지 않고 데모는 앞 배포에 남는다.

// 두 빌드가 같은 DB 에 동시에 적용하지 않게 거는 잠금의 번호(이 앱에서만 쓰는 아무 수).
const LOCK_KEY = 20261102;

export type PrepareOptions = {
  migrate: () => Promise<void>;
  /** 잠금은 한 접속을 오래 쥐는 직결 접속에서만 건다 — 연결 풀(pooler)에서는 잠금이 다른 접속에 남을 수 있다. */
  lock: boolean;
  log: (line: string) => void;
};

export async function prepareDatabase(db: Db, { migrate, lock, log }: PrepareOptions): Promise<void> {
  if (lock) await db.execute(sql`select pg_advisory_lock(${LOCK_KEY})`);
  try {
    const before = await appliedMigrations(db);
    await migrate();
    const after = await appliedMigrations(db);
    log(`마이그레이션: 적용된 것 ${after}개 — 이번에 ${after - before}개 적용`);

    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(codeGroups);
    if (Number(count) === 0) {
      const counts = await resetToSample(db);
      log(`샘플 데이터: 빈 DB 라 넣었다 — ${describeCounts(counts)}`);
    } else {
      log("샘플 데이터: 이미 데이터가 있어 그대로 둔다");
    }
  } finally {
    if (lock) await db.execute(sql`select pg_advisory_unlock(${LOCK_KEY})`);
  }
}

async function appliedMigrations(db: Db): Promise<number> {
  const [{ exists }] = rowsOf<{ exists: boolean }>(
    await db.execute(sql`select to_regclass('drizzle.__drizzle_migrations') is not null as exists`),
  );
  if (!exists) return 0;
  const [{ count }] = rowsOf<{ count: number }>(
    await db.execute(sql`select count(*)::int as count from drizzle.__drizzle_migrations`),
  );
  return Number(count);
}

// postgres 드라이버는 행의 배열을, PGlite 는 { rows } 를 돌려준다.
function rowsOf<T>(result: unknown): T[] {
  return (Array.isArray(result) ? result : (result as { rows: T[] }).rows) as T[];
}

export function describeCounts(counts: Record<string, number>): string {
  return Object.entries(counts)
    .map(([table, n]) => `${table} ${n}`)
    .join(" · ");
}

/** Neon 의 연결 풀 주소는 호스트 이름에 `-pooler` 가 붙는다. */
export function isPooled(url: string): boolean {
  try {
    return new URL(url).hostname.includes("-pooler");
  } catch {
    return true;
  }
}
