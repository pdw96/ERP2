import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type { PlanCustomer, PlanItem, SalesPlanSheet } from "@/db/sales-plans";
import { cellKey } from "@/lib/sales-plan-input";
import { pageWeeks } from "@/lib/weeks";
import { SalesPlanGrid } from "../sales-plan-grid";

// 판매계획 화면의 표(메뉴 「판매계획」) — 고객 × 완제품 × 주의 칸을 고치고 「저장」으로 바뀐 칸만 보낸다. 저장은 서버 동작이라 흉내 낸다 —
// 지난 주 칸이 잠기는지, 품목 합계가 입력하는 대로 바뀌는지, 보내는 칸(before · after), 거절의 까닭이 그 칸에 붙는지를 본다.
// 이번 주는 2026-11-16(47주). 시험의 쪽은 지난 주 하나(11/09)를 넣으려고 2026-11-09 부터 13주다.

const h = vi.hoisted(() => ({ save: vi.fn(), go: vi.fn() }));
vi.mock("../actions", () => ({ saveSalesPlanAction: h.save }));
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

const sheet: SalesPlanSheet = {
  thisWeek: THIS,
  weeks: pageWeeks(PAST),
  rows: [
    { customer: laon, item: fg1, cells: { [PAST]: "1000", [THIS]: "3000", [NEXT]: "2500" } },
    { customer: maru, item: fg1, cells: { [THIS]: "1500" } },
    { customer: north, item: fg2, cells: { [THIS]: "700" } },
  ],
  totals: [
    { item: fg1, cells: { [PAST]: "1000", [THIS]: "4500", [NEXT]: "2500" } },
    { item: fg2, cells: { [THIS]: "700" } },
  ],
  filtered: false,
};
const options = { customers: [laon, maru], items: [fg1, fg3] };
const back = { from: PAST, customer: "", item: "" };

const cell = (c: string, i: string, week: string) => screen.getByLabelText(`${c} ${i} ${week} 수량`);
const total = (i: string, week: string) => screen.getByTestId(`total-${i}-${week}`);
const optionTexts = (select: HTMLElement) =>
  within(select)
    .getAllByRole("option")
    .map((o) => o.textContent);

