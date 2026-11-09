// @vitest-environment node
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createItem, getItem, loadItemsForSheet, saveItemRows, stockLists, updateItem } from "@/db/items";
import { resetToSample } from "@/db/reset";
import { SAMPLE_DEFAULT_WAREHOUSES, SAMPLE_ITEMS } from "@/db/sample";
import { items, numberRules, warehouses } from "@/db/schema";
import type { Db } from "@/db/types";
import { createWarehouse, getWarehouse, updateWarehouse } from "@/db/warehouses";
import type { ItemValues } from "@/lib/item-input";
import { ITEM_TYPE_DEFAULTS, type ItemType } from "@/lib/master-codes";
import { CODE_KEY, ROW_ERROR, VERSION_KEY, type SheetRow } from "@/lib/sheet";
import { migratedDb, rejection } from "./pglite";

// 조각 「재고 수불」 PR B — 품목의 재고 칸 넷(설계 ③ 「품목의 새 칸」), 품목 유형 부자재 · 소모품(ADR 0019),
// 창고의 불량창고 표시(③ 「창고의 새 칸」). 거절 시험은 거절 뒤 품목 · 창고가 거절 전과 같은지와 거절한 칸을 본다.

let handle: Awaited<ReturnType<typeof migratedDb>>;
let db: Db;
beforeAll(async () => {
  handle = await migratedDb();
  db = handle.db;
});
afterAll(() => handle.close());
beforeEach(() => resetToSample(db));

const allItems = () => db.select().from(items).orderBy(asc(items.code));
const whId = async (code: string) => (await getWarehouse(db, code))!.id;

const newItem = (over: ItemValues = {}): ItemValues => ({
  itemType: "FG",
  procurement: "MAKE",
  name: "시험 IC",
  unit: "EA",
  inspectOut: "on",
  lotManaged: "on",
  leadTimeDays: "0",
  safetyStock: "0",
  minLot: "0",
  lotMultiple: "0",
  ...over,
});
const editOf = (code: string, over: ItemValues = {}): Promise<ItemValues> =>
  getItem(db, code).then(async (i) => {
    const lists = await stockLists(db);
    const wh = (id: number | null) => lists.warehouses.find((w) => w.id === id)?.code ?? "";
    return {
      procurement: i!.procurement,
      name: i!.name,
      spec: i!.spec,
      unit: i!.unit,
      inspectIn: i!.inspectIn ? "on" : "off",
      inspectOut: i!.inspectOut ? "on" : "off",
      lotManaged: i!.lotManaged ? "on" : "off",
      lotRuleCode: i!.lotRuleCode ?? "",
      defaultInWarehouse: wh(i!.defaultInWarehouseId),
      defaultOutWarehouse: wh(i!.defaultOutWarehouseId),
      leadTimeDays: String(i!.leadTimeDays),
      safetyStock: String(i!.safetyStock),
      minLot: String(i!.minLot),
      lotMultiple: String(i!.lotMultiple),
      active: i!.active ? "Y" : "N",
      ...over,
    };
  });

describe("품목 유형 부자재 · 소모품(ADR 0019, 성공 기준 16)", () => {
  it.each([
    ["SM", "SM-0003"],
    ["CS", "CS-0003"],
  ])("%s — 샘플의 다음 번호 %s 가 붙고, 기본값은 구매 · LOT 끔 · 검사 끔", async (itemType, code) => {
    const d = ITEM_TYPE_DEFAULTS[itemType as ItemType];
    expect(d).toEqual({ procurement: "BUY", inspectIn: false, inspectOut: false, lotManaged: false });
    const r = await createItem(db, {
      ...newItem({ itemType, procurement: "BUY", inspectOut: "off" }),
      lotManaged: undefined,
    });
    expect(r).toEqual({ ok: true, code });
    expect(await getItem(db, code)).toMatchObject({
      itemType,
      procurement: "BUY",
      lotManaged: false,
      inspectIn: false,
    });
  });

  it("빈 DB 면 첫 번호 SM-0001 · CS-0001", async () => {
    await db.delete(items);
    expect(await createItem(db, newItem({ itemType: "SM", procurement: "BUY" }))).toEqual({
      ok: true,
      code: "SM-0001",
    });
    expect(await createItem(db, newItem({ itemType: "CS", procurement: "BUY" }))).toEqual({
      ok: true,
      code: "CS-0001",
    });
  });

  it("LOT 가 붙어 오는 부자재는 LOT 관리를 켤 수 있다", async () => {
    const r = await createItem(db, newItem({ itemType: "SM", procurement: "BUY", lotManaged: "on" }));
    expect(r).toMatchObject({ ok: true });
    expect(await getItem(db, (r as { code: string }).code)).toMatchObject({ lotManaged: true });
  });

  it.each([
    ["SM-0100 · SM", { code: "SM-0100", itemType: "SM" }, null],
    ["CS-0100 · CS", { code: "CS-0100", itemType: "CS" }, null],
    ["머리가 유형과 다름(SM 코드에 CS 유형)", { code: "SM-0100", itemType: "CS" }, "items_code_format"],
    ["모르는 머리 XX", { code: "XX-0100", itemType: "SM" }, "items_code_format"],
    ["모르는 유형 PM", { code: "PM-0100", itemType: "PM" }, "items_code_format"],
  ])("DB 의 코드 꼴 — %s", async (_, v, constraint) => {
    const insert = db.insert(items).values({ name: "x", procurement: "BUY", unit: "EA", ...v });
    if (constraint === null) await expect(insert).resolves.toBeDefined();
    else expect(await rejection(insert)).toMatchObject({ constraint });
  });
});

