// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetToSample } from "@/db/reset";
import { cancelMove, onHand, saveMove, type MoveSaveResult } from "@/db/stock";
import { listLedger } from "@/db/stock-history";
import { listItemStock, listLotStock, listWarehouseStock, type LotStockRow, type StockQty } from "@/db/stock-status";
import type { Db } from "@/db/types";
import type { MoveValues } from "@/lib/move-input";
import {
  LOT_STOCK_SORTS,
  WAREHOUSE_STOCK_SORTS,
  itemPlacesHref,
  parseItemStockQuery,
  parseLedgerQuery,
  parseLotStockQuery,
  parseWarehouseStockQuery,
} from "@/lib/stock-query";
import { migratedDb } from "./pglite";

// 재고 현황 · 창고별 · LOT별 재고(조각 「재고 현황」 성공 기준 5 · 6 · 7 · 8, 설계 ⑤ 의 S1 ~ S4 · PR B) — PGlite 에서 실제 SQL 로.
// S1: 화면의 줄을 시험 안에서 잔액 표 전체로 따로 센 기대값(창고 × 품목, 품목 × 창고 × LOT 마다 넷)과 견준다.
// S2: 줄마다 실재고 = 검사대기 + 불량 + 가용재고, 세 화면 사이 · 수불부 기말 · 등록이 내보낼 수 있는 수량과 같다(샘플과 임의의 수불 묶음).

const TODAY = "2026-11-11";
let handle: Awaited<ReturnType<typeof migratedDb>>;
let db: Db;
beforeAll(async () => {
  handle = await migratedDb();
  db = handle.db;
});
afterAll(() => handle.close());
beforeEach(() => resetToSample(db, TODAY));

const rows = <T>(result: unknown) => (result as { rows: T[] }).rows;
const num = (s: string) => Number(s.replace(/,/g, "").replace("−", "-"));
const fourNum = (r: StockQty) => ({
  onHand: num(r.onHand),
  qc: num(r.qc),
  defect: num(r.defect),
  available: num(r.available),
});
type Four = ReturnType<typeof fourNum>;
const zero = (): Four => ({ onHand: 0, qc: 0, defect: 0, available: 0 });
const add = (a: Four, b: Four): Four => ({
  onHand: a.onHand + b.onHand,
  qc: a.qc + b.qc,
  defect: a.defect + b.defect,
  available: a.available + b.available,
});

const byWarehouse = async (params: Record<string, string> = {}) =>
  (await listWarehouseStock(db, parseWarehouseStockQuery(params).query)).rows;
const byLot = async (params: Record<string, string> = {}) =>
  (await listLotStock(db, parseLotStockQuery(params).query)).rows;
const byItem = async () => (await listItemStock(db, parseItemStockQuery({}).query)).rows;

type Raw = {
  item: string;
  wh: string;
  lot: string;
  lot_managed: boolean;
  is_defect: boolean;
  status: string;
  qty: number;
};

/** S1 — 잔액 표 전체(불량창고 → 불량, 그 밖 검사대기 → 검사대기, 나머지 → 가용). */
async function raw(): Promise<Raw[]> {
  return rows<Omit<Raw, "qty"> & { qty: string }>(
    await db.execute(sql`
      select i.code as item, w.code as wh, b.lot, i.lot_managed, w.is_defect, b.status, b.qty::text as qty
      from stock_balances b join items i on i.id = b.item_id join warehouses w on w.id = b.warehouse_id`),
  ).map((r) => ({ ...r, qty: Number(r.qty) }));
}

function expectedBy(data: Raw[], key: (r: Raw) => string): Map<string, Four> {
  const m = new Map<string, Four>();
  for (const r of data) {
    const f = m.get(key(r)) ?? zero();
    f.onHand += r.qty;
    if (r.is_defect) f.defect += r.qty;
    else if (r.status === "QC") f.qc += r.qty;
    else f.available += r.qty;
    m.set(key(r), f);
  }
  // 0 보다 큰 줄만(ADR 0023 의 5)
  for (const [k, f] of m) if (f.onHand === 0) m.delete(k);
  return m;
}

const whKey = (r: { wh?: string; warehouseCode?: string; item?: string; itemCode?: string }) =>
  `${r.wh ?? r.warehouseCode}|${r.item ?? r.itemCode}`;
const lotKey = (r: { item?: string; itemCode?: string; lot: string; wh?: string; warehouseCode?: string }) =>
  `${r.item ?? r.itemCode}|${r.lot}|${r.wh ?? r.warehouseCode}`;

