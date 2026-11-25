// @vitest-environment node
import { mkdtempSync, readFileSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { asc, eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { parseRunSec } from "@/lib/routing-input";
import { isPooled, prepareDatabase } from "@/db/deploy";
import { describeFailure } from "@/db/status";
import {
  SAMPLE_CODE_GROUPS,
  SAMPLE_CODES,
  SAMPLE_DEFECT_TYPES,
  SAMPLE_ITEMS,
  SAMPLE_MPS_FIXED,
  SAMPLE_NUMBER_RULES,
  SAMPLE_PARTNERS,
  SAMPLE_PROCESSES,
  SAMPLE_ROUTINGS,
  SAMPLE_SALES_PLANS,
  SAMPLE_UNIT_SPECS,
  SAMPLE_WORK_CENTERS,
} from "@/db/sample";
import {
  bomChanges,
  bomLines,
  boms,
  codeGroups,
  codes,
  defectTypeProcesses,
  defectTypes,
  items,
  mpsChanges,
  mpsFixed,
  numberRules,
  partners,
  salesPlanChanges,
  salesPlans,
  processes,
  routingChanges,
  routingMaterials,
  routings,
  routingSteps,
  stockCountLines,
  stockCounts,
  stockMoves,
  unitSpecs,
  warehouses,
  workCenters,
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
  "defect_type_processes",
  "defect_types",
  "items",
  "mps_changes",
  "mps_fixed",
  "mrp_gross",
  "mrp_pegs",
  "mrp_planned_orders",
  "mrp_run_items",
  "mrp_runs",
  "mrp_setting_changes",
  "mrp_settings",
  "number_rule_seqs",
  "number_rules",
  "partners",
  "processes",
  "routing_changes",
  "routing_materials",
  "routing_steps",
  "routings",
  "sales_plan_changes",
  "sales_plans",
  "stock_balances",
  "stock_count_lines",
  "stock_counts",
  "stock_move_lines",
  "stock_moves",
  "unit_specs",
  "warehouses",
  "work_centers",
];

async function tableNames(h: Awaited<ReturnType<typeof emptyDb>>) {
  const result = await h.client.query<{ name: string }>(
    "select table_name as name from information_schema.tables where table_schema = 'public' order by 1",
  );
  return result.rows.map((r) => r.name);
}

describe("마이그레이션과 첫 샘플 데이터", () => {
  it("빈 DB 에 적용하면 테이블 서른다섯이 생기고 샘플 데이터(샘플 수불 · 실사 · BOM 까지)가 들어간다", async () => {
    const h = await fresh();
    const log: string[] = [];
    await prepareDatabase(h.db, { migrate: () => h.migrate(), lock: true, log: (l) => log.push(l) });
    expect(await tableNames(h)).toEqual(TABLES);
    expect(await h.db.select().from(codeGroups)).toHaveLength(10);
    expect(log[0]).toMatch(/^마이그레이션: 적용된 것 30개 — 이번에 30개 적용$/);
    expect(log[1]).toMatch(
      /^샘플 데이터: 빈 DB 라 넣었다 — mrp_gross [1-9]\d* · mrp_pegs [1-9]\d* · mrp_planned_orders [1-9]\d* · mrp_run_items [1-9]\d* · mrp_runs 1 · mrp_setting_changes 0 · mrp_settings 1 · mps_changes 0 · mps_fixed 2 · sales_plan_changes 0 · sales_plans 66 · routing_changes 32 · routing_materials 14 · routing_steps 14 · routings 4 · bom_changes 20 · bom_lines 16 · boms 4 · stock_count_lines 12 · stock_counts 2 · stock_balances 24 · stock_move_lines 32 · stock_moves 11 · items 14 · /,
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
      "마이그레이션: 적용된 것 30개 — 이번에 0개 적용",
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
      "마이그레이션: 적용된 것 30개 — 이번에 29개 적용",
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
      "마이그레이션: 적용된 것 30개 — 이번에 27개 적용",
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
      "마이그레이션: 적용된 것 30개 — 이번에 25개 적용",
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
      "마이그레이션: 적용된 것 30개 — 이번에 23개 적용",
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
      "마이그레이션: 적용된 것 30개 — 이번에 21개 적용",
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
      "마이그레이션: 적용된 것 30개 — 이번에 20개 적용",
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
      "마이그레이션: 적용된 것 30개 — 이번에 18개 적용",
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
      "마이그레이션: 적용된 것 30개 — 이번에 17개 적용",
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
      "마이그레이션: 적용된 것 30개 — 이번에 16개 적용",
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

describe("마이그레이션 0015 · 0016 — 공정 표 · 샘플 공정(메뉴 「공정 등록」)", () => {
  async function dataDb(applied = 15) {
    const h = await fresh();
    await h.migrate(firstMigrations(applied));
    await h.client.exec(`
      insert into code_groups (code, name, is_system) values ('UNIT', '단위', false);
      insert into warehouses (code, name) values ('WH-01', '(가상) 옛 창고');
    `);
    return h;
  }

  it("데이터가 있는 DB — 0015 는 표만 만들고(비어 있다), 0016 이 샘플 공정 일곱을 넣는다. 샘플 전체는 다시 넣지 않는다", async () => {
    const h = await dataDb();
    const log: string[] = [];
    await prepareDatabase(h.db, { migrate: () => h.migrate(), lock: true, log: (l) => log.push(l) });
    expect(log).toEqual([
      "마이그레이션: 적용된 것 30개 — 이번에 15개 적용",
      "샘플 데이터: 이미 데이터가 있어 그대로 둔다",
    ]);
    expect(await tableNames(h)).toEqual(TABLES);
    const rows = await h.db.select().from(processes).orderBy(asc(processes.id));
    expect(rows.map((r) => r.code)).toEqual(SAMPLE_PROCESSES.map((p) => p.code));
  });

  it("0016 의 값은 SAMPLE_PROCESSES 와 같다(순서까지)", async () => {
    const h = await dataDb();
    await h.migrate();
    const rows = await h.db.select().from(processes).orderBy(asc(processes.id));
    expect(rows.map((r) => [r.code, r.name, r.note, r.active])).toEqual(
      SAMPLE_PROCESSES.map((p) => [p.code, p.name, p.note, true]),
    );
  });

  it("방문자가 같은 코드로 먼저 등록한 공정은 덮어쓰지 않고, 다시 돌려도 늘지 않는다", async () => {
    const h = await dataDb(16); // 0015 까지 — 표는 있고 샘플 공정은 아직 없다
    await h.client.exec(
      `insert into processes (code, name, note) values ('SAW', '방문자의 쏘잉', '내 설명'), ('ZZ', '방문자 공정', '')`,
    );
    await h.migrate();
    const saw = await h.db.select().from(processes).where(eq(processes.code, "SAW"));
    expect(saw.map((r) => [r.name, r.note])).toEqual([["방문자의 쏘잉", "내 설명"]]);
    expect(await h.db.select().from(processes)).toHaveLength(SAMPLE_PROCESSES.length + 1);
    // 0016 의 SQL 만 한 번 더 돌린다.
    const text = readFileSync("drizzle/0016_process_values.sql", "utf8");
    await h.client.exec(text);
    expect(await h.db.select().from(processes)).toHaveLength(SAMPLE_PROCESSES.length + 1);
  });

  it("빈 DB — 0016 은 넣지 않고(묶음이 없다), 배포 빌드의 샘플이 일곱을 넣는다", async () => {
    const h = await fresh();
    await h.migrate();
    expect(await h.db.select().from(processes)).toHaveLength(0);
    await prepareDatabase(h.db, { migrate: () => h.migrate(), lock: true, log: () => {} });
    expect(await h.db.select().from(processes)).toHaveLength(SAMPLE_PROCESSES.length);
  });
});

describe("마이그레이션 0017 · 0018 — 작업장 표 · 샘플 작업장(메뉴 「작업장 등록」)", () => {
  async function dataDb(applied = 17) {
    const h = await fresh();
    await h.migrate(firstMigrations(applied)); // 0016 까지 — 샘플 공정은 들어 있고 작업장 표는 아직 없다
    await h.client.exec(`
      insert into code_groups (code, name, is_system) values ('UNIT', '단위', false);
      insert into warehouses (code, name) values ('WH-01', '(가상) 옛 창고');
    `);
    // 0016 은 데이터가 없을 때 넣지 않았다 — 데이터를 넣은 뒤 그 SQL 만 다시 돌려 샘플 공정을 갖춘다(운영 DB 의 모양).
    await h.client.exec(readFileSync("drizzle/0016_process_values.sql", "utf8"));
    return h;
  }
  const workCentersWithProcess = (h: Awaited<ReturnType<typeof dataDb>>) =>
    h.db
      .select({
        code: workCenters.code,
        name: workCenters.name,
        processCode: processes.code,
        note: workCenters.note,
        active: workCenters.active,
      })
      .from(workCenters)
      .innerJoin(processes, eq(processes.id, workCenters.processId))
      .orderBy(asc(workCenters.id));

  it("데이터가 있는 DB — 0017 은 표만 만들고, 0018 이 샘플 작업장 아홉을 공정과 이어 넣는다. 샘플 전체는 다시 넣지 않는다", async () => {
    const h = await dataDb();
    const log: string[] = [];
    await prepareDatabase(h.db, { migrate: () => h.migrate(), lock: true, log: (l) => log.push(l) });
    expect(log).toEqual([
      "마이그레이션: 적용된 것 30개 — 이번에 13개 적용",
      "샘플 데이터: 이미 데이터가 있어 그대로 둔다",
    ]);
    expect(await tableNames(h)).toEqual(TABLES);
    const rows = await workCentersWithProcess(h);
    expect(rows).toHaveLength(9);
    expect(rows.map((r) => r.code)).toEqual(SAMPLE_WORK_CENTERS.map((w) => w.code));
  });

  it("0018 의 값은 SAMPLE_WORK_CENTERS 와 같다(순서까지, 공정 코드로 견준다)", async () => {
    const h = await dataDb();
    await h.migrate();
    expect((await workCentersWithProcess(h)).map((r) => [r.code, r.name, r.processCode, r.note, r.active])).toEqual(
      SAMPLE_WORK_CENTERS.map((w) => [w.code, w.name, w.processCode, w.note, true]),
    );
  });

  it("방문자가 같은 코드로 먼저 등록한 작업장은 덮어쓰지 않고, 다시 돌려도 늘지 않는다", async () => {
    const h = await dataDb(18); // 0017 까지 — 표는 있고 샘플 작업장은 아직 없다
    await h.client.exec(
      `insert into work_centers (code, name, process_id, note) values
         ('DA-1', '방문자의 본딩', (select id from processes where code = 'WB'), '내 설명'),
         ('ZZ-1', '방문자 작업장', (select id from processes where code = 'MD'), '')`,
    );
    await h.migrate();
    const da1 = await h.db.select().from(workCenters).where(eq(workCenters.code, "DA-1"));
    expect(da1.map((r) => [r.name, r.note])).toEqual([["방문자의 본딩", "내 설명"]]);
    expect(await h.db.select().from(workCenters)).toHaveLength(SAMPLE_WORK_CENTERS.length + 1);
    const text = readFileSync("drizzle/0018_work_center_values.sql", "utf8");
    await h.client.exec(text);
    expect(await h.db.select().from(workCenters)).toHaveLength(SAMPLE_WORK_CENTERS.length + 1);
  });

  it("빈 DB — 0018 은 넣지 않고(묶음이 없다), 배포 빌드의 샘플이 아홉을 넣는다", async () => {
    const h = await fresh();
    await h.migrate();
    expect(await h.db.select().from(workCenters)).toHaveLength(0);
    await prepareDatabase(h.db, { migrate: () => h.migrate(), lock: true, log: () => {} });
    expect(await h.db.select().from(workCenters)).toHaveLength(SAMPLE_WORK_CENTERS.length);
  });
});

describe("마이그레이션 0019 · 0020 — 불량 유형 표 · 샘플 불량 유형(메뉴 「불량 유형」)", () => {
  async function dataDb(applied = 19) {
    const h = await fresh();
    await h.migrate(firstMigrations(applied)); // 0018 까지 — 샘플 공정은 들어 있고 불량 유형 표는 아직 없다
    await h.client.exec(`
      insert into code_groups (code, name, is_system) values ('UNIT', '단위', false);
      insert into warehouses (code, name) values ('WH-01', '(가상) 옛 창고');
    `);
    // 0016 은 데이터가 없을 때 넣지 않았다 — 데이터를 넣은 뒤 그 SQL 만 다시 돌려 샘플 공정을 갖춘다(운영 DB 의 모양).
    await h.client.exec(readFileSync("drizzle/0016_process_values.sql", "utf8"));
    return h;
  }
  const defectsWithProcesses = async (h: Awaited<ReturnType<typeof dataDb>>) => {
    const rows = await h.db
      .select({
        code: defectTypes.code,
        name: defectTypes.name,
        cls: defectTypes.cls,
        note: defectTypes.note,
        active: defectTypes.active,
        id: defectTypes.id,
      })
      .from(defectTypes)
      .orderBy(asc(defectTypes.id));
    const links = await h.db
      .select({ defectTypeId: defectTypeProcesses.defectTypeId, processCode: processes.code })
      .from(defectTypeProcesses)
      .innerJoin(processes, eq(processes.id, defectTypeProcesses.processId))
      .orderBy(asc(processes.id));
    return rows.map((r) => ({
      ...r,
      processCodes: links.filter((l) => l.defectTypeId === r.id).map((l) => l.processCode),
    }));
  };
  const sampleProcessOrder = SAMPLE_PROCESSES.map((p) => p.code);
  const linkCount = SAMPLE_DEFECT_TYPES.reduce((n, d) => n + d.processCodes.length, 0);

  it("데이터가 있는 DB — 0019 는 표만 만들고, 0020 이 묶음 · 값 · 샘플 불량 유형 열넷과 발생 공정을 넣는다. 샘플 전체는 다시 넣지 않는다", async () => {
    const h = await dataDb();
    const log: string[] = [];
    await prepareDatabase(h.db, { migrate: () => h.migrate(), lock: true, log: (l) => log.push(l) });
    expect(log).toEqual([
      "마이그레이션: 적용된 것 30개 — 이번에 11개 적용",
      "샘플 데이터: 이미 데이터가 있어 그대로 둔다",
    ]);
    expect(await tableNames(h)).toEqual(TABLES);
    const rows = await defectsWithProcesses(h);
    expect(rows).toHaveLength(14);
    expect(rows.map((r) => r.code)).toEqual(SAMPLE_DEFECT_TYPES.map((d) => d.code));
    expect(linkCount).toBe(15);
    expect(rows.flatMap((r) => r.processCodes)).toHaveLength(15);
  });

  it("0020 의 묶음 · 값 · 불량 유형 · 발생 공정은 sample.ts 와 같다", async () => {
    const h = await dataDb();
    await h.migrate();
    const group = SAMPLE_CODE_GROUPS.find((g) => g.code === "DEFECT_CLS")!;
    expect(
      (await h.db.select().from(codeGroups).where(eq(codeGroups.code, "DEFECT_CLS"))).map((g) => [
        g.code,
        g.name,
        g.isSystem,
      ]),
    ).toEqual([[group.code, group.name, group.isSystem]]);
    expect(
      (await h.db.select().from(codes).where(eq(codes.groupCode, "DEFECT_CLS")).orderBy(asc(codes.id))).map((c) => [
        c.code,
        c.name,
        c.sortOrder,
        c.active,
      ]),
    ).toEqual(SAMPLE_CODES.filter((c) => c.groupCode === "DEFECT_CLS").map((c) => [c.code, c.name, c.sortOrder, true]));
    expect(
      (await defectsWithProcesses(h)).map((r) => [r.code, r.name, r.cls, r.note, r.active, r.processCodes]),
    ).toEqual(
      SAMPLE_DEFECT_TYPES.map((d) => [
        d.code,
        d.name,
        d.cls,
        d.note,
        true,
        sampleProcessOrder.filter((c) => d.processCodes.includes(c)),
      ]),
    );
  });

  it("방문자가 같은 코드로 먼저 등록한 불량 유형은 덮어쓰지 않고 잇기도 더하지 않으며, 다시 돌려도 늘지 않는다", async () => {
    const h = await dataDb(20); // 0019 까지 — 표는 있고 샘플 불량 유형은 아직 없다
    await h.client.exec(`
      insert into code_groups (code, name, is_system) values ('DEFECT_CLS', '불량 대분류', false);
      insert into codes (group_code, code, name, sort_order) values ('DEFECT_CLS', 'APPEAR', '겉모양', 10);
      insert into defect_types (code, name, cls, note) values ('CHIP', '방문자의 칩', 'APPEAR', '내 설명'), ('ZZ-1', '방문자 불량', 'APPEAR', '');
    `);
    await h.migrate();
    const chip = await h.db.select().from(defectTypes).where(eq(defectTypes.code, "CHIP"));
    expect(chip.map((r) => [r.name, r.note])).toEqual([["방문자의 칩", "내 설명"]]);
    const after = await defectsWithProcesses(h);
    expect(after.find((r) => r.code === "CHIP")!.processCodes).toEqual([]);
    expect(after).toHaveLength(SAMPLE_DEFECT_TYPES.length + 1);
    expect(after.flatMap((r) => r.processCodes)).toHaveLength(linkCount - 1);
    const text = readFileSync("drizzle/0020_defect_type_values.sql", "utf8");
    await h.client.exec(text);
    const again = await defectsWithProcesses(h);
    expect(again).toHaveLength(SAMPLE_DEFECT_TYPES.length + 1);
    expect(again.flatMap((r) => r.processCodes)).toHaveLength(linkCount - 1);
  });

  it("빈 DB — 0020 은 넣지 않고(묶음이 없다), 배포 빌드의 샘플이 열넷을 넣는다", async () => {
    const h = await fresh();
    await h.migrate();
    expect(await h.db.select().from(defectTypes)).toHaveLength(0);
    await prepareDatabase(h.db, { migrate: () => h.migrate(), lock: true, log: () => {} });
    expect(await h.db.select().from(defectTypes)).toHaveLength(SAMPLE_DEFECT_TYPES.length);
    expect(await h.db.select().from(defectTypeProcesses)).toHaveLength(linkCount);
  });
});

describe("마이그레이션 0021 · 0022 — 라우팅 표 · 샘플 라우팅(메뉴 「라우팅」)", () => {
  async function dataDb(applied = 22) {
    const h = await fresh();
    await h.migrate(firstMigrations(applied)); // 0021 까지 — 표는 있고 샘플 라우팅은 아직 없다
    // 샘플 품목이 기대는 묶음 · 값 · 번호 규칙을 먼저 둔다.
    await h.db.insert(codeGroups).values(SAMPLE_CODE_GROUPS);
    await h.db.insert(codes).values(SAMPLE_CODES);
    await h.db.insert(numberRules).values(SAMPLE_NUMBER_RULES);
    // 0016 · 0018 은 데이터가 없을 때 넣지 않았다 — 데이터를 넣은 뒤 그 SQL 만 다시 돌려 샘플 공정 · 작업장을 갖춘다(운영 DB 의 모양).
    await h.client.exec(readFileSync("drizzle/0016_process_values.sql", "utf8"));
    await h.client.exec(readFileSync("drizzle/0018_work_center_values.sql", "utf8"));
    await h.db.insert(items).values(SAMPLE_ITEMS);
    return h;
  }
  type H = Awaited<ReturnType<typeof dataDb>>;
  const stepRows = async (h: H) => {
    const r = await h.client.query<{
      item: string;
      seq: number;
      process: string;
      wc: string;
      setup: number;
      run: number;
      note: string;
    }>(
      `select i.code as item, s.seq, p.code as process, w.code as wc, s.setup_min as setup, s.run_ms as run, s.note
         from routing_steps s join routings r on r.id = s.routing_id join items i on i.id = r.item_id
         join processes p on p.id = s.process_id join work_centers w on w.id = s.work_center_id
         order by r.id, s.seq`,
    );
    return r.rows.map((x) => [x.item, x.seq, x.process, x.wc, x.setup, x.run, x.note]);
  };
  const materialRows = async (h: H) => {
    const r = await h.client.query<{ item: string; seq: number; material: string }>(
      `select i.code as item, m.seq, mi.code as material
         from routing_materials m join routings r on r.id = m.routing_id join items i on i.id = r.item_id
         join items mi on mi.id = m.item_id order by r.id, m.seq, m.id`,
    );
    return r.rows.map((x) => [x.item, x.seq, x.material]);
  };
  const expectedSteps = (skip: string[] = []) =>
    SAMPLE_ROUTINGS.filter((r) => !skip.includes(r.item)).flatMap((r) =>
      r.steps.map((s, i) => [
        r.item,
        (i + 1) * 10,
        s.process,
        s.workCenter,
        s.setupMin,
        parseRunSec(s.runSec),
        s.note ?? "",
      ]),
    );
  const expectedMaterials = (skip: string[] = []) =>
    SAMPLE_ROUTINGS.filter((r) => !skip.includes(r.item)).flatMap((r) =>
      r.steps.flatMap((s, i) => (s.materials ?? []).map((m) => [r.item, (i + 1) * 10, m])),
    );

  it("데이터가 있는 DB — 0022 가 샘플 라우팅 넷을 넣고, 줄 · 자재가 SAMPLE_ROUTINGS 와 같다(순번 · 공정 · 작업장 · 준비 · 개당 ms · 비고 · 자재)", async () => {
    const h = await dataDb();
    const log: string[] = [];
    await prepareDatabase(h.db, { migrate: () => h.migrate(), lock: true, log: (l) => log.push(l) });
    expect(log).toEqual([
      "마이그레이션: 적용된 것 30개 — 이번에 8개 적용",
      "샘플 데이터: 이미 데이터가 있어 그대로 둔다",
    ]);
    expect(await h.db.select().from(routings)).toHaveLength(4);
    expect(await h.db.select().from(routingSteps)).toHaveLength(14);
    expect(await stepRows(h)).toEqual(expectedSteps());
    expect(await materialRows(h)).toEqual(expectedMaterials());
    expect(expectedMaterials()).toHaveLength(14);
    // 이력은 넣지 않는다.
    expect(await h.db.select().from(routingChanges)).toHaveLength(0);
  });

  it("0022 를 다시 돌려도 바뀌지 않고, 방문자가 먼저 만든 라우팅이 있는 품목은 건너뛴다", async () => {
    const h = await dataDb(22);
    await h.client.exec(`
      insert into routings (item_id) values ((select id from items where code = 'SF-0001'));
      insert into routing_steps (routing_id, seq, process_id, work_center_id, setup_min, run_ms, note)
        select r.id, 10, p.id, w.id, 5, 1000, '방문자 줄' from routings r, processes p, work_centers w
        where p.code = 'MD' and w.code = 'MD-1';
    `);
    await h.migrate();
    const mine = await stepRows(h);
    expect(mine.filter((r) => r[0] === "SF-0001")).toEqual([["SF-0001", 10, "MD", "MD-1", 5, 1000, "방문자 줄"]]);
    expect(mine.filter((r) => r[0] !== "SF-0001")).toEqual(expectedSteps(["SF-0001"]));
    expect((await materialRows(h)).filter((r) => r[0] === "SF-0001")).toEqual([]);
    expect(await materialRows(h)).toEqual(expectedMaterials(["SF-0001"]));
    const text = readFileSync("drizzle/0022_routing_values.sql", "utf8");
    await h.client.exec(text);
    expect(await stepRows(h)).toEqual(mine);
    expect(await h.db.select().from(routings)).toHaveLength(SAMPLE_ROUTINGS.length);
    expect(await h.db.select().from(routingMaterials)).toHaveLength(expectedMaterials(["SF-0001"]).length);
  });

  it("0022 는 샘플 줄이 다 맞는 품목에만 넣는다 — 작업장이 없거나 다른 공정의 것이면 그 품목은 라우팅 머리부터 넣지 않는다", async () => {
    const h = await dataDb();
    // 데이터 DB 에서 방문자가 DA-2(FG-0002 만 씀)를 지우고, WB-1(SF-0002 만 씀)을 몰딩 공정으로 옮겨 두었다.
    await h.client.exec(`
      delete from work_centers where code = 'DA-2';
      update work_centers set process_id = (select id from processes where code = 'MD') where code = 'WB-1';
    `);
    await h.migrate();
    const skip = ["SF-0002", "FG-0002"];
    const heads = await h.client.query<{ code: string }>(
      `select i.code from routings r join items i on i.id = r.item_id order by i.code`,
    );
    expect(heads.rows.map((r) => r.code)).toEqual(["FG-0001", "SF-0001"]);
    expect(await stepRows(h)).toEqual(expectedSteps(skip));
    expect(await materialRows(h)).toEqual(expectedMaterials(skip));
    // 다시 돌려도 그대로다.
    await h.client.exec(readFileSync("drizzle/0022_routing_values.sql", "utf8"));
    expect(await h.db.select().from(routings)).toHaveLength(2);
    expect(await stepRows(h)).toEqual(expectedSteps(skip));
  });

  it("0022 는 「사용 안 함」 샘플 품목에는 넣지 않는다", async () => {
    const h = await dataDb();
    await h.client.exec(`update items set active = false where code = 'SF-0001'`);
    await h.migrate();
    expect(await h.db.select().from(routings)).toHaveLength(SAMPLE_ROUTINGS.length - 1);
    expect(await stepRows(h)).toEqual(expectedSteps(["SF-0001"]));
    expect(await materialRows(h)).toEqual(expectedMaterials(["SF-0001"]));
  });

  it("빈 DB — 0022 는 넣지 않고 배포 빌드의 샘플이 넷을 넣는다", async () => {
    const h = await fresh();
    await h.migrate();
    expect(await h.db.select().from(routings)).toHaveLength(0);
    await prepareDatabase(h.db, { migrate: () => h.migrate(), lock: true, log: () => {} });
    expect(await h.db.select().from(routings)).toHaveLength(SAMPLE_ROUTINGS.length);
    expect(await h.db.select().from(routingSteps)).toHaveLength(14);
    expect(await h.db.select().from(routingMaterials)).toHaveLength(14);
    expect(await h.db.select().from(routingChanges)).toHaveLength(32);
  });
});

describe("마이그레이션 0023 · 0024 — 판매계획 표 · 샘플 판매계획(메뉴 「판매계획 등록」 · 「판매계획 확정」)", () => {
  async function dataDb(applied = 24) {
    const h = await fresh();
    await h.migrate(firstMigrations(applied)); // 0023 까지 — 표는 있고 샘플 판매계획은 아직 없다
    // 샘플 품목 · 거래처가 기대는 묶음 · 값 · 번호 규칙을 먼저 둔다.
    await h.db.insert(codeGroups).values(SAMPLE_CODE_GROUPS);
    await h.db.insert(codes).values(SAMPLE_CODES);
    await h.db.insert(numberRules).values(SAMPLE_NUMBER_RULES);
    await h.db.insert(partners).values(SAMPLE_PARTNERS);
    await h.db.insert(items).values(SAMPLE_ITEMS);
    return h;
  }
  type H = Awaited<ReturnType<typeof dataDb>>;
  /** 칸을 (고객, 품목, 이번 주에서 센 주 수, 수량)으로 — 주는 SQL 을 돌린 날 기준이라 offset 으로 견준다. */
  const cellRows = async (h: H) => {
    const r = await h.client.query<{ customer: string; item: string; off: number; qty: string }>(
      `select p.code as customer, i.code as item,
              ((s.week_start - (date_trunc('week', now() at time zone 'Asia/Seoul'))::date) / 7)::int as off,
              s.qty::text as qty
         from sales_plans s join partners p on p.id = s.partner_id join items i on i.id = s.item_id
         order by p.code, i.code, s.week_start`,
    );
    return r.rows.map((x) => [x.customer, x.item, x.off, Number(x.qty)]);
  };
  const expectedCells = (skip: string[] = []) =>
    SAMPLE_SALES_PLANS.filter((p) => !skip.includes(`${p.customer}|${p.item}`))
      .flatMap((p) => p.weeks.map((w) => [p.customer, p.item, w.offset, Number(w.qty)]))
      .sort(
        (a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[1]).localeCompare(String(b[1])) || +a[2] - +b[2],
      );
  const total = SAMPLE_SALES_PLANS.reduce((n, p) => n + p.weeks.length, 0);

  it("데이터가 있는 DB — 0024 가 샘플 판매계획 다섯 줄을 넣고, 칸이 SAMPLE_SALES_PLANS 와 같다(이력은 비어 있다)", async () => {
    const h = await dataDb();
    const log: string[] = [];
    await prepareDatabase(h.db, { migrate: () => h.migrate(), lock: true, log: (l) => log.push(l) });
    expect(log).toEqual([
      "마이그레이션: 적용된 것 30개 — 이번에 6개 적용",
      "샘플 데이터: 이미 데이터가 있어 그대로 둔다",
    ]);
    expect(await h.db.select().from(salesPlans)).toHaveLength(total);
    expect(await cellRows(h)).toEqual(expectedCells());
    expect(await h.db.select().from(salesPlanChanges)).toHaveLength(0);
  });

  it("0024 를 다시 돌려도 바뀌지 않는다", async () => {
    const h = await dataDb();
    await h.migrate();
    const first = await cellRows(h);
    await h.client.exec(readFileSync("drizzle/0024_sales_plan_values.sql", "utf8"));
    expect(await cellRows(h)).toEqual(first);
    expect(first).toEqual(expectedCells());
  });

  it("방문자가 먼저 넣은 고객 × 품목은 건너뛴다 — 그 줄은 방문자의 칸만 남고, 나머지 줄은 샘플이 든다", async () => {
    const h = await dataDb();
    await h.client.exec(`
      insert into sales_plans (partner_id, item_id, week_start, qty)
      values ((select id from partners where code = 'BP-0004'), (select id from items where code = 'FG-0001'),
              (date_trunc('week', now() at time zone 'Asia/Seoul'))::date + 14, 123);
    `);
    await h.migrate();
    const rows = await cellRows(h);
    expect(rows.filter((r) => r[0] === "BP-0004" && r[1] === "FG-0001")).toEqual([["BP-0004", "FG-0001", 2, 123]]);
    expect(rows.filter((r) => !(r[0] === "BP-0004" && r[1] === "FG-0001"))).toEqual(expectedCells(["BP-0004|FG-0001"]));
  });

  it("「사용 안 함」 · 매출처가 아닌 고객 · 「사용 안 함」 품목의 줄은 넣지 않는다", async () => {
    const h = await dataDb();
    await h.client.exec(`
      update partners set active = false where code = 'BP-0005';
      update partners set is_customer = false, is_supplier = true where code = 'BP-0007';
      update items set active = false where code = 'FG-0002';
    `);
    await h.migrate();
    expect(await cellRows(h)).toEqual(
      expectedCells(["BP-0005|FG-0001", "BP-0007|FG-0001", "BP-0007|FG-0002", "BP-0004|FG-0002"]),
    );
  });

  it("빈 DB — 0024 는 넣지 않고(묶음이 없다), 배포 빌드의 샘플이 칸을 넣는다", async () => {
    const h = await fresh();
    await h.migrate();
    expect(await h.db.select().from(salesPlans)).toHaveLength(0);
    await prepareDatabase(h.db, { migrate: () => h.migrate(), lock: true, log: () => {} });
    expect(await h.db.select().from(salesPlans)).toHaveLength(total);
    expect(await h.db.select().from(salesPlanChanges)).toHaveLength(0);
  });
});

describe("마이그레이션 0025 — 판매계획 확정 칸 · 샘플의 확정(메뉴 「판매계획 확정」)", () => {
  async function dataDb() {
    const h = await fresh();
    await h.migrate(firstMigrations(24)); // 0023 까지
    await h.db.insert(codeGroups).values(SAMPLE_CODE_GROUPS);
    await h.db.insert(codes).values(SAMPLE_CODES);
    await h.db.insert(numberRules).values(SAMPLE_NUMBER_RULES);
    await h.db.insert(partners).values(SAMPLE_PARTNERS);
    await h.db.insert(items).values(SAMPLE_ITEMS);
    return h;
  }
  type H = Awaited<ReturnType<typeof dataDb>>;
  /** 칸마다 (고객, 품목, 이번 주에서 센 주 수, 확정 여부) — 확정 여부만 견주고 일시는 견주지 않는다. */
  const states = async (h: H) => {
    const r = await h.client.query<{ customer: string; item: string; off: number; confirmed: boolean }>(
      `select p.code as customer, i.code as item,
              ((s.week_start - (date_trunc('week', now() at time zone 'Asia/Seoul'))::date) / 7)::int as off,
              s.confirmed_at is not null as confirmed
         from sales_plans s join partners p on p.id = s.partner_id join items i on i.id = s.item_id
         order by p.code, i.code, s.week_start`,
    );
    return r.rows.map((x) => [x.customer, x.item, x.off, x.confirmed]);
  };
  const confirmedAts = async (h: H) =>
    (
      await h.client.query<{ c: string | null }>(`select confirmed_at::text as c from sales_plans order by id`)
    ).rows.map((x) => x.c);
  const sampleStates = (skip: string[] = []) =>
    SAMPLE_SALES_PLANS.flatMap((p) =>
      p.weeks.map((w) => [p.customer, p.item, w.offset, !skip.includes(`${p.customer}|${p.item}`) && w.offset <= 5]),
    ).sort(
      (a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[1]).localeCompare(String(b[1])) || +a[2] - +b[2],
    );

  it("데이터가 있는 DB — 0025 가 이번 주 + 5주까지의 칸을 확정하고, 그 뒤 주는 미확정으로 둔다(이력은 비어 있다)", async () => {
    const h = await dataDb();
    await h.migrate();
    expect(await states(h)).toEqual(sampleStates());
    expect(await h.db.select().from(salesPlanChanges)).toHaveLength(0);
  });

  it("0025 를 다시 돌려도 바뀌지 않는다(확정 일시도 그대로다)", async () => {
    const h = await dataDb();
    await h.migrate();
    const first = await states(h);
    const at = await confirmedAts(h);
    await h.client.exec(
      readFileSync("drizzle/0025_sales_plan_confirm.sql", "utf8").split("--> statement-breakpoint").at(-1)!,
    );
    expect(await states(h)).toEqual(first);
    expect(await confirmedAts(h)).toEqual(at);
  });

  it("확정 이력 · 고친 이력이 있는 고객 × 품목은 건너뛴다 — 그 쌍은 미확정으로 남는다", async () => {
    const h = await dataDb();
    await h.migrate(firstMigrations(25)); // 0024 까지 — 샘플 칸이 든다
    await h.client.exec(`
      insert into sales_plan_changes (partner_id, item_id, week_start, before, after)
      values ((select id from partners where code = 'BP-0004'), (select id from items where code = 'FG-0001'),
              (date_trunc('week', now() at time zone 'Asia/Seoul'))::date, 3000, 4000);
    `);
    await h.migrate();
    expect(await states(h)).toEqual(sampleStates(["BP-0004|FG-0001"]));
  });

  it("이미 확정된 칸의 일시는 건드리지 않고, 이번 주 + 6주 이후의 방문자 칸은 확정하지 않는다", async () => {
    const h = await dataDb();
    await h.migrate();
    await h.client.exec(`
      update sales_plans set confirmed_at = null;
      update sales_plans set confirmed_at = '2026-01-01T00:00:00Z'
       where week_start = (date_trunc('week', now() at time zone 'Asia/Seoul'))::date
         and partner_id = (select id from partners where code = 'BP-0005');
    `);
    await h.client.exec(
      readFileSync("drizzle/0025_sales_plan_confirm.sql", "utf8").split("--> statement-breakpoint").at(-1)!,
    );
    const r = await h.client.query<{ c: string }>(
      `select confirmed_at::text as c from sales_plans
        where week_start = (date_trunc('week', now() at time zone 'Asia/Seoul'))::date
          and partner_id = (select id from partners where code = 'BP-0005') and item_id = (select id from items where code = 'FG-0001')`,
    );
    expect(r.rows[0].c).toMatch(/^2026-01-01/);
    expect((await states(h)).filter((x) => Number(x[2]) >= 6 && x[3] === true)).toEqual([]);
  });

  it("빈 DB — 0025 는 칸이 없어 아무것도 하지 않고, 배포 빌드의 샘플이 확정 칸을 넣는다", async () => {
    const h = await fresh();
    await h.migrate();
    expect(await h.db.select().from(salesPlans)).toHaveLength(0);
    await prepareDatabase(h.db, { migrate: () => h.migrate(), lock: true, log: () => {} });
    expect(await h.db.select().from(salesPlans)).toHaveLength(
      SAMPLE_SALES_PLANS.reduce((n, p) => n + p.weeks.length, 0),
    );
  });
});

describe("마이그레이션 0027 — 샘플 MPS 고정(메뉴 「MPS」)", () => {
  async function dataDb() {
    const h = await fresh();
    await h.migrate(firstMigrations(27)); // 0026 까지 — 표는 있고 샘플 고정은 아직 없다
    await h.db.insert(codeGroups).values(SAMPLE_CODE_GROUPS);
    await h.db.insert(codes).values(SAMPLE_CODES);
    await h.db.insert(numberRules).values(SAMPLE_NUMBER_RULES);
    await h.db.insert(partners).values(SAMPLE_PARTNERS);
    await h.db.insert(items).values(SAMPLE_ITEMS);
    return h;
  }
  type H = Awaited<ReturnType<typeof dataDb>>;
  /** 칸을 (품목, 이번 주에서 센 주 수, 수량)으로 — 주는 SQL 을 돌린 날 기준이라 offset 으로 견준다. */
  const cellRows = async (h: H) => {
    const r = await h.client.query<{ item: string; off: number; qty: string }>(
      `select i.code as item,
              ((s.week_start - (date_trunc('week', now() at time zone 'Asia/Seoul'))::date) / 7)::int as off,
              s.qty::text as qty
         from mps_fixed s join items i on i.id = s.item_id
         order by i.code, s.week_start`,
    );
    return r.rows.map((x) => [x.item, x.off, Number(x.qty)]);
  };
  const expectedCells = () =>
    SAMPLE_MPS_FIXED.map((f) => [f.item, f.offset, Number(f.qty)]).sort(
      (a, b) => String(a[0]).localeCompare(String(b[0])) || +a[1] - +b[1],
    );

  it("데이터가 있는 DB — 0027 이 FG-0001 의 이번 주 · 다음 주를 SAMPLE_MPS_FIXED 값으로 고정한다(이력은 비어 있다)", async () => {
    const h = await dataDb();
    const log: string[] = [];
    await prepareDatabase(h.db, { migrate: () => h.migrate(), lock: true, log: (l) => log.push(l) });
    expect(log).toEqual([
      "마이그레이션: 적용된 것 30개 — 이번에 3개 적용",
      "샘플 데이터: 이미 데이터가 있어 그대로 둔다",
    ]);
    expect(await cellRows(h)).toEqual(expectedCells());
    expect(await h.db.select().from(mpsChanges)).toHaveLength(0);
  });

  it("0027 을 다시 돌려도 바뀌지 않는다", async () => {
    const h = await dataDb();
    await h.migrate();
    const first = await cellRows(h);
    await h.client.exec(readFileSync("drizzle/0027_mps_values.sql", "utf8"));
    expect(await cellRows(h)).toEqual(first);
    expect(first).toEqual(expectedCells());
  });

  it("FG-0001 에 고정 칸이 이미 있으면 건너뛴다 — 방문자의 칸만 남는다", async () => {
    const h = await dataDb();
    await h.client.exec(`
      insert into mps_fixed (item_id, week_start, qty, fixed_at)
      values ((select id from items where code = 'FG-0001'),
              (date_trunc('week', now() at time zone 'Asia/Seoul'))::date + 14, 123, now());
    `);
    await h.migrate();
    expect(await cellRows(h)).toEqual([["FG-0001", 2, 123]]);
  });

  it("FG-0001 이 「사용 안 함」이거나 완제품이 아니면 넣지 않는다", async () => {
    const off = await dataDb();
    await off.client.exec(`update items set active = false where code = 'FG-0001'`);
    await off.migrate();
    expect(await cellRows(off)).toEqual([]);

    const notFg = await dataDb();
    await notFg.client.exec(`update items set code = 'SF-0009', item_type = 'SF' where code = 'FG-0001'`);
    await notFg.migrate();
    expect(await cellRows(notFg)).toEqual([]);
  });

  it("빈 DB — 0027 은 넣지 않고(묶음이 없다), 배포 빌드의 샘플이 고정 칸을 넣는다", async () => {
    const h = await fresh();
    await h.migrate();
    expect(await h.db.select().from(mpsFixed)).toHaveLength(0);
    await prepareDatabase(h.db, { migrate: () => h.migrate(), lock: true, log: () => {} });
    expect(await h.db.select().from(mpsFixed)).toHaveLength(SAMPLE_MPS_FIXED.length);
    expect(await h.db.select().from(mpsChanges)).toHaveLength(0);
  });
});
