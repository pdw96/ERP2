// @vitest-environment node
import { asc, eq, getTableName, isTable, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nextCode } from "@/db/numbering";
import { RESET_TABLES, resetToSample } from "@/db/reset";
import { lastResetAt } from "@/db/status";
import {
  SAMPLE_CODE_GROUPS,
  SAMPLE_CODES,
  SAMPLE_DEFECT_TYPES,
  SAMPLE_ITEMS,
  SAMPLE_NUMBER_RULES,
  SAMPLE_PARTNERS,
  SAMPLE_PROCESSES,
  SAMPLE_MPS_FIXED,
  SAMPLE_SALES_PLANS,
  SAMPLE_UNIT_SPECS,
  SAMPLE_WAREHOUSES,
  SAMPLE_WORK_CENTERS,
} from "@/db/sample";
import * as schema from "@/db/schema";
import {
  bomChanges,
  bomLines,
  boms,
  codes,
  defectTypeProcesses,
  defectTypes,
  items,
  numberRuleSeqs,
  numberRules,
  partners,
  processes,
  routingChanges,
  routingMaterials,
  routings,
  routingSteps,
  mpsChanges,
  mpsFixed,
  salesPlanChanges,
  salesPlans,
  stockBalances,
  stockCountLines,
  stockCounts,
  stockMoveLines,
  stockMoves,
  unitSpecs,
  warehouses,
  workCenters,
} from "@/db/schema";
import { saveMove } from "@/db/stock";
import { koreaToday } from "@/lib/today";
import type { Db } from "@/db/types";
import { migratedDb } from "./pglite";

let handle: Awaited<ReturnType<typeof migratedDb>>;
let db: Db;
beforeAll(async () => {
  handle = await migratedDb();
  db = handle.db;
});
afterAll(() => handle.close());

async function snapshot() {
  const strip = <T extends { id: number; createdAt: Date; updatedAt: Date }>(rows: T[]) =>
    rows.map((row) => {
      const rest: Partial<T> = { ...row };
      delete rest.createdAt;
      delete rest.updatedAt;
      return rest;
    });
  return {
    items: strip(await db.select().from(items).orderBy(asc(items.id))),
    warehouses: strip(await db.select().from(warehouses).orderBy(asc(warehouses.id))),
    partners: strip(await db.select().from(partners).orderBy(asc(partners.id))),
    processes: strip(await db.select().from(processes).orderBy(asc(processes.id))),
    workCenters: strip(await db.select().from(workCenters).orderBy(asc(workCenters.id))),
    defectTypes: strip(await db.select().from(defectTypes).orderBy(asc(defectTypes.id))),
    defectTypeProcesses: await db
      .select()
      .from(defectTypeProcesses)
      .orderBy(asc(defectTypeProcesses.defectTypeId), asc(defectTypeProcesses.processId)),
    codes: strip(await db.select().from(codes).orderBy(asc(codes.id))),
    unitSpecs: strip(await db.select().from(unitSpecs).orderBy(asc(unitSpecs.id))),
    numberRules: strip(await db.select().from(numberRules).orderBy(asc(numberRules.id))),
    numberRuleSeqs: strip(await db.select().from(numberRuleSeqs).orderBy(asc(numberRuleSeqs.id))),
    stockMoves: strip(await db.select().from(stockMoves).orderBy(asc(stockMoves.id))),
    stockMoveLines: strip(await db.select().from(stockMoveLines).orderBy(asc(stockMoveLines.id))),
    stockBalances: strip(await db.select().from(stockBalances).orderBy(asc(stockBalances.id))),
    stockCounts: strip(await db.select().from(stockCounts).orderBy(asc(stockCounts.id))),
    stockCountLines: strip(await db.select().from(stockCountLines).orderBy(asc(stockCountLines.id))),
    boms: strip(await db.select().from(boms).orderBy(asc(boms.id))),
    bomLines: strip(await db.select().from(bomLines).orderBy(asc(bomLines.id))),
    // 고친 이력은 일시가 되돌린 때라 일시를 뺀 나머지를 견준다.
    bomChanges: (await db.select().from(bomChanges).orderBy(asc(bomChanges.id))).map((row) => {
      const rest: Partial<typeof row> = { ...row };
      delete rest.savedAt;
      return rest;
    }),
    routings: strip(await db.select().from(routings).orderBy(asc(routings.id))),
    routingSteps: await db.select().from(routingSteps).orderBy(asc(routingSteps.id)),
    routingMaterials: await db.select().from(routingMaterials).orderBy(asc(routingMaterials.id)),
    salesPlans: strip(await db.select().from(salesPlans).orderBy(asc(salesPlans.id))).map((row) => {
      const { confirmedAt, ...rest } = row; // 확정 일시는 되돌림 시각이라 있고 없고만 견준다
      return { ...rest, confirmed: confirmedAt != null };
    }),
    salesPlanChanges: (await db.select().from(salesPlanChanges).orderBy(asc(salesPlanChanges.id))).map((row) => {
      const rest: Partial<typeof row> = { ...row };
      delete rest.savedAt;
      return rest;
    }),
    mpsFixed: strip(await db.select().from(mpsFixed).orderBy(asc(mpsFixed.id))).map((row) => {
      const { fixedAt, ...rest } = row; // 고정 일시는 되돌림 시각이라 견주지 않는다
      return { ...rest, fixed: fixedAt != null };
    }),
    mpsChanges: (await db.select().from(mpsChanges).orderBy(asc(mpsChanges.id))).map((row) => {
      const rest: Partial<typeof row> = { ...row };
      delete rest.savedAt;
      return rest;
    }),
    routingChanges: (await db.select().from(routingChanges).orderBy(asc(routingChanges.id))).map((row) => {
      const rest: Partial<typeof row> = { ...row };
      delete rest.savedAt;
      return rest;
    }),
  };
}

