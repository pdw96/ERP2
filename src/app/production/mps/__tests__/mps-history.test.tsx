import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MpsChangeRow } from "@/db/mps";
import { MpsHistory } from "../mps-history";

// MPS 의 고친 이력 표(메뉴 「MPS」) — 일시 · 품목 · 주 · 종류 · 전 → 후, 고정 아님은 「—」. 이번 주는 2026-11-16(47주).
// 확정은 전이 없고(안 → 고정), 확정 취소는 후가 없다(고정 → 안).

const row = (over: Partial<MpsChangeRow>): MpsChangeRow => ({
  savedAt: "2026-11-20 10:05",
  kind: "EDIT",
  item: { code: "FG-0001", name: "전원 관리 IC" },
  week: "2026-11-23",
  before: "300",
  after: "500",
  ...over,
});

const rowsText = () =>
  within(screen.getByRole("region", { name: "고친 이력 표" }))
    .getAllByRole("row")
    .map((r) => [...r.children].map((c) => c.textContent));

describe("MPS 고친 이력", () => {
  it("일시 · 품목 · 주 · 종류 · 전 → 후 — 수량은 천 단위 쉼표, 고정 아님은 「—」", () => {
    render(
      <MpsHistory
        rows={[
          row({}),
          row({ week: "2026-11-30", before: null, after: "0" }),
          row({ week: "2027-01-04", kind: "CONFIRM", before: null, after: "1500.5" }),
          row({ kind: "UNCONFIRM", before: "3000", after: null }),
        ]}
        total={4}
        thisWeek="2026-11-16"
      />,
    );
    expect(rowsText()).toEqual([
      ["일시", "품목", "주", "종류", "전", "후"],
      ["2026-11-20 10:05", "FG-0001 전원 관리 IC", "48주", "고침", "300", "500"],
      ["2026-11-20 10:05", "FG-0001 전원 관리 IC", "49주", "고침", "—", "0"],
      ["2026-11-20 10:05", "FG-0001 전원 관리 IC", "2027년 1주", "확정", "—", "1,500.5"],
      ["2026-11-20 10:05", "FG-0001 전원 관리 IC", "48주", "확정 취소", "3,000", "—"],
    ]);
    expect(screen.queryByText(/최근 100줄만 보입니다/)).toBeNull();
  });

  it("이력이 101줄 이상이면 「최근 100줄만 보입니다(전체 N줄)」, 100줄이면 안내하지 않는다", () => {
    const { unmount } = render(<MpsHistory rows={[row({})]} total={1234} thisWeek="2026-11-16" />);
    expect(screen.getByText("최근 100줄만 보입니다(전체 1,234줄)")).toBeInTheDocument();
    unmount();
    render(<MpsHistory rows={[row({})]} total={100} thisWeek="2026-11-16" />);
    expect(screen.queryByText(/최근 100줄만 보입니다/)).toBeNull();
  });

  it("이력이 없으면 「고친 이력이 없습니다」", () => {
    render(<MpsHistory rows={[]} total={0} thisWeek="2026-11-16" />);
    expect(screen.getByText("고친 이력이 없습니다")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "고친 이력 표" })).toBeNull();
  });
});
