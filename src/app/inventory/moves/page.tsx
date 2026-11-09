import { redirect } from "next/navigation";
import { MOVE_HOME } from "@/lib/move-menus";

// 메뉴 「수불 등록」은 등록 메뉴 넷으로 나뉘었다(ADR 0020) — 옛 주소는 「기타입고 등록」으로 넘긴다. 전표 보기(`/inventory/moves/<전표번호>`)는 그대로다.
export default function MovesPage() {
  redirect(MOVE_HOME);
}
