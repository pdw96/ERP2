import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MrpRun } from "../mrp-run";

// [MRP 실행]과 완성일 기준 요일(메뉴 「MRP」) — 마지막 실행 일시(한국 시각), 실행 단추, 월 ~ 일 고르기와 [저장].
// 둘 다 서버 동작이라 흉내 낸다 — 보던 탭(표면 view=grid)을 함께 보내는지, 거절의 까닭을 그대로 보이는지 본다.

const h = vi.hoisted(() => ({ run: vi.fn(), save: vi.fn() }));
vi.mock("../actions", () => ({ runMrpAction: h.run, saveMrpSettingAction: h.save }));

describe("MRP 실행 · 완성일 기준 요일", () => {
  afterEach(() => vi.resetAllMocks());

  it("마지막 실행 일시를 보이고, 없으면 실행하라고 알린다", () => {
    const { unmount } = render(<MrpRun lastRun="2026-11-24 14:05" dueWeekday={1} grid={false} />);
    expect(screen.getByText("마지막 실행 2026-11-24 14:05")).toBeInTheDocument();
    unmount();
    render(<MrpRun lastRun={null} dueWeekday={1} grid={false} />);
    expect(screen.getByText("아직 MRP 를 실행하지 않았습니다 — [MRP 실행]을 누르세요")).toBeInTheDocument();
  });

  it("기준 요일 고르기에 월 ~ 일 일곱이 있고 지금 값이 골라져 있다", () => {
    render(<MrpRun lastRun={null} dueWeekday={5} grid={false} />);
    const select = screen.getByLabelText("완성일 기준 요일");
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["월", "화", "수", "목", "금", "토", "일"]);
    expect(select).toHaveValue("5");
    expect(within(select).getByRole("option", { name: "금" })).toHaveProperty("selected", true);
  });

  it("[MRP 실행]은 보던 탭을 함께 보내고, 거절되면 까닭을 그대로 보인다", async () => {
    h.run.mockResolvedValue({ ok: false, formError: "실행하지 못했습니다 — 잠시 뒤 다시 실행하세요" });
    render(<MrpRun lastRun={null} dueWeekday={1} grid />);
    fireEvent.click(screen.getByRole("button", { name: "MRP 실행" }));
    await waitFor(() => expect(h.run).toHaveBeenCalled());
    const sent = h.run.mock.calls[0][1] as FormData;
    expect(sent.get("view")).toBe("grid");
    expect(sent.get("from")).toBeNull();
    expect(await screen.findByRole("alert")).toHaveTextContent("실행하지 못했습니다 — 잠시 뒤 다시 실행하세요");
  });

  it("표에서는 보던 쪽(from)도 함께 보내고, 목록에서는 보내지 않는다", async () => {
    h.run.mockResolvedValue({ ok: false, formError: "x" });
    const { unmount } = render(<MrpRun lastRun={null} dueWeekday={1} grid from="2026-12-07" />);
    fireEvent.click(screen.getByRole("button", { name: "MRP 실행" }));
    await waitFor(() => expect(h.run).toHaveBeenCalledTimes(1));
    expect((h.run.mock.calls[0][1] as FormData).get("from")).toBe("2026-12-07");
    unmount();
    render(<MrpRun lastRun={null} dueWeekday={1} grid={false} from="2026-12-07" />);
    fireEvent.click(screen.getByRole("button", { name: "MRP 실행" }));
    await waitFor(() => expect(h.run).toHaveBeenCalledTimes(2));
    expect((h.run.mock.calls[1][1] as FormData).get("from")).toBeNull();
  });

  it("[저장]은 고른 요일을 보내고, 목록에서는 view 를 보내지 않는다 · 거절은 그대로", async () => {
    h.save.mockResolvedValue({ ok: false, formError: "완성일 기준 요일을 고르세요" });
    render(<MrpRun lastRun={null} dueWeekday={1} grid={false} />);
    fireEvent.change(screen.getByLabelText("완성일 기준 요일"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(h.save).toHaveBeenCalled());
    const sent = h.save.mock.calls[0][1] as FormData;
    expect(sent.get("dueWeekday")).toBe("3");
    expect(sent.get("view")).toBeNull();
    expect(await screen.findByRole("alert")).toHaveTextContent("완성일 기준 요일을 고르세요");
  });
});
