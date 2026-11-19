// @vitest-environment node
import { eq, getTableName, isTable } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetToSample } from "@/db/reset";
import * as schema from "@/db/schema";
import {
  codes,
  defectTypeProcesses,
  defectTypes,
  items,
  partners,
  processes,
  warehouses,
  workCenters,
} from "@/db/schema";
import type { Db } from "@/db/types";
import { migratedDb, rejection } from "./pglite";

// 코드의 꼴과 참조는 DB 의 제약이 막는다(설계 ②) — 화면 · 서버를 건너뛴 값도 들어오지 않는다.

let handle: Awaited<ReturnType<typeof migratedDb>>;
let db: Db;
beforeAll(async () => {
  handle = await migratedDb();
  db = handle.db;
});
afterAll(() => handle.close());
beforeEach(() => resetToSample(db));

const item = (over: Partial<typeof items.$inferInsert> = {}) => ({
  code: "RM-0100",
  name: "시험 원자재",
  itemType: "RM",
  procurement: "BUY",
  unit: "EA",
  ...over,
});

describe("테이블", () => {
  it("스키마의 테이블은 스물여섯이다 — 기준정보 다섯과 공정 · 작업장 · 불량 유형 · 불량 유형의 발생 공정 · 단위 사양 · 번호 규칙 · 번호 규칙의 일련 · 수불 전표 · 수불 줄 · 잔액 · 실사 · 실사 줄 · BOM 머리 · BOM 줄 · BOM 고친 이력 · 라우팅 머리 · 공정 줄 · 투입 자재 · 고친 이력 · 판매계획 · 판매계획 고친 이력", () => {
    const names = Object.values(schema).filter(isTable).map(getTableName).sort();
    expect(names).toEqual([
      "bom_changes",
      "bom_lines",
      "boms",
      "code_groups",
      "codes",
      "defect_type_processes",
      "defect_types",
      "items",
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
    ]);
  });
});

describe("품목", () => {
  it("맞는 꼴은 저장되고 기본값이 붙는다", async () => {
    const [row] = await db.insert(items).values(item()).returning();
    expect(row).toMatchObject({
      code: "RM-0100",
      spec: "",
      inspectIn: false,
      leadTimeDays: 0,
      safetyStock: 0,
      active: true,
    });
  });

  it.each([
    ["머리가 유형과 다름", { code: "SF-0100" }, "items_code_format"],
    ["머리가 없는 꼴", { code: "XX-0100" }, "items_code_format"],
    ["자릿수 모자람", { code: "RM-100" }, "items_code_format"],
    ["소문자", { code: "rm-0100" }, "items_code_format"],
    ["빈 품명", { name: "" }, "items_name_length"],
    ["101자 품명", { name: "가".repeat(101) }, "items_name_length"],
    ["101자 규격", { spec: "가".repeat(101) }, "items_spec_length"],
    ["리드타임 366", { leadTimeDays: 366 }, "items_lead_time_range"],
    ["리드타임 음수", { leadTimeDays: -1 }, "items_lead_time_range"],
    ["안전재고 음수", { safetyStock: -0.001 }, "items_quantities_not_negative"],
    ["배수 음수", { lotMultiple: -1 }, "items_quantities_not_negative"],
  ])("%s → 거절", async (_name, over, constraint) => {
    expect(await rejection(db.insert(items).values(item(over)))).toMatchObject({ constraint });
    expect(
      await db
        .select()
        .from(items)
        .where(eq(items.code, item(over).code)),
    ).toHaveLength(0);
  });

  it("경계 — 품명 100자 · 리드타임 0 · 365 · 수량 소수 셋째 자리", async () => {
    await db.insert(items).values(item({ name: "가".repeat(100), leadTimeDays: 0 }));
    const [row] = await db
      .insert(items)
      .values(item({ code: "RM-0101", leadTimeDays: 365, safetyStock: 1.234, minLot: 0, lotMultiple: 0.001 }))
      .returning();
    expect(row).toMatchObject({ leadTimeDays: 365, safetyStock: 1.234, lotMultiple: 0.001 });
  });

  it("수량은 소수 셋째 자리까지 남는다 — 넷째 자리는 반올림", async () => {
    const [row] = await db
      .insert(items)
      .values(item({ safetyStock: 1.2345 }))
      .returning();
    expect(row.safetyStock).toBe(1.235);
  });

  it("같은 코드는 거절한다", async () => {
    expect(await rejection(db.insert(items).values(item({ code: "RM-0001" })))).toMatchObject({
      constraint: "items_code_unique",
    });
  });

  it.each([
    ["없는 단위", { unit: "BOX" }, "items_unit_fk"],
    ["다른 묶음의 값을 단위로", { unit: "RM" }, "items_unit_fk"],
    ["없는 조달구분", { procurement: "OUT" }, "items_procurement_fk"],
    ["단위 묶음 칸을 바꿈", { unitGroup: "ITEM_TYPE", unit: "RM" }, "items_unit_group_fixed"],
  ])("%s → 공통코드에 없는 값이라 거절", async (_name, over, constraint) => {
    expect(await rejection(db.insert(items).values(item(over)))).toMatchObject({ constraint });
  });

  it("공통코드에 더한 단위는 받는다", async () => {
    await db.insert(codes).values({ groupCode: "UNIT", code: "BOX", name: "상자", sortOrder: 50 });
    await expect(db.insert(items).values(item({ unit: "BOX" }))).resolves.toBeDefined();
  });

  it("품목이 쓰는 공통코드 값은 지울 수 없다", async () => {
    expect(await rejection(db.delete(codes).where(eq(codes.code, "EA")))).toMatchObject({ code: "23503" });
  });
});

