import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Sidebar, SidebarView } from "@/components/sidebar";

const nav = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

describe("Sidebar", () => {
  beforeEach(() => {
    nav.pathname = "/";
  });

  const modules = () =>
    within(document.getElementById("area-menu")!)
      .getAllByRole("link")
      .filter((l) => !l.closest("ul[aria-label$='메뉴']"));

  it("모듈을 마스터플랜 순서로 보인다 — 기준정보가 맨 위", () => {
    render(<Sidebar />);
    const links = modules();
    expect(links.map((l) => l.firstChild?.textContent)).toEqual([
      "기준정보",
      "영업",
      "구매",
      "재고",
      "생산",
      "품질",
      "회계",
      "인사",
      "시스템 관리",
    ]);
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/master",
      "/sales",
      "/purchasing",
      "/inventory",
      "/production",
      "/quality",
      "/accounting",
      "/hr",
      "/system",
    ]);
  });

  it("지은 화면이 없는 모듈은 「준비 중」이다", () => {
    render(<Sidebar />);
    const soon = modules().filter((l) => l.textContent?.includes("준비 중"));
    expect(soon.map((l) => l.firstChild?.textContent)).toEqual(["영업", "구매", "생산", "품질", "회계", "인사"]);
  });

  it("지금 모듈의 메뉴를 펼친다 — 품목 · 거래처는 등록 · 조회로 나뉘고(ADR 0013), 지금 화면을 표시한다", () => {
    nav.pathname = "/master/partners/BP-0001";
    render(<Sidebar />);
    const menu = within(screen.getByRole("list", { name: "기준정보 메뉴" }));
    expect(menu.getAllByRole("link").map((l) => [l.textContent, l.getAttribute("href")])).toEqual([
      ["품목 등록", "/master/items"],
      ["품목 조회", "/master/items/inquiry"],
      ["거래처 등록", "/master/partners"],
      ["거래처 조회", "/master/partners/inquiry"],
    ]);
    // 거래처의 수정 화면은 거래처 등록 아래다.
    expect(menu.getByRole("link", { name: "거래처 등록" })).toHaveAttribute("aria-current", "page");
    expect(menu.getAllByRole("link").filter((l) => l.hasAttribute("aria-current"))).toHaveLength(1);
    expect(screen.queryByRole("list", { name: "재고 메뉴" })).toBeNull();
  });

  it("조회 화면은 조회만 표시한다 — 주소가 등록의 주소 아래에 있어도", () => {
    nav.pathname = "/master/items/inquiry";
    render(<Sidebar />);
    const menu = within(screen.getByRole("list", { name: "기준정보 메뉴" }));
    expect(menu.getByRole("link", { name: "품목 조회" })).toHaveAttribute("aria-current", "page");
    expect(menu.getByRole("link", { name: "품목 등록" })).not.toHaveAttribute("aria-current");
  });

  it("품목의 시트형 등록 · 새 품목은 품목 등록을 표시한다", () => {
    for (const path of ["/master/items/sheet", "/master/items/new", "/master/items"]) {
      nav.pathname = path;
      const { unmount } = render(<Sidebar />);
      const menu = within(screen.getByRole("list", { name: "기준정보 메뉴" }));
      expect(menu.getByRole("link", { name: "품목 등록" })).toHaveAttribute("aria-current", "page");
      expect(menu.getByRole("link", { name: "품목 조회" })).not.toHaveAttribute("aria-current");
      unmount();
    }
  });

  it("재고를 열면 「재고 기준정보 › 창고」와 「수불관리 › 수불 등록」은 링크, 나머지 수불관리는 준비 중으로 보인다", () => {
    nav.pathname = "/inventory/warehouses/WH-01";
    render(<Sidebar />);
    const menu = within(screen.getByRole("list", { name: "재고 메뉴" }));
    expect(menu.getByText("재고 기준정보")).toBeInTheDocument();
    expect(menu.getByRole("link", { name: "창고" })).toHaveAttribute("href", "/inventory/warehouses");
    expect(menu.getByRole("link", { name: "창고" })).toHaveAttribute("aria-current", "page");
    expect(menu.getByRole("link", { name: "수불 등록" })).toHaveAttribute("href", "/inventory/moves");
    expect(menu.getByText("재고 실사").parentElement).toHaveTextContent("재고 실사준비 중");
    expect(screen.getByRole("link", { name: /^재고/ })).not.toHaveTextContent("준비 중");
  });

  it("시스템 관리를 열면 공통코드는 링크, 회사 정보 · 사용자 · 메뉴 관리 · 권한은 준비 중으로 보인다", () => {
    nav.pathname = "/system/codes/UNIT/EA";
    render(<Sidebar />);
    const menu = within(screen.getByRole("list", { name: "시스템 관리 메뉴" }));
    expect(menu.getByRole("link", { name: "공통코드" })).toHaveAttribute("href", "/system/codes");
    expect(menu.getByRole("link", { name: "공통코드" })).toHaveAttribute("aria-current", "page");
    for (const soon of ["회사 정보", "사용자", "메뉴 관리", "권한"])
      expect(menu.getByText(soon).parentElement).toHaveTextContent(`${soon}준비 중`);
    expect(screen.getByRole("link", { name: /^시스템 관리/ })).not.toHaveTextContent("준비 중");
  });

  it("주소를 모를 때(빌드 때의 모양)는 어느 모듈도 펼치지 않는다", () => {
    render(<SidebarView pathname="" />);
    expect(screen.queryByRole("list", { name: /메뉴$/ })).toBeNull();
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

    fireEvent.click(screen.getByRole("link", { name: /^영업/ }));
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(list).toHaveClass("hidden");
  });
});
