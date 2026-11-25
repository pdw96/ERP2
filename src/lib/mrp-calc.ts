import { THOUSAND, ZERO, type Milli } from "./move-input";
import { lotSize } from "./mps-calc";
import { addRatio, ceilRatioToMilli, requiredOf, type Ratio } from "./ratio";
import { fromMs, mondayOf, toMs } from "./weeks";

// MRP 계산 — 날짜(리드타임 · 완성일 · 늦음), 품목 하나의 주별 넷팅, MPS 를 BOM 으로 펼쳐 계획오더를 내는 여러 단계 계산.
// 화면과 서버가 함께 쓰며 DB 를 보지 않는다.
// 날짜는 Date.UTC 로만 센다 — 서버의 지역 시각에 기대지 않는다(weeks.ts 와 같다).

const DAY_MS = 86_400_000;

/** 요일 이름 — 1(월) ~ 7(일) 의 차례대로(완성일 기준 요일 `dueWeekday - 1` 로 찾는다). */
export const WEEKDAY_NAMES = ["월", "화", "수", "목", "금", "토", "일"] as const;

/** date 에서 n일 뒤(음수는 앞). */
export function addDays(date: string, n: number): string {
  return fromMs(toMs(date) + n * DAY_MS);
}

/** to − from (일). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toMs(to) - toMs(from)) / DAY_MS);
}

/** 그 주(월요일)의 dueWeekday(1 = 월 … 7 = 일) 날짜 — 월요일 + (dueWeekday − 1)일. */
export function dueDateOf(week: string, dueWeekday: number): string {
  return addDays(week, dueWeekday - 1);
}

export type Schedule = {
  /** 완성일 — 지났으면 오늘(결정 9-1) */
  dueDate: string;
  /** 완성일 − 리드타임 */
  plannedStart: string;
  /** 실제 시작일 — 계획 시작이 지났으면 오늘 */
  startDate: string;
  /** 계획 시작이 오늘보다 앞선 날수(결정 9) */
  lateDays: number;
};

/** 필요한 날(due) · 리드타임 · 오늘로 완성일 · 시작일 · 늦은 날수를 셈한다. */
export function scheduleOf(due: string, leadTimeDays: number, today: string): Schedule {
  const dueDate = due > today ? due : today;
  const plannedStart = addDays(dueDate, -leadTimeDays);
  const startDate = plannedStart > today ? plannedStart : today;
  const lateDays = Math.max(0, daysBetween(plannedStart, today));
  return { dueDate, plannedStart, startDate, lateDays };
}

export type NetWeek = {
  week: string;
  /** 그 주의 총소요(이미 단위 자릿수로 올린 값) */
  gross: Milli;
  /** 그 주 총소요 중 가장 이른 필요일(총소요가 없으면 null) */
  earliestNeed: string | null;
  /** 그 주에 받아야 할 수량(계획 입고) */
  receipt: Milli;
  projected: Milli;
};

export type NetItemInput = {
  /** 이번 주부터 이어진 월요일들, 차례대로 */
  weeks: string[];
  /** 처음 재고 = 지금 가용재고 */
  available: Milli;
  safety: Milli;
  minLot: Milli;
  multiple: Milli;
  /** 품목 단위의 소수 자릿수 0 ~ 3 */
  decimals: number;
  /** 주 → 총소요 · 가장 이른 필요일(없으면 그 주는 총소요 0) */
  gross: ReadonlyMap<string, { qty: Milli; earliestNeed: string }>;
};

/**
 * 품목 하나의 주별 넷팅(결정 1). 주마다 net = 지난주 예상재고 − 총소요 이고,
 * net 이 안전재고 밑이면 receipt = lotSize(안전재고 − net), projected = net + receipt.
 * 넷팅은 늘 안전재고(0 이상)까지 채우므로 예상재고는 음수가 되지 않고, 그 예상재고를 다음 주로 넘긴다.
 */
