import { redirect } from "next/navigation";
import { MOVE_HOME } from "@/lib/move-menus";

// 「새 수불 등록」 화면은 등록 메뉴 넷의 첫 화면이 되었다(ADR 0020) — 옛 주소는 「기타입고 등록」으로 넘긴다.
export default function NewMovePage() {
  redirect(MOVE_HOME);
}
