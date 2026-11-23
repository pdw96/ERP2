// 메뉴 「MPS」의 주소 — 화면(쪽 넘기기)과 서버 동작(서고 돌아갈 주소)이 함께 쓴다. 경로는 이것뿐이고, 사용자 값으로 고르지 않는다.

export const MPS_PATH = "/production/mps";

/** 지금 보는 쪽(from) — 서고 같은 쪽으로 돌아간다. */
export type MpsBack = { from: string };

/** 그 쪽의 주소 — from 이 없으면 이번 주부터. */
export function mpsHref(from: string | undefined): string {
  return from ? `${MPS_PATH}?${new URLSearchParams({ from })}` : MPS_PATH;
}
