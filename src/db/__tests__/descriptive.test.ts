// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { updateCode } from "@/db/codes";
import {
  allItemClasses,
  createItem,
  saveItemRows,
  getItem,
  itemClassOptions,
  listItems,
  parseItemFilter,
  updateItem,
  type ItemFilter,
} from "@/db/items";
import { createPartner, savePartnerRows, getPartner, updatePartner } from "@/db/partners";
import { resetToSample } from "@/db/reset";
import { codes, items, partners } from "@/db/schema";
import type { Db } from "@/db/types";
import type { ItemValues } from "@/lib/item-input";
import type { PartnerValues } from "@/lib/partner-input";
import { migratedDb, rejection } from "./pglite";

// 품목 · 거래처의 설명용 칸(PR H, 성공 기준 13 · ADR 0012) — PGlite 에서 실제 SQL 로(설계 ⑤).
// 분류의 「사용 안 함」 규칙(단위와 같다), 목록의 분류 거르기, DB 의 새 제약, 시트의 저장.

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
const deactivate = (group: string, code: string, name: string) =>
  updateCode(db, group, code, { name, sortOrder: "10", active: "N" });

const newRm: ItemValues = {
  itemType: "RM",
  procurement: "BUY",
  name: "솔더 볼",
  unit: "EA",
  leadTimeDays: "0",
  safetyStock: "0",
  minLot: "0",
  lotMultiple: "0",
};
// 샘플 RM-0001 웨이퍼(WAFER · COMMON · 소분류 없음)의 수정 화면이 보내는 값.
const waferEdit = (over: ItemValues = {}): ItemValues => ({
  procurement: "BUY",
  name: "웨이퍼",
  unit: "EA",
  inspectIn: "on",
  leadTimeDays: "21",
  safetyStock: "50",
  minLot: "25",
  lotMultiple: "25",
  cls1: "WAFER",
  cls2: "COMMON",
  cls3: "",
  active: "Y",
  ...over,
});

describe("품목의 분류 · 비고 — 등록 · 수정", () => {
  it("고른 분류와 비고가 남고, 비우면 없음이다", async () => {
    const r = await createItem(db, { ...newRm, cls1: "CHEM", cls2: "COMMON", note: "냉동 보관" });
    expect(r.ok).toBe(true);
    const saved = await getItem(db, r.ok ? r.code : "");
    expect(saved).toMatchObject({ cls1: "CHEM", cls2: "COMMON", cls3: null, note: "냉동 보관" });
  });

  it("공통코드에 없는 분류는 그 칸을 알리고 저장하지 않는다", async () => {
    expect(await createItem(db, { ...newRm, cls1: "NOPE", cls3: "WAFER" })).toMatchObject({
      ok: false,
      errors: { cls1: "대분류를 목록에서 고르세요", cls3: "소분류를 목록에서 고르세요" },
    });
  });

  it("「사용 안 함」 분류는 새 품목에서 거절한다", async () => {
    await deactivate("ITEM_CLS2", "QFN", "QFN");
    expect(await createItem(db, { ...newRm, cls2: "QFN" })).toMatchObject({
      ok: false,
      errors: { cls2: "「사용 안 함」인 중분류입니다 — 다른 값을 고르세요" },
    });
  });

  it("「사용 안 함」 분류를 가진 품목은 그 값 그대로 저장된다 — 칸마다 따로 본다", async () => {
    await deactivate("ITEM_CLS1", "WAFER", "웨이퍼");
    // 대분류는 그대로(「사용 안 함」), 중분류만 바꾼다.
    expect(await updateItem(db, "RM-0001", waferEdit({ cls2: "SOP", note: "고침" }))).toEqual({
      ok: true,
      code: "RM-0001",
    });
    expect(await getItem(db, "RM-0001")).toMatchObject({ cls1: "WAFER", cls2: "SOP", note: "고침" });
  });

  it("다른 품목의 분류를 「사용 안 함」 값으로 바꾸면 거절한다", async () => {
    await deactivate("ITEM_CLS3", "SENSOR", "센서");
    expect(await updateItem(db, "RM-0001", waferEdit({ cls3: "SENSOR" }))).toMatchObject({
      ok: false,
      errors: { cls3: "「사용 안 함」인 소분류입니다 — 다른 값을 고르세요" },
    });
    expect(await getItem(db, "RM-0001")).toMatchObject({ cls3: null });
  });

  it("분류를 비우면 없음이 된다", async () => {
    await updateItem(db, "RM-0001", waferEdit({ cls1: "", cls2: "" }));
    expect(await getItem(db, "RM-0001")).toMatchObject({ cls1: null, cls2: null });
  });

  it("공통코드에 더한 분류는 바로 받는다", async () => {
    await db.insert(codes).values({ groupCode: "ITEM_CLS1", code: "SOLDER", name: "솔더" });
    expect(await createItem(db, { ...newRm, cls1: "SOLDER" })).toMatchObject({ ok: true });
  });
});

