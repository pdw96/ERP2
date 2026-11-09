// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetToSample } from "@/db/reset";
import { cancelMove, milliOf, saveMove, type MoveSaveResult } from "@/db/stock";
import { getLedgerDetail, listHistory, listLedger, type HistoryRow, type LedgerRow } from "@/db/stock-history";
import type { Db } from "@/db/types";
import type { MoveLineValues, MoveValues } from "@/lib/move-input";
import {
  HISTORY_SORTS,
  LEDGER_SORTS,
  addDays,
  parseHistoryQuery,
  parseLedgerQuery,
  type HistorySort,
  type LedgerQuery,
} from "@/lib/stock-query";
import { migratedDb } from "./pglite";

// 수불 이력 · 수불부(조각 「재고 수불」 성공 기준 8 · 9, 설계 ⑤ 「수불 이력 · 수불부(PR D)」) — PGlite 에서 실제 SQL 로.
// 오늘은 2026-11-09 — 샘플 수불은 11-02 ~ 11-08(전표 10 · 줄 31)이고, 처음 기간(최근 30일)이 다 담는다.

const TODAY = "2026-11-09";
let handle: Awaited<ReturnType<typeof migratedDb>>;
let db: Db;
beforeAll(async () => {
  handle = await migratedDb();
  db = handle.db;
});
afterAll(() => handle.close());
beforeEach(() => resetToSample(db, TODAY));

const rows = <T>(result: unknown) => (result as { rows: T[] }).rows;
const ok = async (p: Promise<MoveSaveResult>) => {
  const r = await p;
  if (!r.ok) throw new Error(`저장되지 않았다: ${JSON.stringify([r.errors, r.formError])}`);
  return r.code;
};
const save = (v: Partial<MoveValues> & { lines: MoveLineValues[] }) =>
  saveMove(db, { moveDate: TODAY, moveType: "IN", ...v }, TODAY);

const history = (params: Record<string, string> = {}) => listHistory(db, parseHistoryQuery(params, TODAY).query);
const ledger = (params: Record<string, string> = {}) => listLedger(db, parseLedgerQuery(params, TODAY).query);
const num = (s: string | null) => (s === null ? null : Number(s.replace(/,/g, "").replace("−", "-")));

/** 잔액 표에서 품목(· 창고)의 지금 수량 — 수불부의 오늘까지 기말과 같아야 한다. */
async function balanceOf(itemCode: string, warehouse?: string): Promise<number> {
  const [{ q }] = rows<{ q: string }>(
    await db.execute(sql`
      select coalesce(sum(b.qty), 0)::text as q from stock_balances b
      join items i on i.id = b.item_id join warehouses w on w.id = b.warehouse_id
      where i.code = ${itemCode} ${warehouse ? sql`and w.code = ${warehouse}` : sql``}`),
  );
  return Number(q);
}

/** 기초 + 입고 계 − 출고 계 = 기말, 입고 계 = 칸의 합, 출고 계 = 칸의 합. */
function expectBalanced(r: LedgerRow) {
  const [o, it, ot, c] = [r.opening, r.inTotal, r.outTotal, r.closing].map((s) =>
    milliOf(s.replace(/,/g, "").replace("−", "-")),
  );
  expect(o + it - ot).toBe(c);
  expect(num(r.inIn)! + num(r.inXfer)! + num(r.inAdj)!).toBeCloseTo(num(r.inTotal)!, 3);
  expect(num(r.outOut)! + num(r.outXfer)! + num(r.outAdj)!).toBeCloseTo(num(r.outTotal)!, 3);
}

