import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MrpGridCell, MrpGridRow, MrpRunInfo } from "@/db/mrp";
import { addWeeks, pageWeeks } from "@/lib/weeks";
import { MrpGrid } from "../mrp-grid";

// 품목별 MRP 표(메뉴 「MRP」) — 품목마다 머리(가용 · 안전 · 최소 · 배수 · 리드타임)와 다섯 줄(총소요 · 입고예정 · 예상재고 · 계획오더(입고) · 계획오더(시작)).
// 입고예정은 아직 원천이 없어 늘 0. 예상재고는 안전재고 밑이면 주황, 음수면 빨강. 완제품의 총소요 · 예상재고는 「MPS 에서 계산」.
// 쪽은 실행 주에서 13주씩 넷(◀ ▶). 실행일 2026-11-24(화) — 실행 주이자 이번 주는 2026-11-23(48주).

const RUN_WEEK = "2026-11-23";
const W2 = "2026-11-30";
const W3 = "2026-12-07";
const run: MrpRunInfo = { ranAt: new Date("2026-11-24T05:05:00Z"), runDate: "2026-11-24", dueWeekday: 1, orders: 3 };

const empty: MrpGridCell = { gross: null, receipt: null, projected: null, release: null };
const cellsOf = (weeks: string[], over: Record<string, Partial<MrpGridCell>>) =>
  Object.fromEntries(weeks.map((w) => [w, { ...empty, ...over[w] }]));

const rm = (weeks: string[], over: Partial<MrpGridRow> = {}): MrpGridRow => ({
  item: { code: "RM-0001", name: "솔더 페이스트", spec: "", itemType: "RM", active: true },
  unit: "KG",
  fromMps: false,
  available: "600",
  safety: "200",
  minLot: "1000",
  multiple: "500",
  leadTimeDays: 21,
  cells: cellsOf(weeks, {
    [RUN_WEEK]: { gross: "500", projected: "1100", receipt: "1000", release: "1000" },
    [W2]: { gross: "800", projected: "300" },
    [W3]: { gross: "900", projected: "150", receipt: "1000" },
    [addWeeks(RUN_WEEK, 3)]: { projected: "-50" },
  }),
  ...over,
});
const fg = (weeks: string[]): MrpGridRow => ({
  item: { code: "FG-0001", name: "전원 관리 IC", spec: "", itemType: "FG", active: true },
  unit: "EA",
  fromMps: true,
  available: "0",
  safety: "0",
  minLot: "0",
  multiple: "0",
  leadTimeDays: 3,
  cells: cellsOf(weeks, { [RUN_WEEK]: { receipt: "7000", release: "7000" } }),
});

const grid = (from: string, rows: (weeks: string[]) => MrpGridRow[]) => {
  const weeks = pageWeeks(from);
  return { run, runWeek: RUN_WEEK, weeks, rows: rows(weeks) };
};

