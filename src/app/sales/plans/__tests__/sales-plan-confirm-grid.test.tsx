import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type { PlanCustomer, PlanItem, SalesPlanSheet } from "@/db/sales-plans";
import { cellKey } from "@/lib/sales-plan-input";
import { pageWeeks } from "@/lib/weeks";
import { SalesPlanConfirmGrid } from "../sales-plan-confirm-grid";

// 판매계획 확정의 표(메뉴 「판매계획 확정」) — 칸은 읽기만 하고(글자), 줄 앞 체크박스로 고른 줄의 고칠 수 있는 주의 칸을
// [확정] · [확정 취소]한다. 확정 · 확정 취소는 서버 동작이라 흉내 낸다 — 보내는 칸(qty 는 불러온 값), 지난 주 · 고르지 않은 줄이
// 빠지는지, 「전체」의 반쯤 표시, 거절의 까닭을 본다. 이번 주는 2026-11-16(47주). 쪽은 지난 주 하나(11/09)를 넣으려고 11/09 부터.

const h = vi.hoisted(() => ({ confirm: vi.fn(), unconfirm: vi.fn(), go: vi.fn() }));
vi.mock("../actions", () => ({
  confirmSalesPlanAction: h.confirm,
  unconfirmSalesPlanAction: h.unconfirm,
}));
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
vi.mock("next/form", () => ({
  default: ({ replace, ...props }: Record<string, unknown>) => {
    void replace; // next/form 만의 속성 — <form> 에는 없다
    return <form {...props} />;
  },
}));

const THIS = "2026-11-16";
const PAST = "2026-11-09";
const NEXT = "2026-11-23";

const customer = (over: Partial<PlanCustomer>): PlanCustomer => ({
  code: "BP-0004",
  name: "(가상) 라온전자",
  active: true,
  isCustomer: true,
  ...over,
});
const item = (over: Partial<PlanItem>): PlanItem => ({
  code: "FG-0001",
  name: "완제품 가",
  spec: "",
  unit: "EA",
  decimals: 0,
  active: true,
  ...over,
});

const laon = customer({});
const maru = customer({ code: "BP-0005", name: "(가상) 마루반도체" });
const north = customer({ code: "BP-0007", name: "(가상) 노스필드디바이스", isCustomer: false });
const fg1 = item({});
const fg2 = item({ code: "FG-0002", name: "완제품 나", active: false });
const fg3 = item({ code: "FG-0003", name: "완제품 다" });

const fixed = (qty: string) => ({ qty, confirmed: true });
const open = (qty: string) => ({ qty, confirmed: false });

const sheet: SalesPlanSheet = {
  thisWeek: THIS,
  weeks: pageWeeks(PAST),
  rows: [
    { customer: laon, item: fg1, cells: { [PAST]: fixed("1000"), [THIS]: open("3000"), [NEXT]: fixed("2500") } },
    { customer: maru, item: fg1, cells: { [THIS]: fixed("1500"), [NEXT]: open("600") } },
    { customer: north, item: fg2, cells: { [PAST]: open("400"), [THIS]: fixed("700") } },
  ],
  totals: [
    { item: fg1, cells: { [PAST]: "1000", [THIS]: "1500", [NEXT]: "2500" } },
    { item: fg2, cells: { [THIS]: "700" } },
  ],
  unconfirmed: 3,
  filtered: false,
  planned: { customers: [laon, maru, north], items: [fg1, fg2] },
};
const options = { customers: [laon, maru], items: [fg1, fg3] };
const back = { from: PAST, customer: "", item: "" };

const cell = (c: string, i: string, week: string) => screen.getByTestId(`plan-${c}-${i}-${week}`);
const total = (i: string, week: string) => screen.getByTestId(`total-${i}-${week}`);
const pick = (c: string, i: string) => screen.getByRole("checkbox", { name: `${c} ${i} 줄 고르기` });
const tally = () => screen.getByTestId("plan-selection");
const button = (name: string) => screen.getByRole("button", { name });

beforeEach(() => {
  h.confirm.mockReset().mockResolvedValue(null);
  h.unconfirm.mockReset().mockResolvedValue(null);
  h.go.mockReset();
});