describe("품목 목록의 분류 거르기", () => {
  it("분류로 거른다 — 셋은 함께 걸린다(그리고)", async () => {
    expect(codesOf(await listItems(db, { ...all, cls1: "FRAME" }))).toEqual(["RM-0002", "RM-0006"]);
    expect(codesOf(await listItems(db, { ...all, cls2: "SOP" }))).toEqual([
      "FG-0001",
      "RM-0002",
      "SF-0001",
      "SF-0002",
      "SM-0001",
    ]);
    expect(codesOf(await listItems(db, { ...all, cls2: "SOP", cls3: "POWER" }))).toEqual([
      "FG-0001",
      "SF-0001",
      "SF-0002",
    ]);
    expect(codesOf(await listItems(db, { ...all, cls1: "IC", cls2: "QFN", cls3: "SENSOR" }))).toEqual(["FG-0002"]);
    expect(await listItems(db, { ...all, cls1: "WAFER", cls2: "SOP" })).toEqual([]);
  });

  it("주소의 분류 — 공통코드에 있는 값(「사용 안 함」 포함)만 거르고, 없는 값은 거르지 않고 알린다", async () => {
    await deactivate("ITEM_CLS1", "WIRE", "와이어");
    const classes = await allItemClasses(db);
    expect(parseItemFilter({ cls1: "WIRE", cls2: "SOP" }, classes)).toEqual({
      filter: { ...all, cls1: "WIRE", cls2: "SOP" },
      notices: [],
    });
    expect(parseItemFilter({ cls1: "NOPE", cls3: "wafer" }, classes)).toEqual({
      filter: all,
      notices: [
        { field: "cls1", message: "없는 대분류라 거르지 않았습니다" },
        { field: "cls3", message: "없는 소분류라 거르지 않았습니다" },
      ],
    });
  });

  it("고르는 목록 — 거르기는 「사용 안 함」까지, 입력 화면은 사용 중인 것과 그 품목의 지금 값", async () => {
    await deactivate("ITEM_CLS1", "WAFER", "웨이퍼");
    const all8 = ["WAFER", "FRAME", "WIRE", "CHEM", "WIP", "IC", "PACK", "TOOL"];
    expect(codesOf((await allItemClasses(db)).cls1)).toEqual(all8);
    expect(codesOf((await itemClassOptions(db)).cls1)).toEqual(all8.slice(1));
    const wafer = (await getItem(db, "RM-0001"))!;
    expect(codesOf((await itemClassOptions(db, wafer)).cls1)).toEqual(all8);
  });
});

