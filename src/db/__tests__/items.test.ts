// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createItem,
  getItem,
  ITEM_LIMIT,
  listItems,
  parseItemFilter,
  previewCodes,
  unitOptions,
  updateItem,
  type ItemFilter,
} from "@/db/items";
import { resetToSample } from "@/db/reset";
import { codes, items } from "@/db/schema";
import type { Db } from "@/db/types";
import type { ItemValues } from "@/lib/item-input";
import { ITEM_TYPE_DEFAULTS } from "@/lib/master-codes";
import { SAMPLE_CODES } from "@/db/sample";
import { migratedDb } from "./pglite";

// 품목의 목록 · 등록 · 수정 — PGlite 에서 실제 SQL 로(설계 ⑤).

let handle: Awaited<ReturnType<typeof migratedDb>>;
let db: Db;
beforeAll(async () => {
  handle = await migratedDb();
  db = handle.db;
});
afterAll(() => handle.close());
beforeEach(() => resetToSample(db));

const all: ItemFilter = { q: "", includeInactive: false };
const codesOf = (rows: { code: string }[]) => rows.map((r) => r.code);

const newRm: ItemValues = {
  itemType: "RM",
  procurement: "BUY",
  name: "솔더 볼",
  spec: "지름 0.3mm",
  unit: "EA",
  inspectIn: "on",
  leadTimeDays: "10",
  safetyStock: "1000",
  minLot: "500",
  lotMultiple: "500",
};

const editOf = (over: ItemValues = {}): ItemValues => ({
  procurement: "BUY",
  name: "웨이퍼",
  spec: "8인치 · 두께 200µm",
  unit: "EA",
  inspectIn: "on",
  leadTimeDays: "21",
  safetyStock: "50",
  minLot: "25",
  lotMultiple: "25",
  active: "Y",
  ...over,
});

const deactivateUnit = (code: string) => db.update(codes).set({ active: false }).where(eq(codes.code, code));

describe("목록", () => {
  it("기본 보기 — 사용 중인 품목을 코드 순으로", async () => {
    expect(codesOf(await listItems(db, all))).toEqual([
      "FG-0001",
      "FG-0002",
      "RM-0001",
      "RM-0002",
      "RM-0003",
      "RM-0004",
      "RM-0005",
      "RM-0006",
      "SF-0001",
      "SF-0002",
    ]);
  });

  it("코드나 품명에 든 글자로 찾는다 — 대소문자를 가리지 않는다", async () => {
    expect(codesOf(await listItems(db, { ...all, q: "리드프레임" }))).toEqual(["RM-0002", "RM-0006"]);
    expect(codesOf(await listItems(db, { ...all, q: "fg-000" }))).toEqual(["FG-0001", "FG-0002"]);
    expect(codesOf(await listItems(db, { ...all, q: "qfn" }))).toEqual(["RM-0006"]);
  });

  it("찾을 글자의 % · _ 는 글자 그대로 찾는다", async () => {
    expect(await listItems(db, { ...all, q: "%" })).toEqual([]);
    expect(await listItems(db, { ...all, q: "_" })).toEqual([]);
  });

  it("유형 · 조달구분으로 거른다", async () => {
    expect(codesOf(await listItems(db, { ...all, itemType: "SF" }))).toEqual(["SF-0001", "SF-0002"]);
    expect(await listItems(db, { ...all, procurement: "BUY" })).toHaveLength(6);
    await db.update(items).set({ procurement: "BUY" }).where(eq(items.code, "SF-0001"));
    expect(codesOf(await listItems(db, { ...all, itemType: "SF", procurement: "BUY" }))).toEqual(["SF-0001"]);
  });

  it("「사용 안 함」은 기본 보기에서 빠지고, 「사용 안 함 포함」이면 보인다", async () => {
    await updateItem(db, "RM-0003", editOf({ name: "금 와이어", unit: "M", active: "N" }));
    expect(codesOf(await listItems(db, all))).not.toContain("RM-0003");
    expect(codesOf(await listItems(db, { ...all, includeInactive: true }))).toContain("RM-0003");
  });
});

