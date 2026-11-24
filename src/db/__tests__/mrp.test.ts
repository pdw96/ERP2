// @vitest-environment node
import { asc, count, eq, sql, type SQL } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { limitMessage } from "@/db/master-shared";
import { mpsSupply } from "@/db/mps";
import {
  MRP_ORDER_LIMIT,
  MRP_PEG_LIMIT,
  MRP_RUN_LIMIT,
  MRP_SETTING_CHANGE_LIMIT,
  MRP_SETTING_HISTORY_SHOWN,
  mrpSettings,
  openMrpGrid,
  openMrpOrders,
  overNumericLimit,
  overOrderLimit,
  parseMrpGridFrom,
  parseMrpOrderQuery,
  runMrp,
  saveMrpSettings,
} from "@/db/mrp";
import { resetToSample } from "@/db/reset";
import { items, mrpPegs, mrpPlannedOrders, mrpRuns } from "@/db/schema";
import type { Db } from "@/db/types";
import { addDays, WEEKDAY_NAMES } from "@/lib/mrp-calc";
import { milliOf } from "@/db/stock";
import { addWeeks, mondayOf } from "@/lib/weeks";
import { migratedDb, rejection } from "./pglite";

// MRP(메뉴 「MRP」)의 표 · 완성일 기준 요일 설정과 그 이력 · [MRP 실행]을 PGlite 에서 실제 SQL 로.
// 바탕은 2026-11-24(화)로 되돌린 샘플이다 — 되돌림이 그날 MRP 를 한 번 실행해 둔다. 이번 주는 2026-11-23.

const BAD = "완성일 기준 요일을 고르세요";
const TODAY = "2026-11-24";
const W0 = "2026-11-23";
/** 한국 시각 2026-11-24 14:00 */
const NOW = new Date("2026-11-24T05:00:00Z");

let handle: Awaited<ReturnType<typeof migratedDb>>;
let db: Db;
beforeAll(async () => {
  handle = await migratedDb();
  db = handle.db;
});
afterAll(() => handle.close());
beforeEach(() => resetToSample(db, TODAY));

describe("완성일 기준 요일", () => {
  it("상수", () => {
    expect([MRP_SETTING_CHANGE_LIMIT, MRP_SETTING_HISTORY_SHOWN]).toEqual([1000, 20]);
    expect(WEEKDAY_NAMES).toEqual(["월", "화", "수", "목", "금", "토", "일"]);
  });

  it("처음에는 월요일이고 이력이 없다", async () => {
    expect(await mrpSettings(db)).toEqual({ dueWeekday: 1, changes: [], total: 0 });
  });

  it("바꾸면 값이 바뀌고 이력이 한 줄 남는다 — 글자 숫자도 받는다", async () => {
    expect(await saveMrpSettings(db, "5")).toEqual({ ok: true, changed: true });
    const s = await mrpSettings(db);
    expect(s.dueWeekday).toBe(5);
    expect(s.total).toBe(1);
    expect(s.changes).toHaveLength(1);
    expect(s.changes[0]).toMatchObject({ before: 1, after: 5 });
    expect(s.changes[0].changedAt).toBeInstanceOf(Date);
  });

  it("이력은 새것이 먼저다", async () => {
    await saveMrpSettings(db, 3);
    await saveMrpSettings(db, 7);
    const s = await mrpSettings(db);
    expect(s.changes.map((c) => [c.before, c.after])).toEqual([
      [3, 7],
      [1, 3],
    ]);
  });

  it("같은 값은 쓰지 않는다", async () => {
    await saveMrpSettings(db, "5");
    expect(await saveMrpSettings(db, 5)).toEqual({ ok: true, changed: false });
    expect((await mrpSettings(db)).total).toBe(1);
  });

  it.each([0, 8, "abc", 1.5, "", null, undefined, "1.5", "0", " 1", NaN, {}])(
    "%j 은 거절한다 — 값 · 이력 그대로",
    async (bad) => {
      expect(await saveMrpSettings(db, bad)).toEqual({ ok: false, formError: BAD });
      expect(await mrpSettings(db)).toEqual({ dueWeekday: 1, changes: [], total: 0 });
    },
  );

  it("이력이 1,000줄이면 더 쌓지 않고 알린다", async () => {
    await db.execute(
      sql`insert into mrp_setting_changes (before, after) select 1, 2 from generate_series(1, ${MRP_SETTING_CHANGE_LIMIT})`,
    );
    expect(await saveMrpSettings(db, 4)).toEqual({
      ok: false,
      formError: limitMessage("완성일 기준 요일의 고친 이력", MRP_SETTING_CHANGE_LIMIT),
    });
    expect((await mrpSettings(db)).dueWeekday).toBe(1);
  });

  it("화면에는 이력을 20줄까지 보이고 전체 줄 수는 따로 센다", async () => {
    await db.execute(sql`insert into mrp_setting_changes (before, after) select 1, 2 from generate_series(1, 25)`);
    const s = await mrpSettings(db);
    expect(s.changes).toHaveLength(MRP_SETTING_HISTORY_SHOWN);
    expect(s.total).toBe(25);
  });

  it("매일 밤 되돌림이 1(월)로, 이력을 비워 되돌린다", async () => {
    await saveMrpSettings(db, "6");
    await resetToSample(db, TODAY);
    expect(await mrpSettings(db)).toEqual({ dueWeekday: 1, changes: [], total: 0 });
  });
});

