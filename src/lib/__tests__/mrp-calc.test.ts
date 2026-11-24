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
  type MrpPeg,
} from "@/lib/mrp-calc";
import { addWeeks, mondayOf } from "@/lib/weeks";

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
      mps: [{ itemId: 1, week: "2026-12-21", qty: m(1000), fixed: false }],
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
      mpsWeek: "2026-12-21",
      mpsFixed: false,
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
      mps: [{ itemId: 1, week: "2026-12-21", qty: m(1000), fixed: false }],
    });
    expect(only(orders, 1)).toMatchObject({ dueDate: "2026-12-25", startDate: "2026-12-22" });
    expect(only(orders, 2)).toMatchObject({ dueDate: "2026-12-22", startDate: "2026-12-21" });
    expect(only(orders, 3)).toMatchObject({ dueDate: "2026-12-21", startDate: "2026-11-30" });
  });

  it("이번 주 MPS 는 완성일이 오늘이고 아래 단계도 함께 늦는다(결정 9 · 9-1)", () => {
    const { orders } = plan({
      items: chainItems,
      bomLines: chainLines,
      mps: [{ itemId: 1, week: "2026-11-23", qty: m(7000), fixed: false }],
    });
    expect(only(orders, 1)).toMatchObject({ dueDate: "2026-11-24", startDate: "2026-11-24", lateDays: 3 });
    expect(only(orders, 2)).toMatchObject({ dueDate: "2026-11-24", startDate: "2026-11-24", lateDays: 1 });
    expect(only(orders, 3)).toMatchObject({ dueDate: "2026-11-24", startDate: "2026-11-24", lateDays: 21 });
  });

  it("끝수는 단위 자릿수에서 올린다 — 로스율까지(결정 7)", () => {
    const { orders, items } = plan({
      items: [item(1, "FG-0001"), item(3, "RM-0001", { procurement: "BUY", decimals: 3 })],
      bomLines: [line(1, 3, { baseQty: m(1000), qty: m(0.5), lossHundredths: 200 })],
      mps: [{ itemId: 1, week: "2026-12-07", qty: m(7000), fixed: false }],
    });
    expect(only(orders, 3).qty).toBe(m(3.57));
    expect(items.find((i) => i.itemId === 3)?.gross).toEqual(new Map([["2026-12-07", m(3.57)]]));
  });

  it("같은 주 총소요는 분수로 모아 한 번 올린다", () => {
    const { orders, items } = plan({
      items: [item(1, "FG-0001"), item(4, "FG-0002"), item(3, "RM-0001", { procurement: "BUY", decimals: 3 })],
      bomLines: [line(1, 3, { baseQty: m(1000), qty: m(0.001) }), line(4, 3, { baseQty: m(1000), qty: m(0.001) })],
      mps: [
        { itemId: 1, week: "2026-12-07", qty: m(500), fixed: false },
        { itemId: 4, week: "2026-12-07", qty: m(500), fixed: false },
      ],
    });
    expect(items.find((i) => i.itemId === 3)?.gross).toEqual(new Map([["2026-12-07", m(0.001)]]));
    expect(only(orders, 3).qty).toBe(m(0.001));
  });

  it("두 단계에 드는 자재는 총소요가 다 모인 뒤 한 번 넷팅한다(저단계)", () => {
    const { orders } = plan({
      items: [item(1, "FG-0001"), item(2, "SF-0001"), item(3, "RM-0001", { procurement: "BUY" })],
      bomLines: [line(1, 3), line(1, 2), line(2, 3)],
      mps: [{ itemId: 1, week: "2026-12-07", qty: m(100), fixed: false }],
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
      mps: [{ itemId: 1, week: "2026-11-30", qty: m(10), fixed: false }],
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
      mps: [{ itemId: 1, week: "2026-12-07", qty: m(100), fixed: false }],
    });
    expect(only(orders, 2)).toMatchObject({ kind: "BUY", qty: m(100), noBom: false });
    expect(ordersOf(orders, 3)).toEqual([]);
    expect(items.map((i) => i.itemId)).toEqual([1, 2]);
  });

  it("시작일에 적용되는 BOM 줄이 없는 생산 품목은 「BOM 없음」으로 내고 펼치지 않는다", () => {
    const { orders, items } = plan({
      items: [item(1, "FG-0001"), item(2, "SF-0001"), item(3, "RM-0001", { procurement: "BUY" })],
      bomLines: [line(1, 2), line(2, 3, { validFrom: "2027-06-01" })],
      mps: [{ itemId: 1, week: "2026-12-07", qty: m(100), fixed: false }],
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
      mps: [{ itemId: 1, week: "2026-12-07", qty: m(50), fixed: false }],
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
        mpsWeek: null,
        mpsFixed: null,
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

  it("MPS 줄이 없는 완제품은 넷팅하지 않는다 — 안전재고 미달이어도 계획오더 · 자재 소요가 없다", () => {
    const { orders, items } = plan({
      items: [item(1, "FG-0001", { safety: m(100) }), item(3, "RM-0001", { procurement: "BUY" })],
      bomLines: [line(1, 3)],
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
        { itemId: 1, week: "2026-11-23", qty: m(500), fixed: false },
        { itemId: 1, week: "2026-11-30", qty: m(800), fixed: false },
        { itemId: 1, week: "2026-12-07", qty: m(900), fixed: false },
      ],
    });
    expect(ordersOf(orders, 3).map((o) => [o.qty, o.dueDate])).toEqual([
      [m(1000), "2026-11-24"],
      [m(1000), "2026-12-07"],
    ]);
  });

  it("BOM 에 순환이 있으면 던진다", () => {
    expect(() =>
      plan({
        items: [item(1, "FG-0001"), item(2, "SF-0001")],
        bomLines: [line(1, 2), line(2, 1)],
        mps: [{ itemId: 1, week: "2026-12-21", qty: m(1), fixed: false }],
      }),
    ).toThrow("순환");
  });

  it("MPS 에 없는 품목이 있으면 던진다", () => {
    expect(() =>
      plan({ items: [item(1, "FG-0001")], mps: [{ itemId: 99, week: "2026-12-21", qty: m(1), fixed: false }] }),
    ).toThrow("MRP 에 없는 품목입니다");
  });

  describe("페깅", () => {
    /** 그 품목의 nth 번째 계획오더가 정렬된 orders 에서 몇째 자리인가. */
    const at = (orders: MrpOrder[], itemId: number, nth = 0) =>
      orders.flatMap((o, i) => (o.itemId === itemId ? [i] : []))[nth];
    const pegsOf = (pegs: MrpPeg[], itemId: number) => pegs.filter((p) => p.itemId === itemId);

    it("공유 자재 — 필요일이 빠른 소요부터 재고, 모자란 만큼 계획오더(설계 예시)", () => {
      // A(시작 12-08) · B(시작 12-10)가 같은 주에 R 을 40 · 60 쓴다. R 가용 75 · 안전 20 → 그 주 순소요 45 → 최소량 50.
      const { orders, pegs } = plan({
        items: [
          item(1, "FG-000A", { leadTimeDays: 6 }),
          item(2, "FG-000B", { leadTimeDays: 4 }),
          item(3, "RM-0001", { procurement: "BUY", leadTimeDays: 7, safety: m(20), minLot: m(50) }),
        ],
        bomLines: [line(1, 3), line(2, 3)],
        available: new Map([[3, m(75)]]),
        mps: [
          { itemId: 1, week: "2026-12-14", qty: m(40), fixed: false },
          { itemId: 2, week: "2026-12-14", qty: m(60), fixed: false },
        ],
      });
      expect(only(orders, 1).startDate).toBe("2026-12-08");
      expect(only(orders, 2).startDate).toBe("2026-12-10");
      expect(only(orders, 3).qty).toBe(m(50));
      const [a, b, r] = [at(orders, 1), at(orders, 2), at(orders, 3)];
      expect(pegs).toEqual([
        { kind: "ORDER", itemId: 3, demandOrder: a, supplyOrder: null, needDate: "2026-12-08", qty: m(40) },
        { kind: "ORDER", itemId: 3, demandOrder: b, supplyOrder: null, needDate: "2026-12-10", qty: m(15) },
        { kind: "ORDER", itemId: 3, demandOrder: b, supplyOrder: r, needDate: "2026-12-10", qty: m(45) },
        { kind: "SURPLUS", itemId: 3, supplyOrder: r, qty: m(5) },
      ]);
    });

    it("남는 수량이 다음 주 소요로 넘어간다", () => {
      const { orders, pegs } = plan({
        items: [item(1, "FG-0001"), item(3, "RM-0001", { procurement: "BUY", minLot: m(100) })],
        bomLines: [line(1, 3)],
        mps: [
          { itemId: 1, week: "2026-12-07", qty: m(30), fixed: false },
          { itemId: 1, week: "2026-12-14", qty: m(50), fixed: false },
        ],
      });
      expect(only(orders, 3)).toMatchObject({ qty: m(100), dueDate: "2026-12-07" });
      const r = at(orders, 3);
      expect(pegsOf(pegs, 3)).toEqual([
        { kind: "ORDER", itemId: 3, demandOrder: at(orders, 1, 0), supplyOrder: r, needDate: "2026-12-07", qty: m(30) },
        { kind: "ORDER", itemId: 3, demandOrder: at(orders, 1, 1), supplyOrder: r, needDate: "2026-12-14", qty: m(50) },
        { kind: "SURPLUS", itemId: 3, supplyOrder: r, qty: m(20) },
      ]);
    });

    it("한 소요가 두 계획오더에 나뉜다", () => {
      // 최소량 30 인 R 이 첫 주에 30 · 둘째 주에 30 의 계획오더 둘을 낳는다. 둘째 주 소요가 50 이면 첫 계획오더의 남는 몫이 없어도 다음 계획오더에서 가져온다.
      const { orders, pegs } = plan({
        items: [item(1, "FG-0001"), item(3, "RM-0001", { procurement: "BUY", minLot: m(30) })],
        bomLines: [line(1, 3)],
        mps: [
          { itemId: 1, week: "2026-12-07", qty: m(10), fixed: false },
          { itemId: 1, week: "2026-12-14", qty: m(50), fixed: false },
        ],
      });
      const rs = ordersOf(orders, 3);
      expect(rs.map((o) => o.qty)).toEqual([m(30), m(30)]);
      const [r0, r1] = [at(orders, 3, 0), at(orders, 3, 1)];
      const second = pegsOf(pegs, 3).filter((p) => p.kind === "ORDER" && p.demandOrder === at(orders, 1, 1));
      expect(second).toEqual([
        {
          kind: "ORDER",
          itemId: 3,
          demandOrder: at(orders, 1, 1),
          supplyOrder: r0,
          needDate: "2026-12-14",
          qty: m(20),
        },
        {
          kind: "ORDER",
          itemId: 3,
          demandOrder: at(orders, 1, 1),
          supplyOrder: r1,
          needDate: "2026-12-14",
          qty: m(30),
        },
      ]);
    });

    it("안전재고만 채우는 계획오더는 SAFETY", () => {
      const { orders, pegs } = plan({
        items: [item(7, "CS-0001", { procurement: "BUY", safety: m(100) })],
      });
      expect(orders.map((o) => o.qty)).toEqual([m(100)]);
      expect(pegs).toEqual([{ kind: "SAFETY", itemId: 7, supplyOrder: 0, qty: m(100) }]);
    });

    it("가용재고가 음수면 SHORT 를 먼저 메운다", () => {
      const { orders, pegs } = plan({
        items: [item(1, "FG-0001"), item(3, "RM-0001", { procurement: "BUY" })],
        bomLines: [line(1, 3)],
        available: new Map([[3, m(-10)]]),
        mps: [{ itemId: 1, week: "2026-12-07", qty: m(20), fixed: false }],
      });
      expect(ordersOf(orders, 3).map((o) => [o.qty, o.dueDate])).toEqual([
        [m(10), "2026-11-24"],
        [m(20), "2026-12-07"],
      ]);
      expect(pegs).toEqual([
        { kind: "SHORT", itemId: 3, supplyOrder: at(orders, 3, 0), qty: m(10) },
        {
          kind: "ORDER",
          itemId: 3,
          demandOrder: at(orders, 1),
          supplyOrder: at(orders, 3, 1),
          needDate: "2026-12-07",
          qty: m(20),
        },
      ]);
    });

    it("끝수 몫 — 주 안에서 누적 올림, 합은 총소요와 같고 0 몫도 줄로 남는다", () => {
      const { orders, items, pegs } = plan({
        items: [item(1, "FG-000A"), item(2, "FG-000B"), item(3, "RM-0001", { procurement: "BUY" })],
        bomLines: [line(1, 3, { qty: m(0.1) }), line(2, 3, { qty: m(0.1) })],
        mps: [
          { itemId: 1, week: "2026-12-07", qty: m(3), fixed: false },
          { itemId: 2, week: "2026-12-07", qty: m(4), fixed: false },
        ],
      });
      expect(items.find((i) => i.itemId === 3)?.gross).toEqual(new Map([["2026-12-07", m(1)]]));
      expect(only(orders, 3).qty).toBe(m(1));
      expect(pegs).toEqual([
        {
          kind: "ORDER",
          itemId: 3,
          demandOrder: at(orders, 1),
          supplyOrder: at(orders, 3),
          needDate: "2026-12-07",
          qty: m(1),
        },
        { kind: "ORDER", itemId: 3, demandOrder: at(orders, 2), supplyOrder: null, needDate: "2026-12-07", qty: m(0) },
      ]);
    });

    it("여러 단계 — 반제품 계획오더가 원자재 소요의 윗 계획오더가 된다", () => {
      const { orders, pegs } = plan({
        items: chainItems,
        bomLines: chainLines,
        mps: [{ itemId: 1, week: "2026-12-21", qty: m(1000), fixed: false }],
      });
      const [fg, sf, rm] = [at(orders, 1), at(orders, 2), at(orders, 3)];
      expect(pegsOf(pegs, 2)).toEqual([
        { kind: "ORDER", itemId: 2, demandOrder: fg, supplyOrder: sf, needDate: "2026-12-18", qty: m(1000) },
      ]);
      expect(pegsOf(pegs, 3)).toEqual([
        { kind: "ORDER", itemId: 3, demandOrder: sf, supplyOrder: rm, needDate: "2026-12-17", qty: m(1000) },
      ]);
    });

    it("완제품 계획오더는 MPS 주 · 고정을 남기고 페깅 줄이 없다", () => {
      const { orders, pegs } = plan({
        items: chainItems,
        bomLines: chainLines,
        mps: [
          { itemId: 1, week: "2026-12-14", qty: m(10), fixed: true },
          { itemId: 1, week: "2026-12-21", qty: m(20), fixed: false },
        ],
      });
      expect(ordersOf(orders, 1).map((o) => [o.qty, o.mpsWeek, o.mpsFixed])).toEqual([
        [m(10), "2026-12-14", true],
        [m(20), "2026-12-21", false],
      ]);
      for (const o of orders.filter((o) => o.itemId !== 1)) expect([o.mpsWeek, o.mpsFixed]).toEqual([null, null]);
      expect(pegsOf(pegs, 1)).toEqual([]);
    });

    it("「사용 안 함」 품목은 안전재고 0 으로 맞춘다", () => {
      const { orders, pegs } = plan({
        items: [item(1, "FG-0001"), item(3, "RM-0001", { procurement: "BUY", active: false, safety: m(100) })],
        bomLines: [line(1, 3)],
        mps: [{ itemId: 1, week: "2026-12-07", qty: m(50), fixed: false }],
      });
      expect(pegs).toEqual([
        {
          kind: "ORDER",
          itemId: 3,
          demandOrder: at(orders, 1),
          supplyOrder: at(orders, 3),
          needDate: "2026-12-07",
          qty: m(50),
        },
      ]);
    });

    it("합 검사 — 모든 계획오더마다 공급한 줄 합 = 수량, 품목 × 주마다 ORDER 줄 합 = 총소요", () => {
      const { orders, items, pegs } = plan({
        items: [
          item(1, "FG-0001", { leadTimeDays: 3 }),
          item(4, "FG-000A", { leadTimeDays: 6 }),
          item(5, "FG-000B", { leadTimeDays: 4 }),
          item(2, "SF-0001", { leadTimeDays: 1, safety: m(30), minLot: m(40), multiple: m(25) }),
          item(3, "RM-0001", { procurement: "BUY", leadTimeDays: 7, safety: m(20), minLot: m(50) }),
          item(6, "RM-0002", { procurement: "BUY", leadTimeDays: 2, decimals: 1, multiple: m(5) }),
          item(7, "CS-0001", { procurement: "BUY", safety: m(100), minLot: m(300) }),
        ],
        bomLines: [
          line(4, 3),
          line(5, 3),
          line(1, 2),
          line(2, 3, { qty: m(2) }),
          line(2, 6, { qty: m(0.33), lossHundredths: 300 }),
          line(1, 6, { qty: m(0.7), baseQty: m(3) }),
        ],
        available: new Map([
          [3, m(75)],
          [2, m(10)],
          [6, m(3)],
        ]),
        mps: [
          { itemId: 4, week: "2026-12-14", qty: m(40), fixed: true },
          { itemId: 5, week: "2026-12-14", qty: m(60), fixed: false },
          { itemId: 4, week: "2026-12-28", qty: m(17), fixed: false },
          { itemId: 1, week: "2026-11-30", qty: m(13), fixed: false },
          { itemId: 1, week: "2026-12-07", qty: m(7), fixed: true },
          { itemId: 1, week: "2026-12-21", qty: m(29), fixed: false },
        ],
      });
      expect(pegs.some((p) => p.kind === "SURPLUS")).toBe(true);
      expect(pegs.some((p) => p.kind === "SAFETY")).toBe(true);

      orders.forEach((o, i) => {
        const supplied = pegs.filter((p) => p.supplyOrder === i).reduce((s, p) => s + p.qty, m(0));
        expect(supplied).toBe(o.mpsWeek === null ? o.qty : m(0));
      });

      const orderSums = new Map<string, bigint>();
      for (const p of pegs) {
        if (p.kind !== "ORDER") continue;
        const key = `${p.itemId}|${mondayOf(p.needDate)}`;
        orderSums.set(key, (orderSums.get(key) ?? m(0)) + p.qty);
      }
      const grossSums = new Map(
        items.flatMap((it) => [...it.gross].map(([week, qty]) => [`${it.itemId}|${week}`, qty] as const)),
      );
      expect(grossSums.size).toBeGreaterThan(5);
      expect(orderSums).toEqual(grossSums);
    });
  });
});
