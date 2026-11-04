// 거래처 입력의 칸 이름 — 화면(브라우저)과 서버의 검사(src/lib/partner-input.ts)가 함께 쓴다.
// 검사 도구(zod)를 브라우저로 보내지 않게 따로 둔다.

export const PARTNER_FIELDS = [
  "name",
  "isSupplier",
  "isCustomer",
  "country",
  "bizNo",
  "foreignBizNo",
  "active",
] as const;

export type PartnerField = (typeof PARTNER_FIELDS)[number];
/** 화면이 보낸 그대로의 글자 — 거절하면 이 값으로 입력 칸을 다시 채운다. */
export type PartnerValues = Partial<Record<PartnerField, string>>;

/** 거절을 보이는 자리 — 매입처 · 매출처는 「구분」 한 자리로 묶는다(하나 이상 골라야 한다). */
export const PARTNER_ERROR_KEYS = ["name", "role", "country", "bizNo", "foreignBizNo", "active"] as const;
export type PartnerErrorKey = (typeof PARTNER_ERROR_KEYS)[number];
/** 자리마다 거절한 까닭 하나. */
export type PartnerErrors = Partial<Record<PartnerErrorKey, string>>;

/** 해외 사업자번호의 길이 — 나라마다 꼴이 달라 글자 그대로 받는다(설계 「PR G 를 열기 전에 정한 것」). */
export const FOREIGN_BIZ_NO_MAX = 30;
