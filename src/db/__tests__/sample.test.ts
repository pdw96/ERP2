// @vitest-environment node
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetToSample } from "@/db/reset";
import {
  SAMPLE_CODE_GROUPS,
  SAMPLE_CODES,
  SAMPLE_ITEMS,
  SAMPLE_PARTNERS,
  SAMPLE_SALES_PLANS,
  SAMPLE_UNIT_SPECS,
  SAMPLE_WAREHOUSES,
} from "@/db/sample";
import { codeGroups, codes, salesPlanChanges, salesPlans } from "@/db/schema";
import type { Db } from "@/db/types";
import { ITEM_TYPE_DEFAULTS, SYSTEM_CODE_GROUPS, type ItemType } from "@/lib/master-codes";
import { addWeeks, mondayOf } from "@/lib/weeks";
import { migratedDb } from "./pglite";

describe("샘플 데이터 — 성공 기준 1", () => {
  it("품목은 원자재 5 · 반제품 2 · 완제품 2 이상", () => {
    const count = (t: string) => SAMPLE_ITEMS.filter((i) => i.itemType === t).length;
    expect(count("RM")).toBeGreaterThanOrEqual(5);
    expect(count("SF")).toBeGreaterThanOrEqual(2);
    expect(count("FG")).toBeGreaterThanOrEqual(2);
  });

  it("창고는 넷 — 자재 · 생산현장 · 제품 · 불량", () => {
    expect(SAMPLE_WAREHOUSES.map((w) => [w.code, w.name])).toEqual([
      ["WH-01", "자재창고"],
      ["WH-02", "생산현장"],
      ["WH-03", "제품창고"],
      ["WH-04", "불량창고"],
    ]);
  });

  it("거래처는 넷 이상이고 매입처 · 매출처가 다 있다", () => {
    expect(SAMPLE_PARTNERS.length).toBeGreaterThanOrEqual(4);
    expect(SAMPLE_PARTNERS.some((p) => p.isSupplier)).toBe(true);
    expect(SAMPLE_PARTNERS.some((p) => p.isCustomer)).toBe(true);
  });

  it("거래처는 가상이다 — 이름이 「(가상)」으로 시작하고, 사업자등록번호는 발급되지 않는 「000-00-」 꼴", () => {
    for (const p of SAMPLE_PARTNERS) {
      expect(p.name).toMatch(/^\(가상\) /);
      expect(p.bizNo ?? "000-00-").toMatch(/^000-00-/);
    }
  });

  it("해외 거래처 — 일본 매입처 하나 · 미국 매출처 하나, 번호는 실제로 쓰이지 않는 꼴(성공 기준 12)", () => {
    const abroad = SAMPLE_PARTNERS.filter((p) => (p.country ?? "KR") !== "KR");
    expect(abroad.map((p) => [p.country, !!p.isSupplier, !!p.isCustomer])).toEqual([
      ["JP", true, false],
      ["US", false, true],
    ]);
    for (const p of abroad) {
      expect(p.bizNo ?? null).toBeNull();
      expect(p.foreignBizNo).toMatch(/^0+-?0*[0-9]$/);
    }
  });

  it("품목의 조달구분 · 검사 대상 · LOT 관리는 유형의 기본값이다(ADR 0003 · 0019)", () => {
    for (const i of SAMPLE_ITEMS) {
      const d = ITEM_TYPE_DEFAULTS[i.itemType as ItemType];
      expect(i.procurement, i.code).toBe(d.procurement);
      expect(i.inspectIn ?? false, i.code).toBe(d.inspectIn);
      expect(i.inspectOut ?? false, i.code).toBe(d.inspectOut);
      // LOT 관리는 DB 의 기본값(켬) — 끄는 품목만 적는다.
      expect(i.lotManaged ?? true, i.code).toBe(d.lotManaged);
    }
  });

  it("공통코드 묶음은 ITEM_TYPE · PROC_TYPE · MOVE_TYPE(시스템) · UNIT · COUNTRY · ITEM_CLS1 ~ 3 · ADJ_REASON · DEFECT_CLS(사용자) 열, 단위는 EA · M · KG · G 와 MM · L · ML · MG", () => {
    expect(SAMPLE_CODE_GROUPS.map((g) => [g.code, g.isSystem])).toEqual([
      ["ITEM_TYPE", true],
      ["PROC_TYPE", true],
      ["UNIT", false],
      ["COUNTRY", false],
      ["ITEM_CLS1", false],
      ["ITEM_CLS2", false],
      ["ITEM_CLS3", false],
      ["MOVE_TYPE", true],
      ["ADJ_REASON", false],
      ["DEFECT_CLS", false],
    ]);
    expect(SAMPLE_CODES.filter((c) => c.groupCode === "UNIT").map((c) => c.code)).toEqual([
      "EA",
      "M",
      "KG",
      "G",
      "MM",
      "L",
      "ML",
      "MG",
    ]);
  });
});

