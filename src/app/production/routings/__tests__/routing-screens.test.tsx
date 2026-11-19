import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RoutingListRow } from "@/db/routings";
import { RoutingList, RoutingSearch } from "../routing-list";

vi.mock("next/form", () => ({ default: (props: Record<string, unknown>) => <form {...props} /> }));

const row = (over: Partial<RoutingListRow>): RoutingListRow => ({
  code: "SF-0001",
  name: "반제품 가",
  itemType: "SF",
  active: true,
  flow: ["BG", "SAW", "DA"],
  steps: 3,
  setupMin: 30,
  runSec: "4.500",
  ...over,
});
const none = { q: "", process: "", workCenter: "" };

describe("라우팅 목록", () => {
  it("표 머리 · 품목 링크 · 공정 흐름 · 합 · 건수", () => {
    render(
      <RoutingList
        rows={[row({}), row({ code: "FG-0001", name: "완제품", itemType: "FG", active: false })]}
        filter={none}
      />,
    );
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "품목",
      "품명",
      "유형",
      "공정 흐름",
      "공정 수",
      "준비시간 합(분)",
      "개당 시간 합(초)",
    ]);
    const r = within(screen.getAllByRole("row")[1]);
    expect(r.getByRole("link", { name: "SF-0001" })).toHaveAttribute("href", "/production/routings/SF-0001");
    expect(r.getByText("BG → SAW → DA")).toBeInTheDocument();
    expect(r.getByText("4.500")).toBeInTheDocument();
    expect(screen.getByText("2개")).toBeInTheDocument();
  });

  it("사용 안 함 품목은 표시한다", () => {
    render(<RoutingList rows={[row({ active: false })]} filter={none} />);
    expect(screen.getByText("사용 안 함")).toBeInTheDocument();
  });

  it("빈 목록 — 거르는 값이 없으면 등록된 라우팅이 없다, 있으면 찾는 라우팅이 없다", () => {
    const { unmount } = render(<RoutingList rows={[]} filter={none} />);
    expect(screen.getByText("등록된 라우팅이 없습니다")).toBeInTheDocument();
    unmount();
    render(<RoutingList rows={[]} filter={{ ...none, process: "MD" }} />);
    expect(screen.getByText("찾는 라우팅이 없습니다")).toBeInTheDocument();
  });
});

describe("라우팅 찾기", () => {
  it("글자 · 공정 · 작업장 칸과 알림", () => {
    render(
      <RoutingSearch
        filter={none}
        notices={[{ field: "process", message: "받지 않는 공정 값이라 거르지 않았습니다" }]}
        processes={[
          { code: "DA", name: "다이 본딩", active: true, workCenters: [{ code: "DA-1", name: "1라인", active: true }] },
        ]}
      />,
    );
    expect(screen.getByRole("option", { name: "모든 공정" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "모든 작업장" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /DA-1/ })).toBeInTheDocument();
    expect(screen.getByText("받지 않는 공정 값이라 거르지 않았습니다")).toBeInTheDocument();
  });
});
