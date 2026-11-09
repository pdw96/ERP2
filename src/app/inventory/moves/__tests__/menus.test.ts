// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { MOVE_TYPES } from "@/lib/master-codes";
import { MOVE_HOME, MOVE_MENU, MOVE_MENUS, moveMenu } from "@/lib/move-menus";

// 등록 메뉴 넷(ADR 0020) — 수불구분마다 메뉴가 하나이고, 메뉴가 없어진 옛 주소는 「기타입고 등록」으로 넘어간다.

const h = vi.hoisted(() => ({ redirect: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: h.redirect }));

import MovesPage from "../page";
import NewMovePage from "../new/page";

describe("등록 메뉴 넷", () => {
  it("수불구분마다 메뉴가 하나이고, 차례 · 이름 · 주소가 설계대로다", () => {
    expect(MOVE_MENUS.map((m) => m.type)).toEqual(MOVE_TYPES.map((t) => t.code));
    expect(MOVE_MENUS.map((m) => [m.label, m.href])).toEqual([
      ["기타입고 등록", "/inventory/receipts"],
      ["기타출고 등록", "/inventory/issues"],
      ["재고이동 등록", "/inventory/transfers"],
      ["재고조정 등록", "/inventory/adjustments"],
    ]);
    expect(MOVE_MENU.XFER.label).toBe("재고이동 등록");
    expect(moveMenu("ADJ")?.href).toBe("/inventory/adjustments");
    expect(moveMenu("PURCHASE")).toBeUndefined();
  });

  it("옛 주소 「수불 등록」 · 「새 수불 등록」은 기타입고 등록으로 넘어간다", () => {
    MovesPage();
    NewMovePage();
    expect(MOVE_HOME).toBe("/inventory/receipts");
    expect(h.redirect.mock.calls).toEqual([["/inventory/receipts"], ["/inventory/receipts"]]);
  });
});
