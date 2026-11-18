"use server";

import { redirect } from "next/navigation";
import { createDefectType, updateDefectType, type DefectTypeSaveResult } from "@/db/defect-types";
import { withDb } from "@/db/request";
import { describeFailure } from "@/db/status";
import { defectTypeValues } from "@/lib/defect-type-input";

// 불량 유형 등록 · 수정의 입구. 누구나 부를 수 있는 POST 라(데모는 로그인이 없다, ADR 0004) 화면을 믿지 않고
// src/db/defect-types.ts 가 같은 규칙으로 다시 본다. 실패 로그는 오류 코드만 남긴다 — 방문자가 넣은 글자는 남기지 않는다.

export type DefectTypeFormState = Extract<DefectTypeSaveResult, { ok: false }> | { ok: true } | null;

const FAILED = "저장하지 못했습니다 — 잠시 뒤 다시 저장하세요";

export async function createDefectTypeAction(_prev: DefectTypeFormState, form: FormData): Promise<DefectTypeFormState> {
  const values = defectTypeValues(form);
  let result: DefectTypeSaveResult;
  try {
    result = await withDb((db) => createDefectType(db, values));
  } catch (error) {
    console.error(`불량 유형 등록 실패: ${describeFailure(error, "code-only")}`);
    return { ok: false, errors: {}, formError: FAILED, values };
  }
  if (!result.ok) return result;
  redirect(`/quality/defect-types?saved=${result.code}`);
}

export async function updateDefectTypeAction(
  code: string,
  _prev: DefectTypeFormState,
  form: FormData,
): Promise<DefectTypeFormState> {
  const values = defectTypeValues(form);
  // 화면을 연 때의 버전 — 그 사이 다른 사람이 고쳤으면 저장하지 않는다.
  const version = form.get("version");
  let result: Awaited<ReturnType<typeof updateDefectType>>;
  try {
    result = await withDb((db) => updateDefectType(db, code, values, typeof version === "string" ? version : ""));
  } catch (error) {
    console.error(`불량 유형 수정 실패: ${describeFailure(error, "code-only")}`);
    return { ok: false, errors: {}, formError: FAILED, values };
  }
  if (!result.ok) {
    if ("notFound" in result)
      return { ok: false, errors: {}, formError: "없는 불량 유형입니다 — 목록에서 다시 고르세요", values };
    return result;
  }
  redirect(`/quality/defect-types?saved=${result.code}`);
}