/** 줄마다 실재고 = 넷의 합. */
function expectRowsAddUp(got: StockQty[]) {
  for (const r of got) {
    const f = fourNum(r);
    expect(f.onHand).toBeCloseTo(f.qc + f.defect + f.available, 6);
  }
}

/** S1 · S2 — 창고별 · LOT별 재고가 잔액 표 전체로 센 기대값과 줄 하나하나 같다. */
async function expectPlacesMatch() {
  const data = await raw();
  const wh = await byWarehouse();
  const lot = await byLot();
  expectRowsAddUp(wh);
  expectRowsAddUp(lot);
  const expWh = expectedBy(data, whKey);
  // LOT별 재고에는 LOT 관리 품목만(ADR 0025)
  const expLot = expectedBy(
    data.filter((r) => r.lot_managed),
    lotKey,
  );
  expect(new Map(wh.map((r) => [whKey(r), fourNum(r)]))).toEqual(expWh);
  expect(new Map(lot.map((r) => [lotKey(r), fourNum(r)]))).toEqual(expLot);
}

/** S2 — 세 화면 사이: 품목별 재고의 넷 = 창고별 줄의 합 = LOT별 줄의 합(LOT 관리 품목, 성공 기준 8 · ADR 0025). LOT 관리를 끈 품목은 LOT별 재고에 없다. */
async function expectScreensAgree() {
  const items = await byItem();
  const wh = await byWarehouse();
  const lot = await byLot();
  for (const it of items) {
    const sumWh = wh.filter((r) => r.itemCode === it.itemCode).reduce((a, r) => add(a, fourNum(r)), zero());
    const sumLot = lot.filter((r) => r.itemCode === it.itemCode).reduce((a, r) => add(a, fourNum(r)), zero());
    for (const k of ["onHand", "qc", "defect", "available"] as const) {
      expect(sumWh[k], `${it.itemCode} ${k}`).toBeCloseTo(fourNum(it)[k], 6);
      expect(sumLot[k], `${it.itemCode} ${k}`).toBeCloseTo(it.lotManaged ? fourNum(it)[k] : 0, 6);
    }
  }
}

/** S2 — 수불부(모든 창고, 기간의 끝이 오늘)의 기말재고 = 품목별 재고의 실재고(성공 기준 8). */
async function expectLedgerAgrees() {
  const ledger = (await listLedger(db, parseLedgerQuery({ from: "2026-01-01", to: TODAY }, TODAY).query)).rows;
  const items = await byItem();
  for (const it of items) {
    const closing = ledger.find((l) => l.itemCode === it.itemCode)?.closing ?? "0";
    expect(num(closing), it.itemCode).toBeCloseTo(num(it.onHand), 6);
  }
}

/**
 * S2 — 불량창고 밖의 LOT별 재고의 가용재고 = 등록이 그 LOT 를 고를 때 보이는 가용 수량(성공 기준 8). LOT 관리를 끈 품목은 창고별 재고의
 * 가용재고 = 등록이 그 창고에서 보이는 가용 수량.
 */
async function expectEntryAgrees() {
  const items = await byItem();
  for (const r of await byWarehouse()) {
    if (items.find((i) => i.itemCode === r.itemCode)?.lotManaged) continue;
    const picks = await onHand(db, r.itemCode, r.warehouseCode);
    const q = picks.find((o) => o.lot === "");
    expect(r.isDefect ? 0 : num(q?.qty ?? "0"), whKey(r)).toBeCloseTo(num(r.available), 6);
  }
  const lot = await byLot();
  const pairs = new Set(lot.map((r) => `${r.itemCode}|${r.warehouseCode}`));
  for (const p of pairs) {
    const [item, wh] = p.split("|");
    const picks = new Map((await onHand(db, item, wh)).map((o) => [o.lot, num(o.qty)]));
    for (const r of lot.filter((x) => x.itemCode === item && x.warehouseCode === wh)) {
      if (r.isDefect) {
        expect(num(r.available), `${p}|${r.lot}`).toBe(0);
        continue;
      }
      expect(picks.get(r.lot) ?? 0, `${p}|${r.lot}`).toBeCloseTo(num(r.available), 6);
    }
    // 등록이 고를 수 있는 LOT 는 다 LOT별 재고에 가용으로 있다
    for (const [l, q] of picks) {
      const row = lot.find((x) => x.itemCode === item && x.warehouseCode === wh && x.lot === l);
      if (!row?.isDefect) expect(num(row?.available ?? "0"), `${p}|${l}`).toBeCloseTo(q, 6);
    }
  }
}

