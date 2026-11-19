import { formatMilli, THOUSAND, type Milli } from "@/lib/move-input";
import { parseSalesPlanQty } from "@/lib/sales-plan-input";

// 판매계획 화면의 수량 글자. 서버가 주는 수량은 정규 글자(「3000」 · 「1.5」)이고, 품목 합계는 아홉 자리를 넘을 수 있어
// parseQty(아홉 자리까지) 대신 여기서 천분의 일 단위로 바꾼다. 화면(표)과 고친 이력이 함께 쓴다.

/** 정규 글자 → 천분의 일 단위. */
export function milliOf(canon: string): Milli {
  const [int, frac = ""] = canon.split(".");
  return BigInt(int) * THOUSAND + BigInt(frac.padEnd(3, "0").slice(0, 3));
}

/** 정규 글자를 보이는 꼴로 — 천 단위 쉼표(「3000」 → 「3,000」). */
export const shownQty = (canon: string): string => formatMilli(milliOf(canon));

/**
 * 넣은 글자의 수량 — 빈 칸 · 0 은 null(지움), 서버가 거절할 글자(읽지 못함 · 음수 · 상한 넘음 · 단위 자릿수 넘음)는 undefined
 * (품목 합계에 넣지 않고, 저장에는 보내 서버의 까닭을 받는다). 서버와 같은 parseSalesPlanQty 로 읽는다.
 */
export function typedQty(text: string, decimals: number): Milli | null | undefined {
  const parsed = parseSalesPlanQty(text, decimals);
  return parsed.ok ? parsed.qty : undefined;
}
