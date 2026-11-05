// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

// 시트형 등록의 입구 — 품목 · 거래처. 꼴이 틀린 시트는 DB 에 닿지 않고, DB 가 실패하면 오류 코드만 로그에 남긴다(대장 NC-6).

const h = vi.hoisted(() => ({ withDb: vi.fn(), redirect: vi.fn() }));
vi.mock("@/db/request", () => ({ withDb: h.withDb }));
vi.mock("next/navigation", () => ({ redirect: h.redirect }));

import { saveItemSheetAction } from "../actions";
import { savePartnerSheetAction } from "../../partners/actions";

const visitorText = "방문자가넣은글자-비밀";
const sheet = (rows: unknown) => {
  const f = new FormData();
  f.set("rows", typeof rows === "string" ? rows : JSON.stringify(rows));
  return f;
};
const serverError = () =>
  Object.assign(new Error("wrap"), {
    cause: { code: "57P01", severity: "FATAL", message: `terminating (${visitorText})` },
  });

describe.each([
  ["품목", saveItemSheetAction, { itemType: "원자재", name: visitorText, unit: "EA" }],
  ["거래처", savePartnerSheetAction, { name: visitorText, isSupplier: "Y" }],
] as const)("%s 시트의 입구", (what, action, row) => {
  afterEach(() => vi.resetAllMocks());

  it("서버의 결과를 그대로 돌려준다 — 목록으로 가지 않는다", async () => {
    const result = { saved: [{ code: "X-0001", name: "x" }], rejected: [] };
    h.withDb.mockResolvedValue(result);
    expect(await action(null, sheet([row]))).toEqual(result);
    expect(h.redirect).not.toHaveBeenCalled();
  });

  it("101줄이면 DB 에 닿지 않고 나눠 저장하라고 알린다", async () => {
    const r = await action(null, sheet(Array.from({ length: 101 }, () => row)));
    expect(r).toEqual({ saved: [], rejected: [], formError: "한 번에 100행까지 받습니다 — 나눠서 저장하세요" });
    expect(h.withDb).not.toHaveBeenCalled();
  });

  it("꼴이 틀린 시트는 DB 에 닿지 않는다", async () => {
    expect(await action(null, sheet("{"))).toMatchObject({ formError: expect.stringContaining("읽지 못했습니다") });
    expect(await action(null, new FormData())).toMatchObject({ formError: expect.stringContaining("읽지 못했습니다") });
    expect(h.withDb).not.toHaveBeenCalled();
  });

  it("DB 가 실패하면 아무것도 저장하지 않았다고 알리고 줄을 그대로 남긴다 — 로그에는 코드만", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    h.withDb.mockRejectedValue(serverError());
    const r = await action(null, sheet([row]));
    expect(r.saved).toEqual([]);
    expect(r.formError).toContain("다시 저장하세요");
    expect(r.rejected).toHaveLength(1);
    const logged = error.mock.calls.flat().join(" ");
    expect(logged).toContain(`${what} 시트 등록 실패`);
    expect(logged).toContain("57P01");
    expect(logged).not.toContain(visitorText);
  });
});