describe("매일 밤 되돌림 — 성공 기준 6", () => {
  it("되돌림이 비우는 테이블은 스키마의 테이블 전부다 — 테이블을 더하고 되돌림에 잊으면 실패한다", () => {
    const tables = Object.values(schema).filter(isTable).map(getTableName);
    expect([...RESET_TABLES].sort()).toEqual(tables.sort());
  });

  it("바꿔 놓은 데이터가 샘플과 같아진다 — 더한 행은 빠지고, 고친 행은 돌아오고, 번호도 1 부터", async () => {
    await resetToSample(db);
    const clean = await snapshot();

    await db.insert(codes).values({ groupCode: "UNIT", code: "BOX", name: "상자" });
    await db.insert(unitSpecs).values({ unit: "BOX", baseUnit: "BOX", factor: 1, decimals: 0 });
    await db.update(unitSpecs).set({ decimals: 3 }).where(eq(unitSpecs.unit, "EA"));
    await db.insert(items).values({ code: "RM-0007", name: "장난", itemType: "RM", procurement: "BUY", unit: "BOX" });
    await db.update(items).set({ name: "바꾼 이름", active: false }).where(eq(items.code, "RM-0001"));
    await db.insert(warehouses).values({ code: "WH-05", name: "장난 창고" });
    await db.update(partners).set({ name: "장난" }).where(eq(partners.code, "BP-0001"));
    // 재고 수불 PR B — 번호 규칙을 더하고 고치고, 일련이 생기고, 품목의 기본 창고 · 규칙을 바꾸고, 불량창고 표시를 바꾼다.
    await db.insert(numberRules).values({ code: "LOT_X", name: "장난 규칙", seqDigits: 4 });
    await db.update(numberRules).set({ prefix: "ZZ" }).where(eq(numberRules.code, "LOT_FG"));
    // 일련의 기간은 샘플이 만들 수 없는 날(2000-01-01)이다 — 샘플 수불은 되돌린 날에서 센 며칠 앞이라, 실제 날짜를 쓰면 그날 되돌린 샘플의 기간과 겹친다.
    await db.insert(numberRuleSeqs).values({ ruleCode: "LOT_FG", period: "000101", lastSeq: 7 });
    await db
      .update(items)
      .set({ defaultInWarehouseId: null, lotRuleCode: "LOT_X", lotManaged: false })
      .where(eq(items.code, "FG-0001"));
    await db.update(warehouses).set({ isDefect: false }).where(eq(warehouses.code, "WH-04"));
    // 재고 수불 PR C — 수불을 하나 더 남긴다(전표 · 줄 · 잔액 · LOT 일련이 바뀐다).
    const more = await saveMove(
      db,
      { moveDate: koreaToday(), moveType: "IN", lines: [{ item: "FG-0001", warehouse: "WH-03", qty: "10" }] },
      koreaToday(),
    );
    expect(more.ok).toBe(true);
    // BOM PR C — 고친 이력에 줄 하나를 더한다(되돌림이 비우고 샘플 BOM 의 저장이 다시 채운다).
    await db.execute(
      sql`insert into bom_changes (parent_item_id, kind, after) values ((select id from items where code = 'FG-0001'), 'BASE', '{"baseQty":"1"}')`,
    );
    // 라우팅 — 줄 하나를 고치고, 자재 하나를 떼고, 라우팅 하나를 지우고, 고친 이력을 더한다(되돌림이 비우고 샘플 라우팅의 저장이 다시 채운다).
    await db.execute(sql`update sales_plans set qty = 777 where id = 1`);
    await db.execute(sql`delete from sales_plans where id = 2`);
    await db.execute(
      sql`insert into sales_plan_changes (partner_id, item_id, week_start, before, after) values (1, 1, '2026-11-02', 1, 2)`,
    );
    // MPS — 고정 칸 하나를 고치고 하나를 풀고, 고친 이력을 더한다(되돌림이 비우고 샘플 고정을 다시 넣는다).
    await db.execute(sql`update mps_fixed set qty = 777 where id = 1`);
    await db.execute(sql`delete from mps_fixed where id = 2`);
    await db.execute(
      sql`insert into mps_changes (item_id, week_start, before, after, kind) values (1, '2026-11-02', 1, 2, 'EDIT')`,
    );
    await db.execute(sql`update routing_steps set note = '방문자 비고' where seq = 10`);
    await db.execute(sql`delete from routing_materials where item_id = (select id from items where code = 'RM-0002')`);
    await db.execute(sql`delete from routings where item_id = (select id from items where code = 'FG-0002')`);
    await db.execute(
      sql`insert into routing_changes (item_id, kind) values ((select id from items where code = 'FG-0001'), 'ROUTING_DEL')`,
    );
    // BOM PR A — BOM 하나를 지우고 하나를 고친다.
    await db.execute(sql`delete from bom_lines where parent_item_id = (select id from items where code = 'FG-0002')`);
    await db.execute(sql`delete from boms where item_id = (select id from items where code = 'FG-0002')`);
    await db
      .update(boms)
      .set({ baseQty: 1 })
      .where(sql`${boms.itemId} = (select id from items where code = 'SF-0002')`);

    // 불량 유형 — 방문자가 하나 더 만들고, SCRATCH 에 공정을 붙이고, WIRE-SWP 의 공정 하나를 뺀다.
    await db.execute(sql`insert into defect_types (code, name, cls) values ('ZZ-1', '방문자 불량', 'DIM')`);
    await db.execute(
      sql`insert into defect_type_processes (defect_type_id, process_id) values
        ((select id from defect_types where code = 'SCRATCH'), (select id from processes where code = 'DA')),
        ((select id from defect_types where code = 'ZZ-1'), (select id from processes where code = 'MD'))`,
    );
    await db.execute(
      sql`delete from defect_type_processes where defect_type_id = (select id from defect_types where code = 'WIRE-SWP')
        and process_id = (select id from processes where code = 'MD')`,
    );

    const counts = await resetToSample(db);
    expect(await snapshot()).toEqual(clean);
    expect([clean.routings.length, clean.routingSteps.length, clean.routingMaterials.length]).toEqual([4, 14, 14]);
    expect(clean.routingChanges.length).toBeGreaterThan(0);
    expect(clean.salesPlans.length).toBe(SAMPLE_SALES_PLANS.reduce((n, p) => n + p.weeks.length, 0));
    expect(clean.salesPlanChanges).toHaveLength(0);
    expect(clean.mpsFixed).toHaveLength(SAMPLE_MPS_FIXED.length);
    expect(clean.mpsChanges).toHaveLength(0);
    expect(counts).toEqual({
      mps_changes: clean.mpsChanges.length,
      mps_fixed: clean.mpsFixed.length,
      sales_plan_changes: clean.salesPlanChanges.length,
      sales_plans: clean.salesPlans.length,
      routing_changes: clean.routingChanges.length,
      routing_materials: clean.routingMaterials.length,
      routing_steps: clean.routingSteps.length,
      routings: clean.routings.length,
      bom_changes: clean.bomChanges.length,
      bom_lines: clean.bomLines.length,
      boms: clean.boms.length,
      stock_count_lines: clean.stockCountLines.length,
      stock_counts: clean.stockCounts.length,
      stock_balances: clean.stockBalances.length,
      stock_move_lines: clean.stockMoveLines.length,
      stock_moves: clean.stockMoves.length,
      items: SAMPLE_ITEMS.length,
      number_rule_seqs: clean.numberRuleSeqs.length,
      number_rules: SAMPLE_NUMBER_RULES.length,
      warehouses: SAMPLE_WAREHOUSES.length,
      partners: SAMPLE_PARTNERS.length,
      work_centers: SAMPLE_WORK_CENTERS.length,
      defect_types: SAMPLE_DEFECT_TYPES.length,
      defect_type_processes: SAMPLE_DEFECT_TYPES.flatMap((d) => d.processCodes).length,
      processes: SAMPLE_PROCESSES.length,
      unit_specs: SAMPLE_UNIT_SPECS.length,
      codes: SAMPLE_CODES.length,
      code_groups: SAMPLE_CODE_GROUPS.length,
    });
    expect(clean.items[0].id).toBe(1);
    expect(clean.processes.map((p) => p.code)).toEqual(["BG", "SAW", "DA", "WB", "MD", "MK", "FT"]);
    // 작업장은 공정의 id 로 이어진다 — 되돌린 뒤에도 DA-2 는 공정 DA 에 걸린다.
    const da2 = clean.workCenters.find((w) => w.code === "DA-2")!;
    expect(clean.processes.find((p) => p.id === da2.processId)?.code).toBe("DA");
    // 불량 유형의 발생 공정은 공정의 id 로 이어진다 — 되돌린 뒤에도 WIRE-SWP 의 공정은 WB · MD 이고 SCRATCH 는 없다(공통).
    const linksOf = (code: string) => {
      const d = clean.defectTypes.find((x) => x.code === code)!;
      return clean.defectTypeProcesses
        .filter((l) => l.defectTypeId === d.id)
        .map((l) => clean.processes.find((p) => p.id === l.processId)!.code)
        .sort();
    };
    expect(linksOf("WIRE-SWP")).toEqual(["MD", "WB"]);
    expect(linksOf("SCRATCH")).toEqual([]);
    // 번호 규칙의 일련은 샘플 수불이 반제품 · 완제품의 LOT 를 저절로 받으며 생긴다 — 규칙마다 하나(7일 전).
    expect(clean.numberRuleSeqs.map((s) => [s.ruleCode, s.lastSeq])).toEqual([
      ["LOT_SF", 2],
      ["LOT_FG", 1],
      ["LOT_NUM", 1],
    ]);
    // 샘플 수불 열 장과, 샘플 실사(생산현장)의 확정이 만든 「실사 차이」 조정 전표 한 장.
    expect(clean.stockMoves).toHaveLength(11);
    expect(clean.stockCounts.map((c) => c.status)).toEqual(["CONFIRMED", "DRAFT"]);
    // 품목의 기본 창고는 창고 코드로 넣은 샘플대로 — 사 오는 품목은 자재창고 → 생산현장, 완제품은 제품창고.
    const whId = (code: string) => clean.warehouses.find((w) => w.code === code)!.id;
    const rm = clean.items.find((i) => i.code === "RM-0003")!;
    const fg = clean.items.find((i) => i.code === "FG-0002")!;
    expect([rm.defaultInWarehouseId, rm.defaultOutWarehouseId]).toEqual([whId("WH-01"), whId("WH-02")]);
    expect([fg.defaultInWarehouseId, fg.defaultOutWarehouseId, fg.lotRuleCode]).toEqual([
      whId("WH-03"),
      whId("WH-03"),
      "LOT_NUM",
    ]);
  });

  it("두 번 불러도 같다", async () => {
    await resetToSample(db);
    const once = await snapshot();
    await resetToSample(db);
    expect(await snapshot()).toEqual(once);
  });

  it("되돌린 뒤 코드는 샘플의 다음 번호부터 붙는다", async () => {
    await db.insert(warehouses).values([
      { code: "WH-05", name: "더한 창고" },
      { code: "WH-06", name: "더한 창고 2" },
    ]);
    expect(await nextCode(db, "WH")).toBe("WH-07");
    await resetToSample(db);
    expect(await nextCode(db, "WH")).toBe("WH-05");
  });

  it("중간에 실패하면 아무것도 바뀌지 않는다", async () => {
    await resetToSample(db);
    await db.insert(warehouses).values({ code: "WH-09", name: "남아야 할 창고" });
    const before = await snapshot();
    // 샘플 품목이 쓰는 단위를 일부러 빼 품목 넣기에서 실패하게 한다.
    const original = SAMPLE_ITEMS[0].unit;
    SAMPLE_ITEMS[0].unit = "NONE";
    try {
      await expect(resetToSample(db)).rejects.toThrow();
    } finally {
      SAMPLE_ITEMS[0].unit = original;
    }
    expect(await snapshot()).toEqual(before);
    const [{ count }] = (await db.select({ count: sql<number>`count(*)::int` }).from(warehouses)) as {
      count: number;
    }[];
    expect(count).toBe(5);
  });
});