describe("수불 이력 — 거르기", () => {
  it("처음 열면 최근 30일 — 샘플 줄 31 이 다 보이고, 오래된 것부터 일자 → 전표 번호 → 줄 번호", async () => {
    const page = await history();
    expect(page.total).toBe(31);
    expect(page.rows.map((r) => r.moveDate)).toEqual([...page.rows.map((r) => r.moveDate)].sort());
    expect(page.rows[0]).toMatchObject({ moveDate: "2026-11-02", code: "IV-20261102-001", itemCode: "RM-0001" });
    const firstMove = page.rows.filter((r) => r.code === "IV-20261102-001").map((r) => r.itemCode);
    expect(firstMove.slice(0, 3)).toEqual(["RM-0001", "RM-0002", "RM-0003"]);
  });

  it("기간 — 끝일 · 시작일을 넘는 줄은 빠진다", async () => {
    const page = await history({ from: "2026-11-04", to: "2026-11-06" });
    expect(page.rows.every((r) => r.moveDate >= "2026-11-04" && r.moveDate <= "2026-11-06")).toBe(true);
    expect(page.rows.map((r) => r.code)).toContain("IV-20261105-001");
    expect(page.rows.map((r) => r.code)).not.toContain("IV-20261102-001");
  });

  it("품목 · LOT · 유형 — 맞는 줄만", async () => {
    const wire = await history({ item: "RM-0003" });
    expect(wire.total).toBeGreaterThan(0);
    expect(wire.rows.every((r) => r.itemCode === "RM-0003")).toBe(true);
    const lot = await history({ lot: "NW-25-0702" });
    expect(lot.rows.map((r) => [r.itemCode, r.lot])).toEqual([["RM-0003", "NW-25-0702"]]);
    const xfer = await history({ type: "XFER" });
    expect(xfer.rows.every((r) => r.moveTypeName === "이동" && r.from && r.to)).toBe(true);
  });

  it("창고 — 보내는 쪽이든 받는 쪽이든 그 창고인 줄(이동은 두 창고에서 다 보인다)", async () => {
    const wh1 = await history({ wh: "WH-01" });
    const wh2 = await history({ wh: "WH-02" });
    expect(wh1.rows.every((r) => r.from?.startsWith("WH-01") || r.to?.startsWith("WH-01"))).toBe(true);
    expect(wh2.rows.every((r) => r.from?.startsWith("WH-02") || r.to?.startsWith("WH-02"))).toBe(true);
    const xferWire = (p: typeof wh1) => p.rows.filter((r) => r.moveTypeName === "이동" && r.itemCode === "RM-0003");
    expect(xferWire(wh1)).toHaveLength(1);
    expect(xferWire(wh2)).toHaveLength(1);
  });

  it("취소 · 가리키는 문서 · 넣은 단위", async () => {
    const page = await history({ item: "CS-0002", from: "2026-11-08", to: "2026-11-08" });
    const [orig, cancel] = page.rows;
    expect(orig.canceledBy).toBe(cancel.code);
    expect(cancel.cancels).toBe(orig.code);
    // 취소 전표는 원래 전표와 같은 쪽(입고창고)에 「−20」 — 수불부와 같은 셈.
    expect(orig).toMatchObject({ from: null, to: expect.stringMatching(/^WH-01/), inQty: "20", outQty: null });
    expect(cancel).toMatchObject({ from: null, to: expect.stringMatching(/^WH-01/), inQty: "−20", outQty: null });
    await ok(save({ lines: [{ item: "RM-0004", lot: "SR-K3108", warehouse: "WH-01", qty: "500", unit: "G" }] }));
    const [g] = (await history({ item: "RM-0004", from: TODAY, to: TODAY })).rows;
    expect(g).toMatchObject({ inQty: "0.5", outQty: null, unit: "KG", entered: "500 G" });
  });

  it("입고수량 · 출고수량 — 이동은 창고를 고르지 않으면 두 칸에 다, 고르면 그 창고 쪽만", async () => {
    const xfer = (p: Awaited<ReturnType<typeof history>>) =>
      p.rows.filter((r) => r.moveTypeName === "이동").map((r) => [r.inQty, r.outQty]);
    expect(xfer(await history({ item: "RM-0003" }))).toEqual([["2,000", "2,000"]]);
    expect(xfer(await history({ item: "RM-0003", wh: "WH-01" }))).toEqual([[null, "2,000"]]);
    expect(xfer(await history({ item: "RM-0003", wh: "WH-02" }))).toEqual([["2,000", null]]);
    const out = (await history({ type: "OUT" })).rows;
    expect(out.every((r) => r.inQty === null && r.outQty !== null)).toBe(true);
    const adj = (await history({ type: "ADJ" })).rows.map((r) => [r.reasonName, r.inQty, r.outQty]);
    expect(adj).toEqual(
      expect.arrayContaining([
        ["파손", null, "50"],
        ["발견", "20", null],
      ]),
    );
  });

  it("틀린 주소 값은 버리고 알린다", () => {
    const { query, notices } = parseHistoryQuery(
      { from: "2026-02-30", item: "XX-1", wh: "창고", lot: "a b", type: "SELL", sort: "drop", page: "-1" },
      TODAY,
    );
    expect(query).toMatchObject({ from: "2026-10-11", to: TODAY, sort: "date", dir: "asc", page: 1 });
    expect(query.item ?? query.warehouse ?? query.lot ?? query.moveType).toBeUndefined();
    expect(notices.map((n) => n.field)).toEqual(["period", "item", "wh", "lot", "type"]);
    expect(parseHistoryQuery({ from: "2026-11-08", to: "2026-11-01" }, TODAY).notices[0].message).toMatch(/시작일/);
  });
});