describe("거래처의 설명용 칸 — 등록 · 수정", () => {
  const newPartner: PartnerValues = { name: "(가상) 바다솔더", isSupplier: "on" };

  it("넣은 값이 남고, 비운 칸은 빈 글자다", async () => {
    const r = await createPartner(db, {
      ...newPartner,
      ceo: "홍길동",
      phone: "02-0000-0009",
      email: "info@bada.example.com",
      note: "새 매입처",
    });
    expect(r.ok).toBe(true);
    expect(await getPartner(db, r.ok ? r.code : "")).toMatchObject({
      ceo: "홍길동",
      bizType: "",
      phone: "02-0000-0009",
      email: "info@bada.example.com",
      contactName: "",
      note: "새 매입처",
    });
  });

  it("틀린 칸은 함께 알리고 아무것도 바꾸지 않는다", async () => {
    const before = await getPartner(db, "BP-0001");
    const r = await updatePartner(db, "BP-0001", {
      name: "(가상) 가람리드프레임",
      isSupplier: "on",
      country: "KR",
      bizNo: "000-00-00001",
      phone: "모름",
      email: "garam",
      contactName: "가".repeat(51),
      active: "Y",
    });
    expect(r).toMatchObject({
      ok: false,
      errors: {
        phone: "전화는 숫자 · 붙임표(-) · + · 괄호로 넣으세요",
        email: "이메일은 name@example.com 꼴로 넣으세요",
        contactName: "담당자는 50자까지입니다",
      },
    });
    expect(await getPartner(db, "BP-0001")).toEqual(before);
  });

  it("수정 화면이 칸을 비워 보내면 빈 글자로 남는다", async () => {
    await updatePartner(db, "BP-0001", {
      name: "(가상) 가람리드프레임",
      isSupplier: "on",
      country: "KR",
      bizNo: "000-00-00001",
      active: "Y",
    });
    expect(await getPartner(db, "BP-0001")).toMatchObject({ ceo: "", address: "", note: "" });
  });
});

describe("DB 가 막는 것 — 화면 · 서버를 건너뛴 값", () => {
  const base = {
    code: "RM-0100",
    name: "x",
    itemType: "RM",
    procurement: "BUY",
    unit: "EA",
  };

  it.each([
    ["공통코드에 없는 대분류", { cls1: "NOPE" }, "items_cls1_fk"],
    ["다른 묶음의 값(중분류 칸에 대분류 값)", { cls2: "WAFER" }, "items_cls2_fk"],
    ["소분류의 묶음 칸이 ITEM_CLS3 가 아님", { cls3Group: "ITEM_CLS1", cls3: "WAFER" }, "items_cls3_group_fixed"],
    ["비고 501자", { note: "가".repeat(501) }, "items_note_length"],
  ])("품목 — %s", async (_name, over, constraint) => {
    expect(await rejection(db.insert(items).values({ ...base, ...over }))).toMatchObject({ constraint });
  });

  const partner = { code: "BP-0100", name: "x", isSupplier: true };
  it.each([
    ["대표자 51자", { ceo: "가".repeat(51) }, "partners_ceo_length"],
    ["업태 51자", { bizType: "가".repeat(51) }, "partners_biz_type_length"],
    ["종목 51자", { bizItem: "가".repeat(51) }, "partners_biz_item_length"],
    ["주소 201자", { address: "가".repeat(201) }, "partners_address_length"],
    ["담당자 51자", { contactName: "가".repeat(51) }, "partners_contact_name_length"],
    ["비고 501자", { note: "가".repeat(501) }, "partners_note_length"],
    ["전화에 글자", { phone: "02-국번-0000" }, "partners_phone_format"],
    ["전화에 숫자가 없음", { phone: "--" }, "partners_phone_format"],
    ["전화 21자", { phone: "0".repeat(21) }, "partners_phone_format"],
    ["담당자 연락처에 점", { contactPhone: "010.0000.0000" }, "partners_contact_phone_format"],
    ["이메일에 @ 없음", { email: "example.com" }, "partners_email_format"],
    ["이메일에 빈칸", { email: "a b@example.com" }, "partners_email_format"],
    ["이메일 101자", { email: `${"a".repeat(89)}@example.com` }, "partners_email_format"],
  ])("거래처 — %s", async (_name, over, constraint) => {
    expect(await rejection(db.insert(partners).values({ ...partner, ...over }))).toMatchObject({ constraint });
  });

  it("경계 안의 값은 받는다", async () => {
    await db.insert(items).values({ ...base, cls1: "WAFER", cls2: "SOP", cls3: "POWER", note: "가".repeat(500) });
    await db.insert(partners).values({
      ...partner,
      ceo: "가".repeat(50),
      address: "가".repeat(200),
      phone: "+81 (0) 0000-0000",
      contactPhone: "0".repeat(20),
      email: `${"a".repeat(88)}@example.com`,
      note: "가".repeat(500),
    });
    expect(await db.select().from(items).where(eq(items.code, "RM-0100"))).toHaveLength(1);
    expect(await db.select().from(partners).where(eq(partners.code, "BP-0100"))).toHaveLength(1);
  });

  it("서버의 검사를 빠뜨려 DB 가 거절하면 그 칸을 알린다", async () => {
    const input = await import("@/lib/item-input");
    const spy = vi.spyOn(input, "parseNewItem").mockReturnValue({
      ok: true,
      value: {
        itemType: "RM",
        procurement: "BUY",
        name: "x",
        spec: "",
        unit: "EA",
        inspectIn: false,
        inspectOut: false,
        lotManaged: true,
        lotRuleCode: null,
        defaultInWarehouse: null,
        defaultOutWarehouse: null,
        leadTimeDays: 0,
        safetyStock: 0,
        minLot: 0,
        lotMultiple: 0,
        cls1: null,
        cls2: null,
        cls3: null,
        note: "가".repeat(501),
      },
    });
    try {
      expect(await createItem(db, newRm)).toMatchObject({ ok: false, errors: { note: "받을 수 없는 값입니다" } });
    } finally {
      spy.mockRestore();
    }
  });
});

