// @vitest-environment node
import { asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { updateCode } from "@/db/codes";
import { createItem, updateItem } from "@/db/items";
import { daysBefore, resetToSample } from "@/db/reset";
import { SAMPLE_ITEMS } from "@/db/sample";
import { codes, items, numberRuleSeqs, stockBalances, stockMoveLines, stockMoves, warehouses } from "@/db/schema";
import {
  MOVE_LIMIT,
  MOVE_LINE_LIMIT,
  cancelMove,
  getMove,
  listRecentMoves,
  onHand,
  saveMove,
  type MoveSaveResult,
} from "@/db/stock";
import type { Db } from "@/db/types";
import { createWarehouse, updateWarehouse } from "@/db/warehouses";
import type { MoveLineValues, MoveValues } from "@/lib/move-input";
import { migratedDb, rejection } from "./pglite";

// 재고 계산(조각 「재고 수불」 설계 ② · ③ · ⑤ 「재고 계산의 시험 규칙」, ADR 0015 · 0016 · 0017 · 0018) — PGlite 에서 실제 SQL 로.
// R1 거절 시험은 거절 뒤 전표 · 줄 · 잔액 표 전체 · LOT 일련이 거절 전과 같은지(expectRejected)와 거절한 줄 · 칸 · 모자란 수량을 본다.
// R2 성공 시험은 저장 뒤 잔액 표의 모든 행이 그 키의 수불 줄 합과 같은지(invariant)와 잔액 · 줄 · 번호를 본다.
// R3 보장마다 · 칸마다 맞는 꼴 하나와 틀린 꼴 하나 이상. R4 변조본은 PR 본문이 든다.
// 오늘은 2026-11-09 로 묶는다 — 샘플 수불은 그 7일 앞(11-02)부터다.

const TODAY = "2026-11-09";
let handle: Awaited<ReturnType<typeof migratedDb>>;
let db: Db;
beforeAll(async () => {
  handle = await migratedDb();
  db = handle.db;
});
afterAll(() => handle.close());
beforeEach(() => resetToSample(db, TODAY));

type Lines = MoveLineValues[];
const save = (v: Partial<MoveValues> & { lines: Lines }, today = TODAY) =>
  saveMove(db, { moveDate: TODAY, moveType: "IN", ...v }, today);
const ok = async (p: Promise<MoveSaveResult>) => {
  const r = await p;
  if (!r.ok) throw new Error(`저장되지 않았다: ${JSON.stringify([r.errors, r.formError])}`);
  await invariant();
  return r.code;
};
const rows = <T>(result: unknown) => (result as { rows: T[] }).rows;

/** 거절 전 · 뒤를 견줄 것 — 전표 · 줄 · 잔액 표 전체 · LOT 일련. */
async function state() {
  return {
    moves: await db.select().from(stockMoves).orderBy(asc(stockMoves.id)),
    lines: await db.select().from(stockMoveLines).orderBy(asc(stockMoveLines.id)),
    balances: await db.select().from(stockBalances).orderBy(asc(stockBalances.id)),
    seqs: await db.select().from(numberRuleSeqs).orderBy(asc(numberRuleSeqs.id)),
  };
}

/** R1 — 거절되고, 표가 거절 전과 같다. 거절한 결과를 돌려준다. */
async function expectRejected<T extends { ok: boolean }>(run: () => Promise<T>): Promise<Extract<T, { ok: false }>> {
  const before = await state();
  const r = await run();
  expect(r.ok).toBe(false);
  expect(await state()).toEqual(before);
  return r as Extract<T, { ok: false }>;
}

/** R2 의 불변식 — 잔액 = 그 키(품목 · 창고 · LOT · 상태)로 든 수량 − 나간 수량. 어긋난 키가 없다. */
async function invariant() {
  const bad = rows(
    await db.execute(sql`
      with eff as (
        select item_id, to_warehouse_id as w, lot, status, qty as q from stock_move_lines where to_warehouse_id is not null
        union all
        select item_id, from_warehouse_id, lot, status, -qty from stock_move_lines where from_warehouse_id is not null
      ), s as (select item_id, w, lot, status, sum(q) as q from eff group by 1, 2, 3, 4)
      select coalesce(b.item_id, s.item_id) as item, b.qty::text as balance, s.q::text as lines
      from stock_balances b full join s
        on b.item_id = s.item_id and b.warehouse_id = s.w and b.lot = s.lot and b.status = s.status
      where coalesce(b.qty, 0) <> coalesce(s.q, 0)`),
  );
  expect(bad).toEqual([]);
}

/** 잔액 하나(품목 · 창고 · LOT) — 없으면 0. */
async function bal(item: string, wh: string, lot = ""): Promise<number> {
  const [row] = rows<{ q: string }>(
    await db.execute(sql`
      select b.qty::text as q from stock_balances b
      join items i on i.id = b.item_id join warehouses w on w.id = b.warehouse_id
      where i.code = ${item} and w.code = ${wh} and b.lot = ${lot} and b.status = 'AVAILABLE'`),
  );
  return row ? Number(row.q) : 0;
}

const linesOf = async (code: string) =>
  db
    .select()
    .from(stockMoveLines)
    .innerJoin(stockMoves, eq(stockMoves.id, stockMoveLines.moveId))
    .where(eq(stockMoves.code, code))
    .orderBy(asc(stockMoveLines.lineNo))
    .then((r) => r.map((x) => x.stock_move_lines));

// 금 와이어(RM-0003, M · 소수 셋) 자재창고(WH-01)의 새 LOT 로 시험한다 — 샘플과 섞이지 않게.
const wire = (qty: string, over: MoveLineValues = {}): MoveLineValues => ({
  item: "RM-0003",
  lot: "T-1",
  warehouse: "WH-01",
  qty,
  ...over,
});

describe("샘플 수불 — 성공 기준 13", () => {
  it("품목마다 기초 재고가 있고 이동 · 출고 · 조정 · 불량창고 격리 · 취소가 있다. 잔액은 줄의 합이다", async () => {
    await invariant();
    const moves = await db.select().from(stockMoves);
    expect(moves).toHaveLength(10);
    expect(new Set(moves.map((m) => m.moveType))).toEqual(new Set(["IN", "OUT", "XFER", "ADJ"]));
    expect(moves.filter((m) => m.isCancel)).toHaveLength(1);
    expect(moves.every((m) => m.moveDate < TODAY)).toBe(true);
    const moved = rows<{ code: string }>(
      await db.execute(sql`select distinct i.code from stock_move_lines l join items i on i.id = l.item_id`),
    );
    expect(moved.map((r) => r.code).sort()).toEqual(SAMPLE_ITEMS.map((i) => i.code).sort());
    expect(await bal("SF-0002", "WH-04", "SF-261102-002")).toBe(30);
  });

  it("날짜는 되돌린 날에서 센다 — 오늘 첫 전표는 001", async () => {
    await resetToSample(db, "2027-01-03");
    const dates = (await db.select().from(stockMoves)).map((m) => m.moveDate);
    expect(dates[0]).toBe("2026-12-27");
    expect(daysBefore("2027-03-01", 1)).toBe("2027-02-28");
    expect(await ok(save({ moveDate: "2027-01-03", lines: [wire("1")] }, "2027-01-03"))).toBe("IV-20270103-001");
  });
});

describe("수불 저장 — 성공 기준 2 · 3 · 12", () => {
  it("입고 · 출고 · 이동 · 조정이 잔액과 줄을 남기고 번호가 날짜마다 차례로 붙는다", async () => {
    expect(await ok(save({ lines: [wire("500")] }))).toBe("IV-20261109-001");
    expect(await bal("RM-0003", "WH-01", "T-1")).toBe(500);
    await ok(save({ moveType: "XFER", lines: [wire("200", { toWarehouse: "WH-02" })] }));
    expect([await bal("RM-0003", "WH-01", "T-1"), await bal("RM-0003", "WH-02", "T-1")]).toEqual([300, 200]);
    await ok(save({ moveType: "OUT", lines: [wire("50", { warehouse: "WH-02" })] }));
    const adj = await ok(save({ moveType: "ADJ", reason: "LOSS", lines: [wire("-10")] }));
    expect(adj).toBe("IV-20261109-004");
    await ok(save({ moveType: "ADJ", reason: "FOUND", lines: [wire("+3")] }));
    expect([await bal("RM-0003", "WH-01", "T-1"), await bal("RM-0003", "WH-02", "T-1")]).toEqual([293, 150]);
    // 지난 날짜는 그 날짜의 번호
    expect(await ok(save({ moveDate: "2026-11-05", lines: [wire("1", { lot: "T-2" })] }))).toBe("IV-20261105-002");
    const [line] = await linesOf(adj);
    expect(line).toMatchObject({ qty: 10, fromWarehouseId: expect.any(Number), toWarehouseId: null, enteredUnit: "M" });
  });

  it("한 전표에 여러 줄 — 100줄까지", async () => {
    const lines = Array.from({ length: 100 }, (_, i) => wire("1", { lot: `L-${i}` }));
    const code = await ok(save({ lines }));
    expect(await linesOf(code)).toHaveLength(100);
  });

  it("빈 줄은 없는 줄로 친다", async () => {
    const code = await ok(save({ lines: [{}, wire("5"), { item: " ", qty: "" }] }));
    expect(await linesOf(code)).toHaveLength(1);
  });

  it.each([
    ["빈 일자", { moveDate: "" }, "moveDate"],
    ["달력에 없는 날", { moveDate: "2026-02-30" }, "moveDate"],
    ["꼴이 틀림", { moveDate: "2026/11/09" }, "moveDate"],
    ["미래 일자", { moveDate: "2026-11-10" }, "moveDate"],
    ["없는 유형", { moveType: "PURCHASE" }, "moveType"],
    ["조정의 사유 없음", { moveType: "ADJ", lines: [wire("1")] }, "reason"],
    ["입고에 사유", { reason: "ETC" }, "reason"],
    ["없는 사유", { moveType: "ADJ", reason: "NOPE", lines: [wire("1")] }, "reason"],
    ["비고 201자", { note: "가".repeat(201) }, "note"],
  ])("머리 칸 거절 — %s", async (_, over, field) => {
    const r = await expectRejected(() => save({ lines: [wire("5")], ...over }));
    expect(r.errors.header).toHaveProperty(field);
  });

  it("머리 칸의 맞는 꼴 — 오늘 · 비고 200자 · 조정의 사유", async () => {
    await ok(save({ note: "가".repeat(200), lines: [wire("5")] }));
    await ok(save({ moveType: "ADJ", reason: "ETC", lines: [wire("-1")] }));
  });

  it("「사용 안 함」 사유는 거절한다", async () => {
    await db.update(codes).set({ active: false }).where(eq(codes.code, "LOSS"));
    const r = await expectRejected(() => save({ moveType: "ADJ", reason: "LOSS", lines: [wire("1")] }));
    expect(r.errors.header.reason).toContain("사용 안 함");
  });

  it.each([
    ["줄 없음", [] as Lines, "줄을 하나 이상"],
    ["101줄", Array.from({ length: 101 }, (_, i) => wire("1", { lot: `L-${i}` })), "100줄까지"],
  ])("줄 수 거절 — %s", async (_, lines, message) => {
    const r = await expectRejected(() => save({ lines }));
    expect(r.formError).toContain(message);
  });

  it.each([
    ["품목 없음", { item: "" }, "item"],
    ["없는 품목", { item: "RM-9999" }, "item"],
    ["코드 꼴이 아님", { item: "웨이퍼" }, "item"],
    ["창고 없음", { warehouse: "" }, "warehouse"],
    ["없는 창고", { warehouse: "WH-99" }, "warehouse"],
    ["수량 없음", { qty: "" }, "qty"],
    ["수량 0", { qty: "0" }, "qty"],
    ["입고에 음수", { qty: "-5" }, "qty"],
    ["입고에 +", { qty: "+5" }, "qty"],
    ["소수 넷째 자리", { qty: "1.2345" }, "qty"],
    ["정수 열 자리", { qty: "1234567890" }, "qty"],
    ["LOT 꼴", { lot: "LOT 1" }, "lot"],
    ["LOT 31자", { lot: "A".repeat(31) }, "lot"],
    ["입고에 받는 창고", { toWarehouse: "WH-02" }, "toWarehouse"],
    ["없는 단위", { unit: "NOPE" }, "unit"],
  ])("줄 칸 거절 — %s", async (_, over, field) => {
    const r = await expectRejected(() => save({ lines: [wire("5"), wire("5", { lot: "T-9", ...over })] }));
    // 틀린 줄(둘째)에 까닭이 붙고, 맞는 첫 줄도 저장되지 않는다(전표 단위).
    expect(Object.keys(r.errors.lines)).toEqual(["1"]);
    expect(r.errors.lines[1]).toHaveProperty(field);
  });

  it("「사용 안 함」 품목 · 창고는 거절한다", async () => {
    await db.update(items).set({ active: false }).where(eq(items.code, "RM-0003"));
    await db.update(warehouses).set({ active: false }).where(eq(warehouses.code, "WH-02"));
    const r = await expectRejected(() =>
      save({ lines: [wire("5"), { item: "RM-0001", lot: "X", warehouse: "WH-02", qty: "1" }] }),
    );
    expect(r.errors.lines[0].item).toContain("사용 안 함");
    expect(r.errors.lines[1].warehouse).toContain("사용 안 함");
  });

  it("이동 — 받는 창고가 없거나 보내는 창고와 같으면 거절", async () => {
    await ok(save({ lines: [wire("10")] }));
    const r = await expectRejected(() =>
      save({ moveType: "XFER", lines: [wire("1"), wire("1", { toWarehouse: "WH-01" })] }),
    );
    expect(r.errors.lines[0].toWarehouse).toBe("받는 창고를 고르세요");
    expect(r.errors.lines[1].toWarehouse).toContain("다른 창고");
  });
});

describe("LOT — 성공 기준 3, ADR 0015 · 0016", () => {
  it("사 오는 품목의 입고는 거래처 LOT 를 반드시 — 비우면 거절", async () => {
    const r = await expectRejected(() => save({ lines: [wire("5", { lot: "" })] }));
    expect(r.errors.lines[0].lot).toBe("거래처 LOT 를 넣어 주세요");
    const adj = await expectRejected(() => save({ moveType: "ADJ", reason: "FOUND", lines: [wire("5", { lot: "" })] }));
    expect(adj.errors.lines[0].lot).toContain("LOT 를 넣어 주세요");
  });

  it("만드는 품목은 비우면 규칙으로 붙는다 — 품목의 규칙 · 유형의 기본, 그날의 다음 일련", async () => {
    const code = await ok(
      save({
        lines: [
          { item: "FG-0001", warehouse: "WH-03", qty: "10" },
          { item: "FG-0001", warehouse: "WH-03", qty: "10" },
          { item: "FG-0002", warehouse: "WH-03", qty: "10" },
          { item: "SF-0001", warehouse: "WH-02", qty: "10", lot: "MY-LOT" },
        ],
      }),
    );
    expect((await linesOf(code)).map((l) => l.lot)).toEqual(["FG-261109-001", "FG-261109-002", "261109001", "MY-LOT"]);
    const adj = await ok(
      save({ moveType: "ADJ", reason: "FOUND", lines: [{ item: "SF-0001", warehouse: "WH-02", qty: "1" }] }),
    );
    expect((await linesOf(adj))[0].lot).toBe("SF-261109-001");
  });

  it("저절로 붙일 번호가 그 품목에 이미 있으면 다음 일련으로 넘어간다", async () => {
    await ok(save({ lines: [{ item: "FG-0001", lot: "FG-261109-001", warehouse: "WH-03", qty: "1" }] }));
    const code = await ok(save({ lines: [{ item: "FG-0001", warehouse: "WH-03", qty: "1" }] }));
    expect((await linesOf(code))[0].lot).toBe("FG-261109-002");
  });

  it("LOT 관리를 끈 품목에 LOT 를 넣으면 거절, 비우면 빈 LOT 로 남는다", async () => {
    const r = await expectRejected(() =>
      save({ lines: [{ item: "SM-0002", lot: "X", warehouse: "WH-01", qty: "1" }] }),
    );
    expect(r.errors.lines[0].lot).toContain("LOT 관리를 하지 않는");
    const code = await ok(save({ lines: [{ item: "SM-0002", warehouse: "WH-01", qty: "1" }] }));
    expect((await linesOf(code))[0].lot).toBe("");
  });

  it("줄이는 줄은 그 창고에 가용 재고가 있는 LOT 여야 한다", async () => {
    const r = await expectRejected(() =>
      save({ moveType: "OUT", lines: [{ item: "RM-0003", lot: "NW-25-0702", warehouse: "WH-02", qty: "1" }] }),
    );
    expect(r.errors.lines[0].lot).toContain("가용 재고가 없는 LOT");
    const blank = await expectRejected(() =>
      save({ moveType: "OUT", lines: [{ item: "RM-0003", warehouse: "WH-01", qty: "1" }] }),
    );
    expect(blank.errors.lines[0].lot).toBe("LOT 를 고르세요");
  });

  it("고르는 목록은 그 창고의 가용 LOT 와 수량이다", async () => {
    expect(await onHand(db, "RM-0003", "WH-01")).toEqual([
      { lot: "NW-25-0701", qty: "6,000" },
      { lot: "NW-25-0702", qty: "2,000" },
    ]);
    expect(await onHand(db, "SM-0002", "WH-01")).toEqual([{ lot: "", qty: "820" }]);
    expect(await onHand(db, "RM-0003", "틀린")).toEqual([]);
  });
});

describe("단위 — 성공 기준 12, ADR 0017", () => {
  it.each([
    ["L 품목에 500 ML → 0.5 L", "CS-0002", "500", "ML", 0.5],
    ["L 품목에 1 ML → 0.001 L", "CS-0002", "1", "ML", 0.001],
    ["G 품목에 0.5 KG → 500 G", "RM-0005", "0.5", "KG", 500],
    ["M 품목에 1500 MM → 1.5 M", "RM-0003", "1500", "MM", 1.5],
    ["비우면 품목 단위", "RM-0003", "2.5", "", 2.5],
  ])("%s", async (_, item, qty, unit, stacked) => {
    const lot = item === "RM-0003" || item === "RM-0005" ? "U-1" : "";
    const code = await ok(save({ lines: [{ item, lot, warehouse: "WH-01", qty, unit }] }));
    const [line] = await linesOf(code);
    expect(line.qty).toBe(stacked);
    expect(line.enteredQty).toBe(Number(qty));
    expect(line.enteredUnit).toBe(unit || (item === "CS-0002" ? "L" : item === "RM-0005" ? "G" : "M"));
  });

  it.each([
    ["EA 에 소수", { item: "RM-0001", qty: "0.5" }, "qty", "정수로"],
    ["넣은 단위의 자릿수를 넘음 — 0.5 ML", { item: "CS-0002", lot: "", qty: "0.5", unit: "ML" }, "qty", "ML는 정수로"],
    ["품목 단위의 자릿수를 넘는 환산 — G 품목에 1 MG", { item: "RM-0005", qty: "1", unit: "MG" }, "unit", "0.001 G"],
    ["기준이 다른 단위 — M 품목에 KG", { item: "RM-0003", qty: "1", unit: "KG" }, "unit", "기준이 다른"],
  ])("거절 — %s", async (_, over, field, message) => {
    const r = await expectRejected(() => save({ lines: [{ lot: "U-1", warehouse: "WH-01", ...over }] }));
    expect(r.errors.lines[0][field as "qty"]).toContain(message);
  });

  it("「사용 안 함」 단위로는 넣지 못한다 — 품목 단위는 「사용 안 함」이어도 된다", async () => {
    await db
      .update(codes)
      .set({ active: false })
      .where(sql`${codes.groupCode} = 'UNIT' and ${codes.code} in ('MM', 'M')`);
    const r = await expectRejected(() => save({ lines: [wire("1", { unit: "MM" })] }));
    expect(r.errors.lines[0].unit).toContain("사용 안 함");
    await ok(save({ lines: [wire("1")] }));
  });

  it("자릿수를 줄이는 것은 그 단위의 수불 수량이 다 맞을 때만(공통코드 › 단위)", async () => {
    const decimals = (d: string) =>
      updateCode(db, "UNIT", "M", { name: "미터", sortOrder: "20", active: "Y", decimals: d });
    expect(await decimals("0")).toEqual({ ok: true, code: "M" }); // 샘플의 M 수량은 다 정수
    await decimals("3");
    await ok(save({ lines: [wire("1.5")] }));
    expect(await decimals("0")).toMatchObject({
      ok: false,
      errors: { decimals: expect.stringContaining("줄이지 못합니다") },
    });
    expect(await decimals("1")).toEqual({ ok: true, code: "M" });
  });
});

describe("음수 재고를 막는다 — 성공 기준 4, ADR 0015", () => {
  it("오늘 — 가용보다 많이 내보내면 거절하고 모자란 수량을 보인다", async () => {
    await ok(save({ lines: [wire("500")] }));
    await ok(save({ moveType: "XFER", lines: [wire("200", { toWarehouse: "WH-02" })] }));
    const r = await expectRejected(() => save({ moveType: "XFER", lines: [wire("420", { toWarehouse: "WH-02" })] }));
    expect(r.errors.lines[0].row).toBe("120 M 모자랍니다");
    expect(r.formError).toContain("재고가 모자라");
    await ok(save({ moveType: "OUT", lines: [wire("300")] })); // 딱 맞으면 된다 — 0
    expect(await bal("RM-0003", "WH-01", "T-1")).toBe(0);
  });

  it("지난 날짜 — 그 날짜 뒤에 나간 것까지 세어 어느 때든 0 밑이면 거절(ADR 0015 의 예)", async () => {
    await ok(save({ moveDate: "2026-11-03", lines: [wire("100")] }));
    await ok(save({ moveType: "OUT", moveDate: "2026-11-04", lines: [wire("80")] }));
    const r = await expectRejected(() => save({ moveType: "OUT", moveDate: "2026-11-03", lines: [wire("30")] }));
    expect(r.errors.lines[0].row).toBe("10 M 모자랍니다 — 그 날짜 뒤에 나간 수불까지 셉니다");
    await ok(save({ moveType: "OUT", moveDate: "2026-11-03", lines: [wire("20")] }));
  });

  it("같은 날은 등록한 차례로 센다", async () => {
    await ok(save({ moveDate: "2026-11-05", lines: [wire("100")] }));
    await ok(save({ moveDate: "2026-11-05", moveType: "OUT", lines: [wire("80")] }));
    const r = await expectRejected(() => save({ moveDate: "2026-11-05", moveType: "OUT", lines: [wire("30")] }));
    expect(r.errors.lines[0].row).toContain("10 M 모자랍니다");
  });

  it("들어오기 전 날짜로는 내보내지 못한다", async () => {
    await ok(save({ moveDate: "2026-11-05", lines: [wire("100")] }));
    const r = await expectRejected(() => save({ moveDate: "2026-11-04", moveType: "OUT", lines: [wire("1")] }));
    expect(r.errors.lines[0].row).toContain("1 M 모자랍니다");
  });

  it("한 전표에 같은 재고를 두 줄로 — 합으로 센다", async () => {
    await ok(save({ lines: [wire("100")] }));
    const r = await expectRejected(() => save({ moveType: "OUT", lines: [wire("60"), wire("60")] }));
    expect(r.errors.lines[0].row).toContain("20 M 모자랍니다");
    expect(r.errors.lines[1].row).toContain("20 M 모자랍니다");
  });

  it("LOT 를 저절로 받은 뒤 모자라 거절되면 LOT 일련도 되돌아간다(전표 단위)", async () => {
    const r = await expectRejected(() =>
      save({
        moveType: "ADJ",
        reason: "ETC",
        lines: [{ item: "FG-0001", warehouse: "WH-03", qty: "5" }, wire("-3000", { lot: "NW-25-0702" })],
      }),
    );
    expect(r.errors.lines[1].row).toContain("1,000 M 모자랍니다");
  });

  it("두 저장이 동시에 같은 재고를 써도 하나만 저장된다", async () => {
    await ok(save({ lines: [wire("100")] }));
    const both = await Promise.all([
      save({ moveType: "OUT", lines: [wire("70")] }),
      save({ moveType: "OUT", lines: [wire("70")] }),
    ]);
    expect(both.filter((r) => r.ok)).toHaveLength(1);
    expect(await bal("RM-0003", "WH-01", "T-1")).toBe(30);
    await invariant();
  });

  it("잔액은 DB 도 0 밑으로 막는다", async () => {
    const [b] = await db.select().from(stockBalances).limit(1);
    expect(await rejection(db.update(stockBalances).set({ qty: -1 }).where(eq(stockBalances.id, b.id)))).toMatchObject({
      constraint: "stock_balances_qty_not_negative",
    });
  });
});

describe("상태 — 불량창고, 성공 기준 6", () => {
  it("불량창고에서 출고 · 이동으로 내보내지 못한다 — 다른 창고에서 불량창고로는 옮긴다", async () => {
    const lot = "SF-261102-002";
    for (const moveType of ["OUT", "XFER"] as const) {
      const r = await expectRejected(() =>
        save({
          moveType,
          lines: [
            { item: "SF-0002", lot, warehouse: "WH-04", toWarehouse: moveType === "XFER" ? "WH-02" : "", qty: "1" },
          ],
        }),
      );
      expect(r.errors.lines[0].warehouse).toContain("불량창고에서는 내보내지 못합니다");
    }
    await ok(
      save({ moveType: "XFER", lines: [{ item: "SF-0002", lot, warehouse: "WH-02", toWarehouse: "WH-04", qty: "5" }] }),
    );
    expect(await bal("SF-0002", "WH-04", lot)).toBe(35);
  });

  it("불량창고 안의 조정(실사 차이)은 받는다", async () => {
    await ok(
      save({
        moveType: "ADJ",
        reason: "COUNT",
        lines: [{ item: "SF-0002", lot: "SF-261102-002", warehouse: "WH-04", qty: "-5" }],
      }),
    );
    expect(await bal("SF-0002", "WH-04", "SF-261102-002")).toBe(25);
  });

  it("재고가 있는 창고는 불량창고 표시를 바꾸지 못한다 — 빈 창고는 바꾼다", async () => {
    const off = await updateWarehouse(db, "WH-04", { name: "불량창고", isDefect: "off", active: "Y" });
    expect(off).toMatchObject({ ok: false, errors: { isDefect: expect.stringContaining("재고가 있는 창고") } });
    const created = await createWarehouse(db, { name: "빈 창고", isDefect: "off" });
    expect(created).toMatchObject({ ok: true, code: "WH-05" });
    expect(await updateWarehouse(db, "WH-05", { name: "빈 창고", isDefect: "on", active: "Y" })).toEqual({
      ok: true,
      code: "WH-05",
    });
  });
});

describe("취소 — 성공 기준 5", () => {
  it("반대 수량의 전표가 오늘 날짜의 새 번호로 생기고 원래 전표에 「취소됨」이 붙는다", async () => {
    const code = await ok(save({ moveDate: "2026-11-05", lines: [wire("100")] }));
    const cancel = await cancelMove(db, code, TODAY);
    expect(cancel).toEqual({ ok: true, code: "IV-20261109-001" });
    await invariant();
    expect(await bal("RM-0003", "WH-01", "T-1")).toBe(0);
    const [original, reversed] = [await getMove(db, code), await getMove(db, "IV-20261109-001")];
    expect(original).toMatchObject({ canceledBy: "IV-20261109-001", cancels: null });
    expect(reversed).toMatchObject({ cancels: code, moveType: "IN", moveDate: TODAY, note: `${code} 취소` });
    expect(reversed!.lineRows[0]).toMatchObject({ from: "WH-01 자재창고", to: null, qty: "100" });
    expect((await listRecentMoves(db, 2)).map((m) => [m.code, m.canceledBy, m.cancels])).toEqual([
      ["IV-20261109-001", null, code],
      [code, "IV-20261109-001", null],
    ]);
  });

  it("이동의 취소는 보내는 · 받는 창고를 바꾸고, 조정의 취소는 사유를 그대로 둔다", async () => {
    await ok(save({ lines: [wire("100")] }));
    const xfer = await ok(save({ moveType: "XFER", lines: [wire("40", { toWarehouse: "WH-02" })] }));
    expect((await cancelMove(db, xfer, TODAY)).ok).toBe(true);
    expect([await bal("RM-0003", "WH-01", "T-1"), await bal("RM-0003", "WH-02", "T-1")]).toEqual([100, 0]);
    const adj = await ok(save({ moveType: "ADJ", reason: "DAMAGE", lines: [wire("-5")] }));
    const c = await cancelMove(db, adj, TODAY);
    const [m] = await db
      .select()
      .from(stockMoves)
      .where(eq(stockMoves.code, c.ok ? c.code : ""));
    expect(m).toMatchObject({ moveType: "ADJ", reason: "DAMAGE" });
    await invariant();
  });

  it("한 전표는 한 번만, 취소 전표는 취소하지 못한다", async () => {
    const code = await ok(save({ lines: [wire("10")] }));
    const cancel = await cancelMove(db, code, TODAY);
    const again = await expectRejected(() => cancelMove(db, code, TODAY));
    expect(again).toEqual({ ok: false, formError: `이미 취소한 전표입니다 — 취소 전표 ${cancel.ok && cancel.code}` });
    const ofCancel = await expectRejected(() => cancelMove(db, cancel.ok ? cancel.code : "", TODAY));
    expect(ofCancel).toEqual({ ok: false, formError: "취소 전표는 취소하지 못합니다" });
    expect(await cancelMove(db, "IV-20990101-001", TODAY)).toEqual({ ok: false, notFound: true });
    expect(await cancelMove(db, "틀린", TODAY)).toEqual({ ok: false, notFound: true });
  });

  it("DB 도 막는다 — 같은 전표의 두 번째 취소, 취소 전표의 취소", async () => {
    const code = await ok(save({ lines: [wire("10")] }));
    const c = await cancelMove(db, code, TODAY);
    const [orig] = await db.select().from(stockMoves).where(eq(stockMoves.code, code));
    const [rev] = await db
      .select()
      .from(stockMoves)
      .where(eq(stockMoves.code, c.ok ? c.code : ""));
    const insert = (cancelsMoveId: number, n: string) =>
      db.insert(stockMoves).values({ code: `IV-20261109-${n}`, moveDate: TODAY, moveType: "IN", cancelsMoveId });
    expect(await rejection(insert(orig.id, "900"))).toMatchObject({ constraint: "stock_moves_cancels_move_id_unique" });
    expect(await rejection(insert(rev.id, "901"))).toMatchObject({ constraint: "stock_moves_cancels_fk" });
    expect(
      await rejection(db.insert(stockMoves).values({ code: "IV-20261108-901", moveDate: TODAY, moveType: "IN" })),
    ).toMatchObject({ constraint: "stock_moves_code_date" });
  });

  it("취소로 재고가 0 밑으로 가면 취소도 막는다", async () => {
    const code = await ok(save({ lines: [wire("100")] }));
    await ok(save({ moveType: "OUT", lines: [wire("80")] }));
    const r = await expectRejected(() => cancelMove(db, code, TODAY));
    expect(r).toMatchObject({ ok: false, formError: expect.stringContaining("금 와이어 LOT T-1 · 자재창고 80 M") });
  });
});

describe("수불이 있는 품목 — LOT 관리 · 단위를 바꾸지 못한다(성공 기준 11, ADR 0015)", () => {
  const edit = (over: Record<string, string>) => ({
    procurement: "BUY",
    name: "금 와이어",
    spec: "지름 25µm",
    unit: "M",
    inspectIn: "on",
    lotManaged: "on",
    leadTimeDays: "10",
    safetyStock: "5000",
    minLot: "2000",
    lotMultiple: "1000",
    defaultInWarehouse: "WH-01",
    defaultOutWarehouse: "WH-02",
    active: "Y",
    ...over,
  });

  it("단위 · LOT 관리를 바꾸면 거절 — 다른 칸은 고친다", async () => {
    expect(await updateItem(db, "RM-0003", edit({ unit: "MM" }))).toMatchObject({
      ok: false,
      errors: { unit: expect.stringContaining("수불이 있는 품목") },
    });
    expect(await updateItem(db, "RM-0003", edit({ lotManaged: "off" }))).toMatchObject({
      ok: false,
      errors: { lotManaged: expect.stringContaining("수불이 있는 품목") },
    });
    expect(await updateItem(db, "RM-0003", edit({ spec: "지름 20µm" }))).toEqual({ ok: true, code: "RM-0003" });
  });

  it("수불이 없는 품목은 바꾼다", async () => {
    const base = {
      procurement: "BUY",
      name: "솔더 볼",
      leadTimeDays: "0",
      safetyStock: "0",
      minLot: "0",
      lotMultiple: "0",
    };
    const r = await createItem(db, { ...base, itemType: "RM", unit: "EA", lotManaged: "on" });
    expect(r).toMatchObject({ ok: true, code: "RM-0007" });
    expect(await updateItem(db, "RM-0007", { ...base, unit: "KG", lotManaged: "off", active: "Y" })).toEqual({
      ok: true,
      code: "RM-0007",
    });
  });
});

describe("등록 상한 — 설계 「2026-11-09 — PR C 를 열기 전에 정한 것」", () => {
  it(`수불 전표는 ${MOVE_LIMIT.toLocaleString()}장까지 — 취소도 센다`, async () => {
    const code = await ok(save({ lines: [wire("10")] }));
    const n = MOVE_LIMIT - (await db.select().from(stockMoves)).length;
    await db.execute(sql`
      insert into stock_moves (code, move_date, move_type)
      select 'IV-20200101-' || lpad(g::text, 4, '0'), '2020-01-01', 'IN' from generate_series(1, ${n}) g`);
    const r = await expectRejected(() => save({ lines: [wire("1")] }));
    expect(r.formError).toBe("수불 전표는 5,000개까지 등록됩니다 — 매일 밤 샘플 데이터로 돌아간 뒤 다시 등록하세요");
    expect(await expectRejected(() => cancelMove(db, code, TODAY))).toMatchObject({
      formError: expect.stringContaining("5,000개까지"),
    });
  });

  it(`수불 줄은 ${MOVE_LINE_LIMIT.toLocaleString()}줄까지 — 넘는 전표는 통째로 거절`, async () => {
    const have = (await db.select().from(stockMoveLines)).length;
    const movesNeeded = Math.floor((MOVE_LINE_LIMIT - have - 69) / 100);
    const rest = MOVE_LINE_LIMIT - have - 69 - movesNeeded * 100;
    await db.execute(sql`
      insert into stock_moves (code, move_date, move_type)
      select 'IV-20200101-' || lpad(g::text, 4, '0'), '2020-01-01', 'IN' from generate_series(1, ${movesNeeded + 1}) g`);
    await db.execute(sql`
      insert into stock_move_lines (move_id, line_no, move_date, item_id, lot, to_warehouse_id, qty, entered_qty, entered_unit)
      select m.id, n, '2020-01-01', 1, 'BULK', 1, 1, 1, 'EA'
      from stock_moves m cross join generate_series(1, 100) n
      where m.code like 'IV-20200101-%' and (m.code < ${`IV-20200101-${String(movesNeeded + 1).padStart(4, "0")}`} or n <= ${rest})`);
    expect((await db.select().from(stockMoveLines)).length).toBe(MOVE_LINE_LIMIT - 69);
    const lines = (k: number) => Array.from({ length: k }, (_, i) => wire("1", { lot: `B-${i}` }));
    const r = await expectRejected(() => save({ lines: lines(70) }));
    expect(r.formError).toContain("수불 줄은 50,000개까지");
    expect((await save({ lines: lines(69) })).ok).toBe(true);
  });
});
