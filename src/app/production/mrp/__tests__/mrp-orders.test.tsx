import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MrpOrderQuery, MrpOrderRow, MrpRunInfo } from "@/db/mrp";
import { MrpOrders } from "../mrp-orders";

// 계획오더 목록(메뉴 「MRP」) — 번호 · 구분 · 품목 · 수량 · 단위 · 시작일 · 완성일 · 비고. 거르기는 구분 · 품목 유형 · 늦음(GET 폼).
// 날짜는 「MM-DD(요일)」, 늦음은 빨강 「N일 늦음」, BOM 없는 생산 계획오더는 「BOM 없음」, 「사용 안 함」 품목은 표시가 붙는다.

vi.mock("next/form", () => ({ default: (props: Record<string, unknown>) => <form {...props} /> }));

const run: MrpRunInfo = { ranAt: new Date("2026-11-24T05:05:00Z"), runDate: "2026-11-24", dueWeekday: 1, orders: 2 };
const all: MrpOrderQuery = { kind: null, itemType: null, lateOnly: false, page: 1 };
const row = (over: Partial<MrpOrderRow>): MrpOrderRow => ({
  number: "PL-20261124-001",
  kind: "MAKE",
  item: { code: "FG-0001", name: "전원 관리 IC", spec: "", itemType: "FG", active: true },
  qty: "7000",
  unit: "EA",
  startDate: "2026-11-24",
  dueDate: "2026-11-24",
  lateDays: 3,
  noBom: false,
  ...over,
});

const rowsText = () =>
  within(screen.getByRole("region", { name: "계획오더 표" }))
    .getAllByRole("row")
    .map((r) => [...r.children].map((c) => c.textContent));

describe("계획오더 목록", () => {
  it("칸마다 그린다 — 수량은 천 단위 쉼표, 날짜는 MM-DD(요일), 비고는 늦음 · BOM 없음", () => {
    render(
      <MrpOrders
        orders={{
          run,
          total: 3,
          page: 1,
          pages: 1,
          rows: [
            row({}),
            row({
              number: "PL-20261124-014",
              kind: "BUY",
              item: { code: "RM-0001", name: "솔더 페이스트", spec: "", itemType: "RM", active: false },
              qty: "1000.5",
              unit: "KG",
              dueDate: "2026-12-07",
              lateDays: 7,
            }),
            row({
              number: "PL-20261124-015",
              item: { code: "SF-0002", name: "보드 조립품", spec: "", itemType: "SF", active: true },
              startDate: "2026-12-01",
              dueDate: "2026-12-02",
              lateDays: 0,
              noBom: true,
            }),
          ],
        }}
        query={all}
      />,
    );
    expect(rowsText()).toEqual([
      ["번호", "구분", "품목", "수량", "단위", "시작일", "완성일", "비고"],
      ["PL-20261124-001", "생산", "FG-0001 전원 관리 IC", "7,000", "EA", "11-24(화)", "11-24(화)", "3일 늦음"],
      [
        "PL-20261124-014",
        "구매",
        "RM-0001 솔더 페이스트사용 안 함",
        "1,000.5",
        "KG",
        "11-24(화)",
        "12-07(월)",
        "7일 늦음",
      ],
      ["PL-20261124-015", "생산", "SF-0002 보드 조립품", "7,000", "EA", "12-01(화)", "12-02(수)", "BOM 없음"],
    ]);
    expect(screen.getByText("7일 늦음")).toHaveClass("text-red-700");
    expect(screen.getByText("사용 안 함")).toBeInTheDocument();
    expect(screen.getByText(/모두 3건/)).toBeInTheDocument();
  });

  it("늦고 BOM 도 없으면 둘 다 적는다", () => {
    render(<MrpOrders orders={{ run, total: 1, page: 1, pages: 1, rows: [row({ noBom: true })] }} query={all} />);
    expect(screen.getByText("3일 늦음")).toBeInTheDocument();
    expect(screen.getByText("BOM 없음")).toBeInTheDocument();
  });

  it("거르기 — 구분 · 품목 유형 · 늦은 것만, 지금 값이 골라져 있다", () => {
    render(
      <MrpOrders
        orders={{ run, total: 0, page: 1, pages: 1, rows: [] }}
        query={{ kind: "BUY", itemType: "RM", lateOnly: true, page: 1 }}
      />,
    );
    const search = within(screen.getByRole("search", { name: "계획오더 거르기" }));
    expect(search.getByLabelText("구분")).toHaveValue("BUY");
    expect(search.getByLabelText("품목 유형")).toHaveValue("RM");
    expect(search.getByLabelText("늦은 것만")).toBeChecked();
    expect(screen.getByText("이 거르기에 맞는 계획오더가 없습니다")).toBeInTheDocument();
  });

  it("쪽이 여럿이면 쪽 링크가 거르기를 싣는다", () => {
    render(
      <MrpOrders
        orders={{ run, total: 250, page: 1, pages: 3, rows: [row({})] }}
        query={{ kind: "MAKE", itemType: null, lateOnly: true, page: 1 }}
      />,
    );
    expect(screen.getAllByRole("link", { name: "2" })[0]).toHaveAttribute(
      "href",
      "/production/mrp?kind=MAKE&late=1&page=2",
    );
  });

  it("실행한 적이 없으면 아무것도 그리지 않는다 — 안내는 실행 상자에만 있다", () => {
    const { container } = render(
      <MrpOrders orders={{ run: null, total: 0, page: 1, pages: 1, rows: [] }} query={all} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/아직 MRP 를 실행하지 않았습니다/)).toBeNull();
    expect(screen.queryByRole("region", { name: "계획오더 표" })).toBeNull();
  });

  it("번호는 그 계획오더의 페깅으로 가는 링크다", () => {
    render(<MrpOrders orders={{ run, total: 1, page: 1, pages: 1, rows: [row({})] }} query={all} />);
    expect(screen.getByRole("link", { name: "PL-20261124-001" })).toHaveAttribute(
      "href",
      "/production/mrp?view=peg&order=PL-20261124-001",
    );
  });
});
