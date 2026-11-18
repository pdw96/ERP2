// 불량 유형 입력의 칸 이름 — 화면(브라우저)과 서버의 검사(src/lib/defect-type-input.ts)가 함께 쓴다.
// 검사 도구(zod)를 브라우저로 보내지 않게 따로 둔다.

export const DEFECT_TYPE_FIELDS = ["code", "name", "cls", "processes", "note", "active"] as const;

export type DefectTypeField = (typeof DEFECT_TYPE_FIELDS)[number];
/** 화면이 보낸 그대로의 글자 — 거절하면 이 값으로 입력 칸을 다시 채운다. 발생 공정만 여럿이다. */
export type DefectTypeValues = Partial<Record<Exclude<DefectTypeField, "processes">, string>> & {
  processes?: string[];
};
/** 칸마다 거절한 까닭 하나. */
export type DefectTypeErrors = Partial<Record<DefectTypeField, string>>;

/** 대분류의 공통코드 묶음 — 이름 「불량 대분류」. */
export const DEFECT_CLS_GROUP = "DEFECT_CLS";
