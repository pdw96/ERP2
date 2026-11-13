// @vitest-environment node
import { mkdtempSync, readFileSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { asc, eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { isPooled, prepareDatabase } from "@/db/deploy";
import { describeFailure } from "@/db/status";
import { SAMPLE_CODE_GROUPS, SAMPLE_CODES, SAMPLE_ITEMS, SAMPLE_NUMBER_RULES, SAMPLE_UNIT_SPECS } from "@/db/sample";
import {
  bomChanges,
  bomLines,
  boms,
  codeGroups,
  codes,
  items,
  numberRules,
  partners,
  stockCountLines,
  stockCounts,
  stockMoves,
  unitSpecs,
  warehouses,
} from "@/db/schema";
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

/** 마이그레이션이 만드는 테이블 — 기준정보 다섯과 재고 수불의 단위 사양 · 번호 규칙 · 번호 규칙의 일련 · 수불 · 잔액 · 실사, BOM 의 머리 · 줄 · 고친 이력. */
const TABLES = [
  "bom_changes",
  "bom_lines",
  "boms",
  "code_groups",
  "codes",
  "items",
  "number_rule_seqs",
  "number_rules",
  "partners",
  "stock_balances",
  "stock_count_lines",
  "stock_counts",
  "stock_move_lines",
  "stock_moves",
  "unit_specs",
  "warehouses",
];

async function tableNames(h: Awaited<ReturnType<typeof emptyDb>>) {
  const result = await h.client.query<{ name: string }>(
    "select table_name as name from information_schema.tables where table_schema = 'public' order by 1",
  );
  return result.rows.map((r) => r.name);
}

describe("마이그레이션과 첫 샘플 데이터", () => {
  it("빈 DB 에 적용하면 테이블 열여섯이 생기고 샘플 데이터(샘플 수불 · 실사 · BOM 까지)가 들어간다", async () => {
    const h = await fresh();
    const log: string[] = [];
    await prepareDatabase(h.db, { migrate: () => h.migrate(), lock: true, log: (l) => log.push(l) });
    expect(await tableNames(h)).toEqual(TABLES);
    expect(await h.db.select().from(codeGroups)).toHaveLength(9);
    expect(log[0]).toMatch(/^마이그레이션: 적용된 것 15개 — 이번에 15개 적용$/);
    expect(log[1]).toMatch(
      /^샘플 데이터: 빈 DB 라 넣었다 — bom_changes 20 · bom_lines 16 · boms 4 · stock_count_lines 12 · stock_counts 2 · stock_balances 24 · stock_move_lines 32 · stock_moves 11 · items 14 · /,
    );
  });

  it("두 번 적용해도 그대로다 — 방문자가 바꾼 데이터도 지우지 않는다", async () => {
    const h = await fresh();
    const quiet = { migrate: () => h.migrate(), lock: true, log: () => {} };
    await prepareDatabase(h.db, quiet);
    await h.db.insert(warehouses).values({ code: "WH-05", name: "방문자가 더한 창고" });

    const log: string[] = [];
    await prepareDatabase(h.db, { ...quiet, log: (l) => log.push(l) });
    expect(log).toEqual([
      "마이그레이션: 적용된 것 15개 — 이번에 0개 적용",
      "샘플 데이터: 이미 데이터가 있어 그대로 둔다",
    ]);
    expect(await tableNames(h)).toEqual(TABLES);
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
    expect(await h.db.select().from(items)).toHaveLength(SAMPLE_ITEMS.length);
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
      "마이그레이션: 적용된 것 15개 — 이번에 14개 적용",
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
      "마이그레이션: 적용된 것 15개 — 이번에 12개 적용",
      "샘플 데이터: 이미 데이터가 있어 그대로 둔다",
    ]);
    expect(
      await h.db
        .select({ cls1: items.cls1, cls2: items.cls2, cls3: items.cls3, note: items.note, group: items.cls1Group })
        .from(items)
        .where(eq(items.code, "RM-0001")),
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
    ).toHaveLength(SAMPLE_CODES.filter((c) => c.groupCode.startsWith("ITEM_CLS")).length);
    expect(
      await h.db
        .select({ code: items.code })
        .from(items)
        .where(sql`${items.cls1} is not null`),
    ).toHaveLength(SAMPLE_ITEMS.length);
  });
});

