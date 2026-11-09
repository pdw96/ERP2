import type { MoveType } from "@/lib/master-codes";

// 수불관리의 등록 메뉴 넷 — 메뉴 하나가 수불구분 하나를 넣는다(ADR 0020, 설계 「2026-11-09 — PR F 를 열기 전에 정한 것」).
// 왼쪽 메뉴(src/lib/areas.ts) · 등록 화면 · 전표 보기가 이 목록 하나를 읽는다.

export type MoveMenu = { type: MoveType; label: string; href: string; note: string };

export const MOVE_MENUS: readonly MoveMenu[] = [
  {
    type: "IN",
    label: "기타입고 등록",
    href: "/inventory/receipts",
    note: "창고로 들어온 것 가운데 구매 · 생산이 아닌 입고(기초 재고 따위)를 전표로 남깁니다.",
  },
  {
    type: "OUT",
    label: "기타출고 등록",
    href: "/inventory/issues",
    note: "창고에서 나간 것 가운데 판매 · 생산 투입이 아닌 출고(소모 · 견본 따위)를 전표로 남깁니다.",
  },
  {
    type: "XFER",
    label: "재고이동 등록",
    href: "/inventory/transfers",
    note: "출고창고에서 입고창고로 옮긴 것을 전표로 남깁니다 — 재고의 합은 그대로입니다.",
  },
  {
    type: "ADJ",
    label: "재고조정 등록",
    href: "/inventory/adjustments",
    note: "장부를 실물에 맞춘 것을 조정사유와 함께 남깁니다 — 늘리면 +, 줄이면 − 를 붙입니다.",
  },
];

/** 수불구분마다의 메뉴. */
export const MOVE_MENU = Object.fromEntries(MOVE_MENUS.map((m) => [m.type, m])) as Record<MoveType, MoveMenu>;

/** 전표의 수불구분(DB 의 글자)에 맞는 메뉴 — 모르는 구분이면 undefined. */
export function moveMenu(type: string): MoveMenu | undefined {
  return MOVE_MENUS.find((m) => m.type === type);
}

/** 메뉴가 없어진 옛 주소(`/inventory/moves` · `/inventory/moves/new`)가 넘어가는 곳. */
export const MOVE_HOME = MOVE_MENUS[0].href;
