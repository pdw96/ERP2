import { describe, expect, it } from "vitest";
import { cellKey, CUSTOMER_CODE, FG_CODE, parseSalesPlanQty } from "../sales-plan-input";

const OVER = "수량은 99,999,999 까지 적을 수 있습니다.";

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
    expect(parseSalesPlanQty("100000000", 0)).toEqual({ ok: false, message: OVER });
    // 상한을 넘으면 자릿수보다 상한의 까닭이 먼저다 — 열 자리 넘는 수와 같게.
    expect(parseSalesPlanQty("100000000.5", 0)).toEqual({ ok: false, message: OVER });
  });
  it("정수 단위(0자리)에서도 「0.0」 · 「0.00」은 지움 — 「0.5」는 자릿수로 거절", () => {
    expect(parseSalesPlanQty("0.0", 0)).toEqual({ ok: true, qty: null });
    expect(parseSalesPlanQty("0.00", 0)).toEqual({ ok: true, qty: null });
    expect(parseSalesPlanQty("0.5", 0)).toEqual({ ok: false, message: "이 품목의 수량은 소수로 적을 수 없습니다." });
  });
  it("정수가 열 자리 넘는 수량도 상한의 까닭 — 「숫자로 적어 주세요」가 아니다", () => {
    for (const [t, d] of [
      ["1,000,000,000", 0],
      ["1234567890", 0],
      ["12345678901234", 0],
      ["1234567890.5", 1],
      ["1234567890.5", 0],
    ] as const) {
      expect(parseSalesPlanQty(t, d)).toEqual({ ok: false, message: OVER });
    }
    expect(parseSalesPlanQty("-1234567890", 0)).toEqual({ ok: false, message: "수량은 0 보다 커야 합니다." });
    // 앞의 0 은 자리로 세지 않는다.
    expect(parseSalesPlanQty("0000000012", 0)).toEqual({ ok: true, qty: BigInt(12000) });
    expect(parseSalesPlanQty("1,2,3,4,5,6,7,8,9,0", 0)).toEqual({ ok: false, message: OVER });
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