describe("마이그레이션 0005 · 0006 — 단위 사양(조각 「재고 수불」 PR A, ADR 0017)", () => {
  const specs = (h: Awaited<ReturnType<typeof emptyDb>>) =>
    h.db
      .select({
        unit: unitSpecs.unit,
        baseUnit: unitSpecs.baseUnit,
        factor: unitSpecs.factor,
        decimals: unitSpecs.decimals,
      })
      .from(unitSpecs)
      .orderBy(asc(unitSpecs.unit));
  const sorted = <T extends { unit: string }>(rows: T[]) => [...rows].sort((a, b) => a.unit.localeCompare(b.unit));

  it("데이터가 있는 DB — 새 단위 넷이 들어가고 모든 단위에 사양이 생긴다. 아는 단위는 샘플과 같고, 방문자가 더한 단위는 자신이 기준 · 소수 셋째 자리", async () => {
    const h = await fresh();
    await h.migrate(firstMigrations(5));
    // PR A 앞의 운영 DB — 샘플의 단위 넷에 방문자가 단위 BOX 를 더해 두었다.
    await h.client.exec(`
      insert into code_groups (code, name, is_system) values ('UNIT', '단위', false);
      insert into codes (group_code, code, name, sort_order) values
        ('UNIT', 'EA', '개', 10), ('UNIT', 'M', '미터', 20), ('UNIT', 'KG', '킬로그램', 30), ('UNIT', 'G', '그램', 40),
        ('UNIT', 'BOX', '상자', 15);
    `);

    const log: string[] = [];
    await prepareDatabase(h.db, { migrate: () => h.migrate(), lock: true, log: (l) => log.push(l) });
    expect(log).toEqual([
      "마이그레이션: 적용된 것 15개 — 이번에 10개 적용",
      "샘플 데이터: 이미 데이터가 있어 그대로 둔다",
    ]);
    // 마이그레이션이 넣은 단위 · 사양은 샘플 데이터와 같다 — 매일 밤 되돌린 뒤와 어긋나지 않게.
    const units = await h.db
      .select({ code: codes.code, name: codes.name, sortOrder: codes.sortOrder })
      .from(codes)
      .where(eq(codes.groupCode, "UNIT"))
      .orderBy(asc(codes.sortOrder));
    expect(units.filter((u) => u.code !== "BOX")).toEqual(
      SAMPLE_CODES.filter((c) => c.groupCode === "UNIT").map((c) => ({
        code: c.code,
        name: c.name,
        sortOrder: c.sortOrder,
      })),
    );
    expect(await specs(h)).toEqual(
      sorted([...SAMPLE_UNIT_SPECS, { unit: "BOX", baseUnit: "BOX", factor: 1, decimals: 3 }]).map((s) => ({
        unit: s.unit,
        baseUnit: s.baseUnit,
        factor: s.factor,
        decimals: s.decimals,
      })),
    );
  });

  it("아는 단위의 기준이 공통코드에 없으면 그 단위 자신을 기준으로 둔다 — 참조가 실패해 배포가 멈추지 않는다", async () => {
    const h = await fresh();
    await h.migrate(firstMigrations(5));
    // 단위가 KG 하나뿐인 DB — 기준 G 가 없다.
    await h.client.exec(`
      insert into code_groups (code, name, is_system) values ('UNIT', '단위', false);
      insert into codes (group_code, code, name, sort_order) values ('UNIT', 'KG', '킬로그램', 30);
    `);
    await prepareDatabase(h.db, { migrate: () => h.migrate(), lock: true, log: () => {} });
    const rows = await specs(h);
    expect(rows.find((r) => r.unit === "KG")).toEqual({ unit: "KG", baseUnit: "KG", factor: 1, decimals: 3 });
    // 함께 들어간 새 단위는 기준이 있으면 ADR 0017 그대로 — MM 의 기준 M 은 없어 자신, MG 의 기준 G 도 없어 자신.
    expect(rows.find((r) => r.unit === "MM")).toEqual({ unit: "MM", baseUnit: "MM", factor: 1, decimals: 0 });
    expect(rows.find((r) => r.unit === "ML")).toEqual({ unit: "ML", baseUnit: "ML", factor: 1, decimals: 0 });
    expect(rows.find((r) => r.unit === "L")).toEqual({ unit: "L", baseUnit: "ML", factor: 1000, decimals: 3 });
  });

  it("빈 DB — 마이그레이션은 단위 · 사양을 넣지 않고, 샘플 데이터가 넣는다", async () => {
    const h = await fresh();
    await h.migrate();
    expect(await h.db.select().from(unitSpecs)).toHaveLength(0);
    expect(await h.db.select().from(codes)).toHaveLength(0);
    await prepareDatabase(h.db, { migrate: () => h.migrate(), lock: true, log: () => {} });
    expect(await h.db.select().from(unitSpecs)).toHaveLength(SAMPLE_UNIT_SPECS.length);
  });
});

