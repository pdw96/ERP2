// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { limitMessage } from "@/db/master-shared";
import { MRP_SETTING_CHANGE_LIMIT, MRP_SETTING_HISTORY_SHOWN, mrpSettings, saveMrpSettings } from "@/db/mrp";
import { resetToSample } from "@/db/reset";
import type { Db } from "@/db/types";
import { WEEKDAY_NAMES } from "@/lib/mrp-calc";
import { migratedDb, rejection } from "./pglite";

// MRP(메뉴 「MRP」)의 표 · 완성일 기준 요일 설정과 그 이력을 PGlite 에서 실제 SQL 로.

const BAD = "완성일 기준 요일을 고르세요";

let handle: Awaited<ReturnType<typeof migratedDb>>;
let db: Db;
beforeAll(async () => {
  handle = await migratedDb();
  db = handle.db;
});
afterAll(() => handle.close());
beforeEach(() => resetToSample(db));

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
    await resetToSample(db);
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
