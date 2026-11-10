// @vitest-environment node
import { asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { updateCode } from "@/db/codes";
import { createItem, updateItem } from "@/db/items";
import { resetToSample } from "@/db/reset";
import {
  items,
  numberRuleSeqs,
  stockBalances,
  stockCountLines,
  stockCounts,
  stockMoveLines,
  stockMoves,
} from "@/db/schema";
import { cancelMove, getMove, moveFormOptions, saveMove } from "@/db/stock";
import {
  COUNT_LIMIT,
  cancelCount,
  confirmCount,
  getCount,
  listRecentCounts,
  openCountSheet,
  previewConfirm,
  saveCount,
  type CountSaveResult,
  type CountSheet,
} from "@/db/stock-counts";
import type { Db } from "@/db/types";
import type { CountLineValues, CountValues } from "@/lib/count-input";
import { migratedDb } from "./pglite";

// 재고 실사(조각 「재고 수불」 성공 기준 7, 설계 ⑤ 「재고 실사(PR E)」 · 「2026-11-09 — PR E 를 열기 전에 정한 것」, ADR 0015 · 0021) — PGlite 에서 실제 SQL 로.
// R1 거절 시험은 거절 뒤 실사 · 실사 줄 · 전표 · 줄 · 잔액 · LOT 일련이 거절 전과 같은지(expectRejected)를 본다.
// R2 성공 시험은 확정 뒤 잔액 표의 모든 행이 그 키의 수불 줄 합과 같은지(invariant)와 잔액 · 전표 · 실사를 본다.
// 오늘은 2026-11-09 로 묶는다 — 샘플 실사는 그 하루 앞(11-08)이다: 생산현장 확정(PI-20261108-001), 제품창고 작성 중(PI-20261108-002).

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

async function state() {
  return {
    counts: await db.select().from(stockCounts).orderBy(asc(stockCounts.id)),
    countLines: await db.select().from(stockCountLines).orderBy(asc(stockCountLines.id)),
    moves: await db.select().from(stockMoves).orderBy(asc(stockMoves.id)),
    lines: await db.select().from(stockMoveLines).orderBy(asc(stockMoveLines.id)),
    balances: await db.select().from(stockBalances).orderBy(asc(stockBalances.id)),
    seqs: await db.select().from(numberRuleSeqs).orderBy(asc(numberRuleSeqs.id)),
  };
}

/** R1 — 거절되고, 표가 거절 전과 같다. */
async function expectRejected<T extends { ok: boolean }>(run: () => Promise<T>): Promise<Extract<T, { ok: false }>> {
  const before = await state();
  const r = await run();
  expect(r.ok).toBe(false);
  expect(await state()).toEqual(before);
  return r as Extract<T, { ok: false }>;
}

/** R2 의 불변식 — 잔액 = 그 키로 든 수량 − 나간 수량. */
async function invariant() {
  const bad = rows(
    await db.execute(sql`
      with eff as (
        select item_id, to_warehouse_id as w, lot, status, qty as q from stock_move_lines where to_warehouse_id is not null
        union all
        select item_id, from_warehouse_id, lot, status, -qty from stock_move_lines where from_warehouse_id is not null
      ), s as (select item_id, w, lot, status, sum(q) as q from eff group by 1, 2, 3, 4)
      select coalesce(b.item_id, s.item_id) as item from stock_balances b full join s
        on b.item_id = s.item_id and b.warehouse_id = s.w and b.lot = s.lot and b.status = s.status
      where coalesce(b.qty, 0) <> coalesce(s.q, 0)`),
  );
  expect(bad).toEqual([]);
}

async function bal(item: string, wh: string, lot = "", status = "AVAILABLE"): Promise<number> {
  const [row] = rows<{ q: string }>(
    await db.execute(sql`
      select b.qty::text as q from stock_balances b
      join items i on i.id = b.item_id join warehouses w on w.id = b.warehouse_id
      where i.code = ${item} and w.code = ${wh} and b.lot = ${lot} and b.status = ${status}`),
  );
  return row ? Number(row.q) : 0;
}

/** 창고를 열어 그 장부 줄을 받는다. */
async function open(wh: string): Promise<CountSheet> {
  const r = await openCountSheet(db, wh);
  if (!r.ok) throw new Error(r.message);
  return r.sheet;
}

/** 열린 입력의 줄을 화면이 보내는 꼴로 — counted 는 품목 코드(또는 「품목|LOT」)마다, 나머지는 rest(장부 그대로 · 비움). */
const linesOf = (sheet: CountSheet, counted: Record<string, string> = {}, rest: "book" | "blank" = "book") =>
  sheet.lines.map((l): CountLineValues => ({
    item: l.itemCode,
    lot: l.lot,
    status: l.status,
    added: l.added ? "1" : "",
    counted: counted[`${l.itemCode}|${l.lot}`] ?? counted[l.itemCode] ?? (rest === "book" ? l.book : l.counted),
  }));

const valuesOf = (sheet: CountSheet, lines: CountLineValues[]): CountValues => ({
  code: sheet.code ?? "",
  warehouse: sheet.warehouse.code,
  baseline: String(sheet.baseline),
  version: sheet.version ?? "",
  lines,
});

const saved = async (p: Promise<CountSaveResult>) => {
  const r = await p;
  if (!r.ok) throw new Error(`저장되지 않았다: ${JSON.stringify([r.errors, r.formError])}`);
  return r;
};

/** 자재창고(WH-01)의 새 실사를 연 뒤 저장하고 확정한다 — counted 밖의 줄은 장부 그대로. */
async function countAndConfirm(wh: string, counted: Record<string, string>, added: CountLineValues[] = []) {
  const sheet = await open(wh);
  const s = await saved(saveCount(db, valuesOf(sheet, [...linesOf(sheet, counted), ...added]), TODAY));
  const r = await confirmCount(db, s.code, s.version, TODAY);
  if (!r.ok) throw new Error(`확정되지 않았다: ${JSON.stringify(r)}`);
  await invariant();
  return r;
}

describe("샘플 실사 — 성공 기준 13", () => {
  it("생산현장은 확정(금 와이어 −5 의 실사 차이), 제품창고는 작성 중(센서 IC 비움)", async () => {
    await invariant();
    const recent = await listRecentCounts(db);
    expect(recent.map((c) => [c.code, c.warehouse, c.statusName, c.moveCode])).toEqual([
      ["PI-20261108-002", "WH-03 제품창고", "작성 중", null],
      ["PI-20261108-001", "WH-02 생산현장", "확정", "IV-20261108-003"],
    ]);
    const done = (await getCount(db, "PI-20261108-001"))!;
    expect(done.lines).toBe(10);
    expect(done.lineRows.filter((l) => l.diff)).toEqual([
      expect.objectContaining({ itemCode: "RM-0003", lot: "NW-25-0701", book: "2,000", counted: "1,995", diff: "−5" }),
    ]);
    const move = (await getMove(db, "IV-20261108-003"))!;
    expect(move).toMatchObject({ moveType: "ADJ", reason: "COUNT", countCode: "PI-20261108-001" });
    expect(move.lineRows).toEqual([expect.objectContaining({ itemCode: "RM-0003", qty: "5", from: "WH-02 생산현장" })]);
    expect(await bal("RM-0003", "WH-02", "NW-25-0701")).toBe(1995);
    const draft = (await getCount(db, "PI-20261108-002"))!;
    expect(draft.lineRows.map((l) => [l.itemCode, l.counted])).toEqual([
      ["FG-0001", "2,500"],
      ["FG-0002", null],
    ]);
  });
});

describe("열기 — 창고를 고르면 작성 중 실사나 장부를 불러온 새 실사", () => {
  it("작성 중 실사가 없으면 장부(잔액이 0 보다 큰 품목 · LOT · 상태)를 줄로, 번호는 아직 없다 — 읽기만 한다", async () => {
    const before = await state();
    const sheet = await open("WH-02");
    expect(await state()).toEqual(before);
    expect(sheet).toMatchObject({ code: null, version: null, warehouse: { code: "WH-02", name: "생산현장" } });
    expect(sheet.lines).toHaveLength(10);
    expect(sheet.lines.find((l) => l.itemCode === "RM-0003")).toMatchObject({
      lot: "NW-25-0701",
      book: "1,995",
      counted: "",
      added: false,
      status: "AVAILABLE",
    });
    const [{ max }] = rows<{ max: number }>(await db.execute(sql`select max(id)::int as max from stock_move_lines`));
    expect(sheet.baseline).toBe(max);
  });

  it("작성 중 실사가 있으면 그 줄과 지금의 장부를 연다", async () => {
    const sheet = await open("WH-03");
    expect(sheet).toMatchObject({ code: "PI-20261108-002", countDate: "2026-11-08" });
    expect(sheet.version).toMatch(/^[0-9]+$/);
    expect(sheet.lines.map((l) => [l.itemCode, l.book, l.counted])).toEqual([
      ["FG-0001", "2,500", "2,500"],
      ["FG-0002", "1,500", ""],
    ]);
  });

  it("없는 창고 · 「사용 안 함」 창고는 열지 않는다", async () => {
    expect(await openCountSheet(db, "WH-99")).toMatchObject({
      ok: false,
      message: expect.stringContaining("없는 창고"),
    });
    expect(await openCountSheet(db, "틀린")).toMatchObject({ ok: false });
    await db.execute(sql`update warehouses set active = false where code = 'WH-02'`);
    expect(await openCountSheet(db, "WH-02")).toMatchObject({
      ok: false,
      message: expect.stringContaining("사용 안 함"),
    });
  });

  it("장부 줄이 100줄을 넘는 창고는 열지 않는다(저자 판정 — 실사 한 건은 100줄)", async () => {
    const lines = Array.from({ length: 95 }, (_, i) => ({
      item: "RM-0003",
      lot: `C-${i}`,
      warehouse: "WH-02",
      qty: "1",
    }));
    const r = await saveMove(db, { moveDate: TODAY, moveType: "IN", lines }, TODAY);
    expect(r.ok).toBe(true);
    // 생산현장 10 + 95 = 105줄
    expect(await openCountSheet(db, "WH-02")).toMatchObject({
      ok: false,
      message: expect.stringContaining("105줄이라 실사를 열지 못합니다"),
    });
  });
});

describe("저장(작성 중)", () => {
  it("처음 저장하면 번호(PI-<오늘>-NNN)가 붙고 작성 중이다 — 실물 수량은 비워도 된다", async () => {
    const sheet = await open("WH-01");
    const r = await saved(saveCount(db, valuesOf(sheet, linesOf(sheet, { "RM-0001": "100" }, "blank")), TODAY));
    expect(r.code).toBe("PI-20261109-001");
    const [c] = await db.select().from(stockCounts).where(eq(stockCounts.code, r.code));
    expect(c).toMatchObject({ status: "DRAFT", countDate: TODAY, baselineLineId: sheet.baseline, confirmedDate: null });
    const reopened = await open("WH-01");
    expect(reopened.code).toBe(r.code);
    expect(reopened.lines.filter((l) => l.counted !== "").map((l) => [l.itemCode, l.counted])).toEqual([
      ["RM-0001", "100"],
    ]);
  });

  it("작성 중 실사를 다시 저장하면 줄을 통째로 바꾼다 — 버전이 다르면 거절한다", async () => {
    const sheet = await open("WH-03");
    const r = await saved(saveCount(db, valuesOf(sheet, linesOf(sheet, { "FG-0002": "1500" })), TODAY));
    expect(r.code).toBe("PI-20261108-002");
    expect(r.version).not.toBe(sheet.version);
    expect((await open("WH-03")).lines.map((l) => l.counted)).toEqual(["2,500", "1,500"]);
    // 앞 버전으로 다시 저장 — 다른 사람이 먼저 저장한 것
    const stale = await expectRejected(() => saveCount(db, valuesOf(sheet, linesOf(sheet)), TODAY));
    expect(stale.formError).toContain("다른 사람이 먼저 고쳤습니다");
  });

  it("창고 하나에 작성 중인 실사는 하나다 — 번호 없이 다시 열어 저장하면 거절한다(DB 도 막는다)", async () => {
    const sheet = await open("WH-01");
    await saved(saveCount(db, valuesOf(sheet, linesOf(sheet)), TODAY));
    const twice = await expectRejected(() => saveCount(db, valuesOf(sheet, linesOf(sheet)), TODAY));
    expect(twice.formError).toContain("작성 중인 실사 PI-20261109-001");
    const wh = rows<{ id: number }>(await db.execute(sql`select id from warehouses where code = 'WH-01'`))[0].id;
    await expect(
      db.insert(stockCounts).values({ code: "PI-20261109-099", countDate: TODAY, warehouseId: wh }),
    ).rejects.toThrow();
  });

  it.each([
    ["EA 에 소수", { item: "RM-0001", lot: "NEW-1", counted: "0.5", added: "1" }, "counted", "EA는 정수로"],
    ["음수", { item: "RM-0001", lot: "NEW-1", counted: "-1", added: "1" }, "counted", "0 이상"],
    ["+ 를 붙임", { item: "RM-0001", lot: "NEW-1", counted: "+1", added: "1" }, "counted", "0 이상"],
    ["없는 품목", { item: "RM-9999", lot: "X", counted: "1", added: "1" }, "item", "없는 품목"],
    ["사 오는 품목을 LOT 없이 더함", { item: "RM-0003", lot: "", counted: "1", added: "1" }, "lot", "LOT 를 넣어"],
    ["LOT 를 끈 품목에 LOT", { item: "SM-0001", lot: "X-1", counted: "1", added: "1" }, "lot", "LOT 를 비우세요"],
    ["장부에 없는 검사대기 줄", { item: "RM-0003", lot: "Q-1", status: "QC", counted: "1" }, "row", "검사대기"],
  ])("거절 — %s", async (_, line, field, message) => {
    const sheet = await open("WH-01");
    const r = await expectRejected(() =>
      saveCount(db, valuesOf(sheet, [...linesOf(sheet), line as CountLineValues]), TODAY),
    );
    const errors = Object.values(r.errors.lines);
    expect(errors).toHaveLength(1);
    expect(errors[0][field as "item"]).toContain(message);
  });

  it("「사용 안 함」 품목은 더하지 못하고, 장부에서 불려 온 줄은 그대로 저장된다", async () => {
    await db.update(items).set({ active: false }).where(eq(items.code, "CS-0001"));
    const sheet = await open("WH-01");
    expect(sheet.lines.some((l) => l.itemCode === "CS-0001")).toBe(true);
    await saved(saveCount(db, valuesOf(sheet, linesOf(sheet)), TODAY));
    const sheet2 = await open("WH-02");
    const r = await expectRejected(() =>
      saveCount(
        db,
        valuesOf(sheet2, [
          ...linesOf(sheet2).filter((l) => l.item !== "CS-0001"),
          { item: "CS-0001", counted: "1", added: "1" },
        ]),
        TODAY,
      ),
    );
    expect(Object.values(r.errors.lines)[0].item).toContain("사용 안 함");
  });

  it("더한 줄은 상태를 보내도 늘 가용이다(저자 판정)", async () => {
    const sheet = await open("WH-01");
    const r = await saved(
      saveCount(
        db,
        valuesOf(sheet, [...linesOf(sheet), { item: "SF-0001", lot: "", status: "QC", counted: "3", added: "1" }]),
        TODAY,
      ),
    );
    const view = (await getCount(db, r.code))!;
    expect(view.lineRows.at(-1)).toMatchObject({ itemCode: "SF-0001", status: "AVAILABLE", added: true });
  });

  it("같은 품목 · LOT 의 줄이 둘이면 거절한다", async () => {
    const sheet = await open("WH-01");
    const dup = linesOf(sheet)[0];
    const r = await expectRejected(() =>
      saveCount(db, valuesOf(sheet, [...linesOf(sheet), { ...dup, added: "1" }]), TODAY),
    );
    expect(Object.values(r.errors.lines)[0].row).toContain("같은 품목");
  });

  it("줄은 1 ~ 100줄이다", async () => {
    const sheet = await open("WH-04");
    expect((await expectRejected(() => saveCount(db, valuesOf(sheet, []), TODAY))).formError).toContain("하나 이상");
    const many = Array.from({ length: 101 }, (_, i) => ({ item: "RM-0003", lot: `L-${i}`, counted: "1", added: "1" }));
    expect((await expectRejected(() => saveCount(db, valuesOf(sheet, many), TODAY))).formError).toContain("100줄까지");
  });

  it("실사는 500개까지 등록된다", async () => {
    await db.execute(sql`
      insert into stock_counts (code, count_date, warehouse_id, status)
      select 'PI-20260101-' || lpad(g::text, 3, '0'), '2026-01-01', (select id from warehouses where code = 'WH-01'), 'CANCELED'
      from generate_series(1, ${COUNT_LIMIT - 2}) g`);
    const sheet = await open("WH-01");
    const r = await expectRejected(() => saveCount(db, valuesOf(sheet, linesOf(sheet)), TODAY));
    expect(r.formError).toContain("500개까지");
  });
});

describe("취소 — 작성 중 실사를 「취소」로 남긴다(저자 판정)", () => {
  it("작성 중은 취소되고, 그 창고에 새 실사를 열 수 있다. 수불은 바뀌지 않는다", async () => {
    const before = await state();
    expect(await cancelCount(db, "PI-20261108-002")).toEqual({ ok: true, code: "PI-20261108-002" });
    const after = await state();
    expect(after.moves).toEqual(before.moves);
    expect(after.balances).toEqual(before.balances);
    expect((await getCount(db, "PI-20261108-002"))!.statusName).toBe("취소");
    expect((await open("WH-03")).code).toBeNull();
  });

  it("확정한 실사 · 취소한 실사 · 없는 번호는 취소하지 못한다", async () => {
    expect(await expectRejected(() => cancelCount(db, "PI-20261108-001"))).toMatchObject({
      formError: expect.stringContaining("조정 전표를 취소하세요"),
    });
    await cancelCount(db, "PI-20261108-002");
    expect(await expectRejected(() => cancelCount(db, "PI-20261108-002"))).toMatchObject({
      formError: "이미 취소한 실사입니다",
    });
    expect(await cancelCount(db, "PI-20990101-001")).toEqual({ ok: false, notFound: true });
    expect(await cancelCount(db, "IV-20261108-001")).toEqual({ ok: false, notFound: true });
  });

  it("취소한 실사는 저장 · 확정하지 못한다", async () => {
    const sheet = await open("WH-03");
    await cancelCount(db, "PI-20261108-002");
    expect((await expectRejected(() => saveCount(db, valuesOf(sheet, linesOf(sheet)), TODAY))).formError).toContain(
      "이미 취소한 실사",
    );
    expect(await expectRejected(() => confirmCount(db, "PI-20261108-002", sheet.version!, TODAY))).toMatchObject({
      formError: expect.stringContaining("이미 취소한"),
    });
  });
});

describe("확정 — 확정하는 순간의 장부와의 차이가 「실사 차이」 조정 전표 하나로(성공 기준 7)", () => {
  it("차이만큼 조정이 생기고 잔액이 실물이 된다 — 늘림은 들고, 줄임은 나간다", async () => {
    const r = await countAndConfirm("WH-01", { "RM-0001": "70", "SM-0002": "830" });
    expect(r.moveCode).toBe("IV-20261109-001");
    expect(await bal("RM-0001", "WH-01", "MW-A1021")).toBe(70);
    expect(await bal("SM-0002", "WH-01")).toBe(830);
    const move = (await getMove(db, r.moveCode!))!;
    expect(move).toMatchObject({
      moveType: "ADJ",
      reason: "COUNT",
      moveDate: TODAY,
      note: `${r.code} 실사 차이`,
      countCode: r.code,
    });
    expect(move.lineRows.map((l) => [l.itemCode, l.qty, l.from, l.to])).toEqual([
      ["RM-0001", "5", "WH-01 자재창고", null],
      ["SM-0002", "10", null, "WH-01 자재창고"],
    ]);
    const view = (await getCount(db, r.code))!;
    expect(view).toMatchObject({ statusName: "확정", confirmedDate: TODAY, moveCode: r.moveCode });
    expect(view.lineRows.filter((l) => l.diff).map((l) => [l.itemCode, l.book, l.counted, l.diff])).toEqual([
      ["RM-0001", "75", "70", "−5"],
      ["SM-0002", "820", "830", "+10"],
    ]);
  });

  it("차이가 없으면 전표 없이 확정만 된다", async () => {
    const before = await state();
    const r = await countAndConfirm("WH-04", {});
    expect(r.moveCode).toBeNull();
    const after = await state();
    expect(after.moves).toEqual(before.moves);
    expect(after.balances).toEqual(before.balances);
    expect((await getCount(db, r.code))!.statusName).toBe("확정");
  });

  it("실물 수량을 비운 줄이 있으면 확정하지 않는다(저자 판정) — 비운 줄의 번호를 보인다", async () => {
    const sheet = await open("WH-03");
    const r = await expectRejected(() => confirmCount(db, sheet.code!, sheet.version!, TODAY));
    expect(r).toMatchObject({ formError: expect.stringContaining("비운 줄이 1개") });
    expect((r as { formError: string }).formError).toContain("줄 2");
  });

  it("실사를 연 뒤 나간 것이 있으면 확정 순간의 장부와 견준다 — 조정 뒤 잔액은 실물이고 0 밑으로 가지 않는다", async () => {
    const sheet = await open("WH-01");
    const s = await saved(saveCount(db, valuesOf(sheet, linesOf(sheet, { "RM-0001": "75" })), TODAY));
    // 실사를 연 뒤 웨이퍼 60 이 나갔다 — 장부는 15, 실물로 센 것은 75
    expect(
      (
        await saveMove(
          db,
          {
            moveDate: TODAY,
            moveType: "OUT",
            lines: [{ item: "RM-0001", lot: "MW-A1021", warehouse: "WH-01", qty: "60" }],
          },
          TODAY,
        )
      ).ok,
    ).toBe(true);
    const preview = await previewConfirm(db, s.code);
    expect(preview).toMatchObject({ movesAfter: ["IV-20261109-001"], blanks: [] });
    expect((preview as { diffs: unknown[] }).diffs).toEqual([
      expect.objectContaining({ itemCode: "RM-0001", book: "15", counted: "75", diff: "+60" }),
    ]);
    const r = await confirmCount(db, s.code, s.version, TODAY);
    expect(r.ok).toBe(true);
    await invariant();
    expect(await bal("RM-0001", "WH-01", "MW-A1021")).toBe(75);
  });

  it("장부가 실물보다 많은 채 그 사이 다 나가도(장부 0) 조정은 0 밑으로 가지 않는다 — 실물 0 이면 전표가 없다", async () => {
    const sheet = await open("WH-04");
    const s = await saved(saveCount(db, valuesOf(sheet, linesOf(sheet, { "SF-0002": "0" })), TODAY));
    // 불량창고 안의 줄이는 조정으로 30 을 다 뺀다
    expect(
      (
        await saveMove(
          db,
          {
            moveDate: TODAY,
            moveType: "ADJ",
            reason: "LOSS",
            lines: [{ item: "SF-0002", lot: "SF-261102-002", warehouse: "WH-04", qty: "-30" }],
          },
          TODAY,
        )
      ).ok,
    ).toBe(true);
    const r = await confirmCount(db, s.code, s.version, TODAY);
    expect(r).toMatchObject({ ok: true, moveCode: null });
    expect(await bal("SF-0002", "WH-04", "SF-261102-002")).toBe(0);
  });

  it("실사 줄 밖의 재고는 손대지 않고, 확정 화면에 경고로 보인다(저자 판정)", async () => {
    const sheet = await open("WH-04");
    const s = await saved(saveCount(db, valuesOf(sheet, linesOf(sheet, { "SF-0002": "28" })), TODAY));
    // 실사를 연 뒤 다른 LOT 가 불량창고로 격리됐다
    expect(
      (
        await saveMove(
          db,
          {
            moveDate: TODAY,
            moveType: "XFER",
            lines: [{ item: "SF-0001", lot: "SF-261102-001", warehouse: "WH-02", toWarehouse: "WH-04", qty: "7" }],
          },
          TODAY,
        )
      ).ok,
    ).toBe(true);
    const preview = await previewConfirm(db, s.code);
    expect(preview).toMatchObject({
      outside: [{ itemCode: "SF-0001", lot: "SF-261102-001", qty: "7", status: "AVAILABLE" }],
      movesAfter: ["IV-20261109-001"],
    });
    await confirmCount(db, s.code, s.version, TODAY);
    await invariant();
    expect(await bal("SF-0001", "WH-04", "SF-261102-001")).toBe(7);
    expect(await bal("SF-0002", "WH-04", "SF-261102-002")).toBe(28);
  });

  it("장부에 없어 더한 줄 — 사 오는 품목은 넣은 LOT 로, 만드는 품목은 LOT 를 비우면 번호 규칙으로 받는다", async () => {
    const r = await countAndConfirm("WH-01", {}, [
      { item: "RM-0003", lot: "FOUND-1", counted: "12", added: "1" },
      { item: "FG-0001", lot: "", counted: "4", added: "1" },
    ]);
    expect(await bal("RM-0003", "WH-01", "FOUND-1")).toBe(12);
    const move = (await getMove(db, r.moveCode!))!;
    const fg = move.lineRows.find((l) => l.itemCode === "FG-0001")!;
    expect(fg.lot).toBe("FG-261109-001");
    expect(await bal("FG-0001", "WH-01", "FG-261109-001")).toBe(4);
    const view = (await getCount(db, r.code))!;
    expect(view.lineRows.find((l) => l.itemCode === "FG-0001")).toMatchObject({ lot: "FG-261109-001", added: true });
  });

  it("검사대기 줄은 그 상태로 맞춘다", async () => {
    // 검사대기는 뒤 조각(구매 · 품질)이 만든다 — 시험이 수불 줄과 잔액을 직접 넣는다.
    await db.execute(
      sql`insert into stock_moves (code, move_date, move_type) values ('IV-20261109-090', ${TODAY}, 'IN')`,
    );
    await db.execute(sql`
      insert into stock_move_lines (move_id, line_no, move_date, item_id, lot, status, to_warehouse_id, qty, entered_qty, entered_unit)
      select m.id, 1, ${TODAY}, i.id, 'QC-1', 'QC', w.id, 10, 10, 'M'
      from stock_moves m, items i, warehouses w where m.code = 'IV-20261109-090' and i.code = 'RM-0003' and w.code = 'WH-01'`);
    await db.execute(sql`
      insert into stock_balances (item_id, warehouse_id, lot, status, qty)
      select i.id, w.id, 'QC-1', 'QC', 10 from items i, warehouses w where i.code = 'RM-0003' and w.code = 'WH-01'`);
    const sheet = await open("WH-01");
    expect(sheet.lines.find((l) => l.lot === "QC-1")).toMatchObject({ status: "QC", book: "10" });
    await countAndConfirm("WH-01", { "RM-0003|QC-1": "8" });
    expect(await bal("RM-0003", "WH-01", "QC-1", "QC")).toBe(8);
  });

  it("두 번 확정 · 버전이 다른 확정 · 없는 번호는 거절한다. 확정한 실사는 고치지 못한다", async () => {
    const sheet = await open("WH-04");
    const s = await saved(saveCount(db, valuesOf(sheet, linesOf(sheet, { "SF-0002": "29" })), TODAY));
    expect(await expectRejected(() => confirmCount(db, s.code, sheet.version ?? "0", TODAY))).toMatchObject({
      formError: expect.stringContaining("다른 사람이 먼저"),
    });
    expect((await confirmCount(db, s.code, s.version, TODAY)).ok).toBe(true);
    expect(await expectRejected(() => confirmCount(db, s.code, s.version, TODAY))).toMatchObject({
      formError: expect.stringContaining("이미 확정한"),
    });
    const again = { ...valuesOf(sheet, linesOf(sheet)), code: s.code, version: s.version };
    expect((await expectRejected(() => saveCount(db, again, TODAY))).formError).toContain("이미 확정한");
    expect(await confirmCount(db, "PI-20990101-001", "1", TODAY)).toEqual({ ok: false, notFound: true });
  });

  it("두 확정이 동시에 와도 하나만 확정된다", async () => {
    const sheet = await open("WH-04");
    const s = await saved(saveCount(db, valuesOf(sheet, linesOf(sheet, { "SF-0002": "20" })), TODAY));
    const both = await Promise.all([
      confirmCount(db, s.code, s.version, TODAY),
      confirmCount(db, s.code, s.version, TODAY),
    ]);
    expect(both.filter((r) => r.ok)).toHaveLength(1);
    await invariant();
    expect(await bal("SF-0002", "WH-04", "SF-261102-002")).toBe(20);
  });

  it("확정한 실사를 바로잡으려면 그 조정 전표를 취소한다 — 실사는 확정 그대로다", async () => {
    const c = await cancelMove(db, "IV-20261108-003", TODAY);
    expect(c.ok).toBe(true);
    await invariant();
    expect(await bal("RM-0003", "WH-02", "NW-25-0701")).toBe(2000);
    expect((await getCount(db, "PI-20261108-001"))!.statusName).toBe("확정");
  });

  it("수불 전표 상한에 닿으면 확정하지 않는다", async () => {
    const sheet = await open("WH-04");
    const s = await saved(saveCount(db, valuesOf(sheet, linesOf(sheet, { "SF-0002": "10" })), TODAY));
    await db.execute(sql`
      insert into stock_moves (code, move_date, move_type)
      select 'IV-20260101-' || lpad(g::text, 4, '0'), '2026-01-01', 'IN' from generate_series(1, 5000 - 11) g`);
    expect(await expectRejected(() => confirmCount(db, s.code, s.version, TODAY))).toMatchObject({
      formError: expect.stringContaining("수불 전표는 5,000개까지"),
    });
  });
});

describe("작성 중 실사의 수량을 기준정보의 고침이 지킨다(PR E 리뷰 1회차)", () => {
  const base = {
    procurement: "BUY",
    name: "솔더 볼",
    leadTimeDays: "0",
    safetyStock: "0",
    minLot: "0",
    lotMultiple: "0",
  };

  it("작성 중 실사에 든 품목은 단위 · LOT 관리를 바꾸지 못하고, 실사를 취소하면 바꾼다", async () => {
    // 수불이 없는 새 품목을 자재창고 실사에 더한다
    expect(await createItem(db, { ...base, itemType: "RM", unit: "EA", lotManaged: "on" })).toMatchObject({
      code: "RM-0007",
    });
    const sheet = await open("WH-01");
    const s = await saved(
      saveCount(
        db,
        valuesOf(sheet, [...linesOf(sheet), { item: "RM-0007", lot: "N-1", counted: "3", added: "1" }]),
        TODAY,
      ),
    );
    expect(await updateItem(db, "RM-0007", { ...base, unit: "KG", lotManaged: "on", active: "Y" })).toMatchObject({
      ok: false,
      errors: { unit: expect.stringContaining("작성 중인 실사에 든 품목") },
    });
    expect(await updateItem(db, "RM-0007", { ...base, unit: "EA", lotManaged: "off", active: "Y" })).toMatchObject({
      ok: false,
      errors: { lotManaged: expect.stringContaining("작성 중인 실사에 든 품목") },
    });
    await cancelCount(db, s.code);
    expect(await updateItem(db, "RM-0007", { ...base, unit: "KG", lotManaged: "off", active: "Y" })).toEqual({
      ok: true,
      code: "RM-0007",
    });
  });

  it("작성 중 실사의 실물 수량이 맞지 않으면 단위의 자릿수를 줄이지 못한다", async () => {
    const decimals = (d: string) =>
      updateCode(db, "UNIT", "M", { name: "미터", sortOrder: "20", active: "Y", decimals: d });
    const sheet = await open("WH-01");
    const s = await saved(saveCount(db, valuesOf(sheet, linesOf(sheet, { "RM-0003|NW-25-0701": "5999.5" })), TODAY));
    expect(await decimals("0")).toMatchObject({
      ok: false,
      errors: { decimals: expect.stringContaining("작성 중 실사의 실물 수량") },
    });
    expect(await decimals("1")).toEqual({ ok: true, code: "M" });
    await cancelCount(db, s.code);
    expect(await decimals("0")).toEqual({ ok: true, code: "M" }); // 취소한 실사는 세지 않는다
  });
});

describe("확정의 LOT 저절로 — 실사의 다른 줄이 쓴 LOT 는 건너뛴다(PR E 리뷰 1회차)", () => {
  it("차이 없는 줄이 다음 번호를 들고 있어도 비운 LOT 는 그 다음 번호를 받는다", async () => {
    const r = await countAndConfirm("WH-01", {}, [
      { item: "FG-0001", lot: "", counted: "4", added: "1" },
      { item: "FG-0001", lot: "FG-261109-001", counted: "0", added: "1" },
    ]);
    const move = (await getMove(db, r.moveCode!))!;
    expect(move.lineRows.map((l) => [l.itemCode, l.lot, l.qty])).toEqual([["FG-0001", "FG-261109-002", "4"]]);
    const view = (await getCount(db, r.code))!;
    expect(view.lineRows.filter((l) => l.itemCode === "FG-0001").map((l) => l.lot)).toEqual([
      "FG-261109-002",
      "FG-261109-001",
    ]);
  });
});

describe("「실사 차이」는 실사 확정만 쓴다(저자 판정)", () => {
  it("재고조정 등록의 사유 목록에 없고, 손으로 넣으면 거절한다", async () => {
    expect((await moveFormOptions(db)).reasons.map((r) => r.code)).toEqual(["DAMAGE", "LOSS", "FOUND", "ETC"]);
    const before = await state();
    const r = await saveMove(
      db,
      {
        moveDate: TODAY,
        moveType: "ADJ",
        reason: "COUNT",
        lines: [{ item: "SM-0002", warehouse: "WH-01", qty: "1" }],
      },
      TODAY,
    );
    expect(r).toMatchObject({
      ok: false,
      errors: { header: { reason: expect.stringContaining("재고 실사의 확정만") } },
    });
    expect(await state()).toEqual(before);
  });
});

describe("확정 화면", () => {
  it("비운 줄을 보이고, 연 뒤의 수불이 없으면 경고가 없다", async () => {
    const preview = await previewConfirm(db, "PI-20261108-002");
    expect(preview).toMatchObject({
      code: "PI-20261108-002",
      warehouse: { code: "WH-03" },
      blanks: [{ lineNo: 2, itemCode: "FG-0002" }],
      diffs: [],
      movesAfter: [],
      outside: [],
    });
  });

  it("확정 · 취소한 실사, 없는 번호", async () => {
    expect(await previewConfirm(db, "PI-20261108-001")).toEqual({ formError: "이미 확정한 실사입니다" });
    expect(await previewConfirm(db, "PI-20990101-001")).toEqual({ notFound: true });
  });
});
