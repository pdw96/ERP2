// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { items, processes, routingMaterials, routings, routingSteps, workCenters } from "@/db/schema";
import type { Db } from "@/db/types";
import { migratedDb, rejection, resetWithoutStock } from "./pglite";

// 라우팅 표의 제약(메뉴 「라우팅」) — PGlite 에서 실제 SQL 로.

let handle: Awaited<ReturnType<typeof migratedDb>>;
let db: Db;

beforeAll(async () => {
  handle = await migratedDb();
  db = handle.db;
  await resetWithoutStock(db);
});
beforeEach(async () => {
  await db.delete(routings);
});
afterAll(() => handle.close());

/** 공정 코드마다 하나씩 작업장을 골라, 공정과 맞는 줄 · 맞지 않는 줄을 만든다. */
async function pick() {
  const [item] = await db.select({ id: items.id }).from(items).where(eq(items.code, "SF-0001"));
  const centers = await db
    .select({ id: workCenters.id, processId: workCenters.processId })
    .from(workCenters)
    .orderBy(workCenters.id);
  const first = centers[0];
  const other = (await db.select({ id: processes.id }).from(processes)).find((p) => p.id !== first.processId)!;
  const [rm] = await db.select({ id: items.id }).from(items).where(eq(items.code, "RM-0001"));
  const [head] = await db.insert(routings).values({ itemId: item.id }).returning({ id: routings.id });
  return { head, first, otherProcessId: other.id, rm };
}

describe("라우팅 표의 제약", () => {
  it("공정과 맞지 않는 작업장은 넣지 못한다", async () => {
    const { head, first, otherProcessId } = await pick();
    const e = await rejection(
      db.insert(routingSteps).values({
        routingId: head.id,
        seq: 10,
        processId: otherProcessId,
        workCenterId: first.id,
        setupMin: 0,
        runMs: 0,
      }),
    );
    expect(e.constraint).toBe("routing_steps_work_center_fk");
  });

  it("순번은 10 단위 10 ~ 500 이다", async () => {
    const { head, first } = await pick();
    const e = await rejection(
      db.insert(routingSteps).values({
        routingId: head.id,
        seq: 15,
        processId: first.processId,
        workCenterId: first.id,
        setupMin: 0,
        runMs: 0,
      }),
    );
    expect(e.constraint).toBe("routing_steps_seq_range");
  });

  it("같은 라우팅에 같은 자재를 두 번 붙이지 못한다", async () => {
    const { head, first, rm } = await pick();
    await db.insert(routingSteps).values({
      routingId: head.id,
      seq: 10,
      processId: first.processId,
      workCenterId: first.id,
      setupMin: 0,
      runMs: 0,
    });
    await db.insert(routingMaterials).values({ routingId: head.id, seq: 10, itemId: rm.id });
    const e = await rejection(db.insert(routingMaterials).values({ routingId: head.id, seq: 10, itemId: rm.id }));
    expect(e.constraint).toBe("routing_materials_item_unique");
  });

  it("없는 순번을 가리키는 자재는 넣지 못한다", async () => {
    const { head, rm } = await pick();
    const e = await rejection(db.insert(routingMaterials).values({ routingId: head.id, seq: 20, itemId: rm.id }));
    expect(e.constraint).toBe("routing_materials_step_fk");
  });
});
