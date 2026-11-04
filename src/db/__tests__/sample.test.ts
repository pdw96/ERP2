// @vitest-environment node
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetToSample } from "@/db/reset";
import { SAMPLE_CODE_GROUPS, SAMPLE_CODES, SAMPLE_ITEMS, SAMPLE_PARTNERS, SAMPLE_WAREHOUSES } from "@/db/sample";
import { codeGroups, codes } from "@/db/schema";
import type { Db } from "@/db/types";
import { SYSTEM_CODE_GROUPS } from "@/lib/master-codes";
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

  it("품목의 조달구분 · 검사 대상은 유형의 기본값이다(ADR 0003)", () => {
    for (const i of SAMPLE_ITEMS) {
      expect(i.procurement, i.code).toBe(i.itemType === "RM" ? "BUY" : "MAKE");
      expect(i.inspectIn ?? false, i.code).toBe(i.itemType === "RM");
      expect(i.inspectOut ?? false, i.code).toBe(i.itemType === "FG");
    }
  });

  it("공통코드 묶음은 ITEM_TYPE · PROC_TYPE(시스템) · UNIT · COUNTRY · ITEM_CLS1 ~ 3(사용자) 일곱, 단위는 EA · M · KG · G 로 시작한다", () => {
    expect(SAMPLE_CODE_GROUPS.map((g) => [g.code, g.isSystem])).toEqual([
      ["ITEM_TYPE", true],
      ["PROC_TYPE", true],
      ["UNIT", false],
      ["COUNTRY", false],
      ["ITEM_CLS1", false],
      ["ITEM_CLS2", false],
      ["ITEM_CLS3", false],
    ]);
    expect(SAMPLE_CODES.filter((c) => c.groupCode === "UNIT").map((c) => c.code)).toEqual(["EA", "M", "KG", "G"]);
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
      expect(!!i.cls3, i.code).toBe(i.itemType !== "RM");
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
