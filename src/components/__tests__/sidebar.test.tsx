import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "@/components/sidebar";

const nav = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

describe("Sidebar", () => {
  beforeEach(() => {
    nav.pathname = "/";
  });

  it("업무 영역 여섯을 순서대로 보인다", () => {
    render(<Sidebar />);
    const links = within(document.getElementById("area-menu")!).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["재고", "생산", "구매", "영업", "회계", "인사"]);
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/inventory",
      "/production",
      "/purchasing",
      "/sales",
      "/accounting",
      "/hr",
    ]);
  });

  it("지금 보는 영역을 표시한다 — 그 아래 화면에서도", () => {
    nav.pathname = "/production/orders";
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "생산" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "재고" })).not.toHaveAttribute("aria-current");
  });

  it("메뉴 판 아래에 설계도 · 시스템 상태 링크가 있고, 설계도를 보는 동안 표시한다", () => {
    nav.pathname = "/design/model";
    render(<Sidebar />);
    const foot = within(document.getElementById("area-menu-foot")!);
    expect(foot.getAllByRole("link").map((l) => [l.textContent, l.getAttribute("href")])).toEqual([
      ["설계도", "/design"],
      ["시스템 상태", "/health"],
    ]);
    expect(foot.getByRole("link", { name: "설계도" })).toHaveAttribute("aria-current", "page");
  });

  it("휴대폰 폭의 메뉴 단추가 메뉴를 펼치고, 영역을 고르면 접는다", () => {
    render(<Sidebar />);
    const button = screen.getByRole("button", { name: "메뉴" });
    const list = document.getElementById("area-menu")!;
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(list).toHaveClass("hidden");

    const foot = document.getElementById("area-menu-foot")!;
    expect(foot).toHaveClass("hidden");

    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(list).toHaveClass("block");
    expect(foot).toHaveClass("block");

    fireEvent.click(screen.getByRole("link", { name: "영업" }));
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(list).toHaveClass("hidden");
  });
});