describe("마이그레이션 0007 · 0008 — 번호 규칙 · 품목의 재고 칸 · 불량창고 · 부자재 · 소모품(조각 「재고 수불」 PR B)", () => {
  /** PR B 앞의 운영 DB — 샘플에 방문자가 원자재 하나(RM-0007)를 더하고 제품창고를 「사용 안 함」으로 바꿔 두었다. */
  async function beforePrB() {
    const h = await fresh();
    await h.migrate(firstMigrations(7));
    await h.client.exec(`
      insert into code_groups (code, name, is_system) values
        ('ITEM_TYPE', '품목 유형', true), ('PROC_TYPE', '조달구분', true), ('UNIT', '단위', false),
        ('ITEM_CLS1', '품목 대분류', false), ('ITEM_CLS2', '품목 중분류', false);
      insert into codes (group_code, code, name, sort_order) values
        ('ITEM_TYPE', 'RM', '원자재', 10), ('ITEM_TYPE', 'SF', '반제품', 20), ('ITEM_TYPE', 'FG', '완제품', 30),
        ('PROC_TYPE', 'BUY', '구매', 10), ('PROC_TYPE', 'MAKE', '생산', 20),
        ('UNIT', 'EA', '개', 10), ('UNIT', 'M', '미터', 20), ('UNIT', 'L', '리터', 60),
        ('ITEM_CLS1', 'CHEM', '화학재료', 40), ('ITEM_CLS2', 'SOP', 'SOP', 10), ('ITEM_CLS2', 'COMMON', '공용', 30);
      insert into unit_specs (unit, base_unit, factor, decimals) values ('EA', 'EA', 1, 0), ('M', 'M', 1, 3), ('L', 'L', 1, 3);
      insert into warehouses (code, name, active) values
        ('WH-01', '자재창고', true), ('WH-02', '생산현장', true), ('WH-03', '제품창고', false), ('WH-04', '불량창고', true);
      insert into items (code, name, item_type, procurement, unit) values
        ('RM-0001', '웨이퍼', 'RM', 'BUY', 'EA'), ('SF-0001', '다이 본딩 완료품', 'SF', 'MAKE', 'EA'),
        ('FG-0001', '전원 관리 IC', 'FG', 'MAKE', 'EA'), ('FG-0002', '센서 IC', 'FG', 'MAKE', 'EA'),
        ('RM-0007', '방문자가 더한 원자재', 'RM', 'BUY', 'EA');
    `);
    return h;
  }

  it("데이터가 있는 DB — 유형 · 대분류 · 규칙 · 불량창고 · 부자재 · 소모품이 샘플과 같게 들어가고, 기존 품목은 LOT 관리 켬 · 유형대로의 기본 창고를 받는다", async () => {
    const h = await beforePrB();
    const log: string[] = [];
    await prepareDatabase(h.db, { migrate: () => h.migrate(), lock: true, log: (l) => log.push(l) });
    expect(log).toEqual([
      "마이그레이션: 적용된 것 15개 — 이번에 8개 적용",
      "샘플 데이터: 이미 데이터가 있어 그대로 둔다",
    ]);

    // 공통코드 — 샘플과 같다(매일 밤 되돌린 뒤와 어긋나지 않게).
    const added = await h.db
      .select({ group: codes.groupCode, code: codes.code, name: codes.name, sortOrder: codes.sortOrder })
      .from(codes)
      .where(sql`${codes.code} in ('SM', 'CS', 'PACK', 'TOOL')`)
      .orderBy(asc(codes.groupCode), asc(codes.sortOrder));
    expect(added).toEqual(
      SAMPLE_CODES.filter((c) => ["SM", "CS", "PACK", "TOOL"].includes(c.code))
        .map((c) => ({ group: c.groupCode, code: c.code, name: c.name, sortOrder: c.sortOrder }))
        .sort((a, b) => a.group.localeCompare(b.group) || a.sortOrder! - b.sortOrder!),
    );
    // 규칙 — 샘플과 같다.
    expect(
      await h.db
        .select({
          code: numberRules.code,
          name: numberRules.name,
          prefix: numberRules.prefix,
          separator: numberRules.separator,
          dateFormat: numberRules.dateFormat,
          seqDigits: numberRules.seqDigits,
          defaultFor: numberRules.defaultFor,
        })
        .from(numberRules)
        .orderBy(asc(numberRules.id)),
    ).toEqual(SAMPLE_NUMBER_RULES.map((r) => ({ ...r, defaultFor: r.defaultFor ?? null })));
    expect((await h.db.select().from(warehouses).where(eq(warehouses.isDefect, true))).map((w) => w.code)).toEqual([
      "WH-04",
    ]);

    const rows = await h.db.select().from(items).orderBy(asc(items.code));
    const wh = Object.fromEntries((await h.db.select().from(warehouses)).map((w) => [w.id, w.code]));
    const view = rows.map((i) => [
      i.code,
      i.lotManaged,
      i.lotRuleCode,
      wh[i.defaultInWarehouseId ?? -1] ?? null,
      wh[i.defaultOutWarehouseId ?? -1] ?? null,
    ]);
    // 부자재 · 소모품 넷 — 단위가 있는 것은 다 들어간다. 대분류 PACK · TOOL 은 이 마이그레이션이 넣었다.
    // 제품창고(WH-03)는 「사용 안 함」이라 완제품의 기본 창고로 넣지 않는다.
    expect(view).toEqual([
      ["CS-0001", false, null, "WH-01", "WH-02"],
      ["CS-0002", false, null, "WH-01", "WH-02"],
      ["FG-0001", true, null, null, null],
      ["FG-0002", true, "LOT_NUM", null, null],
      ["RM-0001", true, null, "WH-01", "WH-02"],
      ["RM-0007", true, null, "WH-01", "WH-02"],
      ["SF-0001", true, null, "WH-02", "WH-02"],
      ["SM-0001", false, null, "WH-01", "WH-02"],
      ["SM-0002", false, null, "WH-01", "WH-02"],
    ]);
    // 들어간 부자재 · 소모품의 칸은 샘플과 같다.
    for (const code of ["SM-0001", "SM-0002", "CS-0001", "CS-0002"]) {
      const sample = SAMPLE_ITEMS.find((i) => i.code === code)!;
      expect(
        rows.find((i) => i.code === code),
        code,
      ).toMatchObject({
        name: sample.name,
        spec: sample.spec,
        itemType: sample.itemType,
        procurement: "BUY",
        unit: sample.unit,
        cls1: sample.cls1,
        cls2: sample.cls2,
        leadTimeDays: sample.leadTimeDays,
        safetyStock: sample.safetyStock,
        minLot: sample.minLot,
        lotMultiple: sample.lotMultiple,
        inspectIn: false,
        inspectOut: false,
      });
    }
  });

  it("단위가 없는 부자재 · 소모품은 넣지 않고, 없는 분류는 비운다 — 참조가 실패해 배포가 멈추지 않는다", async () => {
    const h = await beforePrB();
    await h.client.exec(`
      delete from unit_specs where unit = 'L';
      delete from codes where group_code = 'UNIT' and code = 'L';
      delete from codes where group_code = 'ITEM_CLS2' and code = 'COMMON';
    `);
    await prepareDatabase(h.db, { migrate: () => h.migrate(), lock: true, log: () => {} });
    const added = await h.db
      .select({ code: items.code, cls2: items.cls2 })
      .from(items)
      .where(sql`${items.itemType} in ('SM', 'CS')`)
      .orderBy(asc(items.code));
    expect(added).toEqual([
      { code: "CS-0001", cls2: null },
      { code: "SM-0001", cls2: "SOP" },
      { code: "SM-0002", cls2: null },
    ]);
  });

  it("빈 DB — 마이그레이션은 아무것도 넣지 않고, 샘플 데이터가 넣는다", async () => {
    const h = await fresh();
    await h.migrate();
    expect(await h.db.select().from(numberRules)).toHaveLength(0);
    expect(await h.db.select().from(items)).toHaveLength(0);
    await prepareDatabase(h.db, { migrate: () => h.migrate(), lock: true, log: () => {} });
    expect(await h.db.select().from(numberRules)).toHaveLength(SAMPLE_NUMBER_RULES.length);
    expect(
      await h.db
        .select()
        .from(items)
        .where(sql`${items.itemType} in ('SM', 'CS')`),
    ).toHaveLength(4);
  });
});