async function putQc(itemCode: string, warehouse: string, lot: string, qty: number, seq: number) {
  const code = `IV-20261111-${String(900 + seq)}`;
  await db.execute(sql`insert into stock_moves (code, move_date, move_type) values (${code}, ${TODAY}, 'IN')`);
  await db.execute(sql`
    insert into stock_move_lines (move_id, line_no, move_date, item_id, lot, status, to_warehouse_id, qty, entered_qty, entered_unit)
    select m.id, 1, ${TODAY}, i.id, ${lot}, 'QC', w.id, ${qty}, ${qty}, i.unit
    from stock_moves m, items i, warehouses w where m.code = ${code} and i.code = ${itemCode} and w.code = ${warehouse}`);
  await db.execute(sql`
    insert into stock_balances (item_id, warehouse_id, lot, status, qty)
    select i.id, w.id, ${lot}, 'QC', ${qty} from items i, warehouses w where i.code = ${itemCode} and w.code = ${warehouse}`);
}

const ok = async (p: Promise<MoveSaveResult>) => {
  const r = await p;
  if (!r.ok) throw new Error(`저장되지 않았다: ${JSON.stringify([r.errors, r.formError])}`);
  return r.code;
};
const save = (v: Omit<MoveValues, "moveDate">) => ok(saveMove(db, { moveDate: TODAY, ...v }, TODAY));

describe("창고별 재고(성공 기준 5)", () => {
  it("샘플 — 창고 × 품목 스물셋, 줄마다 잔액 표로 센 값과 같다", async () => {
    const got = await byWarehouse();
    expect(got).toHaveLength(23);
    await expectPlacesMatch();
  });

  it("처음은 창고 → 품목 차례", async () => {
    const keys = (await byWarehouse()).map((r) => [r.warehouseCode, r.itemCode].join("|"));
    expect(keys).toEqual([...keys].sort());
  });

  it("불량창고의 줄은 모든 수량이 불량 칸 — 검사대기 상태로 실어 간 것도", async () => {
    await putQc("RM-0003", "WH-04", "QC-1", 40, 1);
    const wh4 = await byWarehouse({ wh: "WH-04" });
    expect(wh4.map((r) => [r.itemCode, r.onHand, r.qc, r.defect, r.available, r.isDefect])).toEqual([
      ["RM-0003", "40", "0", "40", "0", true],
      ["SF-0002", "30", "0", "30", "0", true],
    ]);
    await expectPlacesMatch();
  });

  it("불량창고 밖의 검사대기는 검사대기 칸", async () => {
    await putQc("RM-0003", "WH-01", "QC-1", 1000, 1);
    expect((await byWarehouse({ wh: "WH-01", item: "RM-0003" }))[0]).toMatchObject({
      qc: "1,000",
      defect: "0",
    });
    await expectPlacesMatch();
  });

  it("수량이 0 이 된 줄은 사라진다", async () => {
    expect(await byWarehouse({ wh: "WH-02", item: "CS-0001" })).toHaveLength(1);
    await save({ moveType: "OUT", lines: [{ item: "CS-0001", warehouse: "WH-02", qty: "2" }] });
    expect(await byWarehouse({ wh: "WH-02", item: "CS-0001" })).toEqual([]);
    await expectPlacesMatch();
  });

  it("창고 · 품목 · 품목 유형으로 거른다 — 함께도", async () => {
    expect((await byWarehouse({ wh: "WH-03" })).map((r) => r.itemCode)).toEqual(["FG-0001", "FG-0002"]);
    expect((await byWarehouse({ item: "CS-0001" })).map((r) => r.warehouseCode)).toEqual(["WH-01", "WH-02"]);
    expect((await byWarehouse({ type: "CS", wh: "WH-02" })).map((r) => r.itemCode)).toEqual(["CS-0001", "CS-0002"]);
    expect(await byWarehouse({ type: "FG", wh: "WH-01" })).toEqual([]);
  });

  it.each(WAREHOUSE_STOCK_SORTS)("칸 「%s」로 세우면 같은 줄이 그 차례로 — 거꾸로도", async (sort) => {
    const asc = await byWarehouse({ sort });
    const desc = await byWarehouse({ sort, dir: "desc" });
    expect(asc).toHaveLength(23);
    expect(new Set(desc.map(whKey))).toEqual(new Set(asc.map(whKey)));
  });

  it("수량 칸은 수의 차례", async () => {
    const qs = (await byWarehouse({ sort: "onHand", dir: "desc" })).map((r) => num(r.onHand));
    expect(qs).toEqual([...qs].sort((a, b) => b - a));
  });

  it.each<[string, Record<string, string>, string]>([
    ["창고 코드 꼴이 아님", { wh: "창고1" }, "wh"],
    ["품목 코드 꼴이 아님", { item: "XX-1" }, "item"],
    ["없는 품목 유형", { type: "ZZ" }, "type"],
  ])("주소의 틀린 값은 버리고 알린다 — %s", async (_, params, field) => {
    const { query, notices } = parseWarehouseStockQuery(params);
    expect(notices.map((n) => n.field)).toEqual([field]);
    expect((await listWarehouseStock(db, query)).total).toBe(23);
  });
});

