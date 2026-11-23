import type { Milli } from "./move-input";
import { parseSalesPlanQty } from "./sales-plan-input";

// MPS 의 칸과 수량 읽기(메뉴 「MPS」). 화면(브라우저)과 서버가 함께 쓴다. DB 는 보지 않고 꼴만 본다.

/** 화면이 보낸 바뀐 칸 하나 — before 는 화면이 본 고정 수량(고정 아니면 「」), after 는 넣은 글자(「」 = 고정 풀기). */
export type MpsCellInput = { item: string; week: string; before: string; after: string };

/** 확정 · 확정 취소에 보내는 칸 하나 — 확정은 화면이 본 안, 확정 취소는 화면이 본 고정 수량. */
export type MpsConfirmInput = { item: string; week: string; qty: string };

/** 한 번 저장 · 확정 · 확정 취소의 칸 상한. */
export const MPS_SAVE_MAX_CELLS = 2000;

/** 칸을 가리키는 열쇠 — 품목 · 주(월요일). */
export const mpsCellKey = (item: string, week: string): string => `${item}|${week}`;

const ZERO_QTY = BigInt(0);

const SALES_PLAN_NEGATIVE = "수량은 0 보다 커야 합니다.";

/**
 * 수량 글자를 읽는다. 빈 칸은 「고정 풀기」(qty null), 0 꼴(「0」 · 「0.00」 · 「0,000」 — 단위 자릿수와 상관없이)은 고정 수량 0.
 * 그 밖은 판매계획과 같은 규칙 — 99,999,999 이하, 품목 단위의 소수 자릿수(decimals) 이하, 쉼표 허용, 음수 거절.
 */
export function parseMpsQty(
  text: string,
  decimals: number,
): { ok: true; qty: Milli | null } | { ok: false; message: string } {
  if (text.trim() === "") return { ok: true, qty: null };
  const parsed = parseSalesPlanQty(text, decimals);
  // 판매계획은 0 을 「그 칸을 지움」(null)으로 읽는다 — 빈 칸이 아니니 MPS 에서는 고정 수량 0 이다.
  if (parsed.ok && parsed.qty === null) return { ok: true, qty: ZERO_QTY };
  // 판매계획의 「0 보다 커야 합니다」는 MPS 에 맞지 않는다 — 0 도 유효한 고정 수량이다.
  if (!parsed.ok && parsed.message === SALES_PLAN_NEGATIVE)
    return { ok: false, message: "수량은 0 이상으로 적어 주세요." };
  return parsed;
}
