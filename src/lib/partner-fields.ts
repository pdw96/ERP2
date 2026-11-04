// 거래처 입력의 칸 이름 — 화면(브라우저)과 서버의 검사(src/lib/partner-input.ts)가 함께 쓴다.
// 검사 도구(zod)를 브라우저로 보내지 않게 따로 둔다.

export const PARTNER_FIELDS = [
  "name",
  "isSupplier",
  "isCustomer",
  "country",
  "bizNo",
  "foreignBizNo",
  "ceo",
  "bizType",
  "bizItem",
  "address",
  "phone",
  "email",
  "contactName",
  "contactPhone",
  "note",
  "active",
] as const;

export type PartnerField = (typeof PARTNER_FIELDS)[number];
/** 화면이 보낸 그대로의 글자 — 거절하면 이 값으로 입력 칸을 다시 채운다. */
export type PartnerValues = Partial<Record<PartnerField, string>>;

/** 거절을 보이는 자리 — 매입처 · 매출처는 「구분」 한 자리로 묶는다(하나 이상 골라야 한다). */
export const PARTNER_ERROR_KEYS = [
  "name",
  "role",
  "country",
  "bizNo",
  "foreignBizNo",
  "ceo",
  "bizType",
  "bizItem",
  "address",
  "phone",
  "email",
  "contactName",
  "contactPhone",
  "note",
  "active",
] as const;
export type PartnerErrorKey = (typeof PARTNER_ERROR_KEYS)[number];
/** 자리마다 거절한 까닭 하나. */
export type PartnerErrors = Partial<Record<PartnerErrorKey, string>>;

/** 해외 사업자번호의 길이 — 나라마다 꼴이 달라 글자 그대로 받는다(설계 「PR G 를 열기 전에 정한 것」). */
export const FOREIGN_BIZ_NO_MAX = 30;

/**
 * 설명용 칸(PR H, ADR 0012) — 화면의 이름과 길이(설계 「PR H 를 열기 전에 정한 것」). 모두 비워도 된다. 순서는 한 건 등록 화면의 순서다.
 * 전화 · 담당자 연락처 · 이메일은 꼴도 본다(아래 PHONE · EMAIL).
 */
export const PARTNER_TEXT_FIELDS = [
  { field: "ceo", label: "대표자", max: 50 },
  { field: "bizType", label: "업태", max: 50 },
  { field: "bizItem", label: "종목", max: 50 },
  { field: "address", label: "주소", max: 200 },
  { field: "phone", label: "전화", max: 20 },
  { field: "email", label: "이메일", max: 100 },
  { field: "contactName", label: "담당자", max: 50 },
  { field: "contactPhone", label: "담당자 연락처", max: 20 },
  { field: "note", label: "비고", max: 500 },
] as const;

export type PartnerTextField = (typeof PARTNER_TEXT_FIELDS)[number]["field"];

/** 전화의 꼴 — 숫자 · 붙임표 · + · 괄호 · 빈칸만 20자까지, 숫자가 하나 이상(DB 의 partners_phone_format 과 같다). */
export const isPhone = (s: string) => /^[0-9+() -]{1,20}$/.test(s) && /[0-9]/.test(s);

/** 이메일의 꼴 — @ 하나를 사이에 두고 앞뒤가 비지 않고, 뒤에 점이 있으며, 빈칸이 없다(DB 의 partners_email_format 과 같다). */
export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
