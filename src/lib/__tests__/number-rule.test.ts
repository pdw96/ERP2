import { describe, expect, it } from "vitest";
import { resolveStock, type StockLists } from "@/lib/item-stock";
import { formatLotNumber, periodOf } from "@/lib/number-rule-fields";
import { parseNewNumberRule, parseNumberRuleUpdate } from "@/lib/number-rule-input";
import { koreaToday } from "@/lib/today";

// LOT 번호 규칙(조각 「재고 수불」 설계 ③ 「번호 규칙」 · ⑤ 「PR B」, ADR 0016) — 번호의 꼴과 입력의 꼴.
// 일련을 다시 세는 것 · 겹친 번호를 건너뛰는 것은 DB 시험(src/db/__tests__/number-rules.test.ts)이 본다.

const rule = (over: Partial<{ prefix: string; separator: string; dateFormat: string; seqDigits: number }> = {}) => ({
  prefix: "FG",
  separator: "-",
  dateFormat: "YYMMDD",
  seqDigits: 3,
  ...over,
});

describe("번호의 꼴 — 머리 → 날짜 → 일련, 있는 조각 사이에 구분자", () => {
  it.each([
    ["-", "FG-261105-001"],
    ["_", "FG_261105_001"],
    [".", "FG.261105.001"],
    ["", "FG261105001"],
  ])("구분자 「%s」 → %s", (separator, lot) => {
    expect(formatLotNumber(rule({ separator }), "2026-11-05", 1)).toBe(lot);
  });

  it.each([
    ["머리가 없으면 머리와 그 뒤 구분자가 빠진다", { prefix: "" }, "261105-001"],
    ["머리 · 구분자가 없으면 숫자만(성공 기준 10)", { prefix: "", separator: "" }, "261105001"],
    ["날짜 꼴이 없으면 날짜와 그 앞 구분자가 빠진다", { dateFormat: "" }, "FG-001"],
    ["머리 · 날짜 꼴이 다 없으면 일련만", { prefix: "", dateFormat: "" }, "001"],
    ["YYYYMMDD", { dateFormat: "YYYYMMDD" }, "FG-20261105-001"],
    ["YYMM", { dateFormat: "YYMM", seqDigits: 4 }, "FG-2611-0001"],
    ["자릿수 6", { seqDigits: 6 }, "FG-261105-000001"],
  ])("%s", (_, over, lot) => {
    expect(formatLotNumber(rule(over), "2026-11-05", 1)).toBe(lot);
  });

  it("일련이 자릿수를 넘으면 자리가 는다", () => {
    expect(formatLotNumber(rule(), "2026-11-05", 999)).toBe("FG-261105-999");
    expect(formatLotNumber(rule(), "2026-11-05", 1000)).toBe("FG-261105-1000");
  });

  it("기간 — 날짜 꼴로 쓴 날짜(일련을 다시 세는 단위). 날짜 꼴이 없으면 빈 글자", () => {
    expect(periodOf("YYMMDD", "2026-01-09")).toBe("260109");
    expect(periodOf("YYYYMMDD", "2026-01-09")).toBe("20260109");
    expect(periodOf("YYMM", "2026-01-09")).toBe("2601");
    expect(periodOf("", "2026-01-09")).toBe("");
  });
});

describe("번호 규칙의 입력 — 등록", () => {
  const good = {
    code: "LOT_FG2",
    name: "완제품 LOT 2",
    prefix: "FG2",
    separator: "-",
    dateFormat: "YYMMDD",
    seqDigits: "3",
    defaultFor: "NONE",
  };

  it("맞는 꼴 — 「없음」(NONE)은 빈 글자 · null 로 읽는다", () => {
    expect(parseNewNumberRule({ ...good, separator: "NONE", dateFormat: "NONE" })).toEqual({
      ok: true,
      value: {
        code: "LOT_FG2",
        name: "완제품 LOT 2",
        prefix: "FG2",
        separator: "",
        dateFormat: "",
        seqDigits: 3,
        defaultFor: null,
      },
    });
  });

  it("머리는 비워도 되고, 기본으로 쓰는 유형은 반제품 · 완제품", () => {
    expect(parseNewNumberRule({ ...good, prefix: undefined, defaultFor: "SF" })).toMatchObject({
      ok: true,
      value: { prefix: "", defaultFor: "SF" },
    });
    expect(parseNewNumberRule({ ...good, defaultFor: "FG" })).toMatchObject({ ok: true, value: { defaultFor: "FG" } });
  });

  it.each([
    ["코드 소문자", { code: "lot_fg" }, "code"],
    ["코드가 숫자로 시작", { code: "1LOT" }, "code"],
    ["코드 한 글자", { code: "L" }, "code"],
    ["코드 21자", { code: "L".repeat(21) }, "code"],
    ["코드 없음", { code: "" }, "code"],
    ["이름 51자", { name: "가".repeat(51) }, "name"],
    ["이름 없음", { name: " " }, "name"],
    ["머리 7자", { prefix: "ABCDEFG" }, "prefix"],
    ["머리 소문자", { prefix: "fg" }, "prefix"],
    ["머리에 붙임표", { prefix: "F-G" }, "prefix"],
    ["구분자 목록 밖", { separator: "/" }, "separator"],
    ["날짜 꼴 목록 밖", { dateFormat: "DDMMYY" }, "dateFormat"],
    ["자릿수 1", { seqDigits: "1" }, "seqDigits"],
    ["자릿수 7", { seqDigits: "7" }, "seqDigits"],
    ["자릿수 글자", { seqDigits: "셋" }, "seqDigits"],
    ["기본 유형이 원자재", { defaultFor: "RM" }, "defaultFor"],
  ])("%s → 그 칸을 거절", (_, over, field) => {
    const r = parseNewNumberRule({ ...good, ...over });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors)).toEqual([field]);
  });
});

