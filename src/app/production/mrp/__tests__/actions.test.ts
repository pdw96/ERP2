// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

// MRP 의 입구 — [MRP 실행] · 완성일 기준 요일 저장(메뉴 「MRP」). 서면 같은 화면으로 돌아가 결과를 주소에 싣고(보던 탭이 표 · 페깅이면 view 만),
// 거절되면 까닭을 그대로 돌려준다. DB 가 실패하면 오류 코드만 로그에 남긴다(넣은 글자는 남기지 않는다).

const h = vi.hoisted(() => ({ redirect: vi.fn(), run: vi.fn(), save: vi.fn() }));
vi.mock("@/db/request", () => ({ withDb: (run: (db: unknown) => unknown) => run("db") }));
vi.mock("next/navigation", () => ({ redirect: h.redirect }));
vi.mock("@/db/mrp", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/mrp")>()),
  runMrp: h.run,
  saveMrpSettings: h.save,
}));

import { runMrpAction, saveMrpSettingAction } from "../actions";

const visitorText = "방문자가넣은글자-비밀";
const form = (values: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
};
const serverError = () =>
  Object.assign(new Error("wrap"), {
    cause: { code: "40001", severity: "ERROR", message: `failing row (${visitorText})`, table_name: "mrp_runs" },
  });

describe("MRP 의 입구", () => {
  afterEach(() => vi.resetAllMocks());

  it("실행되면 「ran=계획오더 수」를 싣고 돌아간다 — 표에서 실행했으면 view=grid 도", async () => {
    h.run.mockResolvedValue({ ok: true, orders: 37 });
    await runMrpAction(null, form({}));
    expect(h.run).toHaveBeenCalledWith("db");
    expect(h.redirect).toHaveBeenLastCalledWith("/production/mrp?ran=37");
    await runMrpAction(null, form({ view: "grid" }));
    expect(h.redirect).toHaveBeenLastCalledWith("/production/mrp?view=grid&ran=37");
  });

  it("표(view=grid)에서는 보던 쪽(from)이 월요일일 때만 싣는다 — 목록은 from 을 싣지 않는다", async () => {
    h.run.mockResolvedValue({ ok: true, orders: 3 });
    await runMrpAction(null, form({ view: "grid", from: "2026-12-07" }));
    expect(h.redirect).toHaveBeenLastCalledWith("/production/mrp?view=grid&from=2026-12-07&ran=3");
    for (const bad of ["2026-12-08", "2026-02-30", "garbage", "//evil.example", ""]) {
      await runMrpAction(null, form({ view: "grid", from: bad }));
      expect(h.redirect).toHaveBeenLastCalledWith("/production/mrp?view=grid&ran=3");
    }
    await runMrpAction(null, form({ from: "2026-12-07" }));
    expect(h.redirect).toHaveBeenLastCalledWith("/production/mrp?ran=3");
    h.save.mockResolvedValue({ ok: true, changed: true });
    await saveMrpSettingAction(null, form({ dueWeekday: "5", view: "grid", from: "2026-12-07" }));
    expect(h.redirect).toHaveBeenLastCalledWith("/production/mrp?view=grid&from=2026-12-07&setting=saved");
    await saveMrpSettingAction(null, form({ dueWeekday: "5", from: "2026-12-07" }));
    expect(h.redirect).toHaveBeenLastCalledWith("/production/mrp?setting=saved");
  });

  it("페깅 탭(view=peg)에서 실행하면 view=peg 로 돌아간다 — 품목 · 계획오더 · from 은 싣지 않는다", async () => {
    h.run.mockResolvedValue({ ok: true, orders: 5 });
    await runMrpAction(null, form({ view: "peg", item: "FG-0001", order: "PL-20261124-001", from: "2026-12-07" }));
    expect(h.redirect).toHaveBeenLastCalledWith("/production/mrp?view=peg&ran=5");
  });

  it("view 가 grid · peg 가 아니면 싣지 않는다 — 경로 같은 값도 쿼리로만 걸러진다", async () => {
    h.run.mockResolvedValue({ ok: true, orders: 0 });
    await runMrpAction(null, form({ view: "//evil.example", path: "https://evil.example" }));
    expect(h.redirect).toHaveBeenLastCalledWith("/production/mrp?ran=0");
  });

  it("기준 요일이 바뀌면 「setting=saved」, 같으면 「setting=same」", async () => {
    h.save.mockResolvedValue({ ok: true, changed: true });
    await saveMrpSettingAction(null, form({ dueWeekday: "5" }));
    expect(h.save).toHaveBeenCalledWith("db", "5");
    expect(h.redirect).toHaveBeenLastCalledWith("/production/mrp?setting=saved");
    h.save.mockResolvedValue({ ok: true, changed: false });
    await saveMrpSettingAction(null, form({ dueWeekday: "5", view: "grid" }));
    expect(h.redirect).toHaveBeenLastCalledWith("/production/mrp?view=grid&setting=same");
  });

  it("거절되면 까닭을 그대로 돌려주고 옮기지 않는다", async () => {
    h.run.mockResolvedValue({ ok: false, formError: "MRP 실행 기록이 1,000건을 넘습니다" });
    h.save.mockResolvedValue({ ok: false, formError: "완성일 기준 요일을 고르세요" });
    expect(await runMrpAction(null, form({}))).toEqual({ ok: false, formError: "MRP 실행 기록이 1,000건을 넘습니다" });
    expect(await saveMrpSettingAction(null, form({ dueWeekday: "9" }))).toEqual({
      ok: false,
      formError: "완성일 기준 요일을 고르세요",
    });
    expect(h.redirect).not.toHaveBeenCalled();
  });

  it.each([
    ["실행", "실행하지 못했습니다 — 잠시 뒤 다시 실행하세요", () => runMrpAction(null, form({})), h.run],
    [
      "저장",
      "저장하지 못했습니다 — 잠시 뒤 다시 저장하세요",
      () => saveMrpSettingAction(null, form({ dueWeekday: visitorText })),
      h.save,
    ],
  ])("%s 중 DB 가 실패하면 로그에 코드만 남기고 넣은 글자는 남기지 않는다", async (_, message, run, db) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    db.mockRejectedValue(serverError());
    expect(await run()).toEqual({ ok: false, formError: message });
    const logged = error.mock.calls.flat().join(" ");
    expect(logged).toContain("40001");
    expect(logged).not.toContain(visitorText);
    expect(h.redirect).not.toHaveBeenCalled();
  });
});