describe("DB 의 제약", () => {
  it("설정은 한 줄(id 1)이고 요일은 1 ~ 7 이다", async () => {
    const id2 = await rejection(db.execute(sql`insert into mrp_settings (id, due_weekday) values (2, 1)`));
    expect(id2.constraint).toBe("mrp_settings_single");
    const day8 = await rejection(db.execute(sql`update mrp_settings set due_weekday = 8`));
    expect(day8.constraint).toBe("mrp_settings_due_weekday");
  });

  it("설정 이력의 전 · 후는 1 ~ 7 이다", async () => {
    const before = await rejection(db.execute(sql`insert into mrp_setting_changes (before, after) values (0, 1)`));
    expect(before.constraint).toBe("mrp_setting_changes_before");
    const after = await rejection(db.execute(sql`insert into mrp_setting_changes (before, after) values (1, 8)`));
    expect(after.constraint).toBe("mrp_setting_changes_after");
  });

  it("계획오더 번호의 꼴이 어긋나면 거절한다", async () => {
    await db.execute(
      sql`insert into mrp_runs (ran_at, run_date, due_weekday, seq_end, order_count) values (now(), '2026-11-24', 1, 0, 0)`,
    );
    const bad = await rejection(
      db.execute(sql`insert into mrp_planned_orders (run_id, number, kind, item_id, qty, unit, decimals, due_date, planned_start, start_date, late_days)
        values (1, 'PL-2026-1', 'MAKE', 1, 1, 'EA', 0, '2026-11-24', '2026-11-24', '2026-11-24', 0)`),
    );
    expect(bad.constraint).toBe("mrp_planned_orders_number_format");
  });

  it("계획오더의 구분 · 수량 · 늦은 날수, 총소요의 월요일 · 수량을 지킨다", async () => {
    await db.execute(
      sql`insert into mrp_runs (ran_at, run_date, due_weekday, seq_end, order_count) values (now(), '2026-11-24', 1, 0, 0)`,
    );
    const order = (kind: string, qty: number, late: number) =>
      db.execute(sql`insert into mrp_planned_orders (run_id, number, kind, item_id, qty, unit, decimals, due_date, planned_start, start_date, late_days)
        values (1, 'PL-20261124-001', ${kind}, 1, ${qty}, 'EA', 0, '2026-11-24', '2026-11-24', '2026-11-24', ${late})`);
    expect((await rejection(order("X", 1, 0))).constraint).toBe("mrp_planned_orders_kind");
    expect((await rejection(order("MAKE", 0, 0))).constraint).toBe("mrp_planned_orders_qty");
    expect((await rejection(order("MAKE", 1, -1))).constraint).toBe("mrp_planned_orders_late_days");
    const tue = await rejection(
      db.execute(sql`insert into mrp_gross (run_id, item_id, week_start, qty) values (1, 1, '2026-11-24', 1)`),
    );
    expect(tue.constraint).toBe("mrp_gross_monday");
    const zero = await rejection(
      db.execute(sql`insert into mrp_gross (run_id, item_id, week_start, qty) values (1, 1, '2026-11-23', 0)`),
    );
    expect(zero.constraint).toBe("mrp_gross_qty");
  });
});

// ── [MRP 실행] ─────────────────────────────────────────────

