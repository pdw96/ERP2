import { describe, expect, it } from "vitest";
import { typedQty } from "../plan-qty";

// 판매계획 표가 넣은 글자를 읽는 법 — 고친 칸을 가른다. 서버(parseSalesPlanQty)가 받는 것만 수량이고, 거절할 글자는 undefined.

describe("typedQty", () => {
  it("빈 칸 · 0 은 null(지움), 받는 수는 천분의 일 단위", () => {
    expect(typedQty("", 0)).toBeNull();
    expect(typedQty("0.0", 0)).toBeNull();
    expect(typedQty("1,500", 0)).toBe(BigInt(1500000));
    expect(typedQty("1.5", 1)).toBe(BigInt(1500));
  });
  it("서버가 거절할 글자는 undefined(늘 고친 칸) — 음수 · 글자 · 상한 넘음 · 자릿수 넘음", () => {
    for (const [t, d] of [
      ["-5", 0],
      ["많이", 0],
      ["100,000,000", 0],
      ["1,000,000,000", 0],
      ["1.5", 0],
    ] as const) {
      expect(typedQty(t, d)).toBeUndefined();
    }
  });
});