export function netItem(input: NetItemInput): NetWeek[] {
  const { safety, minLot, multiple, decimals, gross } = input;
  let prev = input.available;
  return input.weeks.map((week) => {
    const g = gross.get(week);
    const qty = g?.qty ?? ZERO;
    const net = prev - qty;
    const receipt = net < safety ? lotSize(safety - net, minLot, multiple, decimals) : ZERO;
    const projected = net + receipt;
    prev = projected;
    return { week, gross: qty, earliestNeed: g?.earliestNeed ?? null, receipt, projected };
  });
}

export type MrpItem = {
  id: number;
  code: string;
  itemType: string;
  procurement: "MAKE" | "BUY";
  leadTimeDays: number;
  safety: Milli;
  minLot: Milli;
  multiple: Milli;
  /** 품목 단위의 소수 자릿수 0 ~ 3 */
  decimals: number;
  active: boolean;
};

export type MrpBomLine = {
  parentId: number;
  childId: number;
  qty: Milli;
  baseQty: Milli;
  lossHundredths: number;
  validFrom: string;
  validTo: string | null;
};

export type MrpInput = {
  /** 실행한 날(한국 시각) */
  today: string;
  /** 완성일 기준 요일 1 = 월 … 7 = 일 */
  dueWeekday: number;
  /** 이번 주부터 이어진 월요일들, 차례대로 */
  weeks: string[];
  items: MrpItem[];
  /** 모든 BOM 줄(적용일 무관) */
  bomLines: MrpBomLine[];
  /** 품목 → 지금 가용재고(없으면 0) */
  available: ReadonlyMap<number, Milli>;
  /** 완제품의 주별 MPS 수량 · 고정 여부 */
  mps: { itemId: number; week: string; qty: Milli; fixed: boolean }[];
};

export type MrpOrder = Schedule & {
  itemId: number;
  kind: "MAKE" | "BUY";
  qty: Milli;
  noBom: boolean;
  /** 완제품 계획오더를 낸 MPS 칸의 주(그 밖의 계획오더는 null) */
  mpsWeek: string | null;
  /** 그 MPS 칸이 고정인가(그 밖의 계획오더는 null) */
  mpsFixed: boolean | null;
};

export type MrpItemPlan = {
  itemId: number;
  /** MPS 품목(완제품) — 넷팅하지 않았고 총소요가 없다 */
  fromMps: boolean;
  available: Milli;
  /** 넷팅에 쓴 안전재고(「사용 안 함」이면 0) */
  safety: Milli;
  /** 주 → 단위 자릿수로 올린 총소요(0 아닌 주만) */
  gross: Map<string, Milli>;
};

/** 페깅 줄의 구분 — 윗 계획오더의 소요 · 안전재고 · 가용 부족 메움 · 남는 수량. */
export type MrpPegKind = "ORDER" | "SAFETY" | "SHORT" | "SURPLUS";

/**
 * 페깅 한 줄 — 소요 하나를 공급 하나가 얼마만큼 채우는가. demandOrder · supplyOrder 는 반환한 orders(정렬 뒤)의 자리 번호.
 * ORDER 는 윗 계획오더의 소요(supplyOrder null = 재고, 끝수로 몫이 0 이면 qty 0 · supplyOrder null 한 줄).
 * SAFETY · SHORT 는 계획오더가 채운 안전재고 · 가용 부족 메움, SURPLUS 는 소요를 다 채우고 계획오더에 남는 수량(최소량 · 배수).
 */
export type MrpPeg =
  | { kind: "ORDER"; itemId: number; demandOrder: number; supplyOrder: number | null; needDate: string; qty: Milli }
  | { kind: "SAFETY" | "SHORT" | "SURPLUS"; itemId: number; supplyOrder: number; qty: Milli };

export type MrpPlan = { orders: MrpOrder[]; items: MrpItemPlan[]; pegs: MrpPeg[] };

type GrossCell = { sum: Ratio; earliestNeed: string };

/** 윗 계획오더 하나가 낸 자품목 소요 — 필요일은 윗 계획오더의 시작일, 수량은 끝수를 버리지 않은 분수. */
type Demand = { parent: MrpOrder; ratio: Ratio; needDate: string };

