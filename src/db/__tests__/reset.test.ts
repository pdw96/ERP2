// @vitest-environment node
import { asc, eq, getTableName, isTable, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nextCode } from "@/db/numbering";
import { RESET_TABLES, resetToSample } from "@/db/reset";
import { SAMPLE_CODES, SAMPLE_ITEMS, SAMPLE_PARTNERS, SAMPLE_WAREHOUSES } from "@/db/sample";
import * as schema from "@/db/schema";
import { codes, items, partners, warehouses } from "@/db/schema";
import type { Db } from "@/db/types";
import { migratedDb } from "./pglite";

let handle: Awaited<ReturnType<typeof migratedDb>>;
let db: Db;
beforeAll(async () => {
  handle = await migratedDb();
  db = handle.db;
});
afterAll(() => handle.close());

async function snapshot() {
  const strip = <T extends { id: number; createdAt: Date; updatedAt: Date }>(rows: T[]) =>
    rows.map((row) => {
      const rest: Partial<T> = { ...row };
      delete rest.createdAt;
      delete rest.updatedAt;
      return rest;
    });
  return {
    items: strip(await db.select().from(items).orderBy(asc(items.id))),
    warehouses: strip(await db.select().from(warehouses).orderBy(asc(warehouses.id))),
    partners: strip(await db.select().from(partners).orderBy(asc(partners.id))),
    codes: strip(await db.select().from(codes).orderBy(asc(codes.id))),
  };
}

describe("매일 밤 되돌림 — 성공 기준 6", () => {
  it("되돌림이 비우는 테이블은 스키마의 테이블 전부다 — 테이블을 더하고 되돌림에 잊으면 실패한다", () => {
    const tables = Object.values(schema).filter(isTable).map(getTableName);
    expect([...RESET_TABLES].sort()).toEqual(tables.sort());
  });

  it("바꿔 놓은 데이터가 샘플과 같아진다 — 더한 행은 빠지고, 고친 행은 돌아오고, 번호도 1 부터", async () => {
    await resetToSample(db);
    const clean = await snapshot();

    await db.insert(codes).values({ groupCode: "UNIT", code: "BOX", name: "상자" });
    await db.insert(items).values({ code: "RM-0007", name: "장난", itemType: "RM", procurement: "BUY", unit: "BOX" });
    await db.update(items).set({ name: "바꾼 이름", active: false }).where(eq(items.code, "RM-0001"));
    await db.insert(warehouses).values({ code: "WH-05", name: "장난 창고" });
    await db.update(partners).set({ name: "장난" }).where(eq(partners.code, "BP-0001"));

    const counts = await resetToSample(db);
    expect(await snapshot()).toEqual(clean);
    expect(counts).toEqual({
      items: SAMPLE_ITEMS.length,
      warehouses: SAMPLE_WAREHOUSES.length,
      partners: SAMPLE_PARTNERS.length,
      codes: SAMPLE_CODES.length,
      code_groups: 3,
    });
    expect(clean.items[0].id).toBe(1);
  });

  it("두 번 불러도 같다", async () => {
    await resetToSample(db);
    const once = await snapshot();
    await resetToSample(db);
    expect(await snapshot()).toEqual(once);
  });

  it("되돌린 뒤 코드는 샘플의 다음 번호부터 붙는다", async () => {
    await db.insert(warehouses).values([
      { code: "WH-05", name: "더한 창고" },
      { code: "WH-06", name: "더한 창고 2" },
    ]);
    expect(await nextCode(db, "WH")).toBe("WH-07");
    await resetToSample(db);
    expect(await nextCode(db, "WH")).toBe("WH-05");
  });

  it("중간에 실패하면 아무것도 바뀌지 않는다", async () => {
    await resetToSample(db);
    await db.insert(warehouses).values({ code: "WH-09", name: "남아야 할 창고" });
    const before = await snapshot();
    // 샘플 품목이 쓰는 단위를 일부러 빼 품목 넣기에서 실패하게 한다.
    const original = SAMPLE_ITEMS[0].unit;
    SAMPLE_ITEMS[0].unit = "NONE";
    try {
      await expect(resetToSample(db)).rejects.toThrow();
    } finally {
      SAMPLE_ITEMS[0].unit = original;
    }
    expect(await snapshot()).toEqual(before);
    const [{ count }] = (await db.select({ count: sql<number>`count(*)::int` }).from(warehouses)) as {
      count: number;
    }[];
    expect(count).toBe(5);
  });
});

describe("코드 번호 — 같은 머리의 가장 큰 번호 + 1", () => {
  it("유형마다 따로 센다 — 첫 번호 · 다음 번호", async () => {
    await resetToSample(db);
    expect(await nextCode(db, "RM")).toBe("RM-0007");
    expect(await nextCode(db, "SF")).toBe("SF-0003");
    expect(await nextCode(db, "FG")).toBe("FG-0003");
    expect(await nextCode(db, "BP")).toBe("BP-0006");
    await db.execute(sql.raw(`truncate table "items"`));
    expect(await nextCode(db, "RM")).toBe("RM-0001");
  });

  it("자릿수를 넘으면 늘린다", async () => {
    await resetToSample(db);
    await db.insert(warehouses).values({ code: "WH-99", name: "끝 번호" });
    expect(await nextCode(db, "WH")).toBe("WH-100");
  });
});