describe("목록의 거르기 값", () => {
  it("맞는 값을 읽는다", () => {
    expect(parseItemFilter({ q: " 웨이퍼 ", type: "RM", proc: "BUY", inactive: "1" })).toEqual({
      filter: { q: "웨이퍼", itemType: "RM", procurement: "BUY", includeInactive: true },
      notices: [],
    });
  });

  it("빈 주소면 거르지 않는다", () => {
    expect(parseItemFilter({})).toEqual({ filter: { q: "", includeInactive: false }, notices: [] });
  });

  it("찾을 글자 50자까지 받는다", () => {
    expect(parseItemFilter({ q: "가".repeat(50) }).filter.q).toHaveLength(50);
  });

  it.each([
    ["51자 찾을 글자", { q: "가".repeat(51) }, "q"],
    ["목록 밖의 유형", { type: "XX" }, "itemType"],
    ["목록 밖의 조달구분", { proc: "OUT" }, "procurement"],
  ])("%s → 그 값으로 거르지 않고 알린다", (_name, params, field) => {
    const { filter, notices } = parseItemFilter(params);
    expect(filter).toEqual({ q: "", includeInactive: false });
    expect(notices.map((n) => n.field)).toEqual([field]);
  });
});

describe("등록", () => {
  it.each([
    ["RM", "RM-0007"],
    ["SF", "SF-0003"],
    ["FG", "FG-0003"],
  ] as const)("유형 %s → 샘플의 다음 번호 %s 가 붙는다", async (itemType, code) => {
    const r = await createItem(db, { ...newRm, itemType, procurement: ITEM_TYPE_DEFAULTS[itemType].procurement });
    expect(r).toEqual({ ok: true, code });
    expect(await getItem(db, code)).toMatchObject({ itemType, active: true });
  });

  it("빈 테이블이면 유형마다 첫 번호 0001 이다", async () => {
    await db.delete(items);
    expect(await createItem(db, newRm)).toEqual({ ok: true, code: "RM-0001" });
    expect(await createItem(db, { ...newRm, itemType: "FG", procurement: "MAKE" })).toEqual({
      ok: true,
      code: "FG-0001",
    });
  });

  it("넣은 값이 그대로 남는다 — 조달구분 · 검사 대상을 유형의 기본값과 다르게 바꿔도", async () => {
    const r = await createItem(db, {
      ...newRm,
      itemType: "SF",
      procurement: "BUY",
      inspectIn: "on",
      inspectOut: "on",
      safetyStock: "1,234.567",
    });
    expect(r).toEqual({ ok: true, code: "SF-0003" });
    expect(await getItem(db, "SF-0003")).toMatchObject({
      name: "솔더 볼",
      spec: "지름 0.3mm",
      itemType: "SF",
      procurement: "BUY",
      unit: "EA",
      inspectIn: true,
      inspectOut: true,
      leadTimeDays: 10,
      safetyStock: 1234.567,
      minLot: 500,
      lotMultiple: 500,
    });
  });

  it("보낸 코드는 쓰지 않는다 — 서버가 붙인다", async () => {
    const r = await createItem(db, { ...newRm, code: "RM-9999" } as ItemValues);
    expect(r).toEqual({ ok: true, code: "RM-0007" });
    expect(await getItem(db, "RM-9999")).toBeUndefined();
  });

  it("품명 · 단위가 비면 저장되지 않고 그 칸을 알린다", async () => {
    const r = await createItem(db, { ...newRm, name: "", unit: "" });
    expect(r).toEqual({
      ok: false,
      errors: { name: "품명을 넣으세요", unit: "단위를 고르세요" },
      values: { ...newRm, name: "", unit: "" },
    });
    expect(await db.select().from(items)).toHaveLength(10);
  });

  it("공통코드에 없는 단위는 거절한다", async () => {
    const r = await createItem(db, { ...newRm, unit: "BOX" });
    expect(r).toMatchObject({ ok: false, errors: { unit: "단위를 고르세요" } });
    expect(await db.select().from(items)).toHaveLength(10);
  });

  it("공통코드에 더한 단위는 받는다", async () => {
    await db.insert(codes).values({ groupCode: "UNIT", code: "BOX", name: "상자", sortOrder: 50 });
    expect(await createItem(db, { ...newRm, unit: "BOX" })).toEqual({ ok: true, code: "RM-0007" });
  });

  it("「사용 안 함」 단위는 새 품목에서 거절한다", async () => {
    await deactivateUnit("G");
    const r = await createItem(db, { ...newRm, unit: "G" });
    expect(r).toMatchObject({ ok: false, errors: { unit: "「사용 안 함」인 단위입니다 — 다른 단위를 고르세요" } });
    expect(await db.select().from(items)).toHaveLength(10);
  });

  it("두 사람이 같은 번호를 받으면 다음 번호로 한 번 더 넣는다", async () => {
    const numbering = await import("@/db/numbering");
    const spy = vi.spyOn(numbering, "nextCode").mockResolvedValueOnce("RM-0006");
    try {
      expect(await createItem(db, newRm)).toEqual({ ok: true, code: "RM-0007" });
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      spy.mockRestore();
    }
  });

  it("다시 넣어도 겹치면 저장하지 않고 다시 저장하라고 알린다", async () => {
    const numbering = await import("@/db/numbering");
    const spy = vi.spyOn(numbering, "nextCode").mockResolvedValue("RM-0001");
    try {
      const r = await createItem(db, newRm);
      expect(r).toMatchObject({ ok: false, formError: expect.stringContaining("다시 저장하세요") });
      expect(await db.select().from(items)).toHaveLength(10);
    } finally {
      spy.mockRestore();
    }
  });

  it(`등록 상한 ${ITEM_LIMIT}개에 닿으면 저장하지 않는다`, async () => {
    const filler = Array.from({ length: ITEM_LIMIT - 10 }, (_, i) => ({
      code: `RM-${String(i + 100).padStart(4, "0")}`,
      name: "채움",
      itemType: "RM",
      procurement: "BUY",
      unit: "EA",
    }));
    await db.insert(items).values(filler);
    const r = await createItem(db, newRm);
    expect(r).toMatchObject({ ok: false, formError: expect.stringContaining("2,000개까지") });
    expect(await db.select().from(items)).toHaveLength(ITEM_LIMIT);
  });
  it(`동시에 등록해도 상한 ${ITEM_LIMIT}개를 넘지 않는다 — 세기 · 번호 · 넣기가 잠금 안에서 차례로`, async () => {
    const filler = Array.from({ length: ITEM_LIMIT - 11 }, (_, i) => ({
      code: `RM-${String(i + 100).padStart(4, "0")}`,
      name: "채움",
      itemType: "RM",
      procurement: "BUY",
      unit: "EA",
    }));
    await db.insert(items).values(filler);
    const types = ["RM", "SF", "FG"] as const;
    const results = await Promise.all(
      types.flatMap((t) => [0, 1].map(() => createItem(db, { ...newRm, itemType: t, procurement: "BUY" }))),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await db.select().from(items)).toHaveLength(ITEM_LIMIT);
  });
});