describe("단위 사양의 샘플 — 조각 「재고 수불」 성공 기준 12(ADR 0017, 저자 인터뷰 2026-11-05)", () => {
  it("샘플의 단위마다 사양이 하나씩 있다", () => {
    const units = SAMPLE_CODES.filter((c) => c.groupCode === "UNIT").map((c) => c.code);
    expect(SAMPLE_UNIT_SPECS.map((s) => s.unit)).toEqual(units);
  });

  it("ADR 0017 의 표 그대로 — 무게는 G, 길이는 M, 부피는 ML 이 기준이고, 개수 단위는 정수만", () => {
    const table = Object.fromEntries(SAMPLE_UNIT_SPECS.map((s) => [s.unit, [s.baseUnit, s.factor, s.decimals]]));
    expect(table).toEqual({
      EA: ["EA", 1, 0],
      M: ["M", 1, 3],
      KG: ["G", 1000, 3],
      G: ["G", 1, 0],
      MM: ["M", 0.001, 0],
      L: ["ML", 1000, 3],
      ML: ["ML", 1, 0],
      MG: ["G", 0.001, 0],
    });
  });

  it("기준 단위는 자신이 기준인 단위다", () => {
    const self = new Set(SAMPLE_UNIT_SPECS.filter((s) => s.unit === s.baseUnit).map((s) => s.unit));
    for (const s of SAMPLE_UNIT_SPECS) expect(self.has(s.baseUnit)).toBe(true);
  });
});

describe("설명용 칸의 샘플 — 성공 기준 13(저자 인터뷰 2026-11-04)", () => {
  const valuesOf = (group: string) => SAMPLE_CODES.filter((c) => c.groupCode === group).map((c) => [c.code, c.name]);

  it("분류 — 대분류는 종류, 중분류는 패키지, 소분류는 용도", () => {
    expect(valuesOf("ITEM_CLS1")).toEqual([
      ["WAFER", "웨이퍼"],
      ["FRAME", "리드프레임"],
      ["WIRE", "와이어"],
      ["CHEM", "화학재료"],
      ["WIP", "공정품"],
      ["IC", "IC"],
      ["PACK", "포장재"],
      ["TOOL", "공구"],
    ]);
    expect(valuesOf("ITEM_CLS2")).toEqual([
      ["SOP", "SOP"],
      ["QFN", "QFN"],
      ["COMMON", "공용"],
    ]);
    expect(valuesOf("ITEM_CLS3")).toEqual([
      ["POWER", "전원"],
      ["SENSOR", "센서"],
      ["GENERAL", "범용"],
    ]);
  });

  it("품목은 모두 대 · 중분류가 있고, 용도(소분류)는 반제품 · 완제품에만 있다", () => {
    for (const i of SAMPLE_ITEMS) {
      expect(i.cls1, i.code).toBeTruthy();
      expect(i.cls2, i.code).toBeTruthy();
      expect(!!i.cls3, i.code).toBe(i.itemType === "SF" || i.itemType === "FG");
    }
  });

  it("연락처는 쓰이지 않는 것이다 — 전화는 0000 번호, 이메일은 예시 전용 주소, 주소는 없는 지명", () => {
    for (const p of SAMPLE_PARTNERS) {
      for (const phone of [p.phone, p.contactPhone].filter(Boolean)) expect(phone, p.code).toMatch(/-0+-0*[0-9]+$/);
      expect(p.email, p.code).toMatch(/@([a-z]+\.)?example\.com$/);
      expect(p.address, p.code).toMatch(/가상시|Kaso City/);
    }
  });

  it("해외 거래처는 업태 · 종목(한국 세법의 칸)이 비어 있고, 담당자를 비운 거래처가 하나 이상 있다", () => {
    for (const p of SAMPLE_PARTNERS.filter((x) => (x.country ?? "KR") !== "KR")) {
      expect(p.bizType ?? "", p.code).toBe("");
      expect(p.bizItem ?? "", p.code).toBe("");
    }
    expect(SAMPLE_PARTNERS.some((p) => !p.contactName)).toBe(true);
  });
});