describe("품목의 재고 칸 — 한 건 등록 · 수정", () => {
  it("비우면 규칙은 유형의 기본(null), 창고는 없음. 고른 값은 남고 창고는 번호로 저장된다", async () => {
    const r = await createItem(db, newItem());
    expect(r).toEqual({ ok: true, code: "FG-0003" });
    expect(await getItem(db, "FG-0003")).toMatchObject({
      lotManaged: true,
      lotRuleCode: null,
      defaultInWarehouseId: null,
      defaultOutWarehouseId: null,
    });
    const r2 = await createItem(
      db,
      newItem({ lotRuleCode: "LOT_NUM", defaultInWarehouse: "WH-03", defaultOutWarehouse: "WH-02" }),
    );
    expect(r2).toEqual({ ok: true, code: "FG-0004" });
    expect(await getItem(db, "FG-0004")).toMatchObject({
      lotRuleCode: "LOT_NUM",
      defaultInWarehouseId: await whId("WH-03"),
      defaultOutWarehouseId: await whId("WH-02"),
    });
  });

  it.each([
    [
      "원자재에 규칙",
      { itemType: "RM", procurement: "BUY", lotRuleCode: "LOT_FG" },
      "lotRuleCode",
      "반제품 · 완제품만",
    ],
    [
      "부자재에 규칙",
      { itemType: "SM", procurement: "BUY", lotRuleCode: "LOT_FG" },
      "lotRuleCode",
      "반제품 · 완제품만",
    ],
    ["없는 규칙", { lotRuleCode: "LOT_NO" }, "lotRuleCode", "없는 LOT 번호 규칙"],
    ["꼴이 틀린 규칙", { lotRuleCode: "lot fg" }, "lotRuleCode", "목록에서 고르세요"],
    ["불량창고를 기본 입고 창고로", { defaultInWarehouse: "WH-04" }, "defaultInWarehouse", "불량창고는"],
    ["불량창고를 기본 출고 창고로", { defaultOutWarehouse: "WH-04" }, "defaultOutWarehouse", "불량창고는"],
    ["없는 창고", { defaultInWarehouse: "WH-77" }, "defaultInWarehouse", "없는 창고"],
    ["꼴이 틀린 창고", { defaultOutWarehouse: "자재창고" }, "defaultOutWarehouse", "목록에서 고르세요"],
  ])("등록 — %s → 저장하지 않고 그 칸을 알린다", async (_, over, field, message) => {
    const before = await allItems();
    const r = await createItem(db, newItem(over));
    expect(r).toMatchObject({ ok: false, errors: { [field]: expect.stringContaining(message) } });
    expect(await allItems()).toEqual(before);
  });

  it("「사용 안 함」 규칙 · 창고는 새로 고르지 못하고, 그 품목의 지금 값이면 남는다", async () => {
    await db.update(numberRules).set({ active: false }).where(eq(numberRules.code, "LOT_NUM"));
    await db.update(warehouses).set({ active: false }).where(eq(warehouses.code, "WH-03"));
    expect(await createItem(db, newItem({ lotRuleCode: "LOT_NUM" }))).toMatchObject({
      ok: false,
      errors: { lotRuleCode: expect.stringContaining("사용 안 함") },
    });
    expect(await createItem(db, newItem({ defaultInWarehouse: "WH-03" }))).toMatchObject({
      ok: false,
      errors: { defaultInWarehouse: expect.stringContaining("사용 안 함") },
    });
    // 센서 IC 는 LOT_NUM · 제품창고를 이미 쓴다 — 고치지 않은 값은 남는다.
    const r = await updateItem(db, "FG-0002", await editOf("FG-0002", { name: "센서 IC 2" }));
    expect(r).toEqual({ ok: true, code: "FG-0002" });
    expect(await getItem(db, "FG-0002")).toMatchObject({
      name: "센서 IC 2",
      lotRuleCode: "LOT_NUM",
      defaultInWarehouseId: await whId("WH-03"),
    });
  });

  it("수정 — 규칙 · 창고 · LOT 관리를 바꾸고 비울 수 있다. 사 오는 품목에 규칙을 넣는 요청은 거절", async () => {
    expect(
      await updateItem(
        db,
        "FG-0001",
        await editOf("FG-0001", { lotRuleCode: "LOT_NUM", defaultOutWarehouse: "", lotManaged: undefined }),
      ),
    ).toEqual({ ok: true, code: "FG-0001" });
    expect(await getItem(db, "FG-0001")).toMatchObject({
      lotRuleCode: "LOT_NUM",
      defaultOutWarehouseId: null,
      lotManaged: false,
    });
    const before = await allItems();
    expect(await updateItem(db, "RM-0001", await editOf("RM-0001", { lotRuleCode: "LOT_SF" }))).toMatchObject({
      ok: false,
      errors: { lotRuleCode: expect.stringContaining("반제품 · 완제품만") },
    });
    expect(await allItems()).toEqual(before);
  });
});

