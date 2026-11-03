// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

// 공통코드 값 추가 · 수정의 입구 — 저장되면 그 묶음의 값 목록으로 가고, DB 가 실패하면 오류 코드만 로그에 남긴다(대장 NC-6).

const h = vi.hoisted(() => ({ withDb: vi.fn(), redirect: vi.fn() }));
vi.mock("@/db/request", () => ({ withDb: h.withDb }));
vi.mock("next/navigation", () => ({ redirect: h.redirect }));

import { createCodeAction, updateCodeAction } from "../actions";

const form = (values: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
};
const visitorText = "방문자가넣은단위-비밀";

const serverError = () =>
  Object.assign(new Error("wrap"), {
    cause: {
      code: "23514",
      severity: "ERROR",
      message: `new row violates check constraint: (${visitorText})`,
      table_name: "codes",
      constraint_name: "codes_name_length",
    },
  });

describe("공통코드 값 추가 · 수정의 입구", () => {
  afterEach(() => vi.resetAllMocks());

  it("더하면 그 묶음의 값 목록으로 가서 그 값을 알린다", async () => {
    h.withDb.mockResolvedValue({ ok: true, code: "BOX" });
    await createCodeAction("UNIT", null, form({ code: "BOX", name: "상자", sortOrder: "50" }));
    expect(h.redirect).toHaveBeenCalledWith("/system/codes/UNIT?saved=BOX");
  });

  it("수정이 저장되면 그 묶음의 값 목록으로 간다", async () => {
    h.withDb.mockResolvedValue({ ok: true, code: "EA" });
    await updateCodeAction("UNIT", "EA", null, form({ name: "개", sortOrder: "10", active: "Y" }));
    expect(h.redirect).toHaveBeenCalledWith("/system/codes/UNIT?saved=EA");
  });

  it("거절되면 칸의 까닭과 보낸 값을 돌려준다 — 목록으로 가지 않는다", async () => {
    const rejected = { ok: false, errors: { code: "코드를 넣으세요" }, values: { code: "" } };
    h.withDb.mockResolvedValue(rejected);
    expect(await createCodeAction("UNIT", null, form({ code: "" }))).toEqual(rejected);
    expect(h.redirect).not.toHaveBeenCalled();
  });

  it("없는 묶음 · 값이면 그렇게 알린다", async () => {
    h.withDb.mockResolvedValue({ ok: false, notFound: true });
    expect(await updateCodeAction("UNIT", "ZZ", null, form({}))).toMatchObject({
      formError: "없는 묶음이나 값입니다 — 목록에서 다시 고르세요",
    });
    expect(await createCodeAction("COLOR", null, form({}))).toMatchObject({ formError: expect.any(String) });
    expect(h.redirect).not.toHaveBeenCalled();
  });

  it.each([
    ["추가", () => createCodeAction("UNIT", null, form({ code: "BOX", name: visitorText, sortOrder: "1" }))],
    ["수정", () => updateCodeAction("UNIT", "EA", null, form({ name: visitorText, sortOrder: "1", active: "Y" }))],
  ])("%s 중 DB 가 실패하면 다시 저장하라고 알리고, 로그에는 코드와 스키마 이름만 남긴다", async (_name, run) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    h.withDb.mockRejectedValue(serverError());
    const result = await run();
    expect(result).toMatchObject({ ok: false, formError: expect.stringContaining("다시 저장하세요") });
    const logged = error.mock.calls.flat().join(" ");
    expect(logged).toContain("23514 ERROR table=codes constraint=codes_name_length");
    expect(logged).not.toContain(visitorText);
    expect(h.redirect).not.toHaveBeenCalled();
  });
});
