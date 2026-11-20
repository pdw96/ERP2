import { describe, expect, it } from "vitest";
import { lotSize, planMps, type MpsCalcInput } from "@/lib/mps-calc";

// MPS 계산 — 주별 수요 · 안 · 예상재고. DB 를 보지 않는 순수 함수.

const m = (n: number) => BigInt(n) * BigInt(1000);

describe("lotSize", () => {
  it("최소 생산량까지 올린다", () => {
    expect(lotSize(m(250), m(1000), m(1000), 0)).toBe(m(1000));
  });
  it("배수의 배수로 올린다", () => {
    expect(lotSize(m(1500), m(1000), m(1000), 0)).toBe(m(2000));
  });
  it("모자람이 0 이하면 0", () => {
    expect(lotSize(m(0), m(1000), m(1000), 0)).toBe(BigInt(0));
    expect(lotSize(-m(5), m(1000), m(1000), 0)).toBe(BigInt(0));
  });
  it("최소량 · 배수가 없으면 모자란 만큼", () => {
    expect(lotSize(m(1200), BigInt(0), BigInt(0), 0)).toBe(m(1200));
  });
  it("소수 자릿수에서 올림한다", () => {
    expect(lotSize(BigInt(1500), BigInt(0), BigInt(0), 0)).toBe(m(2));
    expect(lotSize(BigInt(1234), BigInt(0), BigInt(0), 2)).toBe(BigInt(1240));
  });
  it("최소량 위에서 배수로 올린다", () => {
    expect(lotSize(m(700), m(500), m(300), 0)).toBe(m(900));
  });
});

const weeks = ["2026-11-23", "2026-11-30", "2026-12-07", "2026-12-14"];
const base = (over: Partial<MpsCalcInput> = {}): MpsCalcInput => ({
  weeks,
  available: m(300),
  safety: m(100),
  minLot: m(500),
  multiple: m(100),
  decimals: 0,
  demand: new Map([
    [weeks[0], m(200)],
    [weeks[1], m(400)],
    [weeks[3], m(300)],
  ]),
  fixed: new Map(),
  ...over,
});

describe("planMps", () => {
  it("설계 문서의 예", () => {
    const r = planMps(base());
    expect(r.map((w) => w.mps)).toEqual([BigInt(0), m(500), BigInt(0), m(500)]);
    expect(r.map((w) => w.projected)).toEqual([m(100), m(200), m(200), m(400)]);
    expect(r.every((w) => !w.fixed)).toBe(true);
    expect(r.map((w) => w.week)).toEqual(weeks);
    expect(r[1].demand).toBe(m(400));
  });
  it("고정이 안보다 작아 음수면 다음 주가 밀린 생산을 안으로 낸다", () => {
    const r = planMps(base({ fixed: new Map([[weeks[1], m(200)]]) }));
    expect(r[1].mps).toBe(m(200));
    expect(r[1].fixed).toBe(true);
    expect(r[1].projected).toBe(-m(100));
    expect(r[2].mps).toBe(m(500));
    expect(r[2].projected).toBe(m(400));
  });
  it("고정 0 은 그 주에 생산하지 않는다", () => {
    const r = planMps(base({ fixed: new Map([[weeks[1], BigInt(0)]]) }));
    expect(r[1].mps).toBe(BigInt(0));
    expect(r[1].fixed).toBe(true);
    expect(r[1].projected).toBe(-m(300));
  });
  it("수요 없이 가용이 안전재고보다 적으면 첫 주에 채운다", () => {
    const r = planMps(
      base({
        available: m(50),
        minLot: BigInt(0),
        multiple: BigInt(0),
        demand: new Map(),
      }),
    );
    expect(r.map((w) => w.mps)).toEqual([m(50), BigInt(0), BigInt(0), BigInt(0)]);
  });
  it("고정이 많아 쌓이면 뒤 안은 0", () => {
    const r = planMps(base({ fixed: new Map([[weeks[0], m(1000)]]) }));
    expect(r[0].projected).toBe(m(1100));
    expect(r.slice(1).map((w) => w.mps)).toEqual([BigInt(0), BigInt(0), BigInt(0)]);
  });
});