describe("판매계획 확정 — 표", () => {
  it("칸은 고칠 수 없는 글자다 — 입력 칸 · [저장] · 줄 더하기가 없다", () => {
    render(<SalesPlanConfirmGrid sheet={sheet} options={options} back={back} />);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    const table = screen.getByRole("region", { name: "판매계획 표" });
    expect(table.querySelectorAll("input:not([type=checkbox]), textarea, select")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "저장" })).toBeNull();
    expect(screen.queryByRole("button", { name: "줄 더하기" })).toBeNull();
    expect(cell("BP-0004", "FG-0001", THIS)).toHaveTextContent("3,000");
  });

  it("미확정 칸은 노란 바탕, 확정 칸은 회색에 「확정」 표시, 빈 칸은 비고, 지난 주 칸은 흐리다", () => {
    render(<SalesPlanConfirmGrid sheet={sheet} options={options} back={back} />);
    const openCell = cell("BP-0004", "FG-0001", THIS);
    expect(openCell).toHaveClass("bg-yellow-100");
    expect(within(openCell).queryByText("확정")).toBeNull();
    const fixedCell = cell("BP-0005", "FG-0001", THIS);
    expect(fixedCell).toHaveClass("bg-stone-100");
    expect(fixedCell).not.toHaveClass("bg-yellow-100");
    expect(within(fixedCell).getByText("확정")).toBeInTheDocument();
    expect(fixedCell).toHaveTextContent("1,500");
    const empty = cell("BP-0005", "FG-0001", "2026-11-30");
    expect(empty.textContent).toBe("");
    expect(empty).not.toHaveClass("bg-yellow-100");
    expect(empty).not.toHaveClass("bg-stone-100");
    expect(cell("BP-0004", "FG-0001", PAST)).toHaveClass("opacity-60");
    expect(cell("BP-0004", "FG-0001", THIS)).not.toHaveClass("opacity-60");
  });

  it("「판매계획 등록」 링크는 지금 쪽(from) · 거르기를 싣는다", () => {
    render(
      <SalesPlanConfirmGrid sheet={sheet} options={options} back={{ from: THIS, customer: "BP-0005", item: "" }} />,
    );
    expect(screen.getByRole("link", { name: "판매계획 등록" })).toHaveAttribute(
      "href",
      "/sales/plans?from=2026-11-16&customer=BP-0005",
    );
  });

  it("확정을 보내는 동안에는 「판매계획 등록」 링크를 눌러도 가지 않고, 끝나면 다시 간다", async () => {
    let finish: (v: null) => void = () => {};
    h.confirm.mockReturnValue(new Promise<null>((resolve) => (finish = resolve)));
    render(<SalesPlanConfirmGrid sheet={sheet} options={options} back={back} />);
    const link = screen.getByRole("link", { name: "판매계획 등록" });
    expect(link).not.toHaveAttribute("aria-disabled");
    fireEvent.click(pick("BP-0004", "FG-0001"));
    await act(async () => fireEvent.click(button("확정")));
    await waitFor(() => expect(h.confirm).toHaveBeenCalled());
    expect(link).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(link);
    expect(h.go).not.toHaveBeenCalled();
    await act(async () => finish(null));
    await waitFor(() => expect(link).not.toHaveAttribute("aria-disabled"));
    fireEvent.click(link);
    expect(h.go).toHaveBeenCalledTimes(1);
  });

  it("◀ ▶ · 「이번 주」 · 거르기는 「판매계획 확정」의 주소로 간다", () => {
    render(
      <SalesPlanConfirmGrid
        sheet={{ ...sheet, weeks: pageWeeks(THIS) }}
        options={options}
        back={{ from: THIS, customer: "BP-0004", item: "" }}
      />,
    );
    expect(screen.getByRole("link", { name: /앞 13주/ })).toHaveAttribute(
      "href",
      "/sales/plans/confirm?from=2026-08-17&customer=BP-0004",
    );
    expect(screen.getByRole("link", { name: /뒤 13주/ })).toHaveAttribute(
      "href",
      "/sales/plans/confirm?from=2027-02-15&customer=BP-0004",
    );
    expect(screen.getByRole("link", { name: "이번 주" })).toHaveAttribute(
      "href",
      "/sales/plans/confirm?customer=BP-0004",
    );
    expect(screen.getByRole("search", { name: "판매계획 거르기" })).toHaveAttribute("action", "/sales/plans/confirm");
  });

  it("품목 합계는 확정값 그대로이고, 미확정 칸 수를 알린다", () => {
    render(<SalesPlanConfirmGrid sheet={sheet} options={options} back={back} />);
    expect(total("FG-0001", THIS)).toHaveTextContent("1,500");
    expect(total("FG-0002", THIS)).toHaveTextContent("700");
    expect(screen.getByText("품목 합계(확정 — MPS 가 받는 수요)")).toBeInTheDocument();
    expect(screen.getByText("미확정 3칸은 확정해야 합계에 듭니다")).toBeInTheDocument();
  });

  it("거른 범위에 줄이 없으면 그렇다고 알린다 — 줄 더하기 안내는 없다", () => {
    render(<SalesPlanConfirmGrid sheet={{ ...sheet, rows: [] }} options={options} back={back} />);
    expect(screen.getByText(/판매계획이 없습니다 — 「판매계획 등록」에서 넣으세요/)).toBeInTheDocument();
    expect(screen.queryByText(/줄 더하기/)).toBeNull();
  });
});

