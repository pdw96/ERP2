import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type { MpsCell, MpsItem, MpsRow, MpsSheet } from "@/db/mps";
import { mpsCellKey } from "@/lib/mps-input";
import { pageWeeks } from "@/lib/weeks";
import { MpsGrid } from "../mps-grid";

// MPS 의 표(메뉴 「MPS」) — 완제품마다 머리 줄(체크박스 · 품목 · 가용 · 안전 · 최소 · 배수)과 세 줄(수요 · MPS · 예상재고).
// MPS 칸에 수량을 치고 [저장]하면 고정, 고른 품목의 안을 [확정]으로 고정하거나 고정을 [확정 취소]로 푼다. 셋 다 서버 동작이라 흉내 낸다 —
// 보내는 칸(before · after · qty), 지난 주 · 고정 주 · 안 0 인 주가 빠지는지, 저장하지 않은 칸이 있으면 확정을 막는지, 예상재고의 부족 표시를 본다.
// 이번 주는 2026-11-16(47주). 시험의 쪽은 지난 주 하나(11/09)를 넣으려고 2026-11-09 부터 13주다.

const h = vi.hoisted(() => ({ save: vi.fn(), confirm: vi.fn(), unconfirm: vi.fn(), go: vi.fn() }));
vi.mock("../actions", () => ({
  saveMpsAction: h.save,
  confirmMpsAction: h.confirm,
  unconfirmMpsAction: h.unconfirm,
}));
// 링크를 누르면 화면의 onClick 뒤에 기본 동작이 막히지 않았을 때만 넘어간 것으로 센다.
vi.mock("next/link", () => ({
  default: ({ href, onClick, ...props }: ComponentProps<"a"> & { href: string }) => (
    <a
      href={href}
      {...props}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented) h.go(href);
        e.preventDefault();
      }}
    />
  ),
}));

const THIS = "2026-11-16";
const PAST = "2026-11-09";
const NEXT = "2026-11-23";
const W3 = "2026-11-30";
const W4 = "2026-12-07";

const item = (over: Partial<MpsItem>): MpsItem => ({
  code: "FG-0001",
  name: "전원 관리 IC",
  spec: "",
  unit: "EA",
  decimals: 0,
  active: true,
  ...over,
});
const fixed = (mps: string, demand: string | null, projected: string | null): MpsCell => ({
  demand,
  mps,
  fixed: true,
  projected,
});
const proposal = (mps: string, demand: string | null, projected: string): MpsCell => ({
  demand,
  mps,
  fixed: false,
  projected,
});

/** 13주 칸 — 지난 주는 비고, 이번 주부터는 안 0 · 마지막 예상재고 그대로. 주어진 칸이 앞선다. */
function cellsOf(rest: string, given: Record<string, MpsCell>): Record<string, MpsCell> {
  const out: Record<string, MpsCell> = {};
  for (const w of pageWeeks(PAST))
    out[w] =
      given[w] ?? (w < THIS ? { demand: null, mps: null, fixed: false, projected: null } : proposal("0", null, rest));
  return out;
}

const fg1: MpsRow = {
  item: item({}),
  available: "3000",
  safety: "2000",
  minLot: "1000",
  multiple: "1000",
  cells: cellsOf("2800", {
    [PAST]: fixed("500", "800", null),
    [THIS]: fixed("300", "1500", "1800"),
    [NEXT]: proposal("1000", "1000", "1800"),
    [W3]: proposal("0", null, "1800"),
    [W4]: fixed("3000", "2000", "2800"),
  }),
};
const fg2: MpsRow = {
  item: item({ code: "FG-0002", name: "센서 IC" }),
  available: "500",
  safety: "1000",
  minLot: "500",
  multiple: "500",
  cells: cellsOf("1500", {
    [THIS]: fixed("0", "2000", "-1500"),
    [NEXT]: proposal("3000", null, "1500"),
  }),
};

const sheet: MpsSheet = { thisWeek: THIS, weeks: pageWeeks(PAST), rows: [fg1, fg2] };
const back = { from: PAST };

