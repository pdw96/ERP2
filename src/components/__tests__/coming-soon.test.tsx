import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ComingSoon } from "@/components/coming-soon";

describe("ComingSoon", () => {
  it("영역 이름과 「준비 중」을 보인다", () => {
    render(<ComingSoon href="/accounting" />);
    expect(screen.getByRole("heading", { name: "회계" })).toBeInTheDocument();
    expect(screen.getByText("준비 중입니다.")).toBeInTheDocument();
  });

  it("목록에 없는 영역이면 멈춘다 — 메뉴와 화면이 어긋나지 않게", () => {
    expect(() => render(<ComingSoon href="/unknown" />)).toThrow("알 수 없는 영역");
  });
});
