// @vitest-environment node
import { describe, expect, it } from "vitest";
import { addRatio, ceilRatioToMilli, ceilToDecimals, requiredOf } from "@/lib/ratio";

// 끝수를 버리지 않은 수(분수) — BOM 조회와 MRP 가 함께 쓴다.

const r = (n: number, d: number) => ({ n: BigInt(n), d: BigInt(d) });

describe("분수", () => {
  it("requiredOf 는 윗 필요량 × 소요량 ÷ 기준수량 × (1 + 로스율)을 약분해 낸다", () => {
    // 7 × 0.5 ÷ 1 × 1.02 = 3.57
    expect(requiredOf(r(7, 1), BigInt(500), BigInt(1000), 200)).toEqual(r(357, 100));
  });

  it("addRatio 는 두 분수를 약분해 더한다", () => {
    expect(addRatio(r(1, 2000), r(1, 2000))).toEqual(r(1, 1000));
    expect(addRatio(r(1, 3), r(1, 6))).toEqual(r(1, 2));
  });

  it("ceilRatioToMilli 는 소수 decimals 자리로 올린 천분의 일 단위 수", () => {
    expect(ceilRatioToMilli(r(42, 10000), 3)).toBe(BigInt(5));
    expect(ceilRatioToMilli(r(21, 10), 0)).toBe(BigInt(3000));
    expect(ceilRatioToMilli(r(357, 100), 3)).toBe(BigInt(3570));
    expect(ceilRatioToMilli(r(3, 1), 0)).toBe(BigInt(3000));
    expect(ceilRatioToMilli(r(0, 1), 2)).toBe(BigInt(0));
  });

  it("ceilToDecimals 는 올린 수를 글자로", () => {
    expect(ceilToDecimals(r(42, 10000), 3)).toBe("0.005");
    expect(ceilToDecimals(r(21, 10), 0)).toBe("3");
  });
});