const mps = (code: string, week: string) => screen.getByLabelText(`${code} ${week} MPS`);
const pick = (code: string) => screen.getByRole("checkbox", { name: `${code} 고르기` });
const button = (name: string) => screen.getByRole("button", { name });

beforeEach(() => {
  h.save.mockReset().mockResolvedValue(null);
  h.confirm.mockReset().mockResolvedValue(null);
  h.unconfirm.mockReset().mockResolvedValue(null);
  h.go.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("MPS 표", () => {
  it("품목 머리 줄에 「FG-0001 전원 관리 IC (EA)」와 「가용 3,000 · 안전 2,000 · 최소 1,000 · 배수 1,000」, 줄은 수요 · MPS · 예상재고", () => {
    render(<MpsGrid sheet={sheet} back={back} />);
    const head = screen.getByTestId("item-FG-0001");
    expect(head).toHaveTextContent("FG-0001 전원 관리 IC (EA)");
    expect(head).toHaveTextContent("가용 3,000 · 안전 2,000 · 최소 1,000 · 배수 1,000");
    const group = head.closest("tbody")!;
    expect([...group.querySelectorAll('th[scope="row"]')].map((r) => r.textContent)).toEqual([
      "수요",
      "MPS",
      "예상재고",
    ]);
    expect(screen.getByTestId(`demand-FG-0001-${THIS}`)).toHaveTextContent("1,500");
    expect(screen.getByTestId(`demand-FG-0001-${W3}`)).toHaveTextContent(/^$/);
  });

  it("「사용 안 함」 완제품은 품목 이름 옆에 표시하고 안전을 「안전 0(사용 안 함)」으로 보인다 — 사용 중인 품목은 그대로", () => {
    const off: MpsRow = { ...fg2, item: item({ code: "FG-0002", name: "센서 IC", active: false }), safety: "0" };
    render(<MpsGrid sheet={{ ...sheet, rows: [fg1, off] }} back={back} />);
    const head = screen.getByTestId("item-FG-0002");
    expect(head).toHaveTextContent("FG-0002 센서 IC (EA)사용 안 함");
    expect(head).toHaveTextContent("안전 0(사용 안 함)");
    const on = screen.getByTestId("item-FG-0001");
    expect(on).not.toHaveTextContent("사용 안 함");
    expect(on).toHaveTextContent("안전 2,000");
  });

  it("주 머리는 「47주」 + 「11/16~11/22」, 이번 주 머리에 「이번 주」", () => {
    render(<MpsGrid sheet={sheet} back={back} />);
    const head = screen.getByRole("columnheader", { name: /47주/ });
    expect(head).toHaveTextContent("11/16~11/22");
    expect(head).toHaveTextContent("이번 주");
    expect(screen.getByRole("columnheader", { name: /46주/ })).not.toHaveTextContent("이번 주");
  });

  it("고정 칸은 값이 보이고 「고정」, 미확정 칸은 안이 흐린 글씨(placeholder)이고 값은 비었다", () => {
    render(<MpsGrid sheet={sheet} back={back} />);
    const fixedCell = mps("FG-0001", "47주");
    expect(fixedCell).toHaveValue("300");
    expect(within(fixedCell.closest("td")!).getByText("고정")).toBeInTheDocument();
    expect(fixedCell).not.toHaveAttribute("readOnly");
    const open = mps("FG-0001", "48주");
    expect(open).toHaveValue("");
    expect(open).toHaveAttribute("placeholder", "1,000");
    expect(within(open.closest("td")!).queryByText("고정")).toBeNull();
    expect(mps("FG-0001", "50주")).toHaveValue("3,000");
    // 고정 수량 0 도 고정이다.
    expect(mps("FG-0002", "47주")).toHaveValue("0");
    expect(within(mps("FG-0002", "47주").closest("td")!).getByText("고정")).toBeInTheDocument();
  });

  it("지난 주는 입력 칸이 아니라 글자 — 고정 수량과 「고정」, 예상재고는 비었다", () => {
    render(<MpsGrid sheet={sheet} back={back} />);
    expect(screen.queryByLabelText("FG-0001 46주 MPS")).toBeNull();
    const past = screen.getByTestId(`mps-FG-0001-${PAST}`);
    expect(past).toHaveTextContent("500");
    expect(past).toHaveTextContent("고정");
    expect(screen.getByTestId(`projected-FG-0001-${PAST}`)).toHaveTextContent(/^$/);
    expect(screen.getByTestId(`mps-FG-0002-${PAST}`)).toHaveTextContent(/^$/);
  });

  it("예상재고 — 음수는 빨강과 「부족」, 0 이상이고 안전재고 밑은 주황, 그 위는 보통", () => {
    render(<MpsGrid sheet={sheet} back={back} />);
    const short = screen.getByTestId(`projected-FG-0002-${THIS}`);
    expect(short).toHaveTextContent("−1,500");
    expect(short).toHaveTextContent("부족");
    expect(short).toHaveClass("text-red-700");
    const low = screen.getByTestId(`projected-FG-0001-${THIS}`);
    expect(low).toHaveTextContent("1,800");
    expect(low).not.toHaveTextContent("부족");
    expect(low).toHaveClass("text-orange-700");
    const enough = screen.getByTestId(`projected-FG-0001-${W4}`);
    expect(enough).toHaveTextContent("2,800");
    expect(enough).not.toHaveClass("text-orange-700");
    expect(enough).not.toHaveClass("text-red-700");
  });

  it("줄이 없으면 「확정한 판매계획이 없어 세울 MPS 가 없습니다」와 「판매계획 확정」 링크", () => {
    render(<MpsGrid sheet={{ ...sheet, rows: [] }} back={back} />);
    expect(screen.getByText(/확정한 판매계획이 없어 세울 MPS 가 없습니다/)).toHaveTextContent(
      "확정한 판매계획이 없어 세울 MPS 가 없습니다 — 「판매계획 확정」에서 확정하세요",
    );
    expect(screen.getByRole("link", { name: "판매계획 확정" })).toHaveAttribute("href", "/sales/plans/confirm");
  });
});

describe("저장", () => {
  it("미확정 칸에 「500」을 치면 [저장]이 { before 「」, after 「500」 } 하나를 보낸다", async () => {
    render(<MpsGrid sheet={sheet} back={back} />);
    expect(button("저장")).toBeDisabled();
    fireEvent.change(mps("FG-0001", "48주"), { target: { value: "500" } });
    expect(screen.getByText("고친 칸 1개")).toBeInTheDocument();
    await act(async () => fireEvent.click(button("저장")));
    await waitFor(() => expect(h.save).toHaveBeenCalled());
    expect(h.save).toHaveBeenCalledWith([{ item: "FG-0001", week: NEXT, before: "", after: "500" }], back);
  });

  it("고정 칸을 비우면 { before 「300」, after 「」 }(고정 풀기)를 보낸다", async () => {
    render(<MpsGrid sheet={sheet} back={back} />);
    fireEvent.change(mps("FG-0001", "47주"), { target: { value: "" } });
    await act(async () => fireEvent.click(button("저장")));
    await waitFor(() => expect(h.save).toHaveBeenCalled());
    expect(h.save.mock.calls[0][0]).toEqual([{ item: "FG-0001", week: THIS, before: "300", after: "" }]);
  });

  it("미확정 칸에 「0」을 치면 고정 수량 0 으로 보낸다 — 빈 칸에 치다 지우면 바뀐 칸이 아니다", async () => {
    render(<MpsGrid sheet={sheet} back={back} />);
    fireEvent.change(mps("FG-0001", "48주"), { target: { value: "7" } });
    fireEvent.change(mps("FG-0001", "48주"), { target: { value: "" } });
    expect(button("저장")).toBeDisabled();
    fireEvent.change(mps("FG-0001", "49주"), { target: { value: "0" } });
    await act(async () => fireEvent.click(button("저장")));
    await waitFor(() => expect(h.save).toHaveBeenCalled());
    expect(h.save.mock.calls[0][0]).toEqual([{ item: "FG-0001", week: W3, before: "", after: "0" }]);
  });

  it("불러온 「3000」 고정 칸에 「3,000」을 다시 치면 보내지 않는다", () => {
    render(<MpsGrid sheet={sheet} back={back} />);
    fireEvent.change(mps("FG-0001", "50주"), { target: { value: "3,000" } });
    expect(button("저장")).toBeDisabled();
    expect(screen.getByText("고친 칸이 없습니다")).toBeInTheDocument();
  });

  it("서버가 거절할 글자(음수 · 글자)도 보낸다 — 까닭은 서버가 돌려준다", async () => {
    render(<MpsGrid sheet={sheet} back={back} />);
    fireEvent.change(mps("FG-0001", "48주"), { target: { value: "-5" } });
    fireEvent.change(mps("FG-0002", "48주"), { target: { value: "많이" } });
    await act(async () => fireEvent.click(button("저장")));
    await waitFor(() => expect(h.save).toHaveBeenCalled());
    expect(h.save.mock.calls[0][0]).toEqual([
      { item: "FG-0001", week: NEXT, before: "", after: "-5" },
      { item: "FG-0002", week: NEXT, before: "", after: "많이" },
    ]);
  });

  it("거절되면 그 칸 아래에 까닭, formError 는 표 위 role=alert — 그 칸을 고치면 까닭이 사라진다", async () => {
    h.save.mockResolvedValue({
      ok: false,
      errors: { [mpsCellKey("FG-0001", NEXT)]: "이 품목의 수량은 소수로 적을 수 없습니다." },
      formError: "저장하지 못했습니다 — 화면을 새로 여세요",
    });
    render(<MpsGrid sheet={sheet} back={back} />);
    fireEvent.change(mps("FG-0001", "48주"), { target: { value: "1.5" } });
    await act(async () => fireEvent.click(button("저장")));
    const input = mps("FG-0001", "48주");
    await waitFor(() => expect(input).toHaveAccessibleDescription("이 품목의 수량은 소수로 적을 수 없습니다."));
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveValue("1.5");
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("저장하지 않았습니다");
    expect(alert).toHaveTextContent("저장하지 못했습니다 — 화면을 새로 여세요");
    expect(alert).toHaveTextContent("틀린 칸 1개 — 칸 아래의 까닭을 보고 고치세요");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    fireEvent.change(input, { target: { value: "2" } });
    expect(input).not.toHaveAttribute("aria-invalid");
  });
});

describe("확정 · 확정 취소", () => {
  it("품목을 고르면 「선택 n품목」, 「전체」는 모두를 고른다", () => {
    render(<MpsGrid sheet={sheet} back={back} />);
    expect(screen.getByTestId("mps-selection")).toHaveTextContent("선택 0품목");
    fireEvent.click(pick("FG-0001"));
    expect(screen.getByTestId("mps-selection")).toHaveTextContent("선택 1품목");
    fireEvent.click(screen.getByRole("checkbox", { name: "전체" }));
    expect(screen.getByTestId("mps-selection")).toHaveTextContent("선택 2품목");
  });

  it("[확정]은 고른 품목의 보이는 주 가운데 안 0 인 주 · 고정 주 · 지난 주를 빼고, 불러온 안을 보낸다", async () => {
    render(<MpsGrid sheet={sheet} back={back} />);
    expect(button("확정")).toBeDisabled();
    fireEvent.click(pick("FG-0001"));
    fireEvent.click(pick("FG-0002"));
    await act(async () => fireEvent.click(button("확정")));
    await waitFor(() => expect(h.confirm).toHaveBeenCalled());
    expect(h.confirm).toHaveBeenCalledWith(
      [
        { item: "FG-0001", week: NEXT, qty: "1000" },
        { item: "FG-0002", week: NEXT, qty: "3000" },
      ],
      back,
    );
    expect(h.unconfirm).not.toHaveBeenCalled();
  });

  it("[확정 취소]는 고른 품목의 고칠 수 있는 주의 고정 칸만 — 불러온 고정 수량을 보낸다(지난 주 고정은 빠진다)", async () => {
    render(<MpsGrid sheet={sheet} back={back} />);
    fireEvent.click(pick("FG-0001"));
    await act(async () => fireEvent.click(button("확정 취소")));
    await waitFor(() => expect(h.unconfirm).toHaveBeenCalled());
    expect(h.unconfirm).toHaveBeenCalledWith(
      [
        { item: "FG-0001", week: THIS, qty: "300" },
        { item: "FG-0001", week: W4, qty: "3000" },
      ],
      back,
    );
  });

  it("저장하지 않은 칸이 있으면 [확정] · [확정 취소]가 꺼지고 「저장한 뒤 확정하세요」", () => {
    render(<MpsGrid sheet={sheet} back={back} />);
    fireEvent.click(pick("FG-0001"));
    expect(button("확정")).toBeEnabled();
    expect(button("확정 취소")).toBeEnabled();
    expect(screen.queryByText("저장한 뒤 확정하세요")).toBeNull();
    fireEvent.change(mps("FG-0002", "48주"), { target: { value: "500" } });
    expect(button("확정")).toBeDisabled();
    expect(button("확정 취소")).toBeDisabled();
    expect(screen.getByText("저장한 뒤 확정하세요")).toBeInTheDocument();
  });

  it("확정이 칸별로 거절되면 「확정하지 않았습니다」와 그 칸 아래의 까닭", async () => {
    h.confirm.mockResolvedValue({ ok: false, errors: { [mpsCellKey("FG-0001", NEXT)]: "확정할 안이 없습니다" } });
    render(<MpsGrid sheet={sheet} back={back} />);
    fireEvent.click(pick("FG-0001"));
    await act(async () => fireEvent.click(button("확정")));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("확정하지 않았습니다"));
    expect(screen.getByRole("alert")).toHaveTextContent("확정하지 못한 칸 1개 — 칸 아래의 까닭을 보세요.");
    expect(mps("FG-0001", "48주")).toHaveAccessibleDescription("확정할 안이 없습니다");
  });
});

describe("쪽 넘기기", () => {
  const fromThis = { ...sheet, weeks: pageWeeks(THIS) };
  const backThis = { from: THIS };

  it("◀ ▶ 는 13주 앞 · 뒤 쪽, 「이번 주」는 쪽 값 없이", () => {
    render(<MpsGrid sheet={fromThis} back={backThis} />);
    expect(screen.getByRole("link", { name: /앞 13주/ })).toHaveAttribute("href", "/production/mps?from=2026-08-17");
    expect(screen.getByRole("link", { name: /뒤 13주/ })).toHaveAttribute("href", "/production/mps?from=2027-02-15");
    expect(screen.getByRole("link", { name: "이번 주" })).toHaveAttribute("href", "/production/mps");
  });

  it("마지막 쪽에는 ▶ 링크가 없다", () => {
    render(<MpsGrid sheet={{ ...sheet, weeks: pageWeeks("2027-08-16") }} back={back} />);
    expect(screen.queryByRole("link", { name: /뒤 13주/ })).toBeNull();
    expect(screen.getByRole("link", { name: /앞 13주/ })).toBeInTheDocument();
  });

  it("저장하지 않은 칸이 있으면 넘기기 전에 묻고, 「취소」면 넘기지 않는다", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<MpsGrid sheet={fromThis} back={backThis} />);
    const link = screen.getByRole("link", { name: /뒤 13주/ });
    fireEvent.click(link); // 바뀐 칸이 없으면 묻지 않고 넘어간다
    expect(confirm).not.toHaveBeenCalled();
    expect(h.go).toHaveBeenCalledTimes(1);
    fireEvent.change(mps("FG-0001", "48주"), { target: { value: "500" } });
    fireEvent.click(link);
    expect(confirm).toHaveBeenCalledWith("저장하지 않은 칸이 있습니다 — 넘기면 사라집니다");
    expect(h.go).toHaveBeenCalledTimes(1);
    confirm.mockReturnValue(true);
    fireEvent.click(link);
    expect(h.go).toHaveBeenCalledTimes(2);
  });
});