describe("창고", () => {
  it("맞는 꼴은 저장된다", async () => {
    await expect(db.insert(warehouses).values({ code: "WH-05", name: "외부창고" })).resolves.toBeDefined();
    await expect(db.insert(warehouses).values({ code: "WH-100", name: "세 자리" })).resolves.toBeDefined();
  });

  it.each([
    ["한 자리", { code: "WH-5", name: "창고" }, "warehouses_code_format"],
    ["다른 머리", { code: "WS-05", name: "창고" }, "warehouses_code_format"],
    ["빈 이름", { code: "WH-05", name: "" }, "warehouses_name_length"],
    ["51자 이름", { code: "WH-05", name: "가".repeat(51) }, "warehouses_name_length"],
    ["겹치는 코드", { code: "WH-01", name: "창고" }, "warehouses_code_unique"],
  ])("%s → 거절", async (_name, values, constraint) => {
    expect(await rejection(db.insert(warehouses).values(values))).toMatchObject({ constraint });
  });
});

describe("공정", () => {
  it("맞는 꼴은 저장되고 기본값이 붙는다", async () => {
    const [row] = await db.insert(processes).values({ code: "DA2", name: "다이 본딩 2" }).returning();
    expect(row).toMatchObject({ code: "DA2", name: "다이 본딩 2", note: "", active: true });
  });

  it.each([
    ["소문자", { code: "da", name: "x" }, "processes_code_format"],
    ["한 글자", { code: "D", name: "x" }, "processes_code_format"],
    ["일곱 자", { code: "ABCDEFG", name: "x" }, "processes_code_format"],
    ["숫자로 시작", { code: "1A", name: "x" }, "processes_code_format"],
    ["빈 이름", { code: "XX", name: "" }, "processes_name_length"],
    ["51자 이름", { code: "XX", name: "가".repeat(51) }, "processes_name_length"],
    ["501자 비고", { code: "XX", name: "x", note: "가".repeat(501) }, "processes_note_length"],
  ])("%s → 거절", async (_name, values, constraint) => {
    expect(await rejection(db.insert(processes).values(values))).toMatchObject({ constraint });
  });

  it("같은 코드 두 번 → 거절", async () => {
    await db.insert(processes).values({ code: "DA2", name: "다이 본딩 2" });
    expect(await rejection(db.insert(processes).values({ code: "DA2", name: "또" }))).toMatchObject({
      constraint: "processes_code_unique",
    });
  });
});

describe("작업장", () => {
  const processId = async (code: string) => {
    const [p] = await db.select().from(processes).where(eq(processes.code, code));
    return p.id;
  };

  it("맞는 꼴은 저장되고 기본값이 붙는다", async () => {
    const pid = await processId("DA");
    const [row] = await db
      .insert(workCenters)
      .values({ code: "DA-3", name: "다이 본딩 3라인", processId: pid })
      .returning();
    expect(row).toMatchObject({ code: "DA-3", name: "다이 본딩 3라인", processId: pid, note: "", active: true });
  });

  it.each([
    ["소문자", "da-1", "x", "", "work_centers_code_format"],
    ["한 글자", "D", "x", "", "work_centers_code_format"],
    ["11자", "ABCDEFGHIJK", "x", "", "work_centers_code_format"],
    ["숫자로 시작", "1A", "x", "", "work_centers_code_format"],
    ["끝 하이픈", "DA-", "x", "", "work_centers_code_format"],
    ["하이픈 둘", "D--A", "x", "", "work_centers_code_format"],
    ["빈 이름", "DA-1", "", "", "work_centers_name_length"],
    ["51자 이름", "DA-1", "가".repeat(51), "", "work_centers_name_length"],
    ["501자 비고", "DA-1", "x", "가".repeat(501), "work_centers_note_length"],
  ])("%s → 거절", async (_name, code, name, note, constraint) => {
    const pid = await processId("DA");
    expect(await rejection(db.insert(workCenters).values({ code, name, note, processId: pid }))).toMatchObject({
      constraint,
    });
  });

  it("같은 코드 두 번 → 거절", async () => {
    const pid = await processId("DA");
    await db.insert(workCenters).values({ code: "DA-3", name: "하나", processId: pid });
    expect(await rejection(db.insert(workCenters).values({ code: "DA-3", name: "또", processId: pid }))).toMatchObject({
      constraint: "work_centers_code_unique",
    });
  });

  it("없는 공정 → 거절", async () => {
    expect(
      await rejection(db.insert(workCenters).values({ code: "DA-3", name: "하나", processId: 999999 })),
    ).toMatchObject({ constraint: "work_centers_process_id_processes_id_fk" });
  });
});

