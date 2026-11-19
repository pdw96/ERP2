// @vitest-environment node
import { count, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getUnitSpec, updateCode } from "@/db/codes";
import { createItem, loadItemsForSheet, saveItemRows, updateItem } from "@/db/items";
import { limitMessage, STALE } from "@/db/master-shared";
import { resetToSample } from "@/db/reset";
import {
  itemsInSalesPlans,
  openSalesPlan,
  parseSalesPlanFilter,
  SALES_PLAN_CELL_LIMIT,
  SALES_PLAN_CHANGE_LIMIT,
  salesPlanDemand,
  salesPlanHistory,
  salesPlanOptions,
  salesPlanQuantitiesFit,
  saveSalesPlan,
  type SalesPlanFilter,
  type SalesPlanSaveResult,
  type SalesPlanSheet,
} from "@/db/sales-plans";
import { items, partners, salesPlanChanges, salesPlans } from "@/db/schema";
import type { Db } from "@/db/types";
import { cellKey, type SalesPlanCellInput } from "@/lib/sales-plan-input";
import { CODE_KEY, ROW_ERROR } from "@/lib/sheet";
import { addWeeks } from "@/lib/weeks";
import { migratedDb, rejection } from "./pglite";

// 판매계획(메뉴 「판매계획」) — 표의 제약과 열기 · 저장 · 고친 이력 · 품목 합계를 PGlite 에서 실제 SQL 로.
// 바탕은 샘플로 되돌린 뒤 판매계획 표만 비운 DB 다. 오늘은 2026-11-19(목), 이번 주는 2026-11-16.

const TODAY = "2026-11-19";
let handle: Awaited<ReturnType<typeof migratedDb>>;
let db: Db;

beforeAll(async () => {
  handle = await migratedDb();
  db = handle.db;
});
beforeEach(async () => {
  await resetToSample(db, TODAY);
  await db.execute(sql`truncate table sales_plan_changes, sales_plans restart identity`);
});
afterAll(() => handle.close());

describe("판매계획 표의 제약", () => {
  async function ids() {
    const [p] = await db.select({ id: partners.id }).from(partners).limit(1);
    const [i] = await db.select({ id: items.id }).from(items).limit(1);
    return { partnerId: p.id, itemId: i.id };
  }

  it("월요일이 아닌 주는 거절한다", async () => {
    const r = await rejection(db.insert(salesPlans).values({ ...(await ids()), weekStart: "2026-11-17", qty: 5 }));
    expect(r.constraint).toBe("sales_plans_monday");
  });

  it("수량 0 은 거절한다", async () => {
    const r = await rejection(db.insert(salesPlans).values({ ...(await ids()), weekStart: "2026-11-16", qty: 0 }));
    expect(r.constraint).toBe("sales_plans_qty_range");
  });

  it("같은 고객 · 품목 · 주는 두 번 넣지 못한다", async () => {
    const v = { ...(await ids()), weekStart: "2026-11-16", qty: 5 };
    await db.insert(salesPlans).values(v);
    const r = await rejection(db.insert(salesPlans).values(v));
    expect(r.constraint).toBe("sales_plans_cell_unique");
  });

  it("고친 이력은 전 · 후가 둘 다 비면 거절한다", async () => {
    const r = await rejection(db.insert(salesPlanChanges).values({ ...(await ids()), weekStart: "2026-11-16" }));
    expect(r.constraint).toBe("sales_plan_changes_some");
  });
});

const TW = "2026-11-16"; // 이번 주
const W1 = "2026-11-23";
const W2 = "2026-11-30";

const cell = (customer: string, item: string, week: string, before: string, after: string): SalesPlanCellInput => ({
  customer,
  item,
  week,
  before,
  after,
});

async function save(cells: SalesPlanCellInput[]): Promise<SalesPlanSaveResult> {
  return saveSalesPlan(db, cells, TODAY);
}

async function open(filter: SalesPlanFilter = {}, from = TW): Promise<SalesPlanSheet> {
  return openSalesPlan(db, { from, filter }, TODAY);
}

async function storedCount(): Promise<number> {
  const [{ n }] = await db.select({ n: count() }).from(salesPlans);
  return n;
}

async function changeCount(): Promise<number> {
  const [{ n }] = await db.select({ n: count() }).from(salesPlanChanges);
  return n;
}