beforeEach(() => {
  h.save.mockReset().mockResolvedValue(null);
  h.go.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("판매계획 표", () => {
  it("칸 머리는 「47주」 + 「11/16~11/22」, 이번 주 칸 머리에 「이번 주」", () => {
    render(<SalesPlanGrid sheet={sheet} options={options} back={back} />);
    const head = screen.getByRole("columnheader", { name: /47주/ });
    expect(head).toHaveTextContent("11/16~11/22");
    expect(head).toHaveTextContent("이번 주");
    expect(screen.getByRole("columnheader", { name: /46주/ })).not.toHaveTextContent("이번 주");
  });

  it("지난 주 칸은 잠기고(disabled), 이번 주 칸은 고칠 수 있다 — 값은 천 단위 쉼표", () => {
    render(<SalesPlanGrid sheet={sheet} options={options} back={back} />);
    expect(cell("BP-0004", "FG-0001", "46주")).toBeDisabled();
    expect(cell("BP-0004", "FG-0001", "46주")).toHaveValue("1,000");
    expect(cell("BP-0004", "FG-0001", "47주")).toBeEnabled();
    expect(cell("BP-0004", "FG-0001", "47주")).toHaveValue("3,000");
    expect(cell("BP-0004", "FG-0001", "47주")).toHaveAttribute("inputMode", "decimal");
  });

  it("「매출처 아님」 · 「사용 안 함」 줄 표시가 보인다", () => {
    render(<SalesPlanGrid sheet={sheet} options={options} back={back} />);
    const row = cell("BP-0007", "FG-0002", "47주").closest("tr")!;
    expect(row).toHaveTextContent("매출처 아님");
    expect(row).toHaveTextContent("사용 안 함");
    expect(cell("BP-0004", "FG-0001", "47주").closest("tr")).not.toHaveTextContent(/매출처 아님|사용 안 함/);
  });

  it("칸에 4000 을 넣으면 [저장]이 켜지고 그 품목 합계 칸이 차이만큼 바뀐다", () => {
    render(<SalesPlanGrid sheet={sheet} options={options} back={back} />);
    const save = screen.getByRole("button", { name: "저장" });
    expect(save).toBeDisabled();
    expect(total("FG-0001", THIS)).toHaveTextContent("4,500");
    fireEvent.change(cell("BP-0004", "FG-0001", "47주"), { target: { value: "4000" } });
    expect(save).toBeEnabled();
    expect(total("FG-0001", THIS)).toHaveTextContent("5,500");
    expect(total("FG-0002", THIS)).toHaveTextContent("700");
    // 같은 값으로 되돌리면 바뀐 칸이 없다.
    fireEvent.change(cell("BP-0004", "FG-0001", "47주"), { target: { value: "3,000" } });
    expect(save).toBeDisabled();
    expect(total("FG-0001", THIS)).toHaveTextContent("4,500");
  });

  it("음수(-5)는 합계를 바꾸지 않지만 저장에는 보낸다 — 까닭은 서버가 돌려준다", async () => {
    render(<SalesPlanGrid sheet={sheet} options={options} back={back} />);
    fireEvent.change(cell("BP-0004", "FG-0001", "47주"), { target: { value: "-5" } });
    expect(total("FG-0001", THIS)).toHaveTextContent("4,500");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "저장" })));
    await waitFor(() => expect(h.save).toHaveBeenCalled());
    expect(h.save.mock.calls[0][0]).toEqual([
      { customer: "BP-0004", item: "FG-0001", week: THIS, before: "3000", after: "-5" },
    ]);
  });

  it("칸을 비우면 그 수량만큼 합계가 줄고, 숫자가 아닌 글자는 합계를 바꾸지 않는다", () => {
    render(<SalesPlanGrid sheet={sheet} options={options} back={back} />);
    fireEvent.change(cell("BP-0005", "FG-0001", "47주"), { target: { value: "" } });
    expect(total("FG-0001", THIS)).toHaveTextContent("3,000");
    fireEvent.change(cell("BP-0004", "FG-0001", "48주"), { target: { value: "많이" } });
    expect(total("FG-0001", NEXT)).toHaveTextContent("2,500");
    expect(screen.getByRole("button", { name: "저장" })).toBeEnabled();
  });

  it("[저장]을 누르면 saveSalesPlanAction 이 바뀐 칸 하나만(before 「3000」, after 「4000」) 받는다", async () => {
    render(<SalesPlanGrid sheet={sheet} options={options} back={back} />);
    fireEvent.change(cell("BP-0004", "FG-0001", "47주"), { target: { value: "4000" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "저장" })));
    await waitFor(() => expect(h.save).toHaveBeenCalled());
    expect(h.save).toHaveBeenCalledWith(
      [{ customer: "BP-0004", item: "FG-0001", week: THIS, before: "3000", after: "4000" }],
      back,
    );
  });

  it("액션이 errors[cellKey] 를 돌려주면 그 칸 아래에 까닭이 보이고, formError 는 role=alert", async () => {
    h.save.mockResolvedValue({
      ok: false,
      errors: { [cellKey("BP-0004", "FG-0001", THIS)]: "이 품목의 수량은 소수로 적을 수 없습니다." },
      formError: "저장하지 못했습니다 — 화면을 새로 여세요",
    });
    render(<SalesPlanGrid sheet={sheet} options={options} back={back} />);
    fireEvent.change(cell("BP-0004", "FG-0001", "47주"), { target: { value: "1.5" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "저장" })));
    const input = cell("BP-0004", "FG-0001", "47주");
    await waitFor(() => expect(input).toHaveAccessibleDescription("이 품목의 수량은 소수로 적을 수 없습니다."));
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveValue("1.5");
    expect(screen.getByRole("alert")).toHaveTextContent("저장하지 못했습니다 — 화면을 새로 여세요");
    // 칸의 까닭은 role=alert 가 아니다(칸마다 aria-describedby).
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    // 그 칸을 고치면 까닭이 사라진다.
    fireEvent.change(input, { target: { value: "2" } });
    expect(input).not.toHaveAttribute("aria-invalid");
  });
});