describe("불량 유형", () => {
  const processId = async (code: string) => {
    const [p] = await db.select().from(processes).where(eq(processes.code, code));
    return p.id;
  };
  const defect = (over: Partial<typeof defectTypes.$inferInsert> = {}) => ({
    code: "TEST-1",
    name: "시험 불량",
    cls: "APPEAR",
    ...over,
  });

  it("맞는 꼴은 저장되고 기본값이 붙는다", async () => {
    const [row] = await db.insert(defectTypes).values(defect()).returning();
    expect(row).toMatchObject({
      code: "TEST-1",
      name: "시험 불량",
      clsGroup: "DEFECT_CLS",
      cls: "APPEAR",
      note: "",
      active: true,
    });
  });

  it.each([
    ["소문자", "chip", "x", "", "defect_types_code_format"],
    ["한 글자", "D", "x", "", "defect_types_code_format"],
    ["11자", "ABCDEFGHIJK", "x", "", "defect_types_code_format"],
    ["숫자로 시작", "1A", "x", "", "defect_types_code_format"],
    ["끝 하이픈", "DA-", "x", "", "defect_types_code_format"],
    ["하이픈 둘", "D--A", "x", "", "defect_types_code_format"],
    ["빈 이름", "TEST-1", "", "", "defect_types_name_length"],
    ["51자 이름", "TEST-1", "가".repeat(51), "", "defect_types_name_length"],
    ["501자 비고", "TEST-1", "x", "가".repeat(501), "defect_types_note_length"],
  ])("%s → 거절", async (_name, code, name, note, constraint) => {
    expect(await rejection(db.insert(defectTypes).values(defect({ code, name, note })))).toMatchObject({ constraint });
  });

  it("같은 코드 두 번 → 거절", async () => {
    await db.insert(defectTypes).values(defect({ code: "CHIP2" }));
    expect(await rejection(db.insert(defectTypes).values(defect({ code: "CHIP2" })))).toMatchObject({
      constraint: "defect_types_code_unique",
    });
  });

  it("없는 대분류 → 거절", async () => {
    expect(await rejection(db.insert(defectTypes).values(defect({ cls: "NOPE" })))).toMatchObject({
      constraint: "defect_types_cls_fk",
    });
  });

  it("대분류는 DEFECT_CLS 묶음만 — 다른 묶음의 값 → 거절", async () => {
    expect(await rejection(db.insert(defectTypes).values(defect({ clsGroup: "UNIT", cls: "EA" })))).toMatchObject({
      constraint: "defect_types_cls_group_fixed",
    });
  });

  it("발생 공정은 (불량 유형, 공정) 한 번씩 — 같은 쌍 두 번 → 기본 키 거절", async () => {
    const [d] = await db.insert(defectTypes).values(defect()).returning();
    const pid = await processId("DA");
    await db.insert(defectTypeProcesses).values({ defectTypeId: d.id, processId: pid });
    expect(
      await rejection(db.insert(defectTypeProcesses).values({ defectTypeId: d.id, processId: pid })),
    ).toMatchObject({ constraint: "defect_type_processes_defect_type_id_process_id_pk" });
  });

  it("없는 공정 · 없는 불량 유형 → 거절", async () => {
    const [d] = await db.insert(defectTypes).values(defect()).returning();
    expect(
      await rejection(db.insert(defectTypeProcesses).values({ defectTypeId: d.id, processId: 999999 })),
    ).toMatchObject({ constraint: "defect_type_processes_process_id_processes_id_fk" });
    expect(
      await rejection(
        db.insert(defectTypeProcesses).values({ defectTypeId: 999999, processId: await processId("DA") }),
      ),
    ).toMatchObject({ constraint: "defect_type_processes_defect_type_id_defect_types_id_fk" });
  });
});