describe("시트의 설명용 칸", () => {
  it("분류는 이름 · 코드로 받고, 거래처의 설명용 칸이 함께 저장된다", async () => {
    const r = await saveItemRows(db, [
      { itemType: "원자재", name: "솔더 볼", unit: "EA", cls1: "화학재료", cls2: "common", note: "메모" },
    ]);
    expect(r.rejected).toEqual([]);
    expect(await getItem(db, r.saved[0].code)).toMatchObject({
      cls1: "CHEM",
      cls2: "COMMON",
      cls3: null,
      note: "메모",
    });

    const p = await savePartnerRows(db, [
      { name: "(가상) 바다솔더", isSupplier: "Y", ceo: "홍길동", phone: "02-0000-0009", contactName: "김철수" },
    ]);
    expect(p.rejected).toEqual([]);
    expect(await getPartner(db, p.saved[0].code)).toMatchObject({
      ceo: "홍길동",
      phone: "02-0000-0009",
      contactName: "김철수",
      email: "",
    });
  });

  it("PR F 꼴의 표(뒤 칸 없음)를 붙여넣어도 저장된다", async () => {
    const r = await saveItemRows(db, [{ itemType: "RM", name: "솔더 볼", unit: "EA" }]);
    expect(r.saved).toHaveLength(1);
    const p = await savePartnerRows(db, [{ name: "(가상) 바다솔더", isSupplier: "Y" }]);
    expect(p.saved).toHaveLength(1);
  });

  it("「사용 안 함」 분류 · 꼴이 틀린 이메일의 줄은 남고, 다른 줄은 저장된다", async () => {
    await deactivate("ITEM_CLS3", "GENERAL", "범용");
    const r = await saveItemRows(db, [
      { itemType: "RM", name: "A", unit: "EA", cls3: "범용" },
      { itemType: "RM", name: "B", unit: "EA" },
    ]);
    expect(r.saved.map((s) => s.name)).toEqual(["B"]);
    expect(r.rejected[0].errors).toEqual({ cls3: "「사용 안 함」인 소분류입니다 — 다른 값을 넣으세요" });

    const p = await savePartnerRows(db, [
      { name: "(가상) 가", isSupplier: "Y", email: "틀림" },
      { name: "(가상) 나", isSupplier: "Y" },
    ]);
    expect(p.saved.map((s) => s.name)).toEqual(["(가상) 나"]);
    expect(p.rejected[0].errors).toEqual({ email: "이메일은 name@example.com 꼴로 넣으세요" });
  });
});
