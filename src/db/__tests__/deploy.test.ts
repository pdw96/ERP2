// @vitest-environment node
import { mkdtempSync, readFileSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { asc, eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { isPooled, prepareDatabase } from "@/db/deploy";
import { describeFailure } from "@/db/status";
import { SAMPLE_CODE_GROUPS, SAMPLE_CODES } from "@/db/sample";
import { codeGroups, codes, items, partners, warehouses } from "@/db/schema";
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
    expect(await h.db.select().from(codeGroups)).toHaveLength(7);
    expect(log[0]).toMatch(/^마이그레이션: 적용된 것 5개 — 이번에 5개 적용$/);
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
      "마이그레이션: 적용된 것 5개 — 이번에 0개 적용",
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
    writeFileSync(join(folder, "0099_broken.sql"), `ALTER TABLE "items" ADD COLUMN "x" no_such_type;`);
    const journalPath = join(folder, "meta", "_journal.json");
    const journal = JSON.parse((await import("node:fs")).readFileSync(journalPath, "utf8"));
    journal.entries.push({
      idx: journal.entries.length,
      version: "7",
      when: Date.now(),
      tag: "0099_broken",
      breakpoints: true,
    });
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

// 앞의 n 개만 적용한 폴더 — 그 PR 앞의 운영 DB 와 같은 모양.
function firstMigrations(n: number) {
  const folder = mkdtempSync(join(tmpdir(), "erp2-migrations-"));
  cpSync("drizzle", folder, { recursive: true });
  const journalPath = join(folder, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  journal.entries = journal.entries.slice(0, n);
  writeFileSync(journalPath, JSON.stringify(journal));
  return folder;
}

describe("마이그레이션 0001 · 0002 — 거래처의 국가(PR G)", () => {
  const onlyFirstMigration = () => firstMigrations(1);

  it("데이터가 있는 DB — 국가 묶음과 처음 값이 먼저 들어가고, 기존 거래처는 한국(KR)이 된다. 샘플은 다시 넣지 않는다", async () => {
    const h = await fresh();
    await h.migrate(onlyFirstMigration());
    // PR G 앞의 데이터 — 국가 칸이 없던 때의 묶음 · 값 · 거래처.
    await h.client.exec(`
      insert into code_groups (code, name, is_system) values ('UNIT', '단위', false);
      insert into codes (group_code, code, name) values ('UNIT', 'EA', '개');
      insert into partners (code, name, is_supplier, biz_no) values ('BP-0001', '(가상) 옛 거래처', true, '000-00-00001');
    `);

    const log: string[] = [];
    await prepareDatabase(h.db, { migrate: () => h.migrate(), lock: true, log: (l) => log.push(l) });
    expect(log).toEqual([
      "마이그레이션: 적용된 것 5개 — 이번에 4개 적용",
      "샘플 데이터: 이미 데이터가 있어 그대로 둔다",
    ]);
    expect(
      await h.db
        .select({ code: partners.code, country: partners.country, foreign: partners.foreignBizNo })
        .from(partners),
    ).toEqual([{ code: "BP-0001", country: "KR", foreign: null }]);
    // 마이그레이션이 넣은 국가는 샘플 데이터와 같다 — 매일 밤 되돌린 뒤와 어긋나지 않게.
    const country = await h.db
      .select({ code: codes.code, name: codes.name, sortOrder: codes.sortOrder })
      .from(codes)
      .where(eq(codes.groupCode, "COUNTRY"))
      .orderBy(asc(codes.sortOrder));
    expect(country).toEqual(
      SAMPLE_CODES.filter((c) => c.groupCode === "COUNTRY").map((c) => ({
        code: c.code,
        name: c.name,
        sortOrder: c.sortOrder,
      })),
    );
    expect(
      await h.db.select({ isSystem: codeGroups.isSystem }).from(codeGroups).where(eq(codeGroups.code, "COUNTRY")),
    ).toEqual([{ isSystem: false }]);
  });

  it("빈 DB — 마이그레이션은 국가를 넣지 않고, 샘플 데이터가 국가까지 넣는다", async () => {
    const h = await fresh();
    await h.migrate(onlyFirstMigration());
    await h.migrate();
    expect(await h.db.select().from(codeGroups)).toHaveLength(0);
    await prepareDatabase(h.db, { migrate: () => h.migrate(), lock: true, log: () => {} });
    expect(await h.db.select().from(codes).where(eq(codes.groupCode, "COUNTRY"))).toHaveLength(5);
  });
});

describe("마이그레이션 0003 · 0004 — 품목 · 거래처의 설명용 칸(PR H)", () => {
  it("데이터가 있는 DB — 분류 묶음 셋과 처음 값이 들어가고, 기존 품목 · 거래처는 빈 칸이 된다. 샘플은 다시 넣지 않는다", async () => {
    const h = await fresh();
    await h.migrate(firstMigrations(3));
    // PR H 앞의 데이터 — 분류 · 설명용 칸이 없던 때의 묶음 · 값 · 품목 · 거래처.
    await h.client.exec(`
      insert into code_groups (code, name, is_system) values
        ('ITEM_TYPE', '품목 유형', true), ('PROC_TYPE', '조달구분', true), ('UNIT', '단위', false), ('COUNTRY', '국가', false);
      insert into codes (group_code, code, name) values
        ('ITEM_TYPE', 'RM', '원자재'), ('PROC_TYPE', 'BUY', '구매'), ('UNIT', 'EA', '개'), ('COUNTRY', 'KR', '한국');
      insert into items (code, name, item_type, procurement, unit) values ('RM-0001', '옛 품목', 'RM', 'BUY', 'EA');
      insert into partners (code, name, is_supplier) values ('BP-0001', '(가상) 옛 거래처', true);
    `);

    const log: string[] = [];
    await prepareDatabase(h.db, { migrate: () => h.migrate(), lock: true, log: (l) => log.push(l) });
    expect(log).toEqual([
      "마이그레이션: 적용된 것 5개 — 이번에 2개 적용",
      "샘플 데이터: 이미 데이터가 있어 그대로 둔다",
    ]);
    expect(
      await h.db
        .select({ cls1: items.cls1, cls2: items.cls2, cls3: items.cls3, note: items.note, group: items.cls1Group })
        .from(items),
    ).toEqual([{ cls1: null, cls2: null, cls3: null, note: "", group: "ITEM_CLS1" }]);
    const [p] = await h.db.select().from(partners);
    expect(p).toMatchObject({
      ceo: "",
      bizType: "",
      bizItem: "",
      address: "",
      phone: "",
      email: "",
      contactName: "",
      contactPhone: "",
      note: "",
    });
    // 마이그레이션이 넣은 분류는 샘플 데이터와 같다 — 매일 밤 되돌린 뒤와 어긋나지 않게.
    const classes = await h.db
      .select({ group: codes.groupCode, code: codes.code, name: codes.name, sortOrder: codes.sortOrder })
      .from(codes)
      .where(sql`${codes.groupCode} like 'ITEM_CLS%'`)
      .orderBy(asc(codes.groupCode), asc(codes.sortOrder));
    expect(classes).toEqual(
      SAMPLE_CODES.filter((c) => c.groupCode.startsWith("ITEM_CLS")).map((c) => ({
        group: c.groupCode,
        code: c.code,
        name: c.name,
        sortOrder: c.sortOrder,
      })),
    );
    expect(
      await h.db
        .select({ code: codeGroups.code, name: codeGroups.name, isSystem: codeGroups.isSystem })
        .from(codeGroups)
        .where(sql`${codeGroups.code} like 'ITEM_CLS%'`)
        .orderBy(asc(codeGroups.code)),
    ).toEqual(
      SAMPLE_CODE_GROUPS.filter((g) => g.code.startsWith("ITEM_CLS")).map((g) => ({
        code: g.code,
        name: g.name,
        isSystem: false,
      })),
    );
  });

  it("빈 DB — 마이그레이션은 분류를 넣지 않고, 샘플 데이터가 분류까지 넣는다", async () => {
    const h = await fresh();
    await h.migrate();
    expect(await h.db.select().from(codeGroups)).toHaveLength(0);
    await prepareDatabase(h.db, { migrate: () => h.migrate(), lock: true, log: () => {} });
    expect(
      await h.db
        .select()
        .from(codes)
        .where(sql`${codes.groupCode} like 'ITEM_CLS%'`),
    ).toHaveLength(12);
    expect(
      await h.db
        .select({ code: items.code })
        .from(items)
        .where(sql`${items.cls1} is not null`),
    ).toHaveLength(10);
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
