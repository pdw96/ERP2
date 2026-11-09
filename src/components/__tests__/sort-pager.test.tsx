import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Pager, SortTh } from "@/components/sort-pager";

// 칸 머리로 세우기 · 쪽 넘김(조각 「재고 수불」 설계 「2026-11-09 — PR D 를 열기 전에 정한 것」).

const filters = { from: "2026-10-11", to: "2026-11-09", item: "RM-0003", wh: undefined };
const head = (ui: React.ReactNode) =>
  render(
    <table>
      <thead>
        <tr>{ui}</tr>
      </thead>
    </table>,
  );

describe("SortTh", () => {
  it("누른 칸이 아니면 그 칸의 오름(▲)으로 — 거르기는 그대로, 쪽은 빠진다", () => {
    head(<SortTh label="수량" sortKey="qty" sort="date" dir="asc" path="/inventory/history" filters={filters} />);
    const th = screen.getByRole("columnheader");
    expect(th).not.toHaveAttribute("aria-sort");
    expect(within(th).getByRole("link")).toHaveAttribute(
      "href",
      "/inventory/history?from=2026-10-11&to=2026-11-09&item=RM-0003&sort=qty",
    );
  });

  it("고른 칸을 다시 누르면 거꾸로(▼), 또 누르면 다시 오름", () => {
    const { unmount } = head(<SortTh label="수량" sortKey="qty" sort="qty" dir="asc" path="/x" filters={{}} />);
    expect(screen.getByRole("columnheader")).toHaveAttribute("aria-sort", "ascending");
    expect(screen.getByRole("link")).toHaveAttribute("href", "/x?sort=qty&dir=desc");
    expect(screen.getByRole("link")).toHaveTextContent("▲");
    unmount();
    head(<SortTh label="수량" sortKey="qty" sort="qty" dir="desc" path="/x" filters={{}} />);
    expect(screen.getByRole("columnheader")).toHaveAttribute("aria-sort", "descending");
    expect(screen.getByRole("link")).toHaveAttribute("href", "/x?sort=qty");
    expect(screen.getByRole("link")).toHaveTextContent("▼");
  });
});

describe("Pager", () => {
  it("쪽이 하나면 모두 몇 줄만", () => {
    render(<Pager total={31} page={1} pages={1} path="/x" params={{}} />);
    expect(screen.getByRole("navigation")).toHaveTextContent("모두 31줄");
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("쪽을 넘겨도 거르기 · 정렬이 남고, 1쪽은 주소에서 빠진다", () => {
    render(<Pager total={250} page={2} pages={3} path="/x" params={{ sort: "qty", dir: "desc" }} />);
    expect(screen.getByRole("navigation")).toHaveTextContent("모두 250줄 · 2 / 3쪽");
    expect(screen.getByRole("link", { name: "이전" })).toHaveAttribute("href", "/x?sort=qty&dir=desc");
    expect(screen.getByRole("link", { name: "다음" })).toHaveAttribute("href", "/x?sort=qty&dir=desc&page=3");
    expect(screen.getByText("2")).toHaveAttribute("aria-current", "page");
  });
});