describe("마이그레이션 0009 — 품목의 기본 창고가 불량창고를 가리키지 못하게(PR B 리뷰 1회차)", () => {
  it("0007 · 0008 이 이미 적용된 DB(미리보기 분기) — 0009 만 적용되고, 불량창고를 가리키던 기본 창고는 비워지며, 그 뒤로는 DB 가 막는다", async () => {
    const h = await fresh();
    await h.migrate(firstMigrations(9));
    // 0009 앞에는 막지 않아 생길 수 있었던 행 — 원자재의 기본 출고 창고가 불량창고.
    await h.client.exec(`
      insert into code_groups (code, name, is_system) values
        ('ITEM_TYPE', '품목 유형', true), ('PROC_TYPE', '조달구분', true), ('UNIT', '단위', false);
      insert into codes (group_code, code, name) values ('ITEM_TYPE', 'RM', '원자재'), ('PROC_TYPE', 'BUY', '구매'), ('UNIT', 'EA', '개');
      insert into warehouses (code, name, is_defect) values ('WH-01', '자재창고', false), ('WH-04', '불량창고', true);
      insert into items (code, name, item_type, procurement, unit, default_in_warehouse_id, default_out_warehouse_id)
      values ('RM-0001', '웨이퍼', 'RM', 'BUY', 'EA',
        (select id from warehouses where code = 'WH-01'), (select id from warehouses where code = 'WH-04'));
    `);
    const log: string[] = [];
    await prepareDatabase(h.db, { migrate: () => h.migrate(), lock: true, log: (l) => log.push(l) });
    expect(log).toEqual([
      "마이그레이션: 적용된 것 15개 — 이번에 6개 적용",
      "샘플 데이터: 이미 데이터가 있어 그대로 둔다",
    ]);
    const [rm] = await h.db.select().from(items).where(eq(items.code, "RM-0001"));
    expect(rm.defaultOutWarehouseId).toBeNull();
    expect(rm.defaultInWarehouseId).not.toBeNull();
    const [defect] = await h.db.select().from(warehouses).where(eq(warehouses.code, "WH-04"));
    await expect(
      h.db.update(items).set({ defaultInWarehouseId: defect.id }).where(eq(items.code, "RM-0001")),
    ).rejects.toThrow();
  });
});

