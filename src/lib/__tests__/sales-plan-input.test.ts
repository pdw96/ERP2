import { describe, expect, it } from "vitest";
import { cellKey, CUSTOMER_CODE, FG_CODE, parseSalesPlanQty } from "../sales-plan-input";

describe("parseSalesPlanQty", () => {
  it("쉼표를 받는다", () => {
    expect(parseSalesPlanQty("1,000", 0)).toEqual({ ok: true, qty: BigInt(1000000) });
  });
  it("단위 자릿수를 넘으면 거절", () => {
    expect(parseSalesPlanQty("1.5", 0).ok).toBe(false);
    expect(parseSalesPlanQty("1.5", 1)).toEqual({ ok: true, qty: BigInt(1500) });
  });
  it("빈 칸 · 0 은 지움(null)", () => {
    for (const [t, d] of [
      ["", 0],
      ["0", 0],
      [" 0.000 ", 3],
    ] as const) {
      expect(parseSalesPlanQty(t, d)).toEqual({ ok: true, qty: null });
    }
  });
  it("음수 · 글자 거절", () => {
    expect(parseSalesPlanQty("-5", 0).ok).toBe(false);
    expect(parseSalesPlanQty("abc", 0).ok).toBe(false);
  });
  it("상한", () => {
    expect(parseSalesPlanQty("99999999", 0).ok).toBe(true);
    expect(parseSalesPlanQty("100000000", 0).ok).toBe(false);
  });
});

describe("코드 · 키", () => {
  it("cellKey", () => expect(cellKey("BP-0004", "FG-0001", "2026-11-16")).toBe("BP-0004|FG-0001|2026-11-16"));
  it("코드 꼴", () => {
    expect(CUSTOMER_CODE.test("BP-0004")).toBe(true);
    expect(CUSTOMER_CODE.test("FG-0004")).toBe(false);
    expect(FG_CODE.test("FG-0001")).toBe(true);
    expect(FG_CODE.test("RM-0001")).toBe(false);
  });
});