type OrderRow = {
  runId: number;
  number: string;
  kind: string;
  code: string;
  itemType: string;
  qty: number;
  unit: string;
  decimals: number;
  dueDate: string;
  startDate: string;
};

/** 남은 계획오더 전부 — 번호 차례. */
async function orders(): Promise<OrderRow[]> {
  return db
    .select({
      runId: mrpPlannedOrders.runId,
      number: mrpPlannedOrders.number,
      kind: mrpPlannedOrders.kind,
      code: items.code,
      itemType: items.itemType,
      qty: mrpPlannedOrders.qty,
      unit: mrpPlannedOrders.unit,
      decimals: mrpPlannedOrders.decimals,
      dueDate: mrpPlannedOrders.dueDate,
      startDate: mrpPlannedOrders.startDate,
    })
    .from(mrpPlannedOrders)
    .innerJoin(items, eq(items.id, mrpPlannedOrders.itemId))
    .orderBy(asc(mrpPlannedOrders.number));
}

/** 실행 기록 전부 — 실행 차례. */
async function runs() {
  return db.select().from(mrpRuns).orderBy(asc(mrpRuns.id));
}

const pl = (date: string, seq: number) => `PL-${date.replaceAll("-", "")}-${String(seq).padStart(3, "0")}`;
const byPlanOrder = (a: OrderRow, b: OrderRow) =>
  a.startDate.localeCompare(b.startDate) || a.code.localeCompare(b.code) || a.dueDate.localeCompare(b.dueDate);

async function ran(now: Date = NOW): Promise<number> {
  const result = await runMrp(db, now);
  if (!result.ok) throw new Error(result.formError);
  return result.orders;
}

