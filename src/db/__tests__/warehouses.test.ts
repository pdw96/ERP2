// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { items, warehouses } from "@/db/schema";
import type { Db } from "@/db/types";
import {
  createWarehouse,
  getWarehouse,
  listWarehouses,
  parseWarehouseFilter,
  previewWarehouseCode,
  updateWarehouse,
  WAREHOUSE_LIMIT,
  type WarehouseFilter,
} from "@/db/warehouses";
import type { WarehouseValues } from "@/lib/warehouse-input";
import { migratedDb, resetWithoutStock } from "./pglite";

// 창고의 목록 · 등록 · 수정 — PGlite 에서 실제 SQL 로(설계 ⑤).

let handle: Awaited<ReturnType<typeof migratedDb>>;
let db: Db;
beforeAll(async () => {
  handle = await migratedDb();
  db = handle.db;
});
afterAll(() => handle.close());
beforeEach(() => resetWithoutStock(db));

const all: WarehouseFilter = { q: "", includeInactive: false };
const codesOf = (rows: { code: string }[]) => rows.map((r) => r.code);
const count = async () => (await db.select().from(warehouses)).length;

describe("목록", () => {
  it("기본 보기 — 사용 중인 창고를 코드 순으로", async () => {
    expect(codesOf(await listWarehouses(db, all))).toEqual(["WH-01", "WH-02", "WH-03", "WH-04"]);
  });

  it("코드나 창고명에 든 글자로 찾는다 — 대소문자를 가리지 않는다", async () => {
    expect(codesOf(await listWarehouses(db, { ...all, q: "불량" }))).toEqual(["WH-04"]);
    expect(codesOf(await listWarehouses(db, { ...all, q: "wh-03" }))).toEqual(["WH-03"]);
    expect(codesOf(await listWarehouses(db, { ...all, q: "창고" }))).toEqual(["WH-01", "WH-03", "WH-04"]);
  });

  it("찾을 글자의 % · _ 는 글자 그대로 찾는다", async () => {
    expect(await listWarehouses(db, { ...all, q: "%" })).toEqual([]);
    expect(await listWarehouses(db, { ...all, q: "_" })).toEqual([]);
  });

  it("「사용 안 함」은 기본 보기에서 빠지고, 「사용 안 함 포함」이면 보인다", async () => {
    await updateWarehouse(db, "WH-02", { name: "생산현장", active: "N" });
    expect(codesOf(await listWarehouses(db, all))).not.toContain("WH-02");
    expect(codesOf(await listWarehouses(db, { ...all, includeInactive: true }))).toContain("WH-02");
  });
});

describe("목록의 거르기 값", () => {
  it("맞는 값을 읽는다", () => {
    expect(parseWarehouseFilter({ q: " 자재 ", inactive: "1" })).toEqual({
      filter: { q: "자재", includeInactive: true },
      notices: [],
    });
  });

  it("빈 주소면 거르지 않는다", () => {
    expect(parseWarehouseFilter({})).toEqual({ filter: { q: "", includeInactive: false }, notices: [] });
  });

  it("51자 찾을 글자는 찾지 않고 알린다", () => {
    const { filter, notices } = parseWarehouseFilter({ q: "가".repeat(51) });
    expect(filter.q).toBe("");
    expect(notices.map((n) => n.field)).toEqual(["q"]);
  });
});

