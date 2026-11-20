// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

// 판매계획의 입구 — 저장(메뉴 「판매계획 등록」) · 확정 · 확정 취소(메뉴 「판매계획 확정」). 서면 그 메뉴의 같은 쪽 · 같은 거르기로
// 돌아가 바꾼 칸 수를 주소에 싣고(꼴이 틀린 돌아갈 값은 뺀다),
// 거절되면 까닭을 돌려준다. DB 가 실패하면 오류 코드만 로그에 남긴다(넣은 글자는 남기지 않는다).

const h = vi.hoisted(() => ({
  redirect: vi.fn(),
  save: vi.fn(),
  confirm: vi.fn(),
  unconfirm: vi.fn(),
}));
vi.mock("@/db/request", () => ({ withDb: (run: (db: unknown) => unknown) => run("db") }));
vi.mock("next/navigation", () => ({ redirect: h.redirect }));
vi.mock("@/db/sales-plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/sales-plans")>()),
  saveSalesPlan: h.save,
  confirmSalesPlan: h.confirm,
  unconfirmSalesPlan: h.unconfirm,
}));

import { confirmSalesPlanAction, saveSalesPlanAction, unconfirmSalesPlanAction } from "../actions";

const visitorText = "방문자가넣은글자-비밀";
const cells = [{ customer: "BP-0004", item: "FG-0001", week: "2026-11-23", qty: "3000" }];
const back = { from: "2026-11-16", customer: "BP-0004", item: "" };
const serverError = () =>
  Object.assign(new Error("wrap"), {
    cause: { code: "40001", severity: "ERROR", message: `failing row (${visitorText})`, table_name: "sales_plans" },
  });

describe("판매계획의 입구", () => {
  afterEach(() => vi.resetAllMocks());

  it("확정되면 「판매계획 확정」의 같은 쪽 · 같은 거르기로 돌아가 「confirmed=칸 수」를 싣는다", async () => {
    h.confirm.mockResolvedValue({ ok: true, changed: 1 });
    await confirmSalesPlanAction(cells, back);
    expect(h.confirm).toHaveBeenCalledWith("db", cells, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(h.redirect).toHaveBeenCalledWith("/sales/plans/confirm?from=2026-11-16&customer=BP-0004&confirmed=1");
  });

  it("확정 취소되면 「판매계획 확정」으로 돌아가 「unconfirmed=칸 수」를 싣는다", async () => {
    h.unconfirm.mockResolvedValue({ ok: true, changed: 12 });
    await unconfirmSalesPlanAction(cells, { from: "2026-11-16", customer: "", item: "FG-0001" });
    expect(h.unconfirm).toHaveBeenCalledWith("db", cells, expect.any(String));
    expect(h.redirect).toHaveBeenCalledWith("/sales/plans/confirm?from=2026-11-16&item=FG-0001&unconfirmed=12");
  });

  it("돌아갈 값의 꼴이 틀리면 뺀다 — 월요일이 아닌 쪽 · 코드 꼴이 아닌 거르기", async () => {
    h.confirm.mockResolvedValue({ ok: true, changed: 2 });
    await confirmSalesPlanAction(cells, { from: "2026-11-17", customer: "x&saved=9", item: "https://evil" });
    expect(h.redirect).toHaveBeenCalledWith("/sales/plans/confirm?confirmed=2");
    h.save.mockResolvedValue({ ok: true, changed: 0 });
    await saveSalesPlanAction([], back);
    expect(h.redirect).toHaveBeenLastCalledWith("/sales/plans?from=2026-11-16&customer=BP-0004&saved=0");
  });

  it("저장되면 「판매계획 등록」의 같은 쪽 · 같은 거르기로 돌아가 「saved=칸 수」를 싣는다", async () => {
    h.save.mockResolvedValue({ ok: true, changed: 4 });
    await saveSalesPlanAction([], { from: "2026-11-23", customer: "", item: "FG-0002" });
    expect(h.redirect).toHaveBeenCalledWith("/sales/plans?from=2026-11-23&item=FG-0002&saved=4");
  });

  it("돌아갈 경로는 동작마다 정해져 있다 — back 에 경로 같은 값을 실어도 쿼리로만 걸러진다", async () => {
    h.unconfirm.mockResolvedValue({ ok: true, changed: 1 });
    await unconfirmSalesPlanAction(cells, {
      from: "/sales/plans",
      customer: "../../evil",
      item: "//evil.example",
      path: "https://evil.example",
    } as never);
    expect(h.redirect).toHaveBeenCalledWith("/sales/plans/confirm?unconfirmed=1");
    h.save.mockResolvedValue({ ok: true, changed: 1 });
    await saveSalesPlanAction([], null as never);
    expect(h.redirect).toHaveBeenLastCalledWith("/sales/plans?saved=1");
  });

  it("거절되면 까닭을 돌려주고 옮기지 않는다", async () => {
    const rejected = { ok: false, errors: {}, formError: "다른 사람이 먼저 고쳤습니다" };
    h.confirm.mockResolvedValue(rejected);
    h.unconfirm.mockResolvedValue(rejected);
    expect(await confirmSalesPlanAction(cells, back)).toEqual(rejected);
    expect(await unconfirmSalesPlanAction(cells, back)).toEqual(rejected);
    expect(h.redirect).not.toHaveBeenCalled();
  });

  it.each([
    ["저장", "저장하지 못했습니다 — 잠시 뒤 다시 저장하세요", () => saveSalesPlanAction([], back), h.save],
    ["확정", "확정하지 못했습니다 — 잠시 뒤 다시 확정하세요", () => confirmSalesPlanAction(cells, back), h.confirm],
    [
      "확정 취소",
      "확정 취소하지 못했습니다 — 잠시 뒤 다시 확정 취소하세요",
      () => unconfirmSalesPlanAction(cells, back),
      h.unconfirm,
    ],
  ])("%s 중 DB 가 실패하면 로그에 코드만 남기고 넣은 글자는 남기지 않는다", async (_, message, run, db) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    db.mockRejectedValue(serverError());
    expect(await run()).toEqual({ ok: false, errors: {}, formError: message });
    const logged = error.mock.calls.flat().join(" ");
    expect(logged).toContain("40001");
    expect(logged).not.toContain(visitorText);
    expect(h.redirect).not.toHaveBeenCalled();
  });
});