describe("[MRP 실행]", () => {
  it("상수", () => {
    expect([MRP_ORDER_LIMIT, MRP_RUN_LIMIT, MRP_PEG_LIMIT]).toEqual([20000, 1000, 200000]);
  });

  it("완제품의 계획오더는 그 순간의 MPS 공급량과 주 · 수량이 하나씩 같다", async () => {
    await ran();
    const supply = (await mpsSupply(db, addWeeks(W0, 51), TODAY)).filter((s) => s.item === "FG-0001");
    expect(supply.length).toBeGreaterThan(0);
    const fg = (await orders()).filter((o) => o.code === "FG-0001").sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    expect(fg.map((o) => [mondayOf(o.dueDate), o.qty, o.kind])).toEqual(
      supply.map((s) => [s.week, Number(s.qty), "MAKE"]),
    );
  });

  it("그날 첫 실행은 PL-20261124-001 부터 빈틈없이 — 차례는 시작일 · 품목 코드 · 완성일", async () => {
    await db.execute(sql`delete from mrp_runs`); // 되돌림의 실행을 지워 이 실행이 그날 처음이게 한다
    const n = await ran();
    const list = await orders();
    expect(n).toBeGreaterThan(0);
    expect(list).toHaveLength(n);
    expect(list.map((o) => o.number)).toEqual(Array.from({ length: n }, (_, i) => pl(TODAY, i + 1)));
    expect([...list].sort(byPlanOrder).map((o) => o.number)).toEqual(list.map((o) => o.number));
    const [run] = await runs();
    expect(run).toMatchObject({ runDate: TODAY, dueWeekday: 1, seqEnd: n, orderCount: n });
    expect(run.ranAt).toEqual(NOW);
  });

  it("되돌림이 그날 한 번 실행해 둔다 — PL-20261124-001 부터", async () => {
    const list = await orders();
    expect(list.length).toBeGreaterThan(0);
    expect(list[0].number).toBe(pl(TODAY, 1));
    const all = await runs();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ runDate: TODAY, seqEnd: list.length, orderCount: list.length });
  });

  it("같은 날 다시 실행하면 지난 계획오더를 갈아 끼우고 일련을 잇는다", async () => {
    const before = await orders();
    const n1 = await ran();
    const first = await orders();
    expect(first).toHaveLength(n1);
    expect(first[0].number).toBe(pl(TODAY, before.length + 1));
    expect(first.map((o) => o.number).some((x) => before.some((b) => b.number === x))).toBe(false);

    const n2 = await ran();
    const second = await orders();
    expect(second).toHaveLength(n2);
    expect(second[0].number).toBe(pl(TODAY, before.length + n1 + 1));
    expect(second.at(-1)!.number).toBe(pl(TODAY, before.length + n1 + n2));
    expect(new Set(second.map((o) => o.runId)).size).toBe(1);
    // 실행 줄은 남는다 — 같은 날의 seq_end 가 일련을 잇는다.
    expect((await runs()).map((r) => r.seqEnd)).toEqual([before.length, before.length + n1, before.length + n1 + n2]);
    // 품목 머리 · 총소요도 마지막 실행 몫만 남는다.
    const lastRun = (await runs()).at(-1)!.id;
    const [items1] = await db
      .execute(sql`select count(*)::int as n from mrp_run_items where run_id <> ${lastRun}`)
      .then(rowsOf);
    const [gross1] = await db
      .execute(sql`select count(*)::int as n from mrp_gross where run_id <> ${lastRun}`)
      .then(rowsOf);
    expect([items1.n, gross1.n]).toEqual([0, 0]);
    const [items2] = await db.execute(sql`select count(*)::int as n from mrp_run_items`).then(rowsOf);
    const [gross2] = await db.execute(sql`select count(*)::int as n from mrp_gross`).then(rowsOf);
    expect(items2.n).toBeGreaterThan(0);
    expect(gross2.n).toBeGreaterThan(0);
  });

  it("두 실행이 겹쳐도 둘 다 끝나고, 남는 것은 한 실행 몫 · 번호는 겹치지 않는다", async () => {
    const start = (await runs()).at(-1)!.seqEnd;
    const results = await Promise.all([runMrp(db, NOW), runMrp(db, NOW)]);
    expect(results.map((r) => r.ok)).toEqual([true, true]);
    const all = await runs();
    expect(all).toHaveLength(3);
    // 실행 줄 둘의 일련 구간이 이어진다.
    expect(all[1].seqEnd).toBe(start + all[1].orderCount);
    expect(all[2].seqEnd).toBe(all[1].seqEnd + all[2].orderCount);
    const list = await orders();
    expect(list).toHaveLength(all[2].orderCount);
    expect(new Set(list.map((o) => o.runId))).toEqual(new Set([all[2].id]));
    expect(list[0].number).toBe(pl(TODAY, all[1].seqEnd + 1));
  });

  it("번호 · 실행일은 한국 날짜다 — UTC 15:30 은 다음 날", async () => {
    const n = await ran(new Date("2026-11-24T15:30:00Z"));
    const list = await orders();
    expect(list[0].number).toBe(pl("2026-11-25", 1));
    expect(list.at(-1)!.number).toBe(pl("2026-11-25", n));
    expect((await runs()).at(-1)!.runDate).toBe("2026-11-25");
  });

  it("계획오더 상한은 20,000건 — 넘으면 거절", () => {
    expect(overOrderLimit(MRP_ORDER_LIMIT)).toBe(false);
    expect(overOrderLimit(MRP_ORDER_LIMIT + 1)).toBe(true);
  });

  it("실행 기록이 1,000줄이면 거절하고 아무것도 바꾸지 않는다", async () => {
    const [{ n }] = await db.select({ n: count() }).from(mrpRuns);
    await db.execute(
      sql`insert into mrp_runs (ran_at, run_date, due_weekday, seq_end, order_count)
        select now(), '2026-01-01', 1, 0, 0 from generate_series(1, ${MRP_RUN_LIMIT - 1 - n})`,
    );
    await ran(); // 999 → 1,000
    const before = await orders();
    expect(await runMrp(db, NOW)).toEqual({ ok: false, formError: limitMessage("MRP 실행 기록", MRP_RUN_LIMIT) });
    expect(await orders()).toEqual(before);
    expect((await db.select({ n: count() }).from(mrpRuns))[0].n).toBe(MRP_RUN_LIMIT);
  });

  it("일련이 999 를 넘어 네 자리가 돼도 목록은 번호의 수 차례다", async () => {
    // 그날 앞 실행이 995 까지 썼다고 하고 실행한다 — 번호가 996 부터 이어져 999 · 1000 을 지난다.
    await db.execute(sql`update mrp_runs set seq_end = 995`);
    await ran();
    const list = await openMrpOrders(db, BASE_QUERY);
    const seqOf = (n: string) => Number(n.slice(n.lastIndexOf("-") + 1));
    const seqs = list.rows.map((r) => seqOf(r.number));
    expect(seqs[0]).toBe(996);
    expect(seqs).toContain(1000);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
  });

  it("수량이 numeric(15,3) 의 끝을 넘으면 경계 그대로 가린다", () => {
    const max = BigInt("999999999999999"); // 999,999,999,999.999
    expect(overNumericLimit(max)).toBe(false);
    expect(overNumericLimit(max + BigInt(1))).toBe(true);
    expect(overNumericLimit(-max - BigInt(1))).toBe(true);
  });

  it("계획량이 너무 크면 안내만 하고 아무것도 바꾸지 않는다", async () => {
    // BOM 줄 소요량을 모두 열어 둔 끝까지 키운다 — 단계마다 곱해져 하위 품목의 총소요 · 계획량이 끝을 넘는다.
    await db.execute(sql`update bom_lines set qty = 900000000`);
    const before = await orders();
    const runsBefore = await runs();
    expect(await runMrp(db, NOW)).toEqual({
      ok: false,
      formError: "계획량이 너무 커서 실행하지 못했습니다 — BOM 의 소요량과 MPS 수량을 확인하세요",
    });
    expect(await orders()).toEqual(before);
    expect(await runs()).toEqual(runsBefore);
  });

  it("완성일 기준 요일 5(금)로 저장하면 완제품의 완성일이 그 주 금요일이다", async () => {
    await saveMrpSettings(db, 5);
    await ran();
    const supply = (await mpsSupply(db, addWeeks(W0, 51), TODAY)).filter((s) => s.item === "FG-0001");
    const fg = (await orders()).filter((o) => o.code === "FG-0001").sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    // 이번 주도 금요일(11-27)이 오늘(11-24)보다 늦어 금요일이다.
    expect(fg.map((o) => o.dueDate)).toEqual(supply.map((s) => addDays(s.week, 4)));
    expect(fg[0].dueDate).toBe("2026-11-27");
    expect((await runs()).at(-1)!.dueWeekday).toBe(5);
  });

  it("계획오더는 실행 때의 단위 · 자릿수를 남긴다 — 뒤에 단위 자릿수를 바꿔도 그대로", async () => {
    await ran();
    const rm = (await orders()).find((o) => o.itemType === "RM")!;
    expect(rm).toBeDefined();
    await db.execute(sql`update unit_specs set decimals = ${rm.decimals === 3 ? 0 : 3} where unit = ${rm.unit}`);
    const after = (await orders()).find((o) => o.number === rm.number)!;
    expect([after.unit, after.decimals]).toEqual([rm.unit, rm.decimals]);
  });
});

