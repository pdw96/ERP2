import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DesignTabs } from "@/components/design-tabs";

const nav = vi.hoisted(() => ({ pathname: "/design" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

describe("DesignTabs", () => {
  beforeEach(() => {
    nav.pathname = "/design";
  });

  it("그림 셋을 차례로 보인다", () => {
    render(<DesignTabs />);
    const links = screen.getAllByRole("link");
    expect(links.map((l) => [l.textContent, l.getAttribute("href")])).toEqual([
      ["업무 흐름", "/design"],
      ["데이터 모델", "/design/model"],
      ["시스템 구성", "/design/system"],
    ]);
  });

  it("지금 보는 그림을 표시한다", () => {
    nav.pathname = "/design/model";
    render(<DesignTabs />);
    expect(screen.getByRole("link", { name: "데이터 모델" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "업무 흐름" })).not.toHaveAttribute("aria-current");
  });
});
