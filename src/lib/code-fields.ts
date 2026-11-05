// 공통코드 값(Minor) 입력의 칸 이름 — 화면(브라우저)과 서버의 검사(src/lib/code-input.ts)가 함께 쓴다.
// 검사 도구(zod)를 브라우저로 보내지 않게 따로 둔다.

// 뒤의 셋은 단위(UNIT) 묶음에만 있다 — 기준 단위 · 배수 · 소수 자릿수(ADR 0017). 다른 묶음은 보내지 않고, 보내도 읽지 않는다.
export const CODE_FIELDS = ["code", "name", "sortOrder", "active", "baseUnit", "factor", "decimals"] as const;

export type CodeField = (typeof CODE_FIELDS)[number];
/** 화면이 보낸 그대로의 글자 — 거절하면 이 값으로 입력 칸을 다시 채운다. */
export type CodeValues = Partial<Record<CodeField, string>>;
/** 칸마다 거절한 까닭 하나. */
export type CodeErrors = Partial<Record<CodeField, string>>;

/** 묶음(Major) 코드의 꼴 — 주소로 받은 묶음을 DB 에 묻기 전에 본다(ADR 0009). */
export const GROUP_CODE = /^[A-Z][A-Z0-9_]{1,19}$/;
/** 값(Minor) 코드의 꼴(ADR 0009). */
export const MINOR_CODE = /^[A-Z0-9][A-Z0-9_]{0,19}$/;

/** 단위 사양을 가진 묶음 — 공통코드 UNIT(ADR 0017). */
export const UNIT_GROUP = "UNIT";

/** 배수를 사람이 읽는 글로 — 1000 · 0.001. 끝의 0 은 떼어 낸다. */
export const factorText = (n: number) => String(Number(n.toFixed(6)));