describe("품목의 재고 칸 — 시트", () => {
  const row = (over: SheetRow = {}): SheetRow => ({ itemType: "완제품", name: "시트 IC", unit: "EA", ...over });

  it("이름 · 코드 둘 다 받고, 비우면 LOT 관리는 유형의 기본값 · 규칙은 유형의 기본 · 창고는 없음", async () => {
    const r = await saveItemRows(db, [
      row({ lotRuleCode: "숫자형 LOT", defaultInWarehouse: "제품창고", defaultOutWarehouse: "wh-02" }),
      row({ itemType: "소모품", name: "장갑" }),
    ]);
    expect(r.rejected).toEqual([]);
    expect(r.saved.map((s) => s.code)).toEqual(["FG-0003", "CS-0003"]);
    expect(await getItem(db, "FG-0003")).toMatchObject({
      lotManaged: true,
      lotRuleCode: "LOT_NUM",
      defaultInWarehouseId: await whId("WH-03"),
      defaultOutWarehouseId: await whId("WH-02"),
    });
    expect(await getItem(db, "CS-0003")).toMatchObject({
      procurement: "BUY",
      lotManaged: false,
      lotRuleCode: null,
      defaultInWarehouseId: null,
    });
  });

  it("틀린 줄만 남는다 — 사 오는 품목의 규칙 · 불량창고 · 없는 창고 · 없는 규칙 · 틀린 Y/N", async () => {
    const bad = [
      row({ itemType: "원자재", lotRuleCode: "LOT_FG" }),
      row({ defaultInWarehouse: "불량창고" }),
      row({ defaultOutWarehouse: "WH-77" }),
      row({ lotRuleCode: "없는 규칙" }),
      row({ lotManaged: "네" }),
    ];
    const before = await allItems();
    const r = await saveItemRows(db, [...bad, row({ name: "맞는 줄" })]);
    expect(r.saved).toEqual([{ code: "FG-0003", name: "맞는 줄" }]);
    expect(r.rejected.map((x) => x.errors)).toEqual([
      { lotRuleCode: expect.stringContaining("반제품 · 완제품만") },
      { defaultInWarehouse: "불량창고는 기본 창고로 고르지 못합니다" },
      { defaultOutWarehouse: expect.stringContaining("없는 창고") },
      { lotRuleCode: expect.stringContaining("번호 규칙에 없는") },
      { lotManaged: expect.stringContaining("Y · N") },
    ]);
    expect((await allItems()).length).toBe(before.length + 1);
  });

  it("불러온 품목은 재고 칸을 코드로 보이고, 그대로 저장하면 같은 값이다", async () => {
    const { rows } = await loadItemsForSheet(db, { q: "FG-0002", includeInactive: false });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      [CODE_KEY]: "FG-0002",
      lotManaged: "Y",
      lotRuleCode: "LOT_NUM",
      defaultInWarehouse: "WH-03",
      defaultOutWarehouse: "WH-03",
    });
    const before = await getItem(db, "FG-0002");
    const r = await saveItemRows(db, [{ ...rows[0], defaultOutWarehouse: "WH-02" }]);
    expect(r.saved).toEqual([{ code: "FG-0002", name: "센서 IC", updated: true }]);
    expect(await getItem(db, "FG-0002")).toMatchObject({
      lotRuleCode: before!.lotRuleCode,
      defaultInWarehouseId: before!.defaultInWarehouseId,
      defaultOutWarehouseId: await whId("WH-02"),
    });
    expect(rows[0][VERSION_KEY]).toMatch(/^[0-9]+$/);
  });

  it("행 전체의 거절이 아니라 칸의 거절이다", async () => {
    const r = await saveItemRows(db, [row({ defaultInWarehouse: "WH-04" })]);
    expect(r.rejected[0].errors[ROW_ERROR]).toBeUndefined();
  });
});

