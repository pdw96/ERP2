// 메뉴 「MRP」의 주소 — 화면(탭 · 쪽 넘기기)과 서버 동작(서고 돌아갈 주소)이 함께 쓴다. 경로는 이것뿐이고, 사용자 값으로 고르지 않는다.

export const MRP_PATH = "/production/mrp";

/** 품목별 MRP 표의 주소 — from 은 쪽의 첫 주, 없으면 실행 주부터. */
export function mrpGridHref(from?: string): string {
  const query = new URLSearchParams({ view: "grid" });
  if (from) query.set("from", from);
  return `${MRP_PATH}?${query}`;
}

/** 페깅 탭의 주소 — item 은 고른 품목코드, order 는 고른 계획오더 번호. 없으면 그 칸은 싣지 않는다. */
export function mrpPegHref(order?: string, item?: string): string {
  const query = new URLSearchParams({ view: "peg" });
  if (item) query.set("item", item);
  if (order) query.set("order", order);
  return `${MRP_PATH}?${query}`;
}