describe("번호 규칙의 입력 — 수정", () => {
  it("코드는 받지 않고 사용 여부를 받는다", () => {
    const r = parseNumberRuleUpdate({
      code: "BAD code",
      name: "x",
      separator: "-",
      dateFormat: "YYMM",
      seqDigits: "4",
      active: "N",
    });
    expect(r).toEqual({
      ok: true,
      value: {
        name: "x",
        prefix: "",
        separator: "-",
        dateFormat: "YYMM",
        seqDigits: 4,
        defaultFor: null,
        active: false,
      },
    });
  });

  it("사용 여부가 없으면 거절", () => {
    expect(parseNumberRuleUpdate({ name: "x", separator: "-", dateFormat: "YYMM", seqDigits: "4" })).toMatchObject({
      ok: false,
      errors: { active: expect.any(String) },
    });
  });
});

describe("품목의 재고 칸을 목록에 대어 본다(설계 ③ 「품목의 새 칸」)", () => {
  const lists: StockLists = {
    rules: [
      { code: "LOT_FG", name: "완제품 LOT", active: true },
      { code: "LOT_OLD", name: "옛 규칙", active: false },
    ],
    warehouses: [
      { id: 1, code: "WH-01", name: "자재창고", active: true, isDefect: false },
      { id: 4, code: "WH-04", name: "불량창고", active: true, isDefect: true },
      { id: 5, code: "WH-05", name: "옛 창고", active: false, isDefect: false },
    ],
  };
  const input = (over: Partial<Parameters<typeof resolveStock>[0]> = {}) => ({
    itemType: "FG",
    lotRuleCode: null,
    defaultInWarehouse: null,
    defaultOutWarehouse: null,
    ...over,
  });

  it("맞으면 창고 코드를 번호로 — 비운 칸은 null", () => {
    expect(resolveStock(input({ lotRuleCode: "LOT_FG", defaultInWarehouse: "WH-01" }), lists)).toEqual({
      ok: true,
      value: { lotRuleCode: "LOT_FG", defaultInWarehouseId: 1, defaultOutWarehouseId: null },
    });
  });

  it.each(["RM", "SM", "CS"])("사 오는 품목(%s)에 규칙을 넣으면 거절 — 거래처 LOT 를 넣는다", (itemType) => {
    expect(resolveStock(input({ itemType, lotRuleCode: "LOT_FG" }), lists)).toEqual({
      ok: false,
      errors: { lotRuleCode: expect.stringContaining("반제품 · 완제품만") },
    });
  });

  it("없는 규칙 · 「사용 안 함」 규칙 → 거절. 그 품목의 지금 규칙이면 「사용 안 함」이어도 남는다", () => {
    expect(resolveStock(input({ lotRuleCode: "LOT_NO" }), lists)).toMatchObject({ ok: false });
    expect(resolveStock(input({ lotRuleCode: "LOT_OLD" }), lists)).toMatchObject({
      ok: false,
      errors: { lotRuleCode: expect.stringContaining("사용 안 함") },
    });
    const current = { lotRuleCode: "LOT_OLD", defaultInWarehouseId: null, defaultOutWarehouseId: null };
    expect(resolveStock(input({ lotRuleCode: "LOT_OLD" }), lists, current)).toMatchObject({ ok: true });
  });

  it("불량창고는 기본 창고로 고르지 못한다(ADR 0015) — 입고 · 출고 둘 다", () => {
    expect(resolveStock(input({ defaultInWarehouse: "WH-04", defaultOutWarehouse: "WH-04" }), lists)).toEqual({
      ok: false,
      errors: {
        defaultInWarehouse: "불량창고는 기본 창고로 고르지 못합니다",
        defaultOutWarehouse: "불량창고는 기본 창고로 고르지 못합니다",
      },
    });
  });

  it("없는 창고 · 「사용 안 함」 창고 → 거절. 그 품목의 지금 창고면 남는다", () => {
    expect(resolveStock(input({ defaultInWarehouse: "WH-09" }), lists)).toMatchObject({ ok: false });
    expect(resolveStock(input({ defaultOutWarehouse: "WH-05" }), lists)).toMatchObject({
      ok: false,
      errors: { defaultOutWarehouse: expect.stringContaining("사용 안 함") },
    });
    const current = { lotRuleCode: null, defaultInWarehouseId: null, defaultOutWarehouseId: 5 };
    expect(resolveStock(input({ defaultOutWarehouse: "WH-05" }), lists, current)).toEqual({
      ok: true,
      value: { lotRuleCode: null, defaultInWarehouseId: null, defaultOutWarehouseId: 5 },
    });
  });

  it("유형을 모르면 규칙은 보지 않고, 이미 까닭이 있는 칸도 보지 않는다", () => {
    expect(resolveStock(input({ itemType: undefined, lotRuleCode: "LOT_FG" }), lists)).toMatchObject({ ok: true });
    expect(
      resolveStock(input({ defaultInWarehouse: "WH-04" }), lists, undefined, new Set(["defaultInWarehouse"])),
    ).toMatchObject({ ok: true });
  });
});

describe("한국 시각의 오늘", () => {
  it("서버 시계(UTC)가 아니라 한국 날짜 — UTC 15시는 한국의 다음 날", () => {
    expect(koreaToday(new Date("2026-11-05T14:59:59Z"))).toBe("2026-11-05");
    expect(koreaToday(new Date("2026-11-05T15:00:00Z"))).toBe("2026-11-06");
  });
});