describe("마이그레이션 0010 · 0011 — 수불 유형 · 조정 사유와 수불 표(조각 「재고 수불」 PR C)", () => {
  it("데이터가 있는 DB — 묶음 둘과 값이 샘플과 같게 들어가고 수불 표가 비어 생긴다. 샘플 수불은 넣지 않는다(매일 밤 되돌림이 넣는다)", async () => {
    const h = await fresh();
    await h.migrate(firstMigrations(10));
    await h.client.exec(`
      insert into code_groups (code, name, is_system) values ('UNIT', '단위', false);
      insert into codes (group_code, code, name) values ('UNIT', 'EA', '개');
    `);
    const log: string[] = [];
    await prepareDatabase(h.db, { migrate: () => h.migrate(), lock: true, log: (l) => log.push(l) });
    expect(log).toEqual([
      "마이그레이션: 적용된 것 15개 — 이번에 5개 적용",
      "샘플 데이터: 이미 데이터가 있어 그대로 둔다",
    ]);
    const groups = await h.db
      .select()
      .from(codeGroups)
      .where(sql`${codeGroups.code} in ('MOVE_TYPE', 'ADJ_REASON')`);
    expect(groups.map((g) => [g.code, g.name, g.isSystem]).sort()).toEqual(
      SAMPLE_CODE_GROUPS.filter((g) => g.code === "MOVE_TYPE" || g.code === "ADJ_REASON")
        .map((g) => [g.code, g.name, g.isSystem ?? false])
        .sort(),
    );
    const values = await h.db
      .select({ groupCode: codes.groupCode, code: codes.code, name: codes.name, sortOrder: codes.sortOrder })
      .from(codes)
      .where(sql`${codes.groupCode} in ('MOVE_TYPE', 'ADJ_REASON')`)
      .orderBy(asc(codes.groupCode), asc(codes.sortOrder));
    expect(values).toEqual(
      SAMPLE_CODES.filter((c) => c.groupCode === "MOVE_TYPE" || c.groupCode === "ADJ_REASON")
        .map((c) => ({ groupCode: c.groupCode, code: c.code, name: c.name, sortOrder: c.sortOrder }))
        .sort((a, b) => (a.groupCode < b.groupCode ? -1 : a.groupCode > b.groupCode ? 1 : a.sortOrder! - b.sortOrder!)),
    );
    expect(await h.db.select().from(stockMoves)).toHaveLength(0);
  });

  it("빈 DB — 데이터 마이그레이션은 아무것도 넣지 않는다(배포 빌드가 샘플 전체를 넣는다)", async () => {
    const h = await fresh();
    await h.migrate();
    expect(await h.db.select().from(codes)).toHaveLength(0);
  });
});