/** 칸 머리로 세운 값 — 비교에 쓴다. 빈 값은 null. */
const HISTORY_VALUE: Record<HistorySort, (r: HistoryRow) => string | number | null> = {
  date: (r) => r.moveDate,
  code: (r) => r.moveDate,
  type: (r) =>
    ["IN", "OUT", "XFER", "ADJ"].indexOf(
      { 기타입고: "IN", 기타출고: "OUT", 이동: "XFER", 조정: "ADJ" }[r.moveTypeName]!,
    ),
  reason: (r) => r.reasonName,
  item: (r) => r.itemCode,
  itemName: (r) => r.itemName,
  lot: (r) => r.lot || null,
  from: (r) => r.from,
  to: (r) => r.to,
  inQty: (r) => num(r.inQty),
  outQty: (r) => num(r.outQty),
  unit: (r) => r.unit,
  entered: (r) => (r.entered ? num(r.entered.split(" ")[0]) : null),
  cancel: (r) => (r.cancels ? 1 : r.canceledBy ? 2 : null),
  ref: (r) => r.cancels ?? r.canceledBy,
  note: (r) => r.note || null,
};

function expectSorted<T>(list: T[], value: (r: T) => string | number | null, dir: "asc" | "desc") {
  const values = list.map(value);
  const firstNull = values.indexOf(null);
  if (firstNull >= 0) expect(values.slice(firstNull).every((v) => v === null)).toBe(true);
  const present = firstNull >= 0 ? values.slice(0, firstNull) : values;
  for (let i = 1; i < present.length; i++) {
    const [a, b] = [present[i - 1]!, present[i]!];
    if (dir === "asc") expect(a <= b, `${a} ≤ ${b}`).toBe(true);
    else expect(a >= b, `${a} ≥ ${b}`).toBe(true);
  }
}

describe("수불 이력 — 칸 머리로 세우기", () => {
  beforeEach(async () => {
    await ok(save({ lines: [{ item: "RM-0004", lot: "SR-K3108", warehouse: "WH-01", qty: "500", unit: "G" }] }));
    await ok(
      save({
        moveType: "ADJ",
        reason: "FOUND",
        note: "가",
        lines: [{ item: "SM-0002", warehouse: "WH-01", qty: "+1" }],
      }),
    );
  });

  it.each(HISTORY_SORTS.flatMap((s) => (["asc", "desc"] as const).map((d) => [s, d] as const)))(
    "%s %s — 거른 줄 전체를 그 칸으로 세우고, 빈 값은 맨 뒤",
    async (sort, dir) => {
      const page = await history({ sort, dir });
      expect(page.total).toBe(33);
      expectSorted(page.rows, HISTORY_VALUE[sort], dir);
    },
  );

  it("값이 같으면 일자 → 전표 번호 → 줄 번호(오래된 것부터)", async () => {
    const page = await history({ sort: "unit", dir: "desc" });
    for (let i = 1; i < page.rows.length; i++) {
      const [a, b] = [page.rows[i - 1], page.rows[i]];
      if (a.unit === b.unit) expect(a.moveDate <= b.moveDate).toBe(true);
    }
  });

  it("일자 ▼ 는 최신부터 — 같은 날은 전표 번호 · 줄 번호도 거꾸로", async () => {
    const page = await history({ sort: "date", dir: "desc" });
    expect(page.rows[0].moveDate).toBe(TODAY);
    expect(page.rows.slice(0, 2).map((r) => r.code)).toEqual(["IV-20261109-002", "IV-20261109-001"]);
  });
});

