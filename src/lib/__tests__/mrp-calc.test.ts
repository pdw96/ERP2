// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  dueDateOf,
  netItem,
  planMrp,
  scheduleOf,
  type MrpBomLine,
  type MrpInput,
  type MrpItem,
  type MrpOrder,
} from "@/lib/mrp-calc";
import { addWeeks } from "@/lib/weeks";

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

describe("planMrp", () => {
  const TODAY = "2026-11-24";
  const WEEKS = Array.from({ length: 52 }, (_, i) => addWeeks("2026-11-23", i));

  const item = (id: number, code: string, over: Partial<MrpItem> = {}): MrpItem => ({
    id,
    code,
    itemType: code.slice(0, 2),
    procurement: "MAKE",
    leadTimeDays: 0,
    safety: m(0),
    minLot: m(0),
    multiple: m(0),
    decimals: 0,
    active: true,
    ...over,
  });
  const line = (parentId: number, childId: number, over: Partial<MrpBomLine> = {}): MrpBomLine => ({
    parentId,
    childId,
    qty: m(1),
    baseQty: m(1),
    lossHundredths: 0,
    validFrom: "2000-01-01",
    validTo: null,
    ...over,
  });
  const plan = (over: Partial<MrpInput>) =>
    planMrp({
      today: TODAY,
      dueWeekday: 1,
      weeks: WEEKS,
      items: [],
      bomLines: [],
      available: new Map(),
      mps: [],
      ...over,
    });
  const ordersOf = (orders: MrpOrder[], itemId: number) => orders.filter((o) => o.itemId === itemId);
  const only = (orders: MrpOrder[], itemId: number) => {
    const mine = ordersOf(orders, itemId);
    expect(mine).toHaveLength(1);
    return mine[0];
  };

  // FG(생산, 3일) → SF(생산, 1일) → RM(구매, 21일), 모두 1:1
  const chainItems = [
    item(1, "FG-0001", { leadTimeDays: 3 }),
    item(2, "SF-0001", { leadTimeDays: 1 }),
    item(3, "RM-0001", { procurement: "BUY", leadTimeDays: 21 }),
  ];
  const chainLines = [line(1, 2), line(2, 3)];

  it("리드타임을 날짜로 앞당기며 아래로 잇는다(결정 2)", () => {
    const { orders, items } = plan({
      items: chainItems,
      bomLines: chainLines,
      mps: [{ itemId: 1, week: "2026-12-21", qty: m(1000) }],
    });
    expect(only(orders, 1)).toEqual({
      itemId: 1,
      kind: "MAKE",
      qty: m(1000),
      noBom: false,
      dueDate: "2026-12-21",
      plannedStart: "2026-12-18",
      startDate: "2026-12-18",
      lateDays: 0,
    });
    expect(only(orders, 2)).toMatchObject({
      kind: "MAKE",
      qty: m(1000),
      dueDate: "2026-12-18",
      startDate: "2026-12-17",
    });
    expect(only(orders, 3)).toMatchObject({
      kind: "BUY",
      qty: m(1000),
      noBom: false,
      dueDate: "2026-12-17",
      startDate: "2026-11-26",
      lateDays: 0,
    });
    expect(orders.map((o) => o.itemId)).toEqual([3, 2, 1]);

    expect(items.map((i) => i.itemId)).toEqual([1, 3, 2]);
    expect(items[0]).toEqual({ itemId: 1, fromMps: true, available: m(0), safety: m(0), gross: new Map() });
    expect(items[2].fromMps).toBe(false);
    expect(items[2].gross).toEqual(new Map([["2026-12-14", m(1000)]]));
    expect(items[1].gross).toEqual(new Map([["2026-12-14", m(1000)]]));
  });

  it("완성일 기준 요일이 금요일이면 그 주 금요일이 완성일이다(결정 3)", () => {
    const { orders } = plan({
      dueWeekday: 5,
      items: chainItems,
      bomLines: chainLines,
      mps: [{ itemId: 1, week: "2026-12-21", qty: m(1000) }],
    });
    expect(only(orders, 1)).toMatchObject({ dueDate: "2026-12-25", startDate: "2026-12-22" });
    expect(only(orders, 2)).toMatchObject({ dueDate: "2026-12-22", startDate: "2026-12-21" });
    expect(only(orders, 3)).toMatchObject({ dueDate: "2026-12-21", startDate: "2026-11-30" });
  });

  it("이번 주 MPS 는 완성일이 오늘이고 아래 단계도 함께 늦는다(결정 9 · 9-1)", () => {
    const { orders } = plan({
      items: chainItems,
      bomLines: chainLines,
      mps: [{ itemId: 1, week: "2026-11-23", qty: m(7000) }],
    });
    expect(only(orders, 1)).toMatchObject({ dueDate: "2026-11-24", startDate: "2026-11-24", lateDays: 3 });
    expect(only(orders, 2)).toMatchObject({ dueDate: "2026-11-24", startDate: "2026-11-24", lateDays: 1 });
    expect(only(orders, 3)).toMatchObject({ dueDate: "2026-11-24", startDate: "2026-11-24", lateDays: 21 });
  });

  it("끝수는 단위 자릿수에서 올린다 — 로스율까지(결정 7)", () => {
    const { orders, items } = plan({
      items: [item(1, "FG-0001"), item(3, "RM-0001", { procurement: "BUY", decimals: 3 })],
      bomLines: [line(1, 3, { baseQty: m(1000), qty: m(0.5), lossHundredths: 200 })],
      mps: [{ itemId: 1, week: "2026-12-07", qty: m(7000) }],
    });
    expect(only(orders, 3).qty).toBe(m(3.57));
    expect(items.find((i) => i.itemId === 3)?.gross).toEqual(new Map([["2026-12-07", m(3.57)]]));
  });

  it("같은 주 총소요는 분수로 모아 한 번 올린다", () => {
    const { orders, items } = plan({
      items: [item(1, "FG-0001"), item(4, "FG-0002"), item(3, "RM-0001", { procurement: "BUY", decimals: 3 })],
      bomLines: [line(1, 3, { baseQty: m(1000), qty: m(0.001) }), line(4, 3, { baseQty: m(1000), qty: m(0.001) })],
      mps: [
        { itemId: 1, week: "2026-12-07", qty: m(500) },
        { itemId: 4, week: "2026-12-07", qty: m(500) },
      ],
    });
    expect(items.find((i) => i.itemId === 3)?.gross).toEqual(new Map([["2026-12-07", m(0.001)]]));
    expect(only(orders, 3).qty).toBe(m(0.001));
  });

  it("두 단계에 드는 자재는 총소요가 다 모인 뒤 한 번 넷팅한다(저단계)", () => {
    const { orders } = plan({
      items: [item(1, "FG-0001"), item(2, "SF-0001"), item(3, "RM-0001", { procurement: "BUY" })],
      bomLines: [line(1, 3), line(1, 2), line(2, 3)],
      mps: [{ itemId: 1, week: "2026-12-07", qty: m(100) }],
    });
    expect(only(orders, 2).qty).toBe(m(100));
    expect(only(orders, 3)).toMatchObject({ qty: m(200), dueDate: "2026-12-07" });
  });

  it("BOM 은 윗 계획오더의 시작일에 적용되는 줄로 펼친다(결정 6)", () => {
    const { orders, items } = plan({
      items: [
        item(1, "FG-0001", { leadTimeDays: 2 }),
        item(5, "RM-000A", { procurement: "BUY" }),
        item(6, "RM-000B", { procurement: "BUY" }),
      ],
      bomLines: [line(1, 5, { validTo: "2026-11-30" }), line(1, 6, { validFrom: "2026-12-01" })],
      mps: [{ itemId: 1, week: "2026-11-30", qty: m(10) }],
    });
    expect(only(orders, 1).startDate).toBe("2026-11-28");
    expect(only(orders, 5)).toMatchObject({ qty: m(10), dueDate: "2026-11-28" });
    expect(ordersOf(orders, 6)).toEqual([]);
    expect(items.map((i) => i.itemId)).toEqual([1, 5]);
  });

  it("조달구분이 구매인 반제품은 펼치지 않는다", () => {
    const { orders, items } = plan({
      items: [
        item(1, "FG-0001"),
        item(2, "SF-0001", { procurement: "BUY" }),
        item(3, "RM-0001", { procurement: "BUY" }),
      ],
      bomLines: [line(1, 2), line(2, 3)],
      mps: [{ itemId: 1, week: "2026-12-07", qty: m(100) }],
    });
    expect(only(orders, 2)).toMatchObject({ kind: "BUY", qty: m(100), noBom: false });
    expect(ordersOf(orders, 3)).toEqual([]);
    expect(items.map((i) => i.itemId)).toEqual([1, 2]);
  });

  it("시작일에 적용되는 BOM 줄이 없는 생산 품목은 「BOM 없음」으로 내고 펼치지 않는다", () => {
    const { orders, items } = plan({
      items: [item(1, "FG-0001"), item(2, "SF-0001"), item(3, "RM-0001", { procurement: "BUY" })],
      bomLines: [line(1, 2), line(2, 3, { validFrom: "2027-06-01" })],
      mps: [{ itemId: 1, week: "2026-12-07", qty: m(100) }],
    });
    expect(only(orders, 1).noBom).toBe(false);
    expect(only(orders, 2)).toMatchObject({ kind: "MAKE", qty: m(100), noBom: true });
    expect(ordersOf(orders, 3)).toEqual([]);
    expect(items.map((i) => i.itemId)).toEqual([1, 2]);
  });

  it("「사용 안 함」 품목은 안전재고 0 으로 보고 소요만 채운다(결정 8)", () => {
    const { orders, items } = plan({
      items: [item(1, "FG-0001"), item(3, "RM-0001", { procurement: "BUY", active: false, safety: m(100) })],
      bomLines: [line(1, 3)],
      mps: [{ itemId: 1, week: "2026-12-07", qty: m(50) }],
    });
    expect(only(orders, 3).qty).toBe(m(50));
    expect(items.find((i) => i.itemId === 3)).toMatchObject({ safety: m(0), available: m(0) });
  });

  it("소모품은 총소요 없이 안전재고 미달이면 산다(결정 5)", () => {
    const { orders, items } = plan({
      items: [item(7, "CS-0001", { procurement: "BUY", leadTimeDays: 14, safety: m(50), minLot: m(100) })],
      available: new Map([[7, m(30)]]),
    });
    expect(orders).toEqual([
      {
        itemId: 7,
        kind: "BUY",
        qty: m(100),
        noBom: false,
        dueDate: "2026-11-24",
        plannedStart: "2026-11-10",
        startDate: "2026-11-24",
        lateDays: 14,
      },
    ]);
    expect(items).toEqual([{ itemId: 7, fromMps: false, available: m(30), safety: m(50), gross: new Map() }]);
  });

  it("총소요도 미달도 없는 품목은 결과에 없다", () => {
    const { orders, items } = plan({
      items: [item(7, "CS-0001", { procurement: "BUY", safety: m(50) })],
      available: new Map([[7, m(50)]]),
    });
    expect(orders).toEqual([]);
    expect(items).toEqual([]);
  });

  it("넷팅에 가용재고를 쓴다 — 인터뷰 예시(결정 1)", () => {
    const { orders } = plan({
      items: [
        item(1, "FG-0001"),
        item(3, "RM-0001", { procurement: "BUY", safety: m(200), minLot: m(1000), multiple: m(500) }),
      ],
      bomLines: [line(1, 3)],
      available: new Map([[3, m(600)]]),
      mps: [
        { itemId: 1, week: "2026-11-23", qty: m(500) },
        { itemId: 1, week: "2026-11-30", qty: m(800) },
        { itemId: 1, week: "2026-12-07", qty: m(900) },
      ],
    });
    expect(ordersOf(orders, 3).map((o) => [o.qty, o.dueDate])).toEqual([
      [m(1000), "2026-11-24"],
      [m(1000), "2026-12-07"],
    ]);
  });
});