describe("마이그레이션 0012 — 재고 실사 표(조각 「재고 수불」 PR E)", () => {
  it("데이터가 있는 DB — 실사 표 둘이 비어 생기고, 있던 창고는 그대로다. 샘플 실사는 넣지 않는다(매일 밤 되돌림이 넣는다)", async () => {
    const h = await fresh();
    await h.migrate(firstMigrations(12));
    await h.client.exec(`
      insert into code_groups (code, name, is_system) values ('UNIT', '단위', false);
      insert into warehouses (code, name) values ('WH-01', '(가상) 옛 창고');
    `);
    const log: string[] = [];
    await prepareDatabase(h.db, { migrate: () => h.migrate(), lock: true, log: (l) => log.push(l) });
    expect(log).toEqual([
      "마이그레이션: 적용된 것 15개 — 이번에 3개 적용",
      "샘플 데이터: 이미 데이터가 있어 그대로 둔다",
    ]);
    expect(await tableNames(h)).toEqual(TABLES);
    expect(await h.db.select().from(stockCounts)).toHaveLength(0);
    expect(await h.db.select().from(stockCountLines)).toHaveLength(0);
    expect((await h.db.select().from(warehouses)).map((w) => w.code)).toEqual(["WH-01"]);
  });
});

describe("마이그레이션 0013 — BOM 표(조각 「BOM」 PR A)", () => {
  it("데이터가 있는 DB — BOM 표 둘이 비어 생기고, 있던 품목은 그대로다. 샘플 BOM 은 넣지 않는다(매일 밤 되돌림이 넣는다)", async () => {
    const h = await fresh();
    await h.migrate(firstMigrations(13));
    await h.client.exec(`
      insert into code_groups (code, name, is_system) values ('UNIT', '단위', false);
      insert into warehouses (code, name) values ('WH-01', '(가상) 옛 창고');
    `);
    const log: string[] = [];
    await prepareDatabase(h.db, { migrate: () => h.migrate(), lock: true, log: (l) => log.push(l) });
    expect(log).toEqual([
      "마이그레이션: 적용된 것 15개 — 이번에 2개 적용",
      "샘플 데이터: 이미 데이터가 있어 그대로 둔다",
    ]);
    expect(await tableNames(h)).toEqual(TABLES);
    expect(await h.db.select().from(boms)).toHaveLength(0);
    expect(await h.db.select().from(bomLines)).toHaveLength(0);
  });
});

describe("마이그레이션 0014 — BOM 고친 이력 표(조각 「BOM」 PR C)", () => {
  it("데이터가 있는 DB — 고친 이력 표가 비어 생긴다. 이력은 지난 저장을 거슬러 만들지 않는다", async () => {
    const h = await fresh();
    await h.migrate(firstMigrations(14));
    await h.client.exec(`
      insert into code_groups (code, name, is_system) values ('UNIT', '단위', false);
      insert into warehouses (code, name) values ('WH-01', '(가상) 옛 창고');
    `);
    const log: string[] = [];
    await prepareDatabase(h.db, { migrate: () => h.migrate(), lock: true, log: (l) => log.push(l) });
    expect(log).toEqual([
      "마이그레이션: 적용된 것 15개 — 이번에 1개 적용",
      "샘플 데이터: 이미 데이터가 있어 그대로 둔다",
    ]);
    expect(await tableNames(h)).toEqual(TABLES);
    expect(await h.db.select().from(bomChanges)).toHaveLength(0);
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