describe("줄 더하기", () => {
  // 거른 화면에는 거르기에 맞는 DB 의 줄이 모두 보인다 — 거르기에 맞는 쌍만 후보로 두면 새 줄은 DB 에 칸이 없는 쌍뿐이고, 저장 뒤에도 보인다.
  it("고객으로 거르면 새 줄의 고객 후보는 그 고객뿐이다", () => {
    const filtered = { ...sheet, rows: sheet.rows.slice(0, 1), filtered: true };
    render(<SalesPlanGrid sheet={filtered} options={options} back={{ ...back, customer: "BP-0004" }} />);
    const pickCustomer = screen.getByLabelText("새 줄 고객");
    expect(optionTexts(pickCustomer).slice(1)).toEqual(["BP-0004 (가상) 라온전자"]);
    fireEvent.change(pickCustomer, { target: { value: "BP-0004" } });
    expect(optionTexts(screen.getByLabelText("새 줄 품목")).slice(1)).toEqual(["FG-0003 완제품 다"]);
  });

  it("품목으로 거르면 새 줄의 품목 후보는 그 품목뿐이다", () => {
    const filtered = { ...sheet, rows: [], filtered: true };
    render(<SalesPlanGrid sheet={filtered} options={options} back={{ ...back, item: "FG-0003" }} />);
    expect(optionTexts(screen.getByLabelText("새 줄 고객")).slice(1)).toEqual([
      "BP-0004 (가상) 라온전자",
      "BP-0005 (가상) 마루반도체",
    ]);
    fireEvent.change(screen.getByLabelText("새 줄 고객"), { target: { value: "BP-0005" } });
    expect(optionTexts(screen.getByLabelText("새 줄 품목")).slice(1)).toEqual(["FG-0003 완제품 다"]);
  });

  it("거른 고객이 새 줄 후보(「사용」 매출처)에 없으면 더할 줄이 없다", () => {
    const filtered = { ...sheet, rows: sheet.rows.slice(2), filtered: true };
    render(<SalesPlanGrid sheet={filtered} options={options} back={{ ...back, customer: "BP-0007" }} />);
    expect(optionTexts(screen.getByLabelText("새 줄 고객")).slice(1)).toEqual([]);
    expect(screen.getByText(/거른 고객 · 품목으로 더할 수 있는 줄이 없습니다/)).toBeInTheDocument();
  });

  it("이미 있는 고객 × 품목은 후보에 없다 — 고객을 고르면 그 고객에게 이미 있는 품목이 빠진다", () => {
    render(<SalesPlanGrid sheet={sheet} options={options} back={back} />);
    const pickCustomer = screen.getByLabelText("새 줄 고객");
    const pickItem = screen.getByLabelText("새 줄 품목");
    expect(optionTexts(pickCustomer).slice(1)).toEqual(["BP-0004 (가상) 라온전자", "BP-0005 (가상) 마루반도체"]);
    fireEvent.change(pickCustomer, { target: { value: "BP-0004" } });
    expect(optionTexts(pickItem).slice(1)).toEqual(["FG-0003 완제품 다"]);
  });

  it("더한 줄은 「새 줄」로 보이고, 넣은 칸이 저장에 가며(before 「」), 지우면 줄과 칸이 빠진다", async () => {
    render(<SalesPlanGrid sheet={sheet} options={options} back={back} />);
    fireEvent.change(screen.getByLabelText("새 줄 고객"), { target: { value: "BP-0005" } });
    fireEvent.change(screen.getByLabelText("새 줄 품목"), { target: { value: "FG-0003" } });
    fireEvent.click(screen.getByRole("button", { name: "줄 더하기" }));
    const added = cell("BP-0005", "FG-0003", "47주");
    expect(added.closest("tr")).toHaveTextContent("새 줄");
    expect(cell("BP-0005", "FG-0003", "46주")).toBeDisabled();
    // 같은 쌍은 다시 고르지 못한다.
    fireEvent.change(screen.getByLabelText("새 줄 고객"), { target: { value: "BP-0005" } });
    expect(optionTexts(screen.getByLabelText("새 줄 품목")).slice(1)).toEqual([]);

    fireEvent.change(added, { target: { value: "1,200" } });
    expect(total("FG-0003", THIS)).toHaveTextContent("1,200");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "저장" })));
    await waitFor(() => expect(h.save).toHaveBeenCalled());
    expect(h.save.mock.calls[0][0]).toEqual([
      { customer: "BP-0005", item: "FG-0003", week: THIS, before: "", after: "1,200" },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "BP-0005 FG-0003 줄 지우기" }));
    expect(screen.queryByLabelText("BP-0005 FG-0003 47주 수량")).toBeNull();
    expect(screen.queryByTestId(`total-FG-0003-${THIS}`)).toBeNull();
    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
  });
});

