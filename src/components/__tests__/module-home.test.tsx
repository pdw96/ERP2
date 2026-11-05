import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ModuleHome } from "@/components/module-home";
import { AREAS } from "@/lib/areas";

describe("ModuleHome", () => {
  it("기준정보 — 품목 · 거래처의 등록 · 조회는 화면으로 가는 링크(ADR 0013)", () => {
    render(<ModuleHome href="/master" />);
    expect(screen.getByRole("heading", { name: "기준정보" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /품목 등록/ })).toHaveAttribute("href", "/master/items");
    expect(screen.getByRole("link", { name: /품목 조회/ })).toHaveAttribute("href", "/master/items/inquiry");
    expect(screen.getByRole("link", { name: /거래처 등록/ })).toHaveAttribute("href", "/master/partners");
    expect(screen.getByRole("link", { name: /거래처 조회/ })).toHaveAttribute("href", "/master/partners/inquiry");
    expect(screen.queryByText("준비 중입니다.")).toBeNull();
  });

  it("재고 — 창고는 링크, 수불관리 · 재고관리는 짓는 조각과 함께 준비 중", () => {
    render(<ModuleHome href="/inventory" />);
    expect(screen.queryByText("준비 중입니다.")).toBeNull();
    const group = within(screen.getByRole("region", { name: "재고 기준정보" }));
    expect(group.getByRole("link", { name: /창고/ })).toHaveAttribute("href", "/inventory/warehouses");
    const inout = within(screen.getByRole("region", { name: "수불관리" }));
    expect(inout.getByText("수불 등록").parentElement).toHaveTextContent("준비 중 · 조각 「재고 수불」");
    expect(screen.queryAllByRole("link")).toHaveLength(1);
  });

  it("시스템 관리 — 공통코드는 링크, 회사 정보 · 사용자 · 메뉴 관리 · 권한은 조각 「인사」가 짓는다", () => {
    render(<ModuleHome href="/system" />);
    expect(screen.getByRole("link", { name: /공통코드/ })).toHaveAttribute("href", "/system/codes");
    expect(screen.getByText("회사 정보").parentElement).toHaveTextContent("준비 중 · 조각 「인사」");
    expect(screen.getByText("메뉴 관리").parentElement).toHaveTextContent("준비 중 · 조각 「인사」");
    expect(screen.getByText("권한").parentElement).toHaveTextContent("준비 중 · 조각 「인사」");
    expect(screen.queryAllByRole("link")).toHaveLength(1);
  });

  it("생산 — 지은 화면이 없으면 「준비 중입니다」와 메뉴 묶음을 보인다", () => {
    render(<ModuleHome href="/production" />);
    expect(screen.getByText("준비 중입니다.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "생산 기준정보" })).toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("목록에 없는 모듈이면 멈춘다 — 메뉴와 화면이 어긋나지 않게", () => {
    expect(() => render(<ModuleHome href="/unknown" />)).toThrow("알 수 없는 영역");
  });

  it("메뉴의 주소는 겹치지 않고, 모듈 아래에 있다", () => {
    const hrefs = AREAS.flatMap((a) =>
      a.groups.flatMap((g) => g.menus.flatMap((m) => (m.href ? [[a.href, m.href]] : []))),
    );
    expect(new Set(hrefs.map(([, h]) => h)).size).toBe(hrefs.length);
    for (const [area, href] of hrefs) expect(href.startsWith(`${area}/`)).toBe(true);
  });
});
