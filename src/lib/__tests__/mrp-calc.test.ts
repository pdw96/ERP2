// @vitest-environment node
import { describe, expect, it } from "vitest";
import { addDays, daysBetween, dueDateOf, netItem, scheduleOf } from "@/lib/mrp-calc";

// MRP 계산 — 날짜(리드타임 · 완성일 · 늦음)와 품목 하나의 주별 넷팅. DB 를 보지 않는 순수 함수.

const m = (n: number) => BigInt(Math.round(n * 1000));

describe("날짜", () => {
  it("addDays 는 달과 해를 넘겨 센다", () => {
    expect(addDays("2026-11-30", -3)).toBe("2026-11-27");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("daysBetween 은 to − from(일)", () => {
    expect(daysBetween("2026-11-21", "2026-11-24")).toBe(3);
    expect(daysBetween("2026-11-24", "2026-11-21")).toBe(-3);
  });

  it("dueDateOf 는 그 주 월요일 + (요일 − 1)일", () => {
    expect(dueDateOf("2026-12-21", 1)).toBe("2026-12-21");
    expect(dueDateOf("2026-12-21", 5)).toBe("2026-12-25");
    expect(dueDateOf("2026-12-21", 7)).toBe("2026-12-27");
  });
});

describe("scheduleOf", () => {
  it("제때 시작하면 늦음이 없다", () => {
    expect(scheduleOf("2026-12-21", 3, "2026-11-24")).toEqual({
      dueDate: "2026-12-21",
      plannedStart: "2026-12-18",
      startDate: "2026-12-18",
      lateDays: 0,
    });
  });

  it("완성일이 지났으면 오늘로 당긴다(결정 9-1)", () => {
    expect(scheduleOf("2026-11-23", 3, "2026-11-24")).toEqual({
      dueDate: "2026-11-24",
      plannedStart: "2026-11-21",
      startDate: "2026-11-24",
      lateDays: 3,
    });
  });

  it("시작이 오늘보다 앞서면 오늘 시작하고 늦은 날수를 센다(결정 9)", () => {
    expect(scheduleOf("2026-12-07", 21, "2026-11-23")).toEqual({
      dueDate: "2026-12-07",
      plannedStart: "2026-11-16",
      startDate: "2026-11-23",
      lateDays: 7,
    });
  });
});

describe("netItem", () => {
  const weeks = ["2026-11-23", "2026-11-30", "2026-12-07"];
  const base = { weeks, available: m(600), safety: m(200), minLot: m(1000), multiple: m(500), decimals: 0 };

  it("인터뷰 예시 — 안전재고 밑이면 최소량 · 배수로 올려 받는다(결정 1)", () => {
    const gross = new Map([
      ["2026-11-23", { qty: m(500), earliestNeed: "2026-11-24" }],
      ["2026-11-30", { qty: m(800), earliestNeed: "2026-12-01" }],
      ["2026-12-07", { qty: m(900), earliestNeed: "2026-12-08" }],
    ]);
    const out = netItem({ ...base, gross });
    expect(out.map((w) => w.receipt)).toEqual([m(1000), m(0), m(1000)]);
    expect(out.map((w) => w.projected)).toEqual([m(1100), m(300), m(400)]);
    expect(out.map((w) => w.gross)).toEqual([m(500), m(800), m(900)]);
    expect(out[0].earliestNeed).toBe("2026-11-24");
  });

  it("총소요가 없어도 가용이 안전재고 밑이면 첫 주에 받는다(소모품, 결정 5)", () => {
    const out = netItem({
      ...base,
      available: m(30),
      safety: m(50),
      minLot: m(100),
      multiple: m(0),
      gross: new Map(),
    });
    expect(out.map((w) => w.receipt)).toEqual([m(100), m(0), m(0)]);
    expect(out.map((w) => w.earliestNeed)).toEqual([null, null, null]);
    expect(out[0].gross).toBe(m(0));
  });

  it("안전재고 0 · 총소요 없음이면 모두 0", () => {
    const out = netItem({ ...base, available: m(0), safety: m(0), gross: new Map() });
    expect(out.map((w) => w.receipt)).toEqual([m(0), m(0), m(0)]);
    expect(out.map((w) => w.projected)).toEqual([m(0), m(0), m(0)]);
  });
});
