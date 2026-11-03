// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

// 거래처 등록 · 수정의 입구 — 저장되면 목록으로 가고, DB 가 실패하면 오류 코드만 로그에 남긴다(대장 NC-6).

const h = vi.hoisted(() => ({ withDb: vi.fn(), redirect: vi.fn() }));
vi.mock("@/db/request", () => ({ withDb: h.withDb }));
vi.mock("next/navigation", () => ({ redirect: h.redirect }));

import { createPartnerAction, updatePartnerAction } from "../actions";

const form = (values: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
};
const visitorText = "방문자가넣은거래처-비밀";

const serverError = () =>
  Object.assign(new Error("wrap"), {
    cause: {
      code: "23514",
      severity: "ERROR",
      message: `new row violates check constraint: (${visitorText})`,
      table_name: "partners",
      constraint_name: "partners_role_required",
    },
  });

describe("거래처 등록 · 수정의 입구", () => {
  afterEach(() => vi.resetAllMocks());

  it("저장되면 그 코드를 알리는 목록으로 간다", async () => {
    h.withDb.mockResolvedValue({ ok: true, code: "BP-0006" });
    await createPartnerAction(null, form({ name: "(가상) 바다솔더", isSupplier: "on" }));
    expect(h.redirect).toHaveBeenCalledWith("/master/partners?saved=BP-0006");
  });

  it("거절되면 칸의 까닭과 보낸 값을 돌려준다 — 목록으로 가지 않는다", async () => {
    const rejected = {
      ok: false,
      errors: { role: "매입처 · 매출처 가운데 하나 이상을 고르세요" },
      values: { name: "x" },
    };
    h.withDb.mockResolvedValue(rejected);
    expect(await createPartnerAction(null, form({ name: "x" }))).toEqual(rejected);
    expect(h.redirect).not.toHaveBeenCalled();
  });

  it.each([
    ["등록", () => createPartnerAction(null, form({ name: visitorText }))],
    ["수정", () => updatePartnerAction("BP-0001", null, form({ name: visitorText }))],
  ])("%s 중 DB 가 실패하면 다시 저장하라고 알리고, 로그에는 코드와 스키마 이름만 남긴다", async (_name, run) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    h.withDb.mockRejectedValue(serverError());
    const result = await run();
    expect(result).toMatchObject({ ok: false, formError: expect.stringContaining("다시 저장하세요") });
    const logged = error.mock.calls.flat().join(" ");
    expect(logged).toContain("23514 ERROR table=partners constraint=partners_role_required");
    expect(logged).not.toContain(visitorText);
    expect(h.redirect).not.toHaveBeenCalled();
  });

  it("수정할 거래처가 없으면 그렇게 알린다", async () => {
    h.withDb.mockResolvedValue({ ok: false, notFound: true });
    expect(await updatePartnerAction("BP-0999", null, form({}))).toMatchObject({
      formError: "없는 거래처입니다 — 목록에서 다시 고르세요",
    });
  });
});
