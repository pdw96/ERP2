import type { Milli } from "./move-input";

// MPS 계산 — 주별 수요 · 안(생산 공급) · 예상재고. 화면과 서버가 함께 쓰며 DB 를 보지 않는다.

export type MpsCalcInput = {
  /** 이번 주부터 이어진 월요일들(계산 범위), 차례대로 */
  weeks: string[];
  /** 처음 재고 = 지금 가용재고 */
  available: Milli;
  /** 품목의 안전재고 · 최소 생산량 · 생산 배수(0 = 없음) */
  safety: Milli;
  minLot: Milli;
  multiple: Milli;
  /** 품목 단위의 소수 자릿수 0 ~ 3 */
  decimals: number;
  /** 주 → 확정 판매계획 합(없으면 0) */
  demand: ReadonlyMap<string, Milli>;
  /** 주 → 고정 수량(0 포함) */
  fixed: ReadonlyMap<string, Milli>;
};

export type MpsCalcWeek = {
  week: string;
  demand: Milli;
  mps: Milli;
  fixed: boolean;
  projected: Milli;
};

const ZERO = BigInt(0);

/** 양수 전용 올림 나눗셈의 배수 올림. */
function ceilTo(q: bigint, unit: bigint): bigint {
  return ((q + unit - BigInt(1)) / unit) * unit;
}

function gcd(a: bigint, b: bigint): bigint {
  while (b > ZERO) [a, b] = [b, a % b];
  return a;
}

/**
 * 모자란 수량 → 안: 최소량까지 올린 뒤, 생산 배수(>0)와 단위 소수 자릿수의 단위(10^(3-decimals) 밀리)를
 * 둘 다 맞추는 최소 공배수 L 의 배수로 한 번에 올린다 — 두 번 나눠 올리면 자릿수 올림이 배수를 깨뜨린다
 * (EA 에 배수 1.5 면 2 가 아니라 3). need <= 0 이면 0.
 */
export function lotSize(need: Milli, minLot: Milli, multiple: Milli, decimals: number): Milli {
  if (need <= ZERO) return ZERO;
  const q = need > minLot ? need : minLot;
  const step = BigInt(10) ** BigInt(3 - decimals);
  const lot = multiple > ZERO ? (multiple / gcd(multiple, step)) * step : step;
  return ceilTo(q, lot);
}

/** 주마다 차례로 예상재고를 잇는다. 음수 예상재고도 그대로 다음 주로 넘긴다. */
export function planMps(input: MpsCalcInput): MpsCalcWeek[] {
  const { safety, minLot, multiple, decimals, demand, fixed } = input;
  let prev = input.available;
  return input.weeks.map((week) => {
    const d = demand.get(week) ?? ZERO;
    const fixedQty = fixed.get(week);
    const isFixed = fixedQty !== undefined;
    const mps = isFixed ? fixedQty : lotSize(safety - (prev - d), minLot, multiple, decimals);
    const projected = prev + mps - d;
    prev = projected;
    return { week, demand: d, mps, fixed: isFixed, projected };
  });
}