// ── 결과 읽기 ─────────────────────────────────────────────

const BASE_QUERY = { kind: null, itemType: null, lateOnly: false, page: 1 } as const;

describe("openMrp", () => {
  it("실행 전(결과 표가 빔)에는 실행이 없고 줄이 없다", async () => {
    await db.execute(sql`truncate mrp_runs cascade`);
    const o = await openMrpOrders(db, BASE_QUERY);
    expect(o).toEqual({ run: null, total: 0, page: 1, pages: 1, rows: [] });
    expect(await openMrpGrid(db, W0)).toEqual({
      run: null,
      runWeek: null,
      weeks: expect.any(Array),
      rows: [],
    });
  });

  it("계획오더 목록 — 번호 차례, 거르기", async () => {
    const all = await openMrpOrders(db, BASE_QUERY);
    expect(all.run).toMatchObject({ runDate: TODAY, dueWeekday: 1 });
    expect(all.total).toBe(all.run!.orders);
    expect(all.rows[0].number).toBe("PL-20261124-001");
    expect(all.rows.map((r) => r.number)).toEqual(all.rows.map((r) => r.number).sort());

    const buy = await openMrpOrders(db, { ...BASE_QUERY, kind: "BUY" });
    expect(buy.total).toBeGreaterThan(0);
    expect(buy.rows.every((r) => r.kind === "BUY")).toBe(true);

    const rm = await openMrpOrders(db, { ...BASE_QUERY, itemType: "RM" });
    expect(rm.total).toBeGreaterThan(0);
    expect(rm.rows.every((r) => r.item.itemType === "RM")).toBe(true);

    const late = await openMrpOrders(db, { ...BASE_QUERY, lateOnly: true });
    expect(late.rows.every((r) => r.lateDays > 0)).toBe(true);
    const lateN = rowsOf(await db.execute(sql`select count(*)::int as n from mrp_planned_orders where late_days > 0`));
    expect(late.total).toBe(lateN[0].n);
  });

  it("「사용 안 함」은 실행 때의 것이다 — 뒤에 품목을 쓰지 않음으로 바꿔도 목록은 표와 같다", async () => {
    const before = (await openMrpOrders(db, BASE_QUERY)).rows[0];
    expect(before.item.active).toBe(true);
    await db.update(items).set({ active: false }).where(eq(items.code, before.item.code));
    const list = (await openMrpOrders(db, BASE_QUERY)).rows.find((r) => r.number === before.number)!;
    expect(list.item.active).toBe(true);
    const grid = (await openMrpGrid(db, W0)).rows.find((r) => r.item.code === before.item.code)!;
    expect(grid.item.active).toBe(list.item.active);
  });

  it("쪽이 넘치면 마지막 쪽, 수량은 정규 글자", async () => {
    const over = await openMrpOrders(db, { ...BASE_QUERY, page: 99 });
    expect(over.page).toBe(over.pages);
    expect(over.rows.length).toBeGreaterThan(0);
    const [o] = (await orders()).filter((x) => x.number === "PL-20261124-001");
    const first = (await openMrpOrders(db, BASE_QUERY)).rows[0];
    expect(first.qty).toBe(String(o.qty));
    expect(first.qty).not.toMatch(/\.\d*0$/);
  });

  it("쿼리 값은 알 수 없는 것을 기본값으로 돌린다", () => {
    expect(parseMrpOrderQuery({ page: "abc", kind: "XYZ", type: "ZZ", late: "yes" })).toEqual(BASE_QUERY);
    expect(parseMrpOrderQuery({ page: "3", kind: "MAKE", type: "RM", late: "1" })).toEqual({
      kind: "MAKE",
      itemType: "RM",
      lateOnly: true,
      page: 3,
    });
    expect(parseMrpOrderQuery({ page: "0" }).page).toBe(1);
    expect(parseMrpOrderQuery({ page: "1.5" }).page).toBe(1);
  });

  it("표의 쪽 값은 실행 주 + 13주 × k 만 받는다", () => {
    expect(parseMrpGridFrom("2026-12-07", W0)).toBe(W0);
    expect(parseMrpGridFrom(addWeeks(W0, 13), W0)).toBe("2027-02-22");
    expect(parseMrpGridFrom(addWeeks(W0, 39), W0)).toBe(addWeeks(W0, 39));
    expect(parseMrpGridFrom("2027-11-22", W0)).toBe(W0);
    expect(parseMrpGridFrom(undefined, W0)).toBe(W0);
  });

  it("품목별 표 — 원자재의 예상재고는 실행 주부터 이어지고, 먼 쪽도 첫 쪽에서 이어진다", async () => {
    const p1 = await openMrpGrid(db, W0);
    expect(p1.runWeek).toBe(W0);
    expect(p1.weeks).toHaveLength(13);
    const p2 = await openMrpGrid(db, addWeeks(W0, 26));
    const row1 = p1.rows.find((r) => r.item.itemType === "RM" && Object.values(r.cells).some((c) => c.gross))!;
    expect(row1).toBeDefined();
    const row2 = p2.rows.find((r) => r.item.code === row1.item.code)!;
    let proj = milliOf(row1.available);
    const check = (row: typeof row1, weeks: string[], skipChain = false) => {
      for (const w of weeks) {
        const c = row.cells[w];
        proj += milliOf(c.receipt ?? "0") - milliOf(c.gross ?? "0");
        if (!skipChain) expect(milliOf(c.projected!)).toBe(proj);
      }
    };
    check(row1, p1.weeks);
    // 셋째 쪽(k=2): 사이의 둘째 쪽 13주를 건너뛰어 열어도 첫 쪽부터 이어 셈한 값이어야 한다
    const mid = (await openMrpGrid(db, addWeeks(W0, 13))).rows.find((r) => r.item.code === row1.item.code)!;
    check(mid, Object.keys(mid.cells).sort(), true);
    check(row2, p2.weeks);
  });

  it("완제품 줄 — fromMps, 총소요 · 예상재고 없음, 입고는 MPS 수량", async () => {
    const g = await openMrpGrid(db, W0);
    const fg = g.rows.find((r) => r.item.code === "FG-0001")!;
    expect(fg.fromMps).toBe(true);
    expect(Object.values(fg.cells).every((c) => c.gross === null && c.projected === null)).toBe(true);
    const supply = (await mpsSupply(db, addWeeks(W0, 51), TODAY)).filter((s) => s.item === "FG-0001");
    const week = supply.find((s) => g.weeks.includes(s.week))!;
    expect(fg.cells[week.week].receipt).toBe(week.qty);
  });
});