describe("LOT별 재고(성공 기준 6 · 7)", () => {
  it("샘플 — 줄마다 잔액 표로 센 값과 같다", async () => {
    await expectPlacesMatch();
  });

  it("처음은 품목 → LOT → 창고 차례", async () => {
    const keys = (await byLot()).map((r) => [r.itemCode, r.lot, r.warehouseCode].join("|"));
    expect(keys).toEqual([...keys].sort());
  });

  it("LOT 관리를 끈 품목은 LOT별 재고에 없고, 창고별 재고에 있다(ADR 0025)", async () => {
    expect(await byLot({ item: "SM-0001" })).toEqual([]);
    expect((await byWarehouse({ item: "SM-0001" })).map((r) => r.warehouseCode)).toEqual(["WH-01", "WH-02"]);
    const lotItems = new Set((await byLot()).map((r) => r.itemCode));
    for (const code of ["SM-0001", "SM-0002", "CS-0001", "CS-0002"]) expect(lotItems.has(code), code).toBe(false);
  });

  it("LOT별 재고의 줄은 모두 LOT번호가 있다", async () => {
    const got = await byLot();
    expect(got.length).toBeGreaterThan(0);
    expect(got.every((r) => r.lot !== "")).toBe(true);
  });

  it("같은 LOT 가 두 창고에 있으면 창고마다 한 줄", async () => {
    const got = await byLot({ item: "RM-0003", lot: "NW-25-0701" });
    expect(got.map((r) => r.warehouseCode)).toEqual(["WH-01", "WH-02"]);
  });

  it("한 창고 · 한 LOT 에 가용과 검사대기가 함께 있으면 한 줄에 두 칸으로", async () => {
    const [before] = await byLot({ item: "RM-0003", lot: "NW-25-0701", wh: "WH-01" });
    await putQc("RM-0003", "WH-01", "NW-25-0701", 100, 3);
    const got = await byLot({ item: "RM-0003", lot: "NW-25-0701", wh: "WH-01" });
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ qc: "100", available: before.available });
    expect(num(got[0].onHand)).toBe(num(before.onHand) + 100);
    await expectPlacesMatch();
  });

  it("다 나간 LOT 는 사라진다", async () => {
    const [row] = await byLot({ item: "RM-0003", lot: "NW-25-0702", wh: "WH-01" });
    expect(row).toBeDefined();
    await save({
      moveType: "OUT",
      lines: [{ item: "RM-0003", lot: "NW-25-0702", warehouse: "WH-01", qty: row.onHand.replace(/,/g, "") }],
    });
    expect(await byLot({ item: "RM-0003", lot: "NW-25-0702" })).toEqual([]);
    await expectPlacesMatch();
  });

  it("품목 · 창고 · LOT번호로 거른다 — LOT번호는 글자 그대로", async () => {
    expect((await byLot({ wh: "WH-04" })).map((r) => r.itemCode)).toEqual(["SF-0002"]);
    expect(await byLot({ lot: "NW-25" })).toEqual([]);
    expect((await byLot({ item: "RM-0003", wh: "WH-02" })).map((r) => r.lot)).toEqual(["NW-25-0701"]);
  });

  it("품목별 재고의 품목에서 — LOT 관리 품목은 그 품목의 LOT별 재고로(ADR 0023 의 6)", async () => {
    const sf = (await byItem()).find((r) => r.itemCode === "SF-0002")!;
    expect(sf.lotManaged).toBe(true);
    const href = itemPlacesHref(sf.itemCode, sf.lotManaged);
    expect(href).toBe("/inventory/status/lots?item=SF-0002");
    const got = await byLot(Object.fromEntries(new URL(href, "http://x").searchParams));
    expect(got.every((r) => r.itemCode === "SF-0002")).toBe(true);
    expect(got.map((r) => r.warehouseCode).sort()).toEqual(["WH-02", "WH-04"]);
  });

  it("품목별 재고의 품목에서 — LOT 관리를 끈 품목은 그 품목의 창고별 재고로(ADR 0025)", async () => {
    const sm = (await byItem()).find((r) => r.itemCode === "SM-0001")!;
    expect(sm.lotManaged).toBe(false);
    const href = itemPlacesHref(sm.itemCode, sm.lotManaged);
    expect(href).toBe("/inventory/status/warehouses?item=SM-0001");
    const got = await byWarehouse(Object.fromEntries(new URL(href, "http://x").searchParams));
    expect(got.map((r) => [r.itemCode, r.warehouseCode])).toEqual([
      ["SM-0001", "WH-01"],
      ["SM-0001", "WH-02"],
    ]);
  });

  it.each(LOT_STOCK_SORTS)("칸 「%s」로 세우면 같은 줄이 그 차례로 — 거꾸로도", async (sort) => {
    const asc = await byLot({ sort });
    const desc = await byLot({ sort, dir: "desc" });
    expect(new Set(desc.map(lotKey))).toEqual(new Set(asc.map(lotKey)));
    expect(asc.length).toBe((await byLot()).length);
  });

  it("LOT 칸으로 세우면 LOT번호의 차례", async () => {
    const lots = (await byLot({ sort: "lot" })).map((r) => r.lot);
    expect(lots).toEqual([...lots].sort());
  });

  it.each<[string, Record<string, string>, string]>([
    ["품목 코드 꼴이 아님", { item: "rm-0001" }, "item"],
    ["창고 코드 꼴이 아님", { wh: "WH-1" }, "wh"],
    ["LOT 꼴이 아님", { lot: "가나다" }, "lot"],
  ])("주소의 틀린 값은 버리고 알린다 — %s", async (_, params, field) => {
    const { query, notices } = parseLotStockQuery(params);
    expect(notices.map((n) => n.field)).toEqual([field]);
    expect((await listLotStock(db, query)).total).toBe((await byLot()).length);
  });
});