describe("쪽 넘기기 · 거르기", () => {
  const fromThis = { ...sheet, weeks: pageWeeks(THIS) };
  const backThis = { from: THIS, customer: "BP-0004", item: "" };

  it("◀ ▶ 는 13주 앞 · 뒤 쪽, 「이번 주」 — 거르기 값을 싣는다", () => {
    render(<SalesPlanGrid sheet={fromThis} options={options} back={backThis} />);
    expect(screen.getByRole("link", { name: /앞 13주/ })).toHaveAttribute(
      "href",
      "/sales/plans?from=2026-08-17&customer=BP-0004",
    );
    expect(screen.getByRole("link", { name: /뒤 13주/ })).toHaveAttribute(
      "href",
      "/sales/plans?from=2027-02-15&customer=BP-0004",
    );
    expect(screen.getByRole("link", { name: "이번 주" })).toHaveAttribute("href", "/sales/plans?customer=BP-0004");
  });

  it("마지막 쪽에는 ▶ 링크가 없다", () => {
    render(<SalesPlanGrid sheet={{ ...sheet, weeks: pageWeeks("2027-08-16") }} options={options} back={back} />);
    expect(screen.queryByRole("link", { name: /뒤 13주/ })).toBeNull();
    expect(screen.getByRole("link", { name: /앞 13주/ })).toBeInTheDocument();
  });

  it("바뀐 칸이 있으면 넘기기 전에 묻고, 「취소」면 넘기지 않는다", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<SalesPlanGrid sheet={fromThis} options={options} back={backThis} />);
    const link = screen.getByRole("link", { name: /뒤 13주/ });
    fireEvent.click(link); // 바뀐 칸이 없으면 묻지 않고 넘어간다
    expect(confirm).not.toHaveBeenCalled();
    expect(h.go).toHaveBeenCalledTimes(1);
    fireEvent.change(cell("BP-0004", "FG-0001", "47주"), { target: { value: "4000" } });
    fireEvent.click(link);
    expect(confirm).toHaveBeenCalledWith("저장하지 않은 칸이 있습니다 — 넘기면 사라집니다");
    expect(h.go).toHaveBeenCalledTimes(1);
    confirm.mockReturnValue(true);
    fireEvent.click(link);
    expect(h.go).toHaveBeenCalledTimes(2);
  });

  it("거르기의 후보는 줄의 고객 · 품목과 새 줄 후보의 합, 쪽(from)은 숨김으로 유지", () => {
    render(<SalesPlanGrid sheet={fromThis} options={options} back={backThis} />);
    const search = screen.getByRole("search", { name: "판매계획 거르기" });
    const customers = within(search).getByLabelText("고객");
    expect(customers).toHaveValue("BP-0004");
    expect(optionTexts(customers)).toEqual([
      "모든 고객",
      "BP-0004 (가상) 라온전자",
      "BP-0005 (가상) 마루반도체",
      "BP-0007 (가상) 노스필드디바이스",
    ]);
    expect(optionTexts(within(search).getByLabelText("품목"))).toEqual([
      "모든 품목",
      "FG-0001 완제품 가",
      "FG-0002 완제품 나",
      "FG-0003 완제품 다",
    ]);
    expect(search.querySelector('input[type="hidden"][name="from"]')).toHaveValue(THIS);
  });

  it("거른 화면이면 합계가 전체 고객이라고 알린다", () => {
    render(<SalesPlanGrid sheet={{ ...fromThis, filtered: true }} options={options} back={backThis} />);
    expect(screen.getByText("거른 줄만 보이지만 합계는 전체 고객입니다")).toBeInTheDocument();
  });
});