describe("수불 이력 — 100줄씩", () => {
  it("넘치면 쪽을 넘기고, 마지막 쪽을 넘는 쪽은 마지막 쪽", async () => {
    const lines = Array.from({ length: 100 }, () => ({ item: "SM-0002", warehouse: "WH-01", qty: "1" }));
    await ok(save({ lines }));
    const p1 = await history();
    expect(p1).toMatchObject({ total: 131, page: 1, pages: 2 });
    expect(p1.rows).toHaveLength(100);
    const p2 = await history({ page: "2" });
    expect(p2.rows).toHaveLength(31);
    expect(new Set([...p1.rows, ...p2.rows].map((r) => r.id)).size).toBe(131);
    expect((await history({ page: "9" })).page).toBe(2);
  });

  it("맞는 줄이 없으면 빈 쪽 하나", async () => {
    expect(await history({ lot: "NONE" })).toMatchObject({ total: 0, page: 1, pages: 1, rows: [] });
  });
});

describe("수불부", () => {
  it("품목마다 기초 + 입고 − 출고 = 기말 — 오늘까지의 기말은 잔액 표와 같다(모든 창고 · 창고마다)", async () => {
    const all = await ledger();
    expect(all.rows).toHaveLength(14);
    for (const r of all.rows) {
      expectBalanced(r);
      expect(num(r.closing)).toBe(await balanceOf(r.itemCode));
    }
    for (const wh of ["WH-01", "WH-02", "WH-03", "WH-04"]) {
      for (const r of (await ledger({ wh })).rows) {
        expectBalanced(r);
        expect(num(r.closing)).toBe(await balanceOf(r.itemCode, wh));
      }
    }
  });

  it("창고를 고르지 않으면 이동이 빠지고, 고르면 그 창고의 들고 남이 「이동」에 든다", async () => {
    const all = await ledger({ item: "RM-0003" });
    expect(all.rows[0]).toMatchObject({ inXfer: "0", outXfer: "0", inIn: "10,000", closing: "10,000" });
    const [wh1] = (await ledger({ item: "RM-0003", wh: "WH-01" })).rows;
    const [wh2] = (await ledger({ item: "RM-0003", wh: "WH-02" })).rows;
    expect(wh1).toMatchObject({ inIn: "10,000", outXfer: "2,000", closing: "8,000" });
    expect(wh2).toMatchObject({ inXfer: "2,000", inIn: "0", closing: "2,000" });
  });

  it("기초는 시작일 앞의 수불 — 앞 기간의 기말이 다음 기간의 기초다", async () => {
    const [before] = (await ledger({ item: "RM-0002", from: "2026-11-01", to: "2026-11-05" })).rows;
    const [after] = (await ledger({ item: "RM-0002", from: "2026-11-06", to: TODAY })).rows;
    expect(after.opening).toBe(before.closing);
    expectBalanced(after);
  });

  it("취소는 원래 유형의 칸에서 뺀다 — 입고를 취소하면 입고 칸이 줄고 출고 칸은 그대로", async () => {
    const code = await ok(save({ lines: [{ item: "SM-0002", warehouse: "WH-01", qty: "20" }] }));
    const [beforeCancel] = (await ledger({ item: "SM-0002", from: TODAY, to: TODAY })).rows;
    expect(beforeCancel).toMatchObject({ inIn: "20", outOut: "0" });
    expect((await cancelMove(db, code, TODAY)).ok).toBe(true);
    const day = await ledger({ item: "SM-0002", from: TODAY, to: TODAY });
    // 기초는 0 이 아니라 줄이 남는다 — 입고 칸이 20 − 20 = 0, 출고 칸은 0.
    expect(day.rows[0]).toMatchObject({ inIn: "0", outOut: "0", inTotal: "0", outTotal: "0" });
    const minusAdj = await ok(
      save({ moveType: "ADJ", reason: "LOSS", lines: [{ item: "SM-0002", warehouse: "WH-01", qty: "-5" }] }),
    );
    await cancelMove(db, minusAdj, TODAY);
    const [adj] = (await ledger({ item: "SM-0002", from: TODAY, to: TODAY })).rows;
    expect(adj).toMatchObject({ inAdj: "0", outAdj: "0" });
    const detail = (await getLedgerDetail(db, "SM-0002", { from: TODAY, to: TODAY, page: 1 }))!;
    expect(detail.rows.map((r) => [r.in, r.out])).toEqual([
      ["20", null],
      ["−20", null],
      [null, "5"],
      [null, "−5"],
    ]);
  });

  it("기초 · 입고 · 출고 · 기말이 다 0 인 품목은 줄로 두지 않는다", async () => {
    const page = await ledger({ from: "2026-12-01", to: "2026-12-31" });
    // 다 나간 품목이 없으니 열넷 모두 기초가 있다 — 기간이 미래여도 기초 = 지금 재고.
    expect(page.total).toBe(14);
    expect((await ledger({ from: "2026-01-01", to: "2026-01-31" })).total).toBe(0);
    expect((await ledger({ wh: "WH-04", from: "2026-01-01", to: "2026-01-31" })).rows).toEqual([]);
  });

  it.each(
    LEDGER_SORTS.filter((s) => s !== "inXfer" && s !== "outXfer").flatMap((s) =>
      (["asc", "desc"] as const).map((d) => [s, d] as const),
    ),
  )("%s %s — 목록 전체를 그 칸으로 세운다", async (sort, dir) => {
    const page = await ledger({ sort, dir });
    const value = (r: LedgerRow) => {
      const v = r[(sort === "item" ? "itemCode" : sort) as keyof LedgerRow];
      return ["item", "itemName", "unit"].includes(sort) ? v : num(v);
    };
    expectSorted(page.rows, value, dir);
  });

  it("창고를 고르지 않으면 「이동」 칸으로는 세우지 않는다", () => {
    expect(parseLedgerQuery({ sort: "inXfer", dir: "desc" }, TODAY).query).toMatchObject({ sort: "item", dir: "asc" });
    expect(parseLedgerQuery({ sort: "inXfer", dir: "desc", wh: "WH-02" }, TODAY).query).toMatchObject({
      sort: "inXfer",
      dir: "desc",
    });
  });
});