/** 넷팅한 품목 하나의 페깅 재료 — 넷팅에 쓴 가용재고 · 안전재고와 넷팅 주 차례로 낸 계획오더. */
type PegSource = { item: MrpItem; available: Milli; safety: Milli; receipts: MrpOrder[] };

/**
 * 모든 BOM 줄(적용일 무관)로 품목마다 가장 깊은 단계(저단계 코드)를 구한다 — 맨 위가 0.
 * 순환이 있으면 단계가 끝없이 깊어지므로, 품목 수만큼 돌아도 멈추지 않으면 계산하지 않는다.
 */
function lowLevelCodes(items: MrpItem[], bomLines: MrpBomLine[]): Map<number, number> {
  const level = new Map<number, number>(items.map((i) => [i.id, 0]));
  for (let round = 0; ; round++) {
    let changed = false;
    for (const l of bomLines) {
      const deeper = (level.get(l.parentId) ?? 0) + 1;
      if ((level.get(l.childId) ?? 0) < deeper) {
        level.set(l.childId, deeper);
        changed = true;
      }
    }
    if (!changed) return level;
    if (round > level.size) throw new Error("BOM 에 순환이 있어 MRP 를 계산할 수 없습니다.");
  }
}

const byCode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * MRP — MPS 수량을 완제품 계획오더로 두고, 생산 계획오더는 시작일에 적용되는 바로 아래 BOM 줄로 자품목 총소요를 낸다.
 * 품목은 저단계 코드가 얕은 것부터(같은 단계는 품목코드 차례) 총소요가 다 모인 뒤 한 번 넷팅한다. 총소요는 분수로 모아 품목 × 주에서 한 번 올린다.
 */
