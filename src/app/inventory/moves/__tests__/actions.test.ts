// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

// 수불 등록 · 취소의 입구 — 저장되면 그 등록 화면에 남아 전표번호를 돌려주고(ADR 0020), 취소되면 취소 전표 화면으로 간다. DB 가 실패하면 오류 코드만 로그에 남긴다(설계 ② — 넣은 글자는 로그에 남지 않는다).

const h = vi.hoisted(() => ({ withDb: vi.fn(), redirect: vi.fn(), refresh: vi.fn() }));
vi.mock("@/db/request", () => ({ withDb: h.withDb }));
vi.mock("next/navigation", () => ({ redirect: h.redirect }));
vi.mock("next/cache", () => ({ refresh: h.refresh }));

import { cancelMoveAction, onHandAction, saveMoveAction } from "../actions";

const visitorText = "방문자가넣은LOT-비밀";
const form = () => {
  const f = new FormData();
  f.set("moveDate", "2026-11-09");
  f.set("moveType", "IN");
  f.set("note", visitorText);
  f.set("lines.0.lot", visitorText);
  return f;
};
const serverError = () =>
  Object.assign(new Error("wrap"), {
    cause: {
      code: "23514",
      severity: "ERROR",
      message: `failing row (${visitorText})`,
      table_name: "stock_move_lines",
    },
  });

describe("수불 등록 · 취소의 입구", () => {
  afterEach(() => vi.resetAllMocks());

  it("저장되면 화면을 옮기지 않고 전표번호를 돌려주며, 최근 전표가 다시 그려지게 한다", async () => {
    h.withDb.mockResolvedValue({ ok: true, code: "IV-20261109-001" });
    expect(await saveMoveAction(null, form())).toEqual({ ok: true, code: "IV-20261109-001" });
    expect(h.refresh).toHaveBeenCalledTimes(1);
    expect(h.redirect).not.toHaveBeenCalled();
  });

  it("거절되면 까닭을 돌려주고 화면을 다시 그리지 않는다", async () => {
    const rejected = {
      ok: false,
      errors: { header: {}, lines: { 0: { lot: "거래처 LOT 를 넣어 주세요" } } },
      values: {},
    };
    h.withDb.mockResolvedValue(rejected);
    expect(await saveMoveAction(null, form())).toEqual(rejected);
    expect(h.refresh).not.toHaveBeenCalled();
  });

  it("취소되면 취소 전표 화면으로, 거절되면 까닭을 돌려준다", async () => {
    h.withDb.mockResolvedValueOnce({ ok: true, code: "IV-20261109-002" });
    await cancelMoveAction("IV-20261109-001");
    expect(h.redirect).toHaveBeenCalledWith("/inventory/moves/IV-20261109-002?saved=1");
    h.withDb.mockResolvedValueOnce({ ok: false, formError: "취소 전표는 취소하지 못합니다" });
    expect(await cancelMoveAction("IV-20261109-002")).toEqual({ formError: "취소 전표는 취소하지 못합니다" });
  });

  it.each([
    ["등록", () => saveMoveAction(null, form())],
    ["취소", () => cancelMoveAction("IV-20261109-001")],
    ["가용 재고", () => onHandAction("RM-0003", "WH-01")],
  ])("%s 중 DB 가 실패하면 로그에 코드만 남기고 넣은 글자는 남기지 않는다", async (_, run) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    h.withDb.mockRejectedValue(serverError());
    await run();
    const logged = error.mock.calls.flat().join(" ");
    expect(logged).toContain("23514");
    expect(logged).not.toContain(visitorText);
    expect(h.redirect).not.toHaveBeenCalled();
    expect(h.refresh).not.toHaveBeenCalled();
  });
});
