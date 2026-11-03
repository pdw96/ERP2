// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

// 등록 · 수정의 입구 — 저장되면 목록으로 가고, DB 가 실패하면 오류 코드만 로그에 남긴다(대장 NC-6).

const h = vi.hoisted(() => ({ withDb: vi.fn(), redirect: vi.fn() }));
vi.mock("@/db/request", () => ({ withDb: h.withDb }));
vi.mock("next/navigation", () => ({ redirect: h.redirect }));

import { createItemAction, updateItemAction } from "../actions";

const form = (values: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
};
const visitorText = "방문자가넣은글자-비밀";

// DB 서버가 돌려준 오류 꼴 — 메시지에 행의 값이 실릴 수 있다.
const serverError = () =>
  Object.assign(new Error("wrap"), {
    cause: {
      code: "23514",
      severity: "ERROR",
      message: `new row violates check constraint: (${visitorText})`,
      table_name: "items",
      constraint_name: "items_name_length",
    },
  });

describe("품목 등록 · 수정의 입구", () => {
  afterEach(() => vi.resetAllMocks());

  it("저장되면 그 코드를 알리는 목록으로 간다", async () => {
    h.withDb.mockResolvedValue({ ok: true, code: "RM-0007" });
    await createItemAction(null, form({ name: "솔더 볼" }));
    expect(h.redirect).toHaveBeenCalledWith("/master/items?saved=RM-0007");
  });

  it("거절되면 칸의 까닭과 보낸 값을 돌려준다 — 목록으로 가지 않는다", async () => {
    const rejected = { ok: false, errors: { name: "품명을 넣으세요" }, values: { name: "" } };
    h.withDb.mockResolvedValue(rejected);
    expect(await createItemAction(null, form({ name: "" }))).toEqual(rejected);
    expect(h.redirect).not.toHaveBeenCalled();
  });

  it.each([
    ["등록", () => createItemAction(null, form({ name: visitorText }))],
    ["수정", () => updateItemAction("RM-0001", null, form({ name: visitorText }))],
  ])("%s 중 DB 가 실패하면 다시 저장하라고 알리고, 로그에는 코드와 스키마 이름만 남긴다", async (_name, run) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    h.withDb.mockRejectedValue(serverError());
    const result = await run();
    expect(result).toMatchObject({ ok: false, formError: expect.stringContaining("다시 저장하세요") });
    const logged = error.mock.calls.flat().join(" ");
    expect(logged).toContain("23514 ERROR table=items constraint=items_name_length");
    expect(logged).not.toContain(visitorText);
    expect(h.redirect).not.toHaveBeenCalled();
  });

  it("수정할 품목이 없으면 그렇게 알린다", async () => {
    h.withDb.mockResolvedValue({ ok: false, notFound: true });
    expect(await updateItemAction("RM-0999", null, form({}))).toMatchObject({
      formError: "없는 품목입니다 — 목록에서 다시 고르세요",
    });
  });
});