describe("수정", () => {
  it("규격 · 계획 정보를 고치면 남는다 — 코드 · 유형은 그대로", async () => {
    const r = await updateItem(db, "RM-0001", editOf({ spec: "12인치", leadTimeDays: "30", safetyStock: "60.5" }));
    expect(r).toEqual({ ok: true, code: "RM-0001" });
    expect(await getItem(db, "RM-0001")).toMatchObject({
      code: "RM-0001",
      itemType: "RM",
      spec: "12인치",
      leadTimeDays: 30,
      safetyStock: 60.5,
    });
  });

  it("유형 · 코드를 보내도 바뀌지 않는다", async () => {
    await updateItem(db, "RM-0001", { ...editOf(), itemType: "FG", code: "FG-0099" } as ItemValues);
    expect(await getItem(db, "RM-0001")).toMatchObject({ code: "RM-0001", itemType: "RM" });
    expect(await getItem(db, "FG-0099")).toBeUndefined();
  });

  it("검사 대상을 끄고 조달구분을 바꾼다", async () => {
    await updateItem(db, "RM-0001", editOf({ inspectIn: undefined, procurement: "MAKE" }));
    expect(await getItem(db, "RM-0001")).toMatchObject({ inspectIn: false, procurement: "MAKE" });
  });

  it("틀린 값이면 아무것도 바꾸지 않는다", async () => {
    const r = await updateItem(db, "RM-0001", editOf({ spec: "바뀜", leadTimeDays: "400" }));
    expect(r).toMatchObject({ ok: false, errors: { leadTimeDays: expect.any(String) } });
    expect(await getItem(db, "RM-0001")).toMatchObject({ spec: "8인치 · 두께 200µm", leadTimeDays: 21 });
  });

  it("없는 품목이면 찾지 못했다고 돌려준다", async () => {
    expect(await updateItem(db, "RM-0999", editOf())).toEqual({ ok: false, notFound: true });
    expect(await updateItem(db, "'; drop table items; --", editOf())).toEqual({ ok: false, notFound: true });
  });

  it("「사용 안 함」 단위를 가진 품목은 그 단위 그대로 저장된다", async () => {
    await deactivateUnit("G");
    const r = await updateItem(db, "RM-0005", editOf({ name: "다이 접착제", unit: "G", spec: "은 페이스트 · 고온" }));
    expect(r).toEqual({ ok: true, code: "RM-0005" });
    expect(await getItem(db, "RM-0005")).toMatchObject({ unit: "G", spec: "은 페이스트 · 고온" });
  });

  it("다른 품목의 단위를 「사용 안 함」 단위로 바꾸면 거절한다", async () => {
    await deactivateUnit("G");
    const r = await updateItem(db, "RM-0001", editOf({ unit: "G" }));
    expect(r).toMatchObject({ ok: false, errors: { unit: "「사용 안 함」인 단위입니다 — 다른 단위를 고르세요" } });
    expect(await getItem(db, "RM-0001")).toMatchObject({ unit: "EA" });
  });

  it("「사용 안 함」으로 바꾸고 다시 사용으로 돌린다", async () => {
    await updateItem(db, "FG-0002", editOf({ name: "센서 IC", procurement: "MAKE", active: "N" }));
    expect(await getItem(db, "FG-0002")).toMatchObject({ active: false });
    await updateItem(db, "FG-0002", editOf({ name: "센서 IC", procurement: "MAKE", active: "Y" }));
    expect(await getItem(db, "FG-0002")).toMatchObject({ active: true });
  });
});

describe("입력 화면이 고르는 값", () => {
  it("단위 — 사용 중인 것을 정렬 순서대로", async () => {
    const units = SAMPLE_CODES.filter((c) => c.groupCode === "UNIT").map((c) => c.code);
    expect((await unitOptions(db)).map((u) => u.code)).toEqual(units);
  });

  it("단위 — 「사용 안 함」은 빠지고, 그 단위를 가진 품목의 수정 화면에는 남는다", async () => {
    await deactivateUnit("G");
    expect((await unitOptions(db)).map((u) => u.code)).not.toContain("G");
    expect(await unitOptions(db, "G")).toContainEqual({ code: "G", name: "그램", active: false });
  });

  it("단위 — 더한 단위가 바로 보인다", async () => {
    await db.insert(codes).values({ groupCode: "UNIT", code: "BOX", name: "상자", sortOrder: 15 });
    expect((await unitOptions(db)).map((u) => u.code)).toEqual(["EA", "BOX", "M", "KG", "G"]);
  });

  it("유형마다 등록하면 붙을 코드", async () => {
    expect(await previewCodes(db)).toEqual({ RM: "RM-0007", SF: "SF-0003", FG: "FG-0003" });
  });
});