describe("수불부 — 품목의 거래", () => {
  it("잔량은 기초에서 시작해 기말에서 끝나고, 창고를 고르지 않으면 이동이 빠진다", async () => {
    const all = (await getLedgerDetail(db, "RM-0003", { from: "2026-10-11", to: TODAY, page: 1 }))!;
    expect(all.opening).toBe("0");
    expect(all.rows.map((r) => [r.moveTypeName, r.in, r.out, r.balance])).toEqual([
      ["기타입고", "8,000", null, "8,000"],
      ["기타입고", "2,000", null, "10,000"],
    ]);
    expect(all.closing).toBe("10,000");
    const wh1 = (await getLedgerDetail(db, "RM-0003", { from: "2026-11-03", to: TODAY, warehouse: "WH-01", page: 1 }))!;
    expect(wh1.opening).toBe("8,000");
    expect(wh1.rows.map((r) => [r.moveTypeName, r.in, r.out, r.balance])).toEqual([
      ["이동", null, "2,000", "6,000"],
      ["기타입고", "2,000", null, "8,000"],
    ]);
    expect(wh1.rows.at(-1)!.balance).toBe(wh1.closing);
  });

  it("거래가 100줄을 넘으면 쪽을 넘기고 잔량은 앞 쪽에서 이어진다", async () => {
    await ok(save({ lines: Array.from({ length: 100 }, () => ({ item: "SM-0002", warehouse: "WH-01", qty: "1" })) }));
    await ok(save({ lines: Array.from({ length: 5 }, () => ({ item: "SM-0002", warehouse: "WH-01", qty: "1" })) }));
    const p1 = (await getLedgerDetail(db, "SM-0002", { from: TODAY, to: TODAY, page: 1 }))!;
    const p2 = (await getLedgerDetail(db, "SM-0002", { from: TODAY, to: TODAY, page: 2 }))!;
    expect(p1).toMatchObject({ total: 105, pages: 2, opening: "820" });
    expect(p1.rows.at(-1)!.balance).toBe("920");
    expect(p2.rows.map((r) => r.balance)).toEqual(["921", "922", "923", "924", "925"]);
    expect(p2.closing).toBe("925");
  });

  it("없는 품목은 없음", async () => {
    expect(await getLedgerDetail(db, "RM-9999", { from: TODAY, to: TODAY, page: 1 })).toBeUndefined();
  });
});

