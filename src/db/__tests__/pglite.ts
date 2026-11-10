import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
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

/**
 * 샘플로 되돌린 뒤 수불(전표 · 줄 · 잔액 · LOT 일련)과 실사를 비운다 — 수불이 없을 때의 기준정보 · 번호 규칙을 보는 시험이 쓴다.
 * 샘플 수불이 생긴 뒤(조각 「재고 수불」 PR C) 샘플 품목은 LOT 관리 · 단위를, 불량창고는 표시를 바꾸지 못한다 — 그 막음은 stock.test.ts 가 본다.
 */
export async function resetWithoutStock(db: Db) {
  const { resetToSample } = await import("@/db/reset");
  await resetToSample(db);
  await db.execute(
    sql`truncate table stock_count_lines, stock_counts, stock_balances, stock_move_lines, stock_moves, number_rule_seqs restart identity`,
  );
}