describe("품목별 MRP 표", () => {
  it("품목 머리와 다섯 줄 — 입고예정은 0, 수량은 천 단위 쉼표", () => {
    render(<MrpGrid grid={grid(RUN_WEEK, (w) => [rm(w)])} thisWeek={RUN_WEEK} />);
    expect(screen.getByTestId("item-RM-0001")).toHaveTextContent(
      "RM-0001 솔더 페이스트 · 가용 600 · 안전 200 · 최소 1,000 · 배수 500 · 리드타임 21일",
    );
    const table = within(screen.getByRole("region", { name: "품목별 MRP 표" }));
    const heads = table
      .getAllByRole("rowheader")
      .filter((th) => th.getAttribute("scope") === "row")
      .map((th) => th.textContent);
    expect(heads).toEqual(["총소요", "입고예정", "예상재고", "계획오더(입고)", "계획오더(시작)"]);
    const line = (name: string) =>
      [...table.getByRole("rowheader", { name }).parentElement!.children].slice(1).map((c) => c.textContent);
    expect(line("총소요").slice(0, 3)).toEqual(["500", "800", "900"]);
    expect(line("입고예정")).toEqual(Array(13).fill("0"));
    expect(line("예상재고").slice(0, 4)).toEqual(["1,100", "300", "150안전재고 밑", "−50부족"]);
    expect(line("계획오더(입고)").slice(0, 3)).toEqual(["1,000", "", "1,000"]);
    expect(line("계획오더(시작)").slice(0, 2)).toEqual(["1,000", ""]);
  });

  it("예상재고가 안전재고 밑이면 주황, 음수면 빨강", () => {
    render(<MrpGrid grid={grid(RUN_WEEK, (w) => [rm(w)])} thisWeek={RUN_WEEK} />);
    expect(screen.getByTestId(`projected-RM-0001-${W2}`)).not.toHaveClass("text-orange-700");
    expect(screen.getByTestId(`projected-RM-0001-${W3}`)).toHaveClass("text-orange-700");
    expect(screen.getByTestId(`projected-RM-0001-${addWeeks(RUN_WEEK, 3)}`)).toHaveClass("text-red-700");
  });

  it("「사용 안 함」 품목은 「안전 0(사용 안 함)」", () => {
    render(
      <MrpGrid
        grid={grid(RUN_WEEK, (w) => [
          rm(w, {
            item: { code: "RM-0009", name: "옛 솔더", spec: "", itemType: "RM", active: false },
            safety: "0",
          }),
        ])}
        thisWeek={RUN_WEEK}
      />,
    );
    expect(screen.getByTestId("item-RM-0009")).toHaveTextContent("안전 0(사용 안 함) · 최소 1,000");
  });

  it("완제품은 총소요 · 예상재고 칸에 「MPS 에서 계산」, 계획오더 두 줄은 수량", () => {
    render(<MrpGrid grid={grid(RUN_WEEK, (w) => [fg(w)])} thisWeek={RUN_WEEK} />);
    expect(screen.getAllByText("MPS 에서 계산")).toHaveLength(2);
    expect(screen.getByTestId(`receipt-FG-0001-${RUN_WEEK}`)).toHaveTextContent("7,000");
    expect(screen.getByTestId(`release-FG-0001-${RUN_WEEK}`)).toHaveTextContent("7,000");
  });

  it("쪽 — 첫 쪽에는 ◀ 가 없고 ▶ 는 다음 쪽(실행 주 + 13주)을 가리킨다", () => {
    render(<MrpGrid grid={grid(RUN_WEEK, (w) => [rm(w)])} thisWeek={RUN_WEEK} />);
    const nav = within(screen.getByRole("navigation", { name: "주 넘기기" }));
    expect(nav.queryByText(/◀/)).toBeNull();
    expect(nav.getByRole("link", { name: /▶/ })).toHaveAttribute(
      "href",
      `/production/mrp?view=grid&from=${addWeeks(RUN_WEEK, 13)}`,
    );
  });

  it("쪽 — 가운데 쪽은 ◀ ▶ 가 이웃 쪽, 마지막 쪽(실행 주 + 39주)에는 ▶ 가 없다", () => {
    const { unmount } = render(<MrpGrid grid={grid(addWeeks(RUN_WEEK, 13), (w) => [rm(w)])} thisWeek={RUN_WEEK} />);
    let nav = within(screen.getByRole("navigation", { name: "주 넘기기" }));
    expect(nav.getByRole("link", { name: /◀/ })).toHaveAttribute("href", `/production/mrp?view=grid&from=${RUN_WEEK}`);
    expect(nav.getByRole("link", { name: /▶/ })).toHaveAttribute(
      "href",
      `/production/mrp?view=grid&from=${addWeeks(RUN_WEEK, 26)}`,
    );
    unmount();
    render(<MrpGrid grid={grid(addWeeks(RUN_WEEK, 39), (w) => [rm(w)])} thisWeek={RUN_WEEK} />);
    nav = within(screen.getByRole("navigation", { name: "주 넘기기" }));
    expect(nav.getByRole("link", { name: /◀/ })).toHaveAttribute(
      "href",
      `/production/mrp?view=grid&from=${addWeeks(RUN_WEEK, 26)}`,
    );
    expect(nav.queryByText(/▶/)).toBeNull();
  });

  it("실행한 적이 없으면 아무것도 그리지 않는다 — 안내는 실행 상자에만 있고, 표와 쪽 넘기기가 없다", () => {
    const { container } = render(
      <MrpGrid grid={{ run: null, runWeek: null, weeks: pageWeeks(RUN_WEEK), rows: [] }} thisWeek={RUN_WEEK} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/아직 MRP 를 실행하지 않았습니다/)).toBeNull();
    expect(screen.queryByRole("region", { name: "품목별 MRP 표" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "주 넘기기" })).toBeNull();
  });

  it("실행했지만 품목이 없으면 그렇게 적는다", () => {
    render(<MrpGrid grid={grid(RUN_WEEK, () => [])} thisWeek={RUN_WEEK} />);
    expect(screen.getByText("총소요도 계획오더도 있는 품목이 없습니다")).toBeInTheDocument();
  });
});
