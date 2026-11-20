// 판매계획의 두 메뉴의 주소 — 「판매계획 등록」(넣고 저장) · 「판매계획 확정」(확정 · 확정 취소).
// 화면(링크 · 거르기)과 서버 동작(서고 돌아갈 주소)이 함께 쓴다. 경로는 이 둘뿐이고, 사용자 값으로 고르지 않는다.

export const ENTRY_PATH = "/sales/plans";
export const CONFIRM_PATH = "/sales/plans/confirm";
export type PlanPath = typeof ENTRY_PATH | typeof CONFIRM_PATH;

/** 지금 보는 쪽(from)과 거르기 값 — 다른 메뉴 · 다른 쪽으로 갈 때 싣는다. */
export type Back = { from: string; customer: string; item: string };

/** 그 메뉴의 주소 — 빈 값은 뺀다. from 이 없으면 이번 주부터. */
export function planHref(path: PlanPath, from: string | undefined, back: Pick<Back, "customer" | "item">): string {
  const query = new URLSearchParams();
  if (from) query.set("from", from);
  if (back.customer) query.set("customer", back.customer);
  if (back.item) query.set("item", back.item);
  const q = query.toString();
  return q ? `${path}?${q}` : path;
}