describe("샘플 — 기본 창고 · 규칙(설계 「2026-11-06 — PR B 를 열기 전에 정한 것」)", () => {
  it("유형마다 기본 입고 · 출고 창고 — 사 오는 품목은 자재창고 → 생산현장, 반제품은 생산현장, 완제품은 제품창고", async () => {
    const codeOf = new Map((await db.select().from(warehouses)).map((w) => [w.id, w.code]));
    for (const i of await allItems()) {
      const at = SAMPLE_DEFAULT_WAREHOUSES[i.itemType as ItemType];
      expect([codeOf.get(i.defaultInWarehouseId!), codeOf.get(i.defaultOutWarehouseId!)], i.code).toEqual([
        at.in,
        at.out,
      ]);
    }
    expect(SAMPLE_DEFAULT_WAREHOUSES).toEqual({
      RM: { in: "WH-01", out: "WH-02" },
      SM: { in: "WH-01", out: "WH-02" },
      CS: { in: "WH-01", out: "WH-02" },
      SF: { in: "WH-02", out: "WH-02" },
      FG: { in: "WH-03", out: "WH-03" },
    });
  });

  it("규칙을 고른 품목은 센서 IC 하나 — 숫자형. 나머지 반제품 · 완제품은 유형의 기본", () => {
    expect(SAMPLE_ITEMS.filter((i) => i.lotRuleCode).map((i) => [i.code, i.lotRuleCode])).toEqual([
      ["FG-0002", "LOT_NUM"],
    ]);
  });

  it("부자재 · 소모품 넷 — 캐리어 테이프 · 방습백 · 다이싱 블레이드 · 세정용 IPA(저자 판정 2026-11-06)", () => {
    expect(
      SAMPLE_ITEMS.filter((i) => i.itemType === "SM" || i.itemType === "CS").map((i) => [
        i.code,
        i.name,
        i.unit,
        i.cls1,
      ]),
    ).toEqual([
      ["SM-0001", "캐리어 테이프", "M", "PACK"],
      ["SM-0002", "방습백", "EA", "PACK"],
      ["CS-0001", "다이싱 블레이드", "EA", "TOOL"],
      ["CS-0002", "세정용 IPA", "L", "CHEM"],
    ]);
  });
});

describe("창고의 불량창고 표시(ADR 0015, 성공 기준 6)", () => {
  it("샘플의 불량창고는 WH-04 하나", async () => {
    expect((await db.select().from(warehouses).where(eq(warehouses.isDefect, true))).map((w) => w.code)).toEqual([
      "WH-04",
    ]);
  });

  it("등록 · 수정에서 켜고 끈다 — 비우면 아니오", async () => {
    expect(await createWarehouse(db, { name: "외주 불량창고", isDefect: "on" })).toEqual({ ok: true, code: "WH-05" });
    expect(await getWarehouse(db, "WH-05")).toMatchObject({ isDefect: true });
    expect(await createWarehouse(db, { name: "외주창고" })).toEqual({ ok: true, code: "WH-06" });
    expect(await getWarehouse(db, "WH-06")).toMatchObject({ isDefect: false });
    expect(await updateWarehouse(db, "WH-04", { name: "불량창고", active: "Y" })).toEqual({ ok: true, code: "WH-04" });
    expect(await getWarehouse(db, "WH-04")).toMatchObject({ isDefect: false });
  });

  it("품목의 기본 창고인 창고는 불량창고로 바꾸지 못한다 — 기본 창고는 불량창고가 아니다", async () => {
    const before = await getWarehouse(db, "WH-01");
    const r = await updateWarehouse(db, "WH-01", { name: "자재창고", isDefect: "on", active: "Y" });
    expect(r).toMatchObject({ ok: false, errors: { isDefect: expect.stringMatching(/^품목 \d+개의 기본/) } });
    expect(await getWarehouse(db, "WH-01")).toEqual(before);
    // 이미 불량창고인 창고는 그대로 둘 수 있다.
    expect(await updateWarehouse(db, "WH-04", { name: "불량창고 A", isDefect: "on", active: "Y" })).toMatchObject({
      ok: true,
    });
  });
});

