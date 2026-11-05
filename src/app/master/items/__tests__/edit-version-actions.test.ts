// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

// PR J — 한 건 수정의 입구는 화면을 연 때의 버전을 DB 층에 넘기고, 시트의 불러오기 입구는 목록과 같은 거르기 이름을 읽는다.
// DB 가 실패하면 오류 코드만 로그에 남긴다(대장 NC-6).

const h = vi.hoisted(() => ({
  withDb: vi.fn(),
  redirect: vi.fn(),
  updateItem: vi.fn(),
  updatePartner: vi.fn(),
  updateWarehouse: vi.fn(),
  updateCode: vi.fn(),
  loadItemsForSheet: vi.fn(),
  loadPartnersForSheet: vi.fn(),
}));
vi.mock("@/db/request", () => ({ withDb: h.withDb }));
vi.mock("next/navigation", () => ({ redirect: h.redirect }));
vi.mock("@/db/items", async (real) => ({
  ...(await real<typeof import("@/db/items")>()),
  updateItem: h.updateItem,
  loadItemsForSheet: h.loadItemsForSheet,
  allItemClasses: async () => ({ cls1: [{ code: "WAFER", name: "웨이퍼", active: true }], cls2: [], cls3: [] }),
}));
vi.mock("@/db/partners", async (real) => ({
  ...(await real<typeof import("@/db/partners")>()),
  updatePartner: h.updatePartner,
  loadPartnersForSheet: h.loadPartnersForSheet,
  allCountries: async () => [{ code: "JP", name: "일본", active: true }],
}));

vi.mock("@/db/warehouses", async (real) => ({
  ...(await real<typeof import("@/db/warehouses")>()),
  updateWarehouse: h.updateWarehouse,
}));
vi.mock("@/db/codes", async (real) => ({
  ...(await real<typeof import("@/db/codes")>()),
  updateCode: h.updateCode,
}));

import { loadItemSheetAction, updateItemAction } from "../actions";
import { updateWarehouseAction } from "@/app/inventory/warehouses/actions";
import { updateCodeAction } from "@/app/system/codes/actions";
import { loadPartnerSheetAction, updatePartnerAction } from "../../partners/actions";

const form = (values: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
};
const visitorText = "방문자가넣은글자-비밀";
const db = { fake: true };

afterEach(() => vi.resetAllMocks());

describe("한 건 수정의 버전", () => {
  it.each([
    ["품목", () => updateItemAction("RM-0001", null, form({ name: "x", version: "123" })), h.updateItem, "RM-0001"],
    [
      "거래처",
      () => updatePartnerAction("BP-0001", null, form({ name: "x", version: "123" })),
      h.updatePartner,
      "BP-0001",
    ],
  ] as const)("%s — 보낸 버전을 넘긴다", async (_what, call, update, code) => {
    h.withDb.mockImplementation((work: (d: unknown) => unknown) => work(db));
    update.mockResolvedValue({ ok: true, code });
    await call();
    expect(update).toHaveBeenCalledWith(db, code, expect.objectContaining({ name: "x" }), "123");
  });

  it("창고 · 공통코드도 보낸 버전을 넘긴다(저자 판정 2026-11-05)", async () => {
    h.withDb.mockImplementation((work: (d: unknown) => unknown) => work(db));
    h.updateWarehouse.mockResolvedValue({ ok: true, code: "WH-04" });
    h.updateCode.mockResolvedValue({ ok: true, code: "G" });
    await updateWarehouseAction("WH-04", null, form({ name: "x", version: "123" }));
    await updateCodeAction("UNIT", "G", null, form({ name: "x", version: "123" }));
    expect(h.updateWarehouse).toHaveBeenCalledWith(db, "WH-04", expect.objectContaining({ name: "x" }), "123");
    expect(h.updateCode).toHaveBeenCalledWith(db, "UNIT", "G", expect.objectContaining({ name: "x" }), "123");
  });

  it("버전이 오지 않으면 빈 버전으로 넘긴다 — DB 층이 「다른 사람이 먼저 고쳤다」로 막는다", async () => {
    h.withDb.mockImplementation((work: (d: unknown) => unknown) => work(db));
    h.updateItem.mockResolvedValue({ ok: false, errors: {}, values: {} });
    await updateItemAction("RM-0001", null, form({ name: "x" }));
    expect(h.updateItem).toHaveBeenCalledWith(db, "RM-0001", expect.anything(), "");
  });
});

describe("시트의 불러오기", () => {
  it("품목 — 목록과 같은 거르기 이름을 읽고, 없는 값은 거르지 않고 알린다", async () => {
    h.withDb.mockImplementation((work: (d: unknown) => unknown) => work(db));
    h.loadItemsForSheet.mockResolvedValue({ rows: [], total: 0 });
    const r = await loadItemSheetAction(form({ q: "웨이", type: "RM", cls1: "WAFER", cls2: "NOPE", inactive: "1" }));
    expect(h.loadItemsForSheet).toHaveBeenCalledWith(db, {
      q: "웨이",
      itemType: "RM",
      cls1: "WAFER",
      includeInactive: true,
    });
    expect(r).toEqual({ rows: [], total: 0, notices: ["없는 중분류라 거르지 않았습니다"] });
  });

  it("거래처 — 국가로도 거른다", async () => {
    h.withDb.mockImplementation((work: (d: unknown) => unknown) => work(db));
    h.loadPartnersForSheet.mockResolvedValue({ rows: [], total: 0 });
    await loadPartnerSheetAction(form({ role: "supplier", country: "JP" }));
    expect(h.loadPartnersForSheet).toHaveBeenCalledWith(db, {
      q: "",
      role: "supplier",
      country: "JP",
      includeInactive: false,
    });
  });

  it.each([
    ["품목", () => loadItemSheetAction(form({ q: visitorText }))],
    ["거래처", () => loadPartnerSheetAction(form({ q: visitorText }))],
  ] as const)("%s — DB 가 실패하면 다시 불러오라고 알리고, 로그에는 코드만", async (what, call) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    h.withDb.mockRejectedValue(Object.assign(new Error("wrap"), { cause: { code: "57P01", message: visitorText } }));
    expect(await call()).toEqual({
      rows: [],
      total: 0,
      notices: [],
      formError: "불러오지 못했습니다 — 잠시 뒤 다시 불러오세요",
    });
    const logged = error.mock.calls.flat().join(" ");
    expect(logged).toContain(`${what} 시트 불러오기 실패`);
    expect(logged).toContain("57P01");
    expect(logged).not.toContain(visitorText);
  });
});
