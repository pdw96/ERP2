import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "@/db/types";

// 시험용 DB — 내 컴퓨터의 메모리에서 도는 PostgreSQL(PGlite)에 레포의 마이그레이션을 그대로 적용한다.
export async function emptyDb() {
  const client = new PGlite();
  const db = drizzle(client);
  return {
    client,
    db: db as unknown as Db,
    migrate: (folder = "drizzle") => migrate(db, { migrationsFolder: folder }),
    close: () => client.close(),
  };
}

export async function migratedDb() {
  const handle = await emptyDb();
  await handle.migrate();
  return handle;
}

/** 거절된 쿼리의 PostgreSQL 오류 — Drizzle 이 감싼 안쪽의 제약 이름 · 코드. */
export async function rejection(promise: Promise<unknown>): Promise<{ code?: string; constraint?: string }> {
  try {
    await promise;
  } catch (error) {
    const e = error as { cause?: { code?: string; constraint?: string } } & { code?: string; constraint?: string };
    return e.cause ?? e;
  }
  throw new Error("거절되지 않았다");
}
