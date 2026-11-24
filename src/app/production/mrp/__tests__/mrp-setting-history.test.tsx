import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { koreaMinute, MrpSettingHistory } from "../mrp-setting-history";

// 완성일 기준 요일을 바꾼 이력(메뉴 「MRP」) — 「일시 · 전 → 후」, 최근 것부터 20줄. 일시는 한국 시각. 이력이 없으면 그리지 않는다.

describe("완성일 기준 요일 이력", () => {
  it("한국 시각 「YYYY-MM-DD HH:mm」 — 자정은 00시", () => {
    expect(koreaMinute(new Date("2026-11-24T05:05:00Z"))).toBe("2026-11-24 14:05");
    expect(koreaMinute(new Date("2026-11-24T15:00:00Z"))).toBe("2026-11-25 00:00");
  });

  it("「일시 · 전 → 후」 한 줄씩", () => {
    render(
      <MrpSettingHistory
        changes={[
          { changedAt: new Date("2026-11-24T05:05:00Z"), before: 1, after: 5 },
          { changedAt: new Date("2026-11-23T01:00:00Z"), before: 7, after: 1 },
        ]}
        total={2}
      />,
    );
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "2026-11-24 14:05 · 월 → 금",
      "2026-11-23 10:00 · 일 → 월",
    ]);
    expect(screen.queryByText(/최근 20줄만 보입니다/)).toBeNull();
  });

  it("21줄 이상이면 「최근 20줄만 보입니다(전체 N줄)」", () => {
    render(<MrpSettingHistory changes={[{ changedAt: new Date(), before: 1, after: 2 }]} total={1000} />);
    expect(screen.getByText("최근 20줄만 보입니다(전체 1,000줄)")).toBeInTheDocument();
  });

  it("이력이 없으면 아무것도 그리지 않는다", () => {
    const { container } = render(<MrpSettingHistory changes={[]} total={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});
