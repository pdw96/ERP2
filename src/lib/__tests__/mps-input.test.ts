import { describe, expect, it } from "vitest";
import { MPS_SAVE_MAX_CELLS, mpsCellKey, parseMpsQty } from "../mps-input";

// MPS 칸의 수량 읽기 — 빈 칸은 「고정 풀기」(null), 0 은 고정 수량 0, 그 밖은 판매계획과 같은 규칙.

describe("parseMpsQty", () => {
  it("빈 칸은 고정 풀기(null)", () => {
    expect(parseMpsQty("", 0)).toEqual({ ok: true, qty: null });
    expect(parseMpsQty("  ", 3)).toEqual({ ok: true, qty: null });
  });
  it("0 꼴은 고정 수량 0 — 단위 자릿수와 상관없이", () => {
    for (const t of ["0", "0.00", "0,000", " 0 "]) expect(parseMpsQty(t, 0)).toEqual({ ok: true, qty: BigInt(0) });
  });
  it("쉼표를 받는다", () => {
    expect(parseMpsQty("1,500", 0)).toEqual({ ok: true, qty: BigInt(1500000) });
  });
  it("단위 자릿수를 넘으면 거절", () => {
    expect(parseMpsQty("1.5", 0)).toEqual({ ok: false, message: "이 품목의 수량은 소수로 적을 수 없습니다." });
    expect(parseMpsQty("1.5", 1)).toEqual({ ok: true, qty: BigInt(1500) });
  });
  it("음수 · 글자 거절", () => {
    expect(parseMpsQty("-1", 0).ok).toBe(false);
    expect(parseMpsQty("abc", 0).ok).toBe(false);
  });
  it("음수는 0 이상으로 적으라고 안내 — MPS 는 0 이 유효한 고정 수량", () => {
    const want = { ok: false, message: "수량은 0 이상으로 적어 주세요." };
    expect(parseMpsQty("-5", 0)).toEqual(want);
    expect(parseMpsQty("-0.5", 1)).toEqual(want);
    expect(parseMpsQty("-1000000000", 0)).toEqual(want);
  });
  it("상한", () => {
    expect(parseMpsQty("99999999", 0).ok).toBe(true);
    expect(parseMpsQty("100000000", 0)).toEqual({ ok: false, message: "수량은 99,999,999 까지 적을 수 있습니다." });
  });
});

describe("칸 열쇠 · 한 번의 칸 상한", () => {
  it("품목 · 주로 칸을 가리킨다", () => {
    expect(mpsCellKey("FG-0001", "2026-11-16")).toBe("FG-0001|2026-11-16");
    expect(MPS_SAVE_MAX_CELLS).toBe(2000);
  });
});