describe("판매계획 열기 · 저장 · 고친 이력", () => {
  it("새 칸을 저장하면 줄이 생기고 이력이 「없음 → 3000」으로 남는다", async () => {
    expect(await save([cell("BP-0004", "FG-0001", W1, "", "3,000")])).toEqual({ ok: true, changed: 1 });

    const sheet = await open();
    expect(sheet.thisWeek).toBe(TW);
    expect(sheet.weeks).toHaveLength(13);
    expect(sheet.weeks[0]).toBe(TW);
    expect(sheet.filtered).toBe(false);
    expect(sheet.rows).toHaveLength(1);
    expect(sheet.rows[0].customer).toMatchObject({ code: "BP-0004", active: true, isCustomer: true });
    expect(sheet.rows[0].item).toMatchObject({ code: "FG-0001", unit: "EA", decimals: 0, active: true });
    expect(sheet.rows[0].cells).toEqual({ [W1]: "3000" });

    const history = await salesPlanHistory(db, {});
    expect(history.total).toBe(1);
    expect(history.rows[0]).toMatchObject({
      customer: { code: "BP-0004" },
      item: { code: "FG-0001" },
      week: W1,
      before: null,
      after: "3000",
    });
    expect(history.rows[0].savedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it("고치면 「3000 → 4000」, 비우면 칸과 줄이 사라지고 「4000 → 없음」", async () => {
    await save([cell("BP-0004", "FG-0001", W1, "", "3000")]);
    expect(await save([cell("BP-0004", "FG-0001", W1, "3000", "4000")])).toEqual({ ok: true, changed: 1 });
    expect((await open()).rows[0].cells[W1]).toBe("4000");
    expect((await salesPlanHistory(db, {})).rows[0]).toMatchObject({ before: "3000", after: "4000" });

    expect(await save([cell("BP-0004", "FG-0001", W1, "4,000", "")])).toEqual({ ok: true, changed: 1 });
    expect(await storedCount()).toBe(0);
    expect((await open()).rows).toEqual([]);
    const history = await salesPlanHistory(db, {});
    expect(history.total).toBe(3);
    // 최근 것부터.
    expect(history.rows.map((r) => [r.before, r.after])).toEqual([
      ["4000", null],
      ["3000", "4000"],
      [null, "3000"],
    ]);
  });

  it("0 은 그 칸을 지운다", async () => {
    await save([cell("BP-0004", "FG-0001", W1, "", "3000")]);
    expect(await save([cell("BP-0004", "FG-0001", W1, "3000", "0")])).toEqual({ ok: true, changed: 1 });
    expect(await storedCount()).toBe(0);
  });

  it("before 가 지금 값과 다르면 STALE 이고 같은 저장의 다른 칸도 저장하지 않는다", async () => {
    await save([cell("BP-0004", "FG-0001", W1, "", "3000")]);
    const r = await save([cell("BP-0004", "FG-0001", W2, "", "1000"), cell("BP-0004", "FG-0001", W1, "2000", "5000")]);
    expect(r).toEqual({ ok: false, errors: {}, formError: STALE });
    expect(await storedCount()).toBe(1);
    expect(await changeCount()).toBe(1);
    // 남이 먼저 만든 칸을 새 칸으로 넣어도 STALE.
    expect(await save([cell("BP-0004", "FG-0001", W1, "", "5000")])).toMatchObject({ formError: STALE });
  });

  it("같은 칸을 두 사람이 고치면 뒤의 사람은 STALE, 다른 고객의 칸을 고친 두 저장은 둘 다 선다", async () => {
    await save([cell("BP-0004", "FG-0001", W1, "", "3000"), cell("BP-0005", "FG-0001", W1, "", "2000")]);

    const same = await Promise.all([
      save([cell("BP-0004", "FG-0001", W1, "3000", "4000")]),
      save([cell("BP-0004", "FG-0001", W1, "3000", "6000")]),
    ]);
    expect(same.filter((r) => r.ok)).toHaveLength(1);
    expect(same.find((r) => !r.ok)).toEqual({ ok: false, errors: {}, formError: STALE });

    const other = await Promise.all([
      save([cell("BP-0004", "FG-0001", W2, "", "1000")]),
      save([cell("BP-0005", "FG-0001", W2, "", "1500")]),
    ]);
    expect(other).toEqual([
      { ok: true, changed: 1 },
      { ok: true, changed: 1 },
    ]);
    const sheet = await open();
    expect(sheet.rows.map((r) => [r.customer.code, r.cells[W2]])).toEqual([
      ["BP-0004", "1000"],
      ["BP-0005", "1500"],
    ]);
  });

  it("바뀐 것이 없는 저장은 아무것도 쓰지 않는다", async () => {
    await save([cell("BP-0004", "FG-0001", W1, "", "3000")]);
    const before = await changeCount();
    expect(await save([cell("BP-0004", "FG-0001", W1, "3000", "3,000")])).toEqual({ ok: true, changed: 0 });
    expect(await save([cell("BP-0004", "FG-0001", W2, "", "0")])).toEqual({ ok: true, changed: 0 });
    expect(await save([])).toEqual({ ok: true, changed: 0 });
    expect(await changeCount()).toBe(before);
  });

  it("한 저장의 이력은 같은 일시로 남는다", async () => {
    await save([cell("BP-0004", "FG-0001", W1, "", "3000"), cell("BP-0004", "FG-0001", W2, "", "4000")]);
    const rows = await db.select({ at: sql<string>`${salesPlanChanges.savedAt}::text` }).from(salesPlanChanges);
    expect(new Set(rows.map((r) => r.at)).size).toBe(1);
  });
});

describe("판매계획 저장 — 화면을 거치지 않은 요청", () => {
  it("지난 주는 고치지 못하고 아무것도 쓰지 않는다", async () => {
    const key = cellKey("BP-0004", "FG-0001", "2026-11-09");
    const r = await save([
      cell("BP-0004", "FG-0001", W1, "", "1000"),
      cell("BP-0004", "FG-0001", "2026-11-09", "", "1000"),
    ]);
    expect(r).toEqual({ ok: false, errors: { [key]: "지난 주는 고치지 못합니다" } });
    expect(await storedCount()).toBe(0);
    expect(await changeCount()).toBe(0);
  });

  it("52주 넘는 주 · 월요일 아닌 주는 거절한다", async () => {
    const far = addWeeks(TW, 52);
    const r = await save([cell("BP-0004", "FG-0001", far, "", "1000")]);
    expect(r).toEqual({ ok: false, errors: { [cellKey("BP-0004", "FG-0001", far)]: "51주 뒤까지만 넣습니다" } });
    // 51주 뒤는 받는다.
    expect(await save([cell("BP-0004", "FG-0001", addWeeks(TW, 51), "", "1000")])).toEqual({ ok: true, changed: 1 });

    const tue = await save([cell("BP-0004", "FG-0001", "2026-11-17", "", "1000")]);
    expect(tue.ok).toBe(false);
    if (!tue.ok) expect(tue.errors[cellKey("BP-0004", "FG-0001", "2026-11-17")]).toBeTruthy();
  });

  it("반제품 · 없는 품목 · 없는 고객 · 자릿수가 넘는 수량은 거절한다", async () => {
    const r = await save([
      cell("BP-0004", "SF-0001", W1, "", "1000"),
      cell("BP-0004", "FG-9999", W1, "", "1000"),
      cell("BP-9999", "FG-0001", W1, "", "1000"),
      cell("BP-0004", "FG-0001", W1, "", "1.5"),
      cell("BP-0004", "FG-0002", W1, "abc", "1000"),
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors)).toHaveLength(5);
    expect(r.errors[cellKey("BP-0004", "FG-9999", W1)]).toBe("없는 품목입니다");
    expect(r.errors[cellKey("BP-9999", "FG-0001", W1)]).toBe("없는 고객입니다");
    expect(r.errors[cellKey("BP-0004", "FG-0001", W1)]).toBe("이 품목의 수량은 소수로 적을 수 없습니다.");
    expect(await storedCount()).toBe(0);
  });

  it("반제품 · 원자재는 「판매계획은 완제품에만 있습니다」", async () => {
    const r = await save([cell("BP-0004", "SF-0001", W1, "", "1000"), cell("BP-0004", "RM-0001", W1, "", "1000")]);
    expect(r).toEqual({
      ok: false,
      errors: {
        [cellKey("BP-0004", "SF-0001", W1)]: "판매계획은 완제품에만 있습니다",
        [cellKey("BP-0004", "RM-0001", W1)]: "판매계획은 완제품에만 있습니다",
      },
    });
  });

  it("매출처가 아닌 거래처로 새 줄을 넣지 못한다 — 있던 줄은 매출처를 끄고 사용 안 함이어도 고친다", async () => {
    const key = cellKey("BP-0001", "FG-0001", W1);
    expect(await save([cell("BP-0001", "FG-0001", W1, "", "1000")])).toEqual({
      ok: false,
      errors: { [key]: "「사용 안 함」이거나 매출처가 아닌 거래처라 새 줄을 넣지 못합니다" },
    });
    expect(await storedCount()).toBe(0);

    await db.update(partners).set({ isCustomer: true }).where(eq(partners.code, "BP-0001"));
    expect(await save([cell("BP-0001", "FG-0001", W1, "", "1000")])).toEqual({ ok: true, changed: 1 });
    await db.update(partners).set({ isCustomer: false, active: false }).where(eq(partners.code, "BP-0001"));
    expect(
      await save([cell("BP-0001", "FG-0001", W1, "1000", "2000"), cell("BP-0001", "FG-0001", W2, "", "500")]),
    ).toEqual({ ok: true, changed: 2 });
    const row = (await open()).rows.find((r) => r.customer.code === "BP-0001")!;
    expect(row.customer).toMatchObject({ active: false, isCustomer: false });
  });

  it("사용 안 함 품목으로 새 줄을 넣지 못한다", async () => {
    await db.update(items).set({ active: false }).where(eq(items.code, "FG-0002"));
    expect(await save([cell("BP-0004", "FG-0002", W1, "", "1000")])).toEqual({
      ok: false,
      errors: { [cellKey("BP-0004", "FG-0002", W1)]: "「사용 안 함」 품목이라 새 줄을 넣지 못합니다" },
    });
  });

  it("꼴이 틀린 요청 · 같은 칸 둘 · 2,000칸 넘음은 formError", async () => {
    const FORM = "저장하지 못했습니다 — 화면을 새로 여세요";
    expect(await saveSalesPlan(db, "x" as unknown as SalesPlanCellInput[], TODAY)).toEqual({
      ok: false,
      errors: {},
      formError: FORM,
    });
    expect(
      await saveSalesPlan(db, [{ customer: "BP-0004", item: "FG-0001", week: W1, before: "" }] as never, TODAY),
    ).toEqual({ ok: false, errors: {}, formError: FORM });
    expect(await saveSalesPlan(db, [{ ...cell("BP-0004", "FG-0001", W1, "", ""), after: 5 }] as never, TODAY)).toEqual({
      ok: false,
      errors: {},
      formError: FORM,
    });

    const dup = await save([cell("BP-0004", "FG-0001", W1, "", "1"), cell("BP-0004", "FG-0001", W1, "", "2")]);
    expect(dup).toMatchObject({ ok: false, errors: {} });
    if (!dup.ok) expect(dup.formError).toBeTruthy();

    const many = Array.from({ length: 2001 }, (_, i) =>
      cell(`BP-${String(i).padStart(4, "0")}`, "FG-0001", W1, "", "1"),
    );
    expect(await save(many)).toEqual({
      ok: false,
      errors: {},
      formError: "한 번에 2,000칸까지 저장합니다 — 나눠 저장하세요",
    });
    expect(await storedCount()).toBe(0);
  });
});

describe("판매계획 — 품목 합계 · 거르기 · 고친 이력의 범위", () => {
  it("품목 합계는 모든 고객의 합이고 거르기와 상관없다", async () => {
    await save([cell("BP-0004", "FG-0001", W1, "", "3000"), cell("BP-0005", "FG-0001", W1, "", "2000")]);
    expect(await salesPlanDemand(db, TW, addWeeks(TW, 12))).toEqual([{ item: "FG-0001", week: W1, qty: "5000" }]);
    // 두 끝을 포함한다.
    expect(await salesPlanDemand(db, W1, W1)).toEqual([{ item: "FG-0001", week: W1, qty: "5000" }]);
    expect(await salesPlanDemand(db, W2, addWeeks(TW, 12))).toEqual([]);

    const sheet = await open({ customer: "BP-0004" });
    expect(sheet.filtered).toBe(true);
    expect(sheet.rows.map((r) => r.customer.code)).toEqual(["BP-0004"]);
    expect(sheet.totals).toHaveLength(1);
    expect(sheet.totals[0].item.code).toBe("FG-0001");
    expect(sheet.totals[0].cells).toEqual({ [W1]: "5000" });
  });

  it("줄은 고객 코드 · 품목 코드 차례이고, 칸은 그 13주 것만 · 다른 쪽에만 칸이 있어도 줄은 보인다", async () => {
    const late = addWeeks(TW, 20);
    await save([
      cell("BP-0007", "FG-0001", W1, "", "1000"),
      cell("BP-0004", "FG-0002", late, "", "500"),
      cell("BP-0004", "FG-0001", W2, "", "1,000"),
    ]);
    const sheet = await open();
    expect(sheet.rows.map((r) => `${r.customer.code}/${r.item.code}`)).toEqual([
      "BP-0004/FG-0001",
      "BP-0004/FG-0002",
      "BP-0007/FG-0001",
    ]);
    expect(sheet.rows[1].cells).toEqual({});
    expect(sheet.rows[0].cells).toEqual({ [W2]: "1000" });
    // 합계는 그 13주에 계획이 있는 품목만.
    expect(sheet.totals.map((t) => t.item.code)).toEqual(["FG-0001"]);

    const next = await open({}, addWeeks(TW, 13));
    expect(next.weeks[0]).toBe(addWeeks(TW, 13));
    expect(next.rows[1].cells).toEqual({ [late]: "500" });
    expect(next.totals.map((t) => t.item.code)).toEqual(["FG-0002"]);

    expect((await open({ item: "FG-0002" })).rows.map((r) => r.item.code)).toEqual(["FG-0002"]);
  });

  it("거르기 후보(planned)는 거르기와 상관없이 칸이 있는 모든 고객 · 품목 — 「사용 안 함」 · 매출처 아님도 남는다", async () => {
    await save([
      cell("BP-0004", "FG-0001", W1, "", "3000"),
      cell("BP-0007", "FG-0002", addWeeks(TW, 20), "", "500"),
      cell("BP-0005", "FG-0001", W2, "", "100"),
    ]);
    await db
      .update(partners)
      .set({ active: false, isCustomer: false, isSupplier: true })
      .where(eq(partners.code, "BP-0007"));
    await db.update(items).set({ active: false }).where(eq(items.code, "FG-0002"));

    for (const filter of [{}, { customer: "BP-0004" }, { item: "FG-0001" }, { customer: "BP-0005", item: "FG-0001" }]) {
      const { planned } = await open(filter);
      expect(planned.customers.map((c) => c.code)).toEqual(["BP-0004", "BP-0005", "BP-0007"]);
      expect(planned.customers[2]).toMatchObject({ active: false, isCustomer: false });
      expect(planned.items.map((i) => i.code)).toEqual(["FG-0001", "FG-0002"]);
      expect(planned.items[1]).toMatchObject({ active: false });
    }
    expect((await open({ customer: "BP-0004" })).rows.map((r) => r.customer.code)).toEqual(["BP-0004"]);
  });

  it("열기는 한 스냅숏(읽기 전용 REPEATABLE READ 트랜잭션)에서 줄 · 합계를 읽는다", async () => {
    await save([cell("BP-0004", "FG-0001", W1, "", "3000"), cell("BP-0005", "FG-0001", W1, "", "2000")]);
    const spy = vi.spyOn(db, "transaction");
    try {
      const sheet = await open({ customer: "BP-0004" });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][1]).toEqual({ isolationLevel: "repeatable read", accessMode: "read only" });
      expect(sheet.rows.map((r) => [r.customer.code, r.cells])).toEqual([["BP-0004", { [W1]: "3000" }]]);
      expect(sheet.totals.map((t) => [t.item.code, t.cells])).toEqual([["FG-0001", { [W1]: "5000" }]]);
    } finally {
      spy.mockRestore();
    }
  });

  it("칸이 하나도 없으면 줄 · 합계 · 거르기 후보가 모두 빈다", async () => {
    const sheet = await open();
    expect(sheet.rows).toEqual([]);
    expect(sheet.totals).toEqual([]);
    expect(sheet.planned).toEqual({ customers: [], items: [] });
  });

  it("고친 이력은 거르기를 따른다", async () => {
    await save([cell("BP-0004", "FG-0001", W1, "", "3000"), cell("BP-0007", "FG-0002", W1, "", "500")]);
    const byItem = await salesPlanHistory(db, { item: "FG-0002" });
    expect(byItem.total).toBe(1);
    expect(byItem.rows.map((r) => r.item.code)).toEqual(["FG-0002"]);
    const byCustomer = await salesPlanHistory(db, { customer: "BP-0004" });
    expect(byCustomer.rows.map((r) => r.customer.code)).toEqual(["BP-0004"]);
    expect((await salesPlanHistory(db, {})).total).toBe(2);
  });

  it("거르기 값의 꼴이 틀리면 버린다", () => {
    expect(parseSalesPlanFilter({ customer: "BP-0004", item: "FG-0001" })).toEqual({
      customer: "BP-0004",
      item: "FG-0001",
    });
    expect(parseSalesPlanFilter({ customer: "x", item: "SF-0001" })).toEqual({});
    expect(parseSalesPlanFilter({ customer: ["BP-0005", "BP-0004"] })).toEqual({ customer: "BP-0005" });
  });

  it("고를 것은 「사용」 매출처 · 「사용」 완제품, 코드 차례", async () => {
    await db.update(partners).set({ active: false }).where(eq(partners.code, "BP-0007"));
    const { customers, items: fg } = await salesPlanOptions(db);
    expect(customers.map((c) => c.code)).toEqual(["BP-0004", "BP-0005"]);
    expect(customers.every((c) => c.active && c.isCustomer)).toBe(true);
    expect(fg.map((i) => i.code)).toEqual(["FG-0001", "FG-0002"]);
  });
});

describe("판매계획 — 상한", () => {
  it("저장 뒤 칸이 20,000 을 넘으면 · 이력이 50,000 을 넘으면 저장하지 않는다", async () => {
    const [p] = await db.select({ id: partners.id }).from(partners).where(eq(partners.code, "BP-0005"));
    const [i] = await db.select({ id: items.id }).from(items).where(eq(items.code, "FG-0002"));
    // 표에 바로 채운다 — 지난 주 쪽으로 SALES_PLAN_CELL_LIMIT 칸.
    await db.execute(sql`
      insert into sales_plans (partner_id, item_id, week_start, qty)
      select ${p.id}, ${i.id}, date '2026-11-16' - (g * 7), 1 from generate_series(1, ${SALES_PLAN_CELL_LIMIT}) g`);
    const r = await save([cell("BP-0004", "FG-0001", W1, "", "1")]);
    expect(r).toEqual({ ok: false, errors: {}, formError: limitMessage("판매계획 칸", SALES_PLAN_CELL_LIMIT) });

    await db.execute(sql`truncate table sales_plans`);
    await db.execute(sql`
      insert into sales_plan_changes (partner_id, item_id, week_start, after)
      select ${p.id}, ${i.id}, date '2026-11-16', 1 from generate_series(1, ${SALES_PLAN_CHANGE_LIMIT - 1}) g`);
    expect(await save([cell("BP-0004", "FG-0001", W1, "", "1"), cell("BP-0004", "FG-0001", W2, "", "1")])).toEqual({
      ok: false,
      errors: {},
      formError: limitMessage("판매계획 고친 이력", SALES_PLAN_CHANGE_LIMIT),
    });
    expect(await save([cell("BP-0004", "FG-0001", W1, "", "1")])).toEqual({ ok: true, changed: 1 });
  });
});

describe("판매계획 — 단위의 도우미", () => {
  it("itemsInSalesPlans 는 칸이 있는 품목만 · salesPlanQuantitiesFit 은 자릿수에 맞는지", async () => {
    await save([cell("BP-0004", "FG-0001", W1, "", "1000")]);
    const fg = await db
      .select({ id: items.id, code: items.code })
      .from(items)
      .where(inArray(items.code, ["FG-0001", "FG-0002"]));
    const id = (c: string) => fg.find((r) => r.code === c)!.id;
    expect(await itemsInSalesPlans(db, [id("FG-0001"), id("FG-0002")])).toEqual(new Set([id("FG-0001")]));
    expect(await itemsInSalesPlans(db, [])).toEqual(new Set());
    expect(await salesPlanQuantitiesFit(db, "EA", 0)).toBe(true);
    await db.execute(sql`update sales_plans set qty = 1000.5`);
    expect(await salesPlanQuantitiesFit(db, "EA", 0)).toBe(false);
    // 소수는 끝 0 없이 읽는다.
    expect((await open()).rows[0].cells).toEqual({ [W1]: "1000.5" });
    expect(await salesPlanDemand(db, W1, W1)).toEqual([{ item: "FG-0001", week: W1, qty: "1000.5" }]);
    expect(await salesPlanQuantitiesFit(db, "EA", 1)).toBe(true);
    expect(await salesPlanQuantitiesFit(db, "KG", 0)).toBe(true);
  });
});

describe("단위 — 판매계획에 든 품목은 단위 · 자릿수를 바꾸지 못한다", () => {
  const PLAN_UNIT = "판매계획에 든 품목이라 단위를 바꾸지 못합니다 — 계획 수량의 뜻이 바뀝니다";
  const base = {
    procurement: "MAKE",
    name: "계획 완제품",
    leadTimeDays: "0",
    safetyStock: "0",
    minLot: "0",
    lotMultiple: "0",
    active: "Y",
    lotManaged: "on",
  };

  async function newFg(unit = "EA"): Promise<string> {
    const r = await createItem(db, { itemType: "FG", unit, ...base });
    if (!r.ok) throw new Error(JSON.stringify(r));
    return r.code;
  }
  const kg = (decimals: string) => ({ name: "킬로그램", sortOrder: "30", active: "Y", decimals });

  it("한 건 수정 — 판매계획에 들면 거절, 계획을 비우면 바뀐다", async () => {
    const fg = await newFg();
    expect(await save([cell("BP-0004", fg, W1, "", "5")])).toEqual({ ok: true, changed: 1 });
    expect(await updateItem(db, fg, { ...base, unit: "KG" })).toMatchObject({ ok: false, errors: { unit: PLAN_UNIT } });
    expect(await save([cell("BP-0004", fg, W1, "5", "")])).toEqual({ ok: true, changed: 1 });
    expect(await updateItem(db, fg, { ...base, unit: "KG" })).toEqual({ ok: true, code: fg });
  });

  it("시트 — 판매계획에 든 품목의 단위를 바꾸는 줄만 남고 다른 줄은 저장된다", async () => {
    const planned = await newFg();
    const other = await newFg();
    expect(await save([cell("BP-0004", planned, W1, "", "5")])).toEqual({ ok: true, changed: 1 });
    const rows = (await loadItemsForSheet(db, { q: "", includeInactive: true })).rows;
    const r = await saveItemRows(db, [
      { ...rows.find((x) => x[CODE_KEY] === planned)!, unit: "KG" },
      { ...rows.find((x) => x[CODE_KEY] === other)!, unit: "KG" },
    ]);
    expect(r.saved.map((s) => s.code)).toEqual([other]);
    expect(r.rejected[0].errors.unit ?? r.rejected[0].errors[ROW_ERROR]).toBe(PLAN_UNIT);
  });

  it("단위 자릿수를 줄이는 고침 — 판매계획 1.25 가 있으면 KG 을 1자리로 줄이지 못하고, 1.2 로 고치면 줄인다", async () => {
    const fg = await newFg("KG");
    expect(await save([cell("BP-0004", fg, W1, "", "1.25")])).toEqual({ ok: true, changed: 1 });
    expect(await updateCode(db, "UNIT", "KG", kg("1"))).toMatchObject({
      ok: false,
      errors: { decimals: expect.stringContaining("판매계획 수량") },
    });
    expect((await getUnitSpec(db, "KG"))!.decimals).toBe(3);
    expect(await save([cell("BP-0004", fg, W1, "1.25", "1.2")])).toEqual({ ok: true, changed: 1 });
    expect((await updateCode(db, "UNIT", "KG", kg("1"))).ok).toBe(true);
    expect((await getUnitSpec(db, "KG"))!.decimals).toBe(1);
  });

  it("소수 수량 1.5 를 저장한 뒤 「1.50 → 2」로 고치면 STALE 이 아니라 바뀐다", async () => {
    const fg = await newFg("KG");
    expect(await save([cell("BP-0004", fg, W1, "", "1.5")])).toEqual({ ok: true, changed: 1 });
    const r = await save([cell("BP-0004", fg, W1, "1.50", "2")]);
    expect(r.ok && r.changed).toBe(1);
    const [row] = await db
      .select({ q: sql<string>`${salesPlans.qty}::text` })
      .from(salesPlans)
      .innerJoin(items, eq(items.id, salesPlans.itemId))
      .where(eq(items.code, fg));
    expect(Number(row.q)).toBe(2);
    expect((await open({ item: fg }, W1)).rows[0].cells).toEqual({ [W1]: "2" });
  });
});