describe("마지막 되돌림 시각 — 상태 화면이 보이고 정기 확인이 본다(대장 NC-10)", () => {
  it("되돌릴 때마다 그 시각으로 바뀌고, 방문자가 고쳐도 바뀌지 않는다", async () => {
    await resetToSample(db);
    const first = await lastResetAt(db);
    expect(first).toBeInstanceOf(Date);
    await db.update(codes).set({ name: "방문자가 고침" }).where(eq(codes.code, "EA"));
    expect(await lastResetAt(db)).toEqual(first);
    await new Promise((r) => setTimeout(r, 5));
    await resetToSample(db);
    expect((await lastResetAt(db))!.getTime()).toBeGreaterThan(first!.getTime());
  });

  it("샘플이 없으면 null", async () => {
    await db.execute(sql`truncate table ${sql.raw(RESET_TABLES.join(", "))} restart identity cascade`);
    expect(await lastResetAt(db)).toBeNull();
    await resetToSample(db);
  });
});

describe("코드 번호 — 같은 머리의 가장 큰 번호 + 1", () => {
  it("유형마다 따로 센다 — 첫 번호 · 다음 번호", async () => {
    await resetToSample(db);
    expect(await nextCode(db, "RM")).toBe("RM-0007");
    expect(await nextCode(db, "SF")).toBe("SF-0003");
    expect(await nextCode(db, "FG")).toBe("FG-0003");
    expect(await nextCode(db, "BP")).toBe("BP-0008");
    expect(await nextCode(db, "SM")).toBe("SM-0003");
    expect(await nextCode(db, "CS")).toBe("CS-0003");
    await db.execute(
      sql.raw(
        `truncate table "mps_changes", "mps_fixed", "sales_plan_changes", "sales_plans", "routing_changes", "routing_materials", "routing_steps", "routings", "bom_changes", "bom_lines", "boms", "stock_count_lines", "stock_balances", "stock_move_lines", "items"`,
      ),
    );
    expect(await nextCode(db, "RM")).toBe("RM-0001");
  });

  it("자릿수를 넘으면 늘린다", async () => {
    await resetToSample(db);
    await db.insert(warehouses).values({ code: "WH-99", name: "끝 번호" });
    expect(await nextCode(db, "WH")).toBe("WH-100");
  });
});