describe("시스템 코드는 프로그램이 아는 값과 같다(ADR 0009)", () => {
  let handle: Awaited<ReturnType<typeof migratedDb>>;
  let db: Db;
  beforeAll(async () => {
    handle = await migratedDb();
    db = handle.db;
    await resetToSample(db);
  });
  afterAll(() => handle.close());

  it.each(Object.entries(SYSTEM_CODE_GROUPS))("%s", async (group, known) => {
    const [g] = await db.select().from(codeGroups).where(eq(codeGroups.code, group));
    expect(g.isSystem).toBe(true);
    const rows = await db.select().from(codes).where(eq(codes.groupCode, group)).orderBy(asc(codes.sortOrder));
    expect(rows.map((r) => ({ code: r.code, name: r.name }))).toEqual(
      known.map((k) => ({ code: k.code, name: k.name })),
    );
  });

  it("시스템 코드 묶음은 프로그램이 아는 것뿐이다", async () => {
    const system = (await db.select().from(codeGroups).where(eq(codeGroups.isSystem, true))).map((g) => g.code);
    expect(system.sort()).toEqual(Object.keys(SYSTEM_CODE_GROUPS).sort());
  });
});

describe("샘플 판매계획 — 메뉴 「판매계획」", () => {
  const TODAY = "2026-11-19"; // 목요일 — 이번 주 월요일은 2026-11-16
  let handle: Awaited<ReturnType<typeof migratedDb>>;
  let db: Db;
  beforeAll(async () => {
    handle = await migratedDb();
    db = handle.db;
    await resetToSample(db, TODAY);
  });
  afterAll(() => handle.close());

  it("다섯 줄 — 고객 × 품목은 BP-0004 · 0005 · 0007 × FG-0001, BP-0004 · 0007 × FG-0002", () => {
    expect(SAMPLE_SALES_PLANS.map((p) => `${p.customer} × ${p.item}`)).toEqual([
      "BP-0004 × FG-0001",
      "BP-0005 × FG-0001",
      "BP-0007 × FG-0001",
      "BP-0004 × FG-0002",
      "BP-0007 × FG-0002",
    ]);
  });

  it("주는 −2 … 11 안이고, 수량은 FG-0001 은 1,000 배수 · FG-0002 는 500 배수이며, 한두 줄은 일부 주를 비운다", () => {
    for (const p of SAMPLE_SALES_PLANS) {
      const unit = p.item === "FG-0001" ? 1000 : 500;
      const offsets = p.weeks.map((w) => w.offset);
      expect(new Set(offsets).size).toBe(offsets.length);
      for (const w of p.weeks) {
        expect(w.offset).toBeGreaterThanOrEqual(-2);
        expect(w.offset).toBeLessThanOrEqual(11);
        expect(Number(w.qty) % unit, `${p.customer} × ${p.item} ${w.offset}`).toBe(0);
        expect(Number(w.qty)).toBeGreaterThan(0);
      }
    }
    const gappy = SAMPLE_SALES_PLANS.filter((p) => p.weeks.length < 14);
    expect(gappy.length).toBeGreaterThanOrEqual(1);
    expect(gappy.length).toBeLessThanOrEqual(2);
  });

  it("되돌림이 넣은 칸 수 = 샘플의 주 수 합이고, 지난 주(2026-11-02)의 칸이 있으며, 이력은 비어 있다", async () => {
    const rows = await db.select().from(salesPlans);
    expect(rows).toHaveLength(SAMPLE_SALES_PLANS.reduce((n, p) => n + p.weeks.length, 0));
    expect(rows.some((r) => r.weekStart === "2026-11-02")).toBe(true);
    expect(rows.every((r) => r.weekStart >= "2026-11-02")).toBe(true);
    expect(await db.select().from(salesPlanChanges)).toHaveLength(0);
  });

  it("칸의 주 · 수량이 샘플과 같다 — 주는 오늘이 든 주의 월요일에서 센다", async () => {
    const r = await handle.client.query<{ customer: string; item: string; week: string; qty: string }>(
      `select p.code as customer, i.code as item, to_char(s.week_start, 'YYYY-MM-DD') as week, s.qty::text as qty
         from sales_plans s join partners p on p.id = s.partner_id join items i on i.id = s.item_id
         order by p.code, i.code, s.week_start`,
    );
    const want = SAMPLE_SALES_PLANS.flatMap((p) =>
      p.weeks.map((w) => ({
        customer: p.customer,
        item: p.item,
        week: addWeeks(mondayOf(TODAY), w.offset),
        qty: Number(w.qty).toFixed(3),
      })),
    ).sort((a, b) => (a.customer + a.item + a.week).localeCompare(b.customer + b.item + b.week));
    expect(r.rows).toEqual(want);
  });

  it("고객은 「사용」 매출처이고 품목은 「사용」 완제품이다", async () => {
    for (const p of SAMPLE_SALES_PLANS) {
      const c = SAMPLE_PARTNERS.find((x) => x.code === p.customer);
      expect(c, p.customer).toBeDefined();
      expect(c!.isCustomer).toBe(true);
      expect(c!.active ?? true).toBe(true);
      const i = SAMPLE_ITEMS.find((x) => x.code === p.item);
      expect(i, p.item).toBeDefined();
      expect(i!.itemType).toBe("FG");
      expect(i!.active ?? true).toBe(true);
    }
  });
});