describe("불량창고와 기본 창고를 동시에 저장해도(리뷰 1회차) — DB 가 막는다", () => {
  it("DB — 불량창고를 기본 창고로 두는 쓰기, 기본 창고인 창고를 불량창고로 바꾸는 쓰기를 거절한다", async () => {
    const defect = await whId("WH-04");
    expect(
      await rejection(db.update(items).set({ defaultInWarehouseId: defect }).where(eq(items.code, "RM-0001"))),
    ).toMatchObject({ constraint: "items_default_in_warehouse_fk" });
    expect(
      await rejection(db.update(items).set({ defaultOutWarehouseId: defect }).where(eq(items.code, "RM-0001"))),
    ).toMatchObject({ constraint: "items_default_out_warehouse_fk" });
    expect(
      await rejection(db.update(warehouses).set({ isDefect: true }).where(eq(warehouses.code, "WH-01"))),
    ).toMatchObject({ code: "23503" });
    expect(await getWarehouse(db, "WH-01")).toMatchObject({ isDefect: false });
    // 늘 false 인 칸을 바꿔 불량창고를 가리키는 길도 막는다.
    expect(
      await rejection(db.update(items).set({ defaultWarehouseDefect: true }).where(eq(items.code, "RM-0001"))),
    ).toMatchObject({ constraint: "items_default_warehouse_defect_fixed" });
  });

  it("창고 — 서버가 센 뒤 그 사이 누가 기본 창고로 골랐으면 DB 가 막고, 그 칸의 말로 알린다", async () => {
    const shared = await import("@/db/items");
    // 센 때는 0 개였다 — 저장하려는 사이 품목들이 이 창고를 기본 창고로 골랐다.
    const spy = vi.spyOn(shared, "itemsDefaultingTo").mockResolvedValue(0);
    try {
      const before = await getWarehouse(db, "WH-01");
      const r = await updateWarehouse(db, "WH-01", { name: "자재창고", isDefect: "on", active: "Y" });
      expect(r).toMatchObject({
        ok: false,
        errors: { isDefect: expect.stringContaining("기본 입고 · 출고 창고라 불량창고로 바꿀 수 없습니다") },
      });
      expect(await getWarehouse(db, "WH-01")).toEqual(before);
    } finally {
      spy.mockRestore();
    }
  });

  it("품목 — 고른 뒤 그 사이 창고가 불량창고로 바뀌었으면 DB 가 막고, 그 칸의 말로 알린다", async () => {
    const stock = await import("@/lib/item-stock");
    const defect = await whId("WH-04");
    // 대어 본 때는 불량창고가 아니었다 — 저장하려는 사이 불량창고로 바뀌었다.
    const spy = vi.spyOn(stock, "resolveStock").mockReturnValue({
      ok: true,
      value: { lotRuleCode: null, defaultInWarehouseId: defect, defaultOutWarehouseId: null },
    });
    try {
      const before = await allItems();
      expect(await createItem(db, newItem())).toMatchObject({
        ok: false,
        errors: { defaultInWarehouse: "그 사이 불량창고로 바뀐 창고입니다 — 다른 창고를 고르세요" },
      });
      const r = await saveItemRows(db, [{ itemType: "완제품", name: "시트 IC", unit: "EA" }]);
      expect(r.rejected.map((x) => x.errors)).toEqual([
        { defaultInWarehouse: "그 사이 불량창고로 바뀐 창고입니다 — 다른 창고를 고르세요" },
      ]);
      expect(await allItems()).toEqual(before);
    } finally {
      spy.mockRestore();
    }
  });
});