describe("수불부 — 임의의 수불 묶음", () => {
  // 정한 씨앗의 가짜 난수 — 시험이 돌 때마다 같은 묶음이다.
  function rng(seed: number) {
    let s = seed;
    return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  }

  it("입고 · 출고 · 이동 · 조정 · 취소를 섞어도 기간 · 창고마다 기초 + 입고 − 출고 = 기말이고, 이어진 기간이 맞물린다", async () => {
    const r = rng(7);
    const pick = <T>(list: readonly T[]) => list[Math.floor(r() * list.length)];
    const whs = ["WH-01", "WH-02", "WH-03", "WH-04"];
    const saved: string[] = [];
    for (let i = 0; i < 60; i++) {
      const day = addDays(TODAY, -Math.floor(r() * 10));
      const type = pick(["IN", "IN", "OUT", "XFER", "XFER", "ADJ", "CANCEL"] as const);
      const item = pick(["SM-0001", "SM-0002", "CS-0001"]);
      const qty = String(1 + Math.floor(r() * 50));
      if (type === "CANCEL") {
        if (saved.length) await cancelMove(db, pick(saved), TODAY);
        continue;
      }
      const from = pick(whs.slice(0, 3));
      const line: MoveLineValues =
        type === "XFER"
          ? { item, warehouse: from, toWarehouse: pick(whs.filter((w) => w !== from)), qty }
          : type === "ADJ"
            ? { item, warehouse: from, qty: `${r() < 0.5 ? "-" : "+"}${qty}` }
            : { item, warehouse: from, qty };
      const res = await saveMove(
        db,
        { moveDate: day, moveType: type, reason: type === "ADJ" ? "ETC" : undefined, lines: [line] },
        TODAY,
      );
      if (res.ok) saved.push(res.code);
    }
    expect(saved.length).toBeGreaterThan(20);

    const cuts = [addDays(TODAY, -6), addDays(TODAY, -3)];
    for (const wh of [undefined, ...whs]) {
      const base: Partial<LedgerQuery> = wh ? { warehouse: wh } : {};
      const q = (from: string, to: string): LedgerQuery => ({ from, to, sort: "item", dir: "asc", page: 1, ...base });
      const a = await listLedger(db, q(addDays(TODAY, -20), addDays(cuts[0], -1)));
      const b = await listLedger(db, q(cuts[0], addDays(cuts[1], -1)));
      const c = await listLedger(db, q(cuts[1], TODAY));
      for (const page of [a, b, c]) page.rows.forEach(expectBalanced);
      const close = (p: typeof a, item: string) => p.rows.find((x) => x.itemCode === item)?.closing ?? "0";
      const open = (p: typeof a, item: string) => p.rows.find((x) => x.itemCode === item)?.opening ?? "0";
      for (const item of ["SM-0001", "SM-0002", "CS-0001"]) {
        expect(open(b, item)).toBe(close(a, item));
        expect(open(c, item)).toBe(close(b, item));
        expect(num(close(c, item))).toBe(await balanceOf(item, wh));
      }
      if (!wh) c.rows.forEach((x) => expect([x.inXfer, x.outXfer]).toEqual(["0", "0"]));
    }
  });
});