// postgres 드라이버는 행의 배열을, PGlite 는 { rows } 를 돌려준다.
function rowsOf(result: unknown): { n: number }[] {
  return (Array.isArray(result) ? result : (result as { rows: { n: number }[] }).rows) as { n: number }[];
}

describe("[MRP 실행] 페깅 저장", () => {
  const rowsOf = async <T>(q: SQL) => ((await db.execute(q)) as unknown as { rows: T[] }).rows;

  it("실행은 페깅을 저장하고 has_pegs 를 켠다", async () => {
    await ran();
    const all = await runs();
    expect(all[all.length - 1].hasPegs).toBe(true);
    const [{ n }] = await db.select({ n: count() }).from(mrpPegs);
    expect(n).toBeGreaterThan(0);
  });

  it("저장한 페깅의 합 — 계획오더마다 공급 줄 합 = 수량, 품목 × 주마다 ORDER 줄 합 = mrp_gross", async () => {
    // 계획오더마다: 그 계획오더를 공급으로 하는 줄의 합 = 수량 + (남는 수량은 SURPLUS 줄이라 이미 들어 있다).
    const bySupply = await rowsOf<{ number: string; qty: string; pegged: string }>(sql`
      select o.number, o.qty::text as qty, coalesce(sum(p.qty), 0)::text as pegged
      from mrp_planned_orders o
      left join mrp_pegs p on p.supply_order_id = o.id
      where o.mps_week is null
      group by o.id, o.number, o.qty
      order by o.number`);
    expect(bySupply.length).toBeGreaterThan(0);
    for (const r of bySupply) expect(Number(r.pegged)).toBeCloseTo(Number(r.qty), 3);

    // 품목 × 주마다: ORDER 줄(필요일이 속한 주)의 합 = 저장된 총소요.
    const byWeek = await rowsOf<{ item_id: number; week: string; gross: string; pegged: string }>(sql`
      select g.item_id, g.week_start::text as week, g.qty::text as gross,
        coalesce((select sum(p.qty) from mrp_pegs p
          where p.run_id = g.run_id and p.item_id = g.item_id and p.kind = 'ORDER'
            and date_trunc('week', p.need_date)::date = g.week_start), 0)::text as pegged
      from mrp_gross g
      where g.item_id in (select item_id from mrp_pegs)
      order by g.item_id, g.week_start`);
    expect(byWeek.length).toBeGreaterThan(0);
    for (const r of byWeek) expect(Number(r.pegged)).toBeCloseTo(Number(r.gross), 3);
  });

  it("완제품 계획오더에 MPS 주 · 고정이 남는다", async () => {
    await ran();
    const supply = (await mpsSupply(db, addWeeks(W0, 51), TODAY)).filter((s) => s.item === "FG-0001");
    expect(supply.length).toBeGreaterThan(0);
    const rows = await rowsOf<{ mps_week: string; mps_fixed: boolean; qty: string }>(sql`
      select o.mps_week::text as mps_week, o.mps_fixed, o.qty::text as qty
      from mrp_planned_orders o join items i on i.id = o.item_id
      where i.code = 'FG-0001' order by o.due_date`);
    expect(rows.map((r) => [r.mps_week, r.mps_fixed])).toEqual(supply.map((s) => [s.week, s.fixed]));
  });

  it("두 번 실행하면 앞 실행의 페깅 줄이 남지 않는다", async () => {
    await ran();
    await ran();
    const all = await runs();
    const latest = all[all.length - 1].id;
    const ids = await db.selectDistinct({ runId: mrpPegs.runId }).from(mrpPegs);
    expect(ids).toEqual([{ runId: latest }]);
  });

  it("되돌림이 페깅을 비우고 다시 만든다", async () => {
    await ran();
    await resetToSample(db, TODAY);
    const all = await runs();
    const latest = all[all.length - 1].id;
    const ids = await db.selectDistinct({ runId: mrpPegs.runId }).from(mrpPegs);
    expect(ids).toEqual([{ runId: latest }]);
  });
});
