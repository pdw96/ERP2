import { parseQty, THOUSAND, ZERO, type Milli } from "./move-input";

// 판매계획의 칸과 수량 읽기. 화면(브라우저)과 서버가 함께 쓴다. DB 는 보지 않고 꼴만 본다.

/** 화면이 보낸 바뀐 칸 하나 — 모두 글자이고, 없음은 「」. before 는 화면을 연 때의 값, after 는 고친 값. */
export type SalesPlanCellInput = { customer: string; item: string; week: string; before: string; after: string };

/** 한 번 저장의 바뀐 칸 상한. */
export const SALES_PLAN_SAVE_MAX_CELLS = 2000;
/** 한 칸 수량의 상한 — 99,999,999(천분의 일 단위). */
export const SALES_PLAN_QTY_MAX: Milli = BigInt(99_999_999) * THOUSAND;

export const CUSTOMER_CODE = /^BP-[0-9]{4,}$/;
export const FG_CODE = /^FG-[0-9]{4,}$/;

/** 칸을 가리키는 열쇠 — 고객 · 품목 · 주(월요일). */
export const cellKey = (customer: string, item: string, week: string): string => `${customer}|${item}|${week}`;

/** 쉼표를 뺀 수량 글자의 부호 · 정수 · 소수 — parseQty(정수 아홉 자리까지)가 읽지 못하는 긴 정수를 가리려고 쓴다. */
const LONG_QTY = /^([+-]?)([0-9]+)(?:\.([0-9]{1,3}))?$/;

const OVER_LIMIT = "수량은 99,999,999 까지 적을 수 있습니다.";

/**
 * 수량 글자를 읽는다. 빈 칸 · 0(「0.0」 꼴 포함 — 단위 자릿수와 상관없이)은 「그 칸을 지움」(qty null). 0 보다 크고 99,999,999 이하,
 * 품목 단위의 소수 자릿수(decimals) 이하, 쉼표 허용. 음수는 거절한다. 정수가 열 자리를 넘는 수도 상한의 까닭으로 거절한다.
 */
export function parseSalesPlanQty(
  text: string,
  decimals: number,
): { ok: true; qty: Milli | null } | { ok: false; message: string } {
  const s = text.trim();
  if (s === "") return { ok: true, qty: null };
  // 앞의 0 을 떼고 읽는다 — 정수가 아홉 자리를 넘으면 parseQty 가 읽지 못하니, 그 전에 상한으로 가른다.
  const long = LONG_QTY.exec(s.replaceAll(",", ""));
  let parsed: { qty: Milli; decimals: number } | null = null;
  if (long) {
    const [, sign, int, frac] = long;
    const digits = int.replace(/^0+/, "");
    if (digits.length > 9) {
      return sign === "-" ? { ok: false, message: "수량은 0 보다 커야 합니다." } : { ok: false, message: OVER_LIMIT };
    }
    parsed = parseQty(`${sign}${digits || "0"}${frac === undefined ? "" : `.${frac}`}`);
  }
  if (!parsed) return { ok: false, message: "수량은 숫자로 적어 주세요." };
  if (parsed.qty < ZERO) return { ok: false, message: "수량은 0 보다 커야 합니다." };
  if (parsed.qty === ZERO) return { ok: true, qty: null };
  if (parsed.qty > SALES_PLAN_QTY_MAX) return { ok: false, message: OVER_LIMIT };
  if (parsed.decimals > decimals) {
    return {
      ok: false,
      message:
        decimals === 0
          ? "이 품목의 수량은 소수로 적을 수 없습니다."
          : `이 품목의 수량은 소수 ${decimals}자리까지 적을 수 있습니다.`,
    };
  }
  return { ok: true, qty: parsed.qty };
}