export function planMrp(input: MrpInput): MrpPlan {
  const { today, dueWeekday, weeks, items, bomLines, available, mps } = input;
  const itemById = new Map(items.map((i) => [i.id, i]));
  const itemOf = (id: number): MrpItem => {
    const found = itemById.get(id);
    if (!found) throw new Error(`MRP 에 없는 품목입니다: ${id}`);
    return found;
  };
  const linesByParent = new Map<number, MrpBomLine[]>();
  for (const l of bomLines) {
    const siblings = linesByParent.get(l.parentId);
    if (siblings) siblings.push(l);
    else linesByParent.set(l.parentId, [l]);
  }

  const gross = new Map<number, Map<string, GrossCell>>();
  /** 품목 → 주 → 그 주의 소요들(윗 계획오더마다 하나) — 페깅이 쓴다. 합은 gross 의 sum 과 같다. */
  const demands = new Map<number, Map<string, Demand[]>>();
  const orders: MrpOrder[] = [];

  /**
   * 계획오더 하나를 내고, 생산이면 그 시작일에 적용되는 바로 아래 줄로 자품목 총소요를 더한다.
   * 자품목마다 이 계획오더의 소요 하나를 따로 쌓는다(같은 자품목이 두 줄이면 합친다). 완제품이면 MPS 칸(주 · 고정)을 남긴다.
   */
  const place = (item: MrpItem, qty: Milli, schedule: Schedule, mps: { week: string; fixed: boolean } | null) => {
    const order: MrpOrder = {
      ...schedule,
      itemId: item.id,
      kind: item.procurement,
      qty,
      noBom: false,
      mpsWeek: mps?.week ?? null,
      mpsFixed: mps?.fixed ?? null,
    };
    if (item.procurement === "MAKE") {
      const start = schedule.startDate;
      const applied = (linesByParent.get(item.id) ?? []).filter(
        (l) => l.validFrom <= start && (l.validTo === null || l.validTo >= start),
      );
      order.noBom = applied.length === 0;
      const week = mondayOf(start);
      const mine = new Map<number, Demand>();
      for (const l of applied) {
        const childId = itemOf(l.childId).id;
        const need = requiredOf({ n: qty, d: THOUSAND }, l.qty, l.baseQty, l.lossHundredths);
        const cells = gross.get(childId) ?? new Map<string, GrossCell>();
        gross.set(childId, cells);
        const cell = cells.get(week);
        cells.set(
          week,
          cell
            ? { sum: addRatio(cell.sum, need), earliestNeed: start < cell.earliestNeed ? start : cell.earliestNeed }
            : { sum: need, earliestNeed: start },
        );
        const same = mine.get(childId);
        if (same) {
          same.ratio = addRatio(same.ratio, need);
          continue;
        }
        const demand: Demand = { parent: order, ratio: need, needDate: start };
        mine.set(childId, demand);
        const byWeek = demands.get(childId) ?? new Map<string, Demand[]>();
        demands.set(childId, byWeek);
        const list = byWeek.get(week);
        if (list) list.push(demand);
        else byWeek.set(week, [demand]);
      }
    }
    orders.push(order);
    return order;
  };

  const safetyOf = (item: MrpItem) => (item.active ? item.safety : ZERO);
  const plans: MrpItemPlan[] = [];

  // 완제품 — MPS 수량이 그대로 계획오더(넷팅 · 최소량 · 배수 없음)
  const mpsItems = new Set(mps.map((r) => r.itemId));
  const mpsOrdered = new Set<number>();
  for (const r of mps) {
    if (r.qty <= ZERO) continue;
    const item = itemOf(r.itemId);
    place(item, r.qty, scheduleOf(dueDateOf(r.week, dueWeekday), item.leadTimeDays, today), {
      week: r.week,
      fixed: r.fixed,
    });
    mpsOrdered.add(item.id);
  }
  for (const id of mpsOrdered) {
    const item = itemOf(id);
    const avail = available.get(id) ?? ZERO;
    plans.push({ itemId: id, fromMps: true, available: avail, safety: safetyOf(item), gross: new Map() });
  }

  // 아래 품목 — 저단계 코드 차례로 넷팅. 완제품은 MPS 가 들므로(MPS 수량이 0 이라 줄이 없어도) 다시 넷팅하지 않는다.
  const level = lowLevelCodes(items, bomLines);
  const pegSources: PegSource[] = [];
  const netted = items
    .filter((i) => i.itemType !== "FG" && !mpsItems.has(i.id))
    .sort((a, b) => level.get(a.id)! - level.get(b.id)! || byCode(a.code, b.code));
  for (const item of netted) {
    const cells = gross.get(item.id) ?? new Map<string, GrossCell>();
    const rounded = new Map<string, { qty: Milli; earliestNeed: string }>();
    for (const [week, cell] of cells) {
      rounded.set(week, { qty: ceilRatioToMilli(cell.sum, item.decimals), earliestNeed: cell.earliestNeed });
    }
    const safety = safetyOf(item);
    const avail = available.get(item.id) ?? ZERO;
    const receipts: MrpOrder[] = [];
    const { minLot, multiple, decimals } = item;
    for (const w of netItem({ weeks, available: avail, safety, minLot, multiple, decimals, gross: rounded })) {
      if (w.receipt <= ZERO) continue;
      const due = w.earliestNeed ?? dueDateOf(w.week, dueWeekday);
      receipts.push(place(item, w.receipt, scheduleOf(due, item.leadTimeDays, today), null));
    }
    const placed = receipts.length > 0;
    pegSources.push({ item, available: avail, safety, receipts });
    const grossShown = new Map([...rounded].filter(([, g]) => g.qty !== ZERO).map(([week, g]) => [week, g.qty]));
    if (placed || grossShown.size > 0) {
      plans.push({ itemId: item.id, fromMps: false, available: avail, safety, gross: grossShown });
    }
  }

  const codeOf = (id: number) => itemById.get(id)!.code;
  orders.sort(
    (a, b) =>
      byCode(a.startDate, b.startDate) || byCode(codeOf(a.itemId), codeOf(b.itemId)) || byCode(a.dueDate, b.dueDate),
  );
  plans.sort((a, b) => byCode(codeOf(a.itemId), codeOf(b.itemId)));

  // 페깅은 정렬 뒤에 한다 — 줄이 계획오더의 정렬 자리를 가리키고, 같은 필요일의 소요는 윗 계획오더의 정렬 차례로 맞춘다.
  const position = new Map(orders.map((o, i) => [o, i]));
  const pegs: MrpPeg[] = [];
  for (const source of pegSources) {
    for (const peg of pegItem(source, weeks, demands.get(source.item.id) ?? new Map(), position)) pegs.push(peg);
  }
  return { orders, items: plans, pegs };
}

