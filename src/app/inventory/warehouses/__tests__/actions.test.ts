// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

// 창고 등록 · 수정의 입구 — 저장되면 목록으로 가고, DB 가 실패하면 오류 코드만 로그에 남긴다(대장 NC-6).

const h = vi.hoisted(() => ({ withDb: vi.fn(), redirect: vi.fn() }));
vi.mock("@/db/request", () => ({ withDb: h.withDb }));
vi.mock("next/navigation", () => ({ redirect: h.redirect }));

import { createWarehouseAction, updateWarehouseAction } from "../actions";

const form = (values: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
};
const visitorText = "방문자가넣은창고-비밀";

const serverError = () =>
  Object.assign(new Error("wrap"), {
    cause: {
      code: "23514",
      severity: "ERROR",
      message: `new row violates check constraint: (${visitorText})`,
      table_name: "warehouses",
      constraint_name: "warehouses_name_length",
    },
  });

describe("창고 등록 · 수정의 입구", () => {
  afterEach(() => vi.resetAllMocks());

  it("저장되면 그 코드를 알리는 목록으로 간다", async () => {
    h.withDb.mockResolvedValue({ ok: true, code: "WH-05" });
    await createWarehouseAction(null, form({ name: "외주창고" }));
    expect(h.redirect).toHaveBeenCalledWith("/inventory/warehouses?saved=WH-05");
  });

  it("수정이 저장되면 목록으로 간다", async () => {
    h.withDb.mockResolvedValue({ ok: true, code: "WH-01" });
    await updateWarehouseAction("WH-01", null, form({ name: "자재창고", active: "Y" }));
    expect(h.redirect).toHaveBeenCalledWith("/inventory/warehouses?saved=WH-01");
  });

  it("거절되면 칸의 까닭과 보낸 값을 돌려준다 — 목록으로 가지 않는다", async () => {
    const rejected = { ok: false, errors: { name: "창고명을 넣으세요" }, values: { name: "" } };
    h.withDb.mockResolvedValue(rejected);
    expect(await createWarehouseAction(null, form({ name: "" }))).toEqual(rejected);
    expect(h.redirect).not.toHaveBeenCalled();
  });

  it.each([
    ["등록", () => createWarehouseAction(null, form({ name: visitorText }))],
    ["수정", () => updateWarehouseAction("WH-01", null, form({ name: visitorText }))],
  ])("%s 중 DB 가 실패하면 다시 저장하라고 알리고, 로그에는 코드와 스키마 이름만 남긴다", async (_name, run) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    h.withDb.mockRejectedValue(serverError());
    const result = await run();
    expect(result).toMatchObject({ ok: false, formError: expect.stringContaining("다시 저장하세요") });
    const logged = error.mock.calls.flat().join(" ");
    expect(logged).toContain("23514 ERROR table=warehouses constraint=warehouses_name_length");
    expect(logged).not.toContain(visitorText);
    expect(h.redirect).not.toHaveBeenCalled();
  });

  it("수정할 창고가 없으면 그렇게 알린다", async () => {
    h.withDb.mockResolvedValue({ ok: false, notFound: true });
    expect(await updateWarehouseAction("WH-98", null, form({}))).toMatchObject({
      formError: "없는 창고입니다 — 목록에서 다시 고르세요",
    });
  });
});
