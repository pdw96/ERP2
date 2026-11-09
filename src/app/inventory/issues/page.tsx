import type { Metadata } from "next";
import { MOVE_MENU } from "@/lib/move-menus";
import { MoveEntryPage } from "../moves/move-entry-page";

const menu = MOVE_MENU.OUT;

export const metadata: Metadata = { title: `${menu.label} — ERP2` };

// 재고 › 수불관리의 등록 메뉴 — 이름 · 주소는 src/lib/move-menus.ts(ADR 0020).
export default function Page() {
  return <MoveEntryPage menu={menu} />;
}