type PegNeed =
  { kind: "ORDER"; qty: Milli; demandOrder: number; needDate: string } | { kind: "SAFETY" | "SHORT"; qty: Milli };

/**
 * 넷팅한 품목 하나의 페깅 — 소요들을 공급들에 앞에서부터 맞춘다(그리디).
 * 소요 차례: 가용 부족 메움(가용이 음수면) → 안전재고 → 주 차례 · 필요일 차례 · 윗 계획오더의 정렬 차례.
 * 소요 하나의 수량은 주 안에서 위 차례로 분수를 누적해 올린 값의 차이 — 끝수가 쌓이지 않고 주의 합이 총소요(넷팅에 쓴 값)와 같다.
 * 공급 차례: 재고(가용, 음수면 0) → 이 품목의 계획오더(넷팅 주 차례). 넷팅이 주마다 예상재고 ≥ 안전재고를 지키므로 공급이 모자라지 않는다.
 */
function pegItem(
  source: PegSource,
  weeks: string[],
  byWeek: ReadonlyMap<string, Demand[]>,
  position: ReadonlyMap<MrpOrder, number>,
): MrpPeg[] {
  const { item, available, safety, receipts } = source;
  const positionOf = (o: MrpOrder) => position.get(o)!;

  const needs: PegNeed[] = [];
  if (available < ZERO) needs.push({ kind: "SHORT", qty: -available });
  if (safety > ZERO) needs.push({ kind: "SAFETY", qty: safety });
  // 넷팅(netItem)이 weeks 의 주만 보므로 소요도 weeks 차례로 꺼낸다.
  for (const week of weeks) {
    const list = byWeek.get(week);
    if (!list) continue;
    const sorted = [...list].sort(
      (a, b) => byCode(a.needDate, b.needDate) || positionOf(a.parent) - positionOf(b.parent),
    );
    let sum: Ratio = { n: ZERO, d: BigInt(1) };
    let before = ZERO;
    for (const d of sorted) {
      sum = addRatio(sum, d.ratio);
      const upTo = ceilRatioToMilli(sum, item.decimals);
      needs.push({ kind: "ORDER", qty: upTo - before, demandOrder: positionOf(d.parent), needDate: d.needDate });
      before = upTo;
    }
  }

  const supplies: { order: number | null; left: Milli }[] = [
    { order: null, left: available > ZERO ? available : ZERO },
    ...receipts.map((o) => ({ order: positionOf(o), left: o.qty })),
  ];
  const pegs: MrpPeg[] = [];
  let s = 0;
  for (const need of needs) {
    if (need.kind === "ORDER" && need.qty === ZERO) {
      pegs.push({
        kind: "ORDER",
        itemId: item.id,
        demandOrder: need.demandOrder,
        supplyOrder: null,
        needDate: need.needDate,
        qty: ZERO,
      });
      continue;
    }
    let rest = need.qty;
    while (rest > ZERO) {
      while (s < supplies.length && supplies[s].left === ZERO) s++;
      if (s === supplies.length) throw new Error("페깅의 공급이 소요보다 적습니다");
      const supply = supplies[s];
      const qty = rest < supply.left ? rest : supply.left;
      supply.left -= qty;
      rest -= qty;
      if (need.kind === "ORDER") {
        pegs.push({
          kind: "ORDER",
          itemId: item.id,
          demandOrder: need.demandOrder,
          supplyOrder: supply.order,
          needDate: need.needDate,
          qty,
        });
      } else if (supply.order !== null) {
        pegs.push({ kind: need.kind, itemId: item.id, supplyOrder: supply.order, qty });
      }
    }
  }
  for (const supply of supplies) {
    if (supply.order !== null && supply.left > ZERO) {
      pegs.push({ kind: "SURPLUS", itemId: item.id, supplyOrder: supply.order, qty: supply.left });
    }
  }
  return pegs;
}