describe("거래처", () => {
  it("매입처 · 매출처 가운데 하나 이상이면 저장되고, 사업자등록번호는 비워도 된다", async () => {
    await expect(
      db.insert(partners).values({ code: "BP-0100", name: "(가상) 시험", isCustomer: true }),
    ).resolves.toBeDefined();
    await expect(
      db.insert(partners).values({ code: "BP-0101", name: "(가상) 시험2", isSupplier: true, bizNo: "000-00-00100" }),
    ).resolves.toBeDefined();
  });

  it.each([
    ["매입처 · 매출처 둘 다 아님", {}, "partners_role_required"],
    ["사업자등록번호 꼴이 틀림", { isSupplier: true, bizNo: "0000000100" }, "partners_biz_no_format"],
    ["코드 꼴이 틀림", { isSupplier: true, code: "BP-100" }, "partners_code_format"],
    ["101자 이름", { isSupplier: true, name: "가".repeat(101) }, "partners_name_length"],
    ["공통코드에 없는 국가", { isSupplier: true, country: "XX" }, "partners_country_fk"],
    [
      "국가 묶음이 COUNTRY 가 아님",
      { isSupplier: true, countryGroup: "UNIT", country: "EA" },
      "partners_country_group_fixed",
    ],
    ["한국인데 해외 사업자번호", { isSupplier: true, foreignBizNo: "12-3456789" }, "partners_biz_no_by_country"],
    [
      "해외인데 사업자등록번호",
      { isSupplier: true, country: "US", bizNo: "000-00-00100" },
      "partners_biz_no_by_country",
    ],
    [
      "해외 사업자번호 31자",
      { isSupplier: true, country: "US", foreignBizNo: "1".repeat(31) },
      "partners_foreign_biz_no_length",
    ],
    [
      "해외 사업자번호 빈 글자",
      { isSupplier: true, country: "US", foreignBizNo: "" },
      "partners_foreign_biz_no_length",
    ],
  ])("%s → 거절", async (_name, over, constraint) => {
    const values = { code: "BP-0100", name: "(가상) 시험", ...over };
    expect(await rejection(db.insert(partners).values(values))).toMatchObject({ constraint });
  });

  it("국가는 기본이 한국(KR)이고, 해외 거래처는 해외 사업자번호 30자까지를 글자 그대로 둔다", async () => {
    await db.insert(partners).values({ code: "BP-0100", name: "(가상) 시험", isSupplier: true });
    await db
      .insert(partners)
      .values({ code: "BP-0101", name: "(가상) 시험2", isSupplier: true, country: "US", foreignBizNo: "A".repeat(30) });
    const rows = await db.select().from(partners).where(eq(partners.code, "BP-0100"));
    expect(rows[0]).toMatchObject({ countryGroup: "COUNTRY", country: "KR", foreignBizNo: null });
  });

  it("거래처가 쓰는 국가는 지울 수 없다", async () => {
    expect(await rejection(db.delete(codes).where(eq(codes.code, "JP")))).toMatchObject({
      constraint: "partners_country_fk",
    });
  });
});

describe("공통코드", () => {
  it("Minor 코드 — 숫자로 시작해도 되고, 묶음이 다르면 같은 코드를 쓴다", async () => {
    await expect(db.insert(codes).values({ groupCode: "UNIT", code: "1L", name: "1리터" })).resolves.toBeDefined();
    await expect(
      db.insert(codes).values({ groupCode: "UNIT", code: "RM", name: "이상한 이름" }),
    ).resolves.toBeDefined();
  });

  it.each([
    ["소문자", { code: "box" }, "codes_code_format"],
    ["밑줄로 시작", { code: "_BOX" }, "codes_code_format"],
    ["21자", { code: "A".repeat(21) }, "codes_code_format"],
    ["빈 이름", { name: "" }, "codes_name_length"],
    ["정렬 순서 1000", { sortOrder: 1000 }, "codes_sort_order_range"],
    ["정렬 순서 음수", { sortOrder: -1 }, "codes_sort_order_range"],
    ["묶음 안의 겹침", { code: "EA" }, "codes_group_code_code_unique"],
    ["없는 묶음", { groupCode: "COLOR" }, "codes_group_code_code_groups_code_fk"],
  ])("%s → 거절", async (_name, over, constraint) => {
    const values = { groupCode: "UNIT", code: "BOX", name: "상자", ...over };
    expect(await rejection(db.insert(codes).values(values))).toMatchObject({ constraint });
  });
});