describe("판매계획 확정 — 확정 · 확정 취소", () => {
  it("[확정] [확정 취소]는 표 아래에 있고, 고른 줄이 없으면 꺼져 있다(흐리고 not-allowed)", () => {
    render(<SalesPlanConfirmGrid sheet={sheet} options={options} back={back} />);
    const table = screen.getByRole("region", { name: "판매계획 표" });
    for (const name of ["확정", "확정 취소"]) {
      const b = button(name);
      expect(table.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(b).toBeDisabled();
      expect(b.className).toContain("disabled:opacity-50");
      expect(b.className).toContain("disabled:cursor-not-allowed");
      expect(b.className).toContain("disabled:text-muted");
    }
    expect(tally()).toHaveTextContent("선택 0줄 · 미확정 0칸");
  });

  it("[확정]은 고른 줄의 고칠 수 있는 주의 미확정 칸만(불러온 수량) 보낸다 — 지난 주 · 확정 칸 · 고르지 않은 줄은 빠진다", async () => {
    render(<SalesPlanConfirmGrid sheet={sheet} options={options} back={back} />);
    fireEvent.click(pick("BP-0004", "FG-0001"));
    fireEvent.click(pick("BP-0007", "FG-0002"));
    expect(tally()).toHaveTextContent("선택 2줄 · 미확정 1칸");
    await act(async () => fireEvent.click(button("확정")));
    await waitFor(() => expect(h.confirm).toHaveBeenCalled());
    expect(h.confirm).toHaveBeenCalledWith([{ customer: "BP-0004", item: "FG-0001", week: THIS, qty: "3000" }], back);
    expect(h.unconfirm).not.toHaveBeenCalled();
  });

  it("[확정 취소]는 고른 줄의 고칠 수 있는 주의 확정 칸만 보낸다", async () => {
    render(<SalesPlanConfirmGrid sheet={sheet} options={options} back={back} />);
    fireEvent.click(pick("BP-0004", "FG-0001"));
    await act(async () => fireEvent.click(button("확정 취소")));
    await waitFor(() => expect(h.unconfirm).toHaveBeenCalled());
    expect(h.unconfirm).toHaveBeenCalledWith([{ customer: "BP-0004", item: "FG-0001", week: NEXT, qty: "2500" }], back);
    expect(h.confirm).not.toHaveBeenCalled();
  });

  it("미확정 칸이 없는 줄만 고르면 [확정]은 꺼지고 [확정 취소]만 켜진다", () => {
    const onlyFixed: SalesPlanSheet = {
      ...sheet,
      rows: [{ customer: maru, item: fg1, cells: { [THIS]: fixed("1500") } }],
    };
    render(<SalesPlanConfirmGrid sheet={onlyFixed} options={options} back={back} />);
    fireEvent.click(pick("BP-0005", "FG-0001"));
    expect(button("확정")).toBeDisabled();
    expect(button("확정 취소")).toBeEnabled();
  });

  it("지난 주 칸만 있는 줄을 고르면 둘 다 꺼진다", () => {
    const onlyPast: SalesPlanSheet = {
      ...sheet,
      rows: [{ customer: north, item: fg2, cells: { [PAST]: open("400") } }],
    };
    render(<SalesPlanConfirmGrid sheet={onlyPast} options={options} back={back} />);
    fireEvent.click(pick("BP-0007", "FG-0002"));
    expect(tally()).toHaveTextContent("선택 1줄 · 미확정 0칸");
    expect(button("확정")).toBeDisabled();
    expect(button("확정 취소")).toBeDisabled();
  });

  it("「전체」는 보이는 줄을 모두 고르고, 일부만 고르면 반쯤 표시", () => {
    render(<SalesPlanConfirmGrid sheet={sheet} options={options} back={back} />);
    const all = screen.getByRole("checkbox", { name: "전체" }) as HTMLInputElement;
    fireEvent.click(all);
    expect(pick("BP-0004", "FG-0001")).toBeChecked();
    expect(pick("BP-0005", "FG-0001")).toBeChecked();
    expect(pick("BP-0007", "FG-0002")).toBeChecked();
    expect(all).toBeChecked();
    expect(tally()).toHaveTextContent("선택 3줄 · 미확정 2칸");

    fireEvent.click(pick("BP-0005", "FG-0001"));
    expect(all).not.toBeChecked();
    expect(all.indeterminate).toBe(true);
    fireEvent.click(all);
    expect(all).toBeChecked();
    expect(all.indeterminate).toBe(false);
    fireEvent.click(all);
    expect(pick("BP-0004", "FG-0001")).not.toBeChecked();
    expect(tally()).toHaveTextContent("선택 0줄 · 미확정 0칸");
  });

  it("줄이 없으면 「전체」도 꺼져 있다", () => {
    render(<SalesPlanConfirmGrid sheet={{ ...sheet, rows: [] }} options={options} back={back} />);
    expect(screen.getByRole("checkbox", { name: "전체" })).toBeDisabled();
  });

  it("확정이 거절되면 「확정하지 않았습니다」와 까닭을 보인다(role=alert)", async () => {
    h.confirm.mockResolvedValue({ ok: false, errors: {}, formError: "다른 사람이 먼저 고쳤습니다" });
    render(<SalesPlanConfirmGrid sheet={sheet} options={options} back={back} />);
    fireEvent.click(pick("BP-0004", "FG-0001"));
    await act(async () => fireEvent.click(button("확정")));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("확정하지 않았습니다"));
    expect(screen.getByRole("alert")).toHaveTextContent("다른 사람이 먼저 고쳤습니다");
  });

  it("칸별 거절은 그 칸 아래에 까닭을 보이고, 안내문은 동작을 따른다 — 「칸 아래의 까닭을 보세요」", async () => {
    const key = cellKey("BP-0004", "FG-0001", THIS);
    const keyNext = cellKey("BP-0004", "FG-0001", NEXT);
    h.confirm.mockResolvedValue({ ok: false, errors: { [key]: "남이 먼저 고쳤습니다" } });
    h.unconfirm.mockResolvedValue({ ok: false, errors: { [keyNext]: "MPS 가 확정한 주입니다" } });
    const { unmount } = render(<SalesPlanConfirmGrid sheet={sheet} options={options} back={back} />);
    fireEvent.click(pick("BP-0004", "FG-0001"));
    await act(async () => fireEvent.click(button("확정")));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("확정하지 못한 칸 1개 — 칸 아래의 까닭을 보세요"),
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent("고치세요");
    expect(cell("BP-0004", "FG-0001", THIS).closest("td")).toHaveTextContent("남이 먼저 고쳤습니다");
    expect(cell("BP-0004", "FG-0001", THIS)).toHaveClass("border-red-700");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    unmount();

    render(<SalesPlanConfirmGrid sheet={sheet} options={options} back={back} />);
    fireEvent.click(pick("BP-0004", "FG-0001"));
    await act(async () => fireEvent.click(button("확정 취소")));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("확정을 취소하지 못한 칸 1개 — 칸 아래의 까닭을 보세요"),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("확정 취소하지 않았습니다");
    expect(cell("BP-0004", "FG-0001", NEXT).closest("td")).toHaveTextContent("MPS 가 확정한 주입니다");
  });
});
