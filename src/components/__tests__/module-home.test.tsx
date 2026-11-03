import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ModuleHome } from "@/components/module-home";
import { AREAS } from "@/lib/areas";

describe("ModuleHome", () => {
  it("기준정보 — 품목은 화면으로 가는 링크, 거래처는 준비 중", () => {
    render(<ModuleHome href="/master" />);
    expect(screen.getByRole("heading", { name: "기준정보" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /품목/ })).toHaveAttribute("href", "/master/items");
    expect(screen.getByText("거래처").parentElement).toHaveTextContent("준비 중 · 조각 「기준정보」");
    expect(screen.queryByText("준비 중입니다.")).toBeNull();
  });

  it("재고 — 지은 화면이 없으면 「준비 중입니다」와 메뉴 묶음을 보인다", () => {
    render(<ModuleHome href="/inventory" />);
    expect(screen.getByText("준비 중입니다.")).toBeInTheDocument();
    const group = within(screen.getByRole("region", { name: "재고 기준정보" }));
    expect(group.getByText("창고").parentElement).toHaveTextContent("준비 중 · 조각 「기준정보」");
    expect(screen.getByRole("region", { name: "수불관리" })).toBeInTheDocument();
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
