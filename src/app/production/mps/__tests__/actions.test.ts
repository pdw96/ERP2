// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

// MPS 의 입구 — 저장 · 확정 · 확정 취소(메뉴 「MPS」). 서면 같은 쪽으로 돌아가 바꾼 칸 수를 주소에 싣고(월요일이 아닌 쪽은 뺀다),
// 거절되면 까닭을 돌려준다. DB 가 실패하면 오류 코드만 로그에 남긴다(넣은 글자는 남기지 않는다).

const h = vi.hoisted(() => ({
  redirect: vi.fn(),
  save: vi.fn(),
  confirm: vi.fn(),
  unconfirm: vi.fn(),
}));
vi.mock("@/db/request", () => ({ withDb: (run: (db: unknown) => unknown) => run("db") }));
vi.mock("next/navigation", () => ({ redirect: h.redirect }));
vi.mock("@/db/mps", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/mps")>()),
  saveMps: h.save,
  confirmMps: h.confirm,
  unconfirmMps: h.unconfirm,
}));

import { confirmMpsAction, saveMpsAction, unconfirmMpsAction } from "../actions";

const visitorText = "방문자가넣은글자-비밀";
const edits = [{ item: "FG-0001", week: "2026-11-23", before: "", after: "500" }];
const cells = [{ item: "FG-0001", week: "2026-11-23", qty: "1000" }];
const back = { from: "2026-11-16" };
const serverError = () =>
  Object.assign(new Error("wrap"), {
    cause: { code: "40001", severity: "ERROR", message: `failing row (${visitorText})`, table_name: "mps_fixed" },
  });

describe("MPS 의 입구", () => {
  afterEach(() => vi.resetAllMocks());

  it("저장되면 같은 쪽으로 돌아가 「saved=칸 수」를 싣는다", async () => {
    h.save.mockResolvedValue({ ok: true, changed: 1 });
    await saveMpsAction(edits, back);
    expect(h.save).toHaveBeenCalledWith("db", edits, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(h.redirect).toHaveBeenCalledWith("/production/mps?from=2026-11-16&saved=1");
  });

  it("확정되면 「confirmed=칸 수」, 확정 취소되면 「unconfirmed=칸 수」", async () => {
    h.confirm.mockResolvedValue({ ok: true, changed: 3 });
    await confirmMpsAction(cells, back);
    expect(h.confirm).toHaveBeenCalledWith("db", cells, expect.any(String));
    expect(h.redirect).toHaveBeenLastCalledWith("/production/mps?from=2026-11-16&confirmed=3");
    h.unconfirm.mockResolvedValue({ ok: true, changed: 12 });
    await unconfirmMpsAction(cells, { from: "2027-02-15" });
    expect(h.unconfirm).toHaveBeenCalledWith("db", cells, expect.any(String));
    expect(h.redirect).toHaveBeenLastCalledWith("/production/mps?from=2027-02-15&unconfirmed=12");
  });

  it("back.from 이 월요일이 아니면 from 을 뺀다 — 경로 같은 값 · 빈 back 도 쿼리로만 걸러진다", async () => {
    h.save.mockResolvedValue({ ok: true, changed: 0 });
    await saveMpsAction([], { from: "2026-11-17" });
    expect(h.redirect).toHaveBeenLastCalledWith("/production/mps?saved=0");
    await saveMpsAction([], { from: "//evil.example", path: "https://evil.example" } as never);
    expect(h.redirect).toHaveBeenLastCalledWith("/production/mps?saved=0");
    h.confirm.mockResolvedValue({ ok: true, changed: 2 });
    await confirmMpsAction(cells, null as never);
    expect(h.redirect).toHaveBeenLastCalledWith("/production/mps?confirmed=2");
  });

  it("거절되면 까닭을 돌려주고 옮기지 않는다", async () => {
    const rejected = {
      ok: false,
      errors: {},
      formError: "다른 사람이 먼저 바꿨습니다 — 화면을 새로 열어 다시 확정하세요",
    };
    h.save.mockResolvedValue(rejected);
    h.confirm.mockResolvedValue(rejected);
    h.unconfirm.mockResolvedValue(rejected);
    expect(await saveMpsAction(edits, back)).toEqual(rejected);
    expect(await confirmMpsAction(cells, back)).toEqual(rejected);
    expect(await unconfirmMpsAction(cells, back)).toEqual(rejected);
    expect(h.redirect).not.toHaveBeenCalled();
  });

  it.each([
    ["저장", "저장하지 못했습니다 — 잠시 뒤 다시 저장하세요", () => saveMpsAction(edits, back), h.save],
    ["확정", "확정하지 못했습니다 — 잠시 뒤 다시 확정하세요", () => confirmMpsAction(cells, back), h.confirm],
    [
      "확정 취소",
      "확정 취소하지 못했습니다 — 잠시 뒤 다시 확정 취소하세요",
      () => unconfirmMpsAction(cells, back),
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
