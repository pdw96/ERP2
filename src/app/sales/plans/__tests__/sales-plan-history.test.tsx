import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SalesPlanChangeRow } from "@/db/sales-plans";
import { SalesPlanHistory } from "../sales-plan-history";

// 판매계획 화면의 고친 이력 표(메뉴 「판매계획」) — 일시 · 고객 · 품목 · 주 · 구분 · 전 → 후, 없음은 「—」. 확정 · 확정 취소는 수량 하나. 이번 주는 2026-11-16(47주).

const row = (over: Partial<SalesPlanChangeRow>): SalesPlanChangeRow => ({
  savedAt: "2026-11-19 10:05",
  kind: "EDIT",
  customer: { code: "BP-0004", name: "(가상) 라온전자" },
  item: { code: "FG-0001", name: "완제품 가" },
  week: "2026-11-23",
  before: "3000",
  after: "4000",
  ...over,
});

const rowsText = () =>
  within(screen.getByRole("region", { name: "고친 이력 표" }))
    .getAllByRole("row")
    .map((r) => [...r.children].map((c) => c.textContent));

describe("판매계획 고친 이력", () => {
  it("일시 · 고객 · 품목 · 주 · 전 → 후 — 수량은 천 단위 쉼표, 없음(새로 넣음 · 지움)은 「—」", () => {
    render(
      <SalesPlanHistory
        rows={[
          row({}),
          row({ week: "2026-11-30", before: null, after: "1500.5" }),
          row({ week: "2027-01-04", before: "700", after: null }),
        ]}
        total={3}
        thisWeek="2026-11-16"
      />,
    );
    expect(rowsText()).toEqual([
      ["일시", "고객", "품목", "주", "구분", "전", "후"],
      ["2026-11-19 10:05", "BP-0004 (가상) 라온전자", "FG-0001 완제품 가", "48주", "고침", "3,000", "4,000"],
      ["2026-11-19 10:05", "BP-0004 (가상) 라온전자", "FG-0001 완제품 가", "49주", "고침", "—", "1,500.5"],
      ["2026-11-19 10:05", "BP-0004 (가상) 라온전자", "FG-0001 완제품 가", "2027년 1주", "고침", "700", "—"],
    ]);
    expect(screen.queryByText(/최근 100줄만 보입니다/)).toBeNull();
  });

  it("확정 · 확정 취소 줄은 구분에 「확정」 · 「확정 취소」, 전 → 후 대신 그때 수량 하나", () => {
    render(
      <SalesPlanHistory
        rows={[
          row({ kind: "CONFIRM", before: "3000", after: "3000" }),
          row({ kind: "UNCONFIRM", before: "1500.5", after: "1500.5" }),
        ]}
        total={2}
        thisWeek="2026-11-16"
      />,
    );
    expect(rowsText().slice(1)).toEqual([
      ["2026-11-19 10:05", "BP-0004 (가상) 라온전자", "FG-0001 완제품 가", "48주", "확정", "3,000"],
      ["2026-11-19 10:05", "BP-0004 (가상) 라온전자", "FG-0001 완제품 가", "48주", "확정 취소", "1,500.5"],
    ]);
  });

  it("거르기 범위의 이력이 101줄 이상이면 「최근 100줄만 보입니다(전체 N줄)」", () => {
    render(<SalesPlanHistory rows={[row({})]} total={1234} thisWeek="2026-11-16" />);
    expect(screen.getByText("최근 100줄만 보입니다(전체 1,234줄)")).toBeInTheDocument();
  });

  it("100줄이면 안내하지 않는다", () => {
    render(<SalesPlanHistory rows={[row({})]} total={100} thisWeek="2026-11-16" />);
    expect(screen.queryByText(/최근 100줄만 보입니다/)).toBeNull();
  });

  it("이력이 없으면 「고친 이력이 없습니다」", () => {
    render(<SalesPlanHistory rows={[]} total={0} thisWeek="2026-11-16" />);
    expect(screen.getByText("고친 이력이 없습니다")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "고친 이력 표" })).toBeNull();
  });
});
