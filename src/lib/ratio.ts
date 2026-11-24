import { formatMilli, ZERO, type Milli } from "./move-input";

// 끝수를 버리지 않은 수(분수) — BOM 조회(필요량)와 MRP(총소요)가 함께 쓴다. 올림은 맨 끝에 한 번만 한다.

/** 끝수를 버리지 않은 수 — 분자 / 분모(둘 다 양). */
export type Ratio = { n: bigint; d: bigint };

const gcd = (a: bigint, b: bigint): bigint => {
  while (b !== ZERO) [a, b] = [b, a % b];
  return a < ZERO ? -a : a;
};

/** 약분한 분수 n / d. */
export const reduced = (n: bigint, d: bigint): Ratio => {
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
};
const TEN_THOUSAND = BigInt(10000);

/** 윗 단계의 필요량 × 소요량 ÷ 기준수량 × (1 + 로스율 ÷ 100) — 소요량 · 기준수량은 천분의 일 단위, 로스율은 백분의 일 퍼센트 단위. */
export function requiredOf(upper: Ratio, qty: Milli, baseQty: Milli, lossHundredths: number): Ratio {
  return reduced(upper.n * qty * (TEN_THOUSAND + BigInt(lossHundredths)), upper.d * baseQty * TEN_THOUSAND);
}

/** 두 분수의 합(약분). */
export function addRatio(a: Ratio, b: Ratio): Ratio {
  return reduced(a.n * b.d + b.n * a.d, a.d * b.d);
}

/** 끝수를 버리지 않은 수를 소수 decimals 자리로 올린 천분의 일 단위 수 — 0.0042 → 5(decimals 3), 2.1 → 3000(decimals 0). */
export function ceilRatioToMilli(r: Ratio, decimals: number): Milli {
  const scale = BigInt(10) ** BigInt(decimals);
  const up = (r.n * scale + r.d - BigInt(1)) / r.d;
  return up * BigInt(10) ** BigInt(3 - decimals);
}

/** 끝수를 버리지 않은 수를 소수 decimals 자리로 올려 보이는 글자로 — 0.0042 → 「0.005」(decimals 3), 2.1 → 「3」(decimals 0). */
export function ceilToDecimals(r: Ratio, decimals: number): string {
  return formatMilli(ceilRatioToMilli(r, decimals));
}
