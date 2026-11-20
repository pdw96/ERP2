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

/** 모자란 수량 → 안: 최소량까지 올리고, 배수(>0)의 배수로 올리고, 소수 decimals 자리에서 올림. need <= 0 이면 0. */
export function lotSize(need: Milli, minLot: Milli, multiple: Milli, decimals: number): Milli {
  if (need <= ZERO) return ZERO;
  let q = need > minLot ? need : minLot;
  if (multiple > ZERO) q = ceilTo(q, multiple);
  return ceilTo(q, BigInt(10) ** BigInt(3 - decimals));
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