describe("수가 서로 맞는다(성공 기준 8)", () => {
  it("샘플 — 세 화면 사이 · 수불부 기말 · 등록이 고를 수 있는 가용 수량", async () => {
    await expectScreensAgree();
    await expectLedgerAgrees();
    await expectEntryAgrees();
  });

  it("검사대기 · 불량이 섞여도 맞는다", async () => {
    await putQc("RM-0003", "WH-01", "QC-1", 1000, 1);
    await putQc("RM-0001", "WH-04", "QC-2", 5, 2);
    await expectPlacesMatch();
    await expectScreensAgree();
    await expectLedgerAgrees();
    await expectEntryAgrees();
  });

  it("임의의 수불 묶음 — 이동 · 출고 · 조정 · 취소를 섞어도 맞는다", async () => {
    // 정한 씨앗의 의사 난수 — 시험이 돌 때마다 같은 묶음이다.
    let seed = 20261111;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    const places = ["WH-01", "WH-02", "WH-03"];
    const codes: string[] = [];
    for (let i = 0; i < 25; i++) {
      const lots = (await byLot()).filter((r) => !r.isDefect && num(r.available) >= 1);
      const r: LotStockRow = lots[rand(lots.length)];
      const qty = String(1 + rand(Math.max(1, Math.floor(num(r.available)))));
      const lot = r.lot || undefined;
      const kind = rand(4);
      if (kind === 0) {
        const to = [...places, "WH-04"].filter((w) => w !== r.warehouseCode)[rand(3)];
        codes.push(
          await save({
            moveType: "XFER",
            lines: [{ item: r.itemCode, lot, warehouse: r.warehouseCode, toWarehouse: to, qty }],
          }),
        );
      } else if (kind === 1) {
        codes.push(
          await save({ moveType: "OUT", lines: [{ item: r.itemCode, lot, warehouse: r.warehouseCode, qty }] }),
        );
      } else if (kind === 2) {
        codes.push(
          await save({
            moveType: "ADJ",
            reason: "FOUND",
            lines: [{ item: r.itemCode, lot, warehouse: r.warehouseCode, qty }],
          }),
        );
      } else if (codes.length > 0) {
        const c = codes.splice(rand(codes.length), 1)[0];
        const res = await cancelMove(db, c, TODAY);
        // 취소가 음수를 만들면 막힌다 — 그것도 괜찮다(재고 계산의 규칙)
        expect(typeof res.ok).toBe("boolean");
      }
    }
    await expectPlacesMatch();
    await expectScreensAgree();
    await expectLedgerAgrees();
    await expectEntryAgrees();
  });
});

describe("읽기만 한다 — 창고별 · LOT별(설계 ② 「읽기만」)", () => {
  it("읽어도 잔액이 바뀌지 않는다", async () => {
    const before = await raw();
    await byWarehouse({ sort: "defect", dir: "desc" });
    await byLot({ wh: "WH-04" });
    expect(await raw()).toEqual(before);
  });
});