describe("등록", () => {
  it("샘플의 다음 번호 WH-05 가 붙고, 사용 중으로 남는다", async () => {
    expect(await createWarehouse(db, { name: "외주창고" })).toEqual({ ok: true, code: "WH-05" });
    expect(await getWarehouse(db, "WH-05")).toMatchObject({ name: "외주창고", active: true });
  });

  it("빈 테이블이면 첫 번호 WH-01 이다", async () => {
    // 품목의 기본 창고(재고 수불 PR B)가 창고를 가리키므로 먼저 뗀다.
    await db.update(items).set({ defaultInWarehouseId: null, defaultOutWarehouseId: null });
    await db.delete(warehouses);
    expect(await createWarehouse(db, { name: "자재창고" })).toEqual({ ok: true, code: "WH-01" });
  });

  it("보낸 코드 · 사용 여부는 쓰지 않는다 — 서버가 붙인다", async () => {
    const r = await createWarehouse(db, { name: "외주창고", code: "WH-99", active: "N" } as WarehouseValues);
    expect(r).toEqual({ ok: true, code: "WH-05" });
    expect(await getWarehouse(db, "WH-99")).toBeUndefined();
    expect(await getWarehouse(db, "WH-05")).toMatchObject({ active: true });
  });

  it("창고명이 비면 저장되지 않고 그 칸을 알린다", async () => {
    const r = await createWarehouse(db, { name: "  " });
    expect(r).toEqual({ ok: false, errors: { name: "창고명을 넣으세요" }, values: { name: "  " } });
    expect(await count()).toBe(4);
  });

  it("두 사람이 같은 번호를 받으면 다음 번호로 한 번 더 넣는다", async () => {
    const numbering = await import("@/db/numbering");
    const spy = vi.spyOn(numbering, "nextCode").mockResolvedValueOnce("WH-04");
    try {
      expect(await createWarehouse(db, { name: "외주창고" })).toEqual({ ok: true, code: "WH-05" });
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      spy.mockRestore();
    }
  });

  it("다시 넣어도 겹치면 저장하지 않고 다시 저장하라고 알린다", async () => {
    const numbering = await import("@/db/numbering");
    const spy = vi.spyOn(numbering, "nextCode").mockResolvedValue("WH-01");
    try {
      const r = await createWarehouse(db, { name: "외주창고" });
      expect(r).toMatchObject({ ok: false, formError: expect.stringContaining("다시 저장하세요") });
      expect(await count()).toBe(4);
    } finally {
      spy.mockRestore();
    }
  });

  const fill = (n: number) =>
    db
      .insert(warehouses)
      .values(Array.from({ length: n }, (_, i) => ({ code: `WH-${String(i + 5).padStart(2, "0")}`, name: "채움" })));

  it(`등록 상한 ${WAREHOUSE_LIMIT}개에 닿으면 저장하지 않는다`, async () => {
    await fill(WAREHOUSE_LIMIT - 4);
    const r = await createWarehouse(db, { name: "백번째" });
    expect(r).toMatchObject({ ok: false, formError: expect.stringContaining("창고는 99개까지") });
    expect(await count()).toBe(WAREHOUSE_LIMIT);
  });

  it(`동시에 등록해도 상한 ${WAREHOUSE_LIMIT}개를 넘지 않는다`, async () => {
    await fill(WAREHOUSE_LIMIT - 6);
    const results = await Promise.all(Array.from({ length: 6 }, () => createWarehouse(db, { name: "동시" })));
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    expect(await count()).toBe(WAREHOUSE_LIMIT);
  });
});

describe("수정", () => {
  it("창고명을 고치면 남는다 — 코드는 그대로", async () => {
    expect(await updateWarehouse(db, "WH-01", { name: "원자재창고", active: "Y" })).toEqual({
      ok: true,
      code: "WH-01",
    });
    expect(await getWarehouse(db, "WH-01")).toMatchObject({ code: "WH-01", name: "원자재창고", active: true });
  });

  it("코드를 보내도 바뀌지 않는다", async () => {
    await updateWarehouse(db, "WH-01", { name: "자재창고", active: "Y", code: "WH-77" } as WarehouseValues);
    expect(await getWarehouse(db, "WH-01")).toMatchObject({ code: "WH-01" });
    expect(await getWarehouse(db, "WH-77")).toBeUndefined();
  });

  it("틀린 값이면 아무것도 바꾸지 않는다", async () => {
    const r = await updateWarehouse(db, "WH-01", { name: "가".repeat(51), active: "N" });
    expect(r).toMatchObject({ ok: false, errors: { name: "창고명은 50자까지입니다" } });
    expect(await getWarehouse(db, "WH-01")).toMatchObject({ name: "자재창고", active: true });
  });

  it("없는 창고면 찾지 못했다고 돌려준다", async () => {
    expect(await updateWarehouse(db, "WH-98", { name: "x", active: "Y" })).toEqual({ ok: false, notFound: true });
    expect(await updateWarehouse(db, "'; drop table warehouses; --", { name: "x", active: "Y" })).toEqual({
      ok: false,
      notFound: true,
    });
  });

  it("「사용 안 함」으로 바꾸고 다시 사용으로 돌린다 — 행은 남는다", async () => {
    await updateWarehouse(db, "WH-04", { name: "불량창고", active: "N" });
    expect(await getWarehouse(db, "WH-04")).toMatchObject({ active: false });
    await updateWarehouse(db, "WH-04", { name: "불량창고", active: "Y" });
    expect(await getWarehouse(db, "WH-04")).toMatchObject({ active: true });
    expect(await count()).toBe(4);
  });

  it("DB 의 제약에 걸리면(서버의 검사를 빠뜨렸을 때) 그 칸을 알린다", async () => {
    // 서버의 검사를 건너뛰고 DB 에 바로 넣으면 제약이 막는다 — 그 제약 이름이 칸으로 이어지는지 본다.
    const input = await import("@/lib/warehouse-input");
    const spy = vi.spyOn(input, "parseWarehouseUpdate").mockReturnValue({
      ok: true,
      value: { name: "", isDefect: false, active: true },
    });
    try {
      const r = await updateWarehouse(db, "WH-01", { name: "", active: "Y" });
      expect(r).toMatchObject({ ok: false, errors: { name: "받을 수 없는 값입니다" } });
      expect((await db.select().from(warehouses).where(eq(warehouses.code, "WH-01")))[0].name).toBe("자재창고");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("입력 화면", () => {
  it("등록하면 붙을 코드", async () => {
    expect(await previewWarehouseCode(db)).toBe("WH-05");
  });
});
