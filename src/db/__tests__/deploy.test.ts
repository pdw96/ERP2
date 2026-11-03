// @vitest-environment node
import { mkdtempSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { isPooled, prepareDatabase } from "@/db/deploy";
import { describeFailure } from "@/db/status";
import { codeGroups, items, warehouses } from "@/db/schema";
import { emptyDb } from "./pglite";

// 배포 빌드가 배포 전에 부르는 준비(ADR 0005) — 성공 기준 7.

const handles: Awaited<ReturnType<typeof emptyDb>>[] = [];
async function fresh() {
  const h = await emptyDb();
  handles.push(h);
  return h;
}
afterEach(async () => {
  while (handles.length) await handles.pop()!.close();
});

async function tableNames(h: Awaited<ReturnType<typeof emptyDb>>) {
  const result = await h.client.query<{ name: string }>(
    "select table_name as name from information_schema.tables where table_schema = 'public' order by 1",
  );
  return result.rows.map((r) => r.name);
}

describe("마이그레이션과 첫 샘플 데이터", () => {
  it("빈 DB 에 적용하면 테이블 다섯이 생기고 샘플 데이터가 들어간다", async () => {
    const h = await fresh();
    const log: string[] = [];
    await prepareDatabase(h.db, { migrate: () => h.migrate(), lock: true, log: (l) => log.push(l) });
    expect(await tableNames(h)).toEqual(["code_groups", "codes", "items", "partners", "warehouses"]);
    expect(await h.db.select().from(codeGroups)).toHaveLength(3);
    expect(log[0]).toMatch(/^마이그레이션: 적용된 것 1개 — 이번에 1개 적용$/);
    expect(log[1]).toMatch(/^샘플 데이터: 빈 DB 라 넣었다 — items 10 · /);
  });

  it("두 번 적용해도 그대로다 — 방문자가 바꾼 데이터도 지우지 않는다", async () => {
    const h = await fresh();
    const quiet = { migrate: () => h.migrate(), lock: true, log: () => {} };
    await prepareDatabase(h.db, quiet);
    await h.db.insert(warehouses).values({ code: "WH-05", name: "방문자가 더한 창고" });

    const log: string[] = [];
    await prepareDatabase(h.db, { ...quiet, log: (l) => log.push(l) });
    expect(log).toEqual([
      "마이그레이션: 적용된 것 1개 — 이번에 0개 적용",
      "샘플 데이터: 이미 데이터가 있어 그대로 둔다",
    ]);
    expect(await tableNames(h)).toEqual(["code_groups", "codes", "items", "partners", "warehouses"]);
    expect(await h.db.select().from(warehouses)).toHaveLength(5);
  });

  it("틀린 마이그레이션이면 실패를 던지고(빌드가 멈춘다) 앞의 상태가 남는다", async () => {
    const h = await fresh();
    await prepareDatabase(h.db, { migrate: () => h.migrate(), lock: true, log: () => {} });

    // 레포의 마이그레이션에 틀린 SQL 하나를 덧붙인 폴더
    const folder = mkdtempSync(join(tmpdir(), "erp2-migrations-"));
    cpSync("drizzle", folder, { recursive: true });
    writeFileSync(join(folder, "0001_broken.sql"), `ALTER TABLE "items" ADD COLUMN "x" no_such_type;`);
    const journalPath = join(folder, "meta", "_journal.json");
    const journal = JSON.parse((await import("node:fs")).readFileSync(journalPath, "utf8"));
    journal.entries.push({ idx: 1, version: "7", when: Date.now(), tag: "0001_broken", breakpoints: true });
    writeFileSync(journalPath, JSON.stringify(journal));

    const failure = await prepareDatabase(h.db, { migrate: () => h.migrate(folder), lock: true, log: () => {} }).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toBeDefined();
    // 빌드 기록에 남는 줄 — 코드 · 등급만, DB 의 메시지는 남기지 않는다(대장 NC-6).
    expect(describeFailure(failure, "code-only")).toBe("DB 질의 실패: 42704 ERROR");
    const columns = await h.client.query(
      "select 1 from information_schema.columns where table_name = 'items' and column_name = 'x'",
    );
    expect(columns.rows).toHaveLength(0);
    expect(await h.db.select().from(items)).toHaveLength(10);
    // 실패해도 잠금은 풀린다 — 다음 빌드가 기다리지 않는다.
    const locks = await h.db.execute(sql`select count(*)::int as n from pg_locks where locktype = 'advisory'`);
    expect((locks as unknown as { rows: { n: number }[] }).rows[0].n).toBe(0);
  });
});

describe("isPooled — 연결 풀 주소에는 잠금을 걸지 않는다", () => {
  it.each([
    ["postgres://u:p@ep-x-pooler.us-east-1.aws.neon.tech/db", true],
    ["postgres://u:p@ep-x.us-east-1.aws.neon.tech/db", false],
    ["postgres://localhost/db", false],
    ["틀린 주소", true],
  ])("%s → %s", (url, pooled) => {
    expect(isPooled(url)).toBe(pooled);
  });
});
