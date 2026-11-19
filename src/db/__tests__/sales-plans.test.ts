// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetToSample } from "@/db/reset";
import { items, partners, salesPlanChanges, salesPlans } from "@/db/schema";
import type { Db } from "@/db/types";
import { migratedDb, rejection } from "./pglite";

// 판매계획(메뉴 「판매계획」) — 표의 제약을 PGlite 에서 실제 SQL 로. 바탕은 샘플로 되돌린 뒤 판매계획 표만 비운 DB 다.

const TODAY = "2026-11-12";
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
