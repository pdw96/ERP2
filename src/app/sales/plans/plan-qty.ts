import { formatMilli, THOUSAND, type Milli } from "@/lib/move-input";

// 판매계획 화면의 수량 글자. 서버가 주는 수량은 정규 글자(「3000」 · 「1.5」)이고, 품목 합계는 아홉 자리를 넘을 수 있어
// parseQty(아홉 자리까지) 대신 여기서 천분의 일 단위로 바꾼다. 화면(표)과 고친 이력이 함께 쓴다.

/** 정규 글자 → 천분의 일 단위. */
export function milliOf(canon: string): Milli {
  const [int, frac = ""] = canon.split(".");
  return BigInt(int) * THOUSAND + BigInt(frac.padEnd(3, "0").slice(0, 3));
}

/** 정규 글자를 보이는 꼴로 — 천 단위 쉼표(「3000」 → 「3,000」). */
export const shownQty = (canon: string): string => formatMilli(milliOf(canon));
