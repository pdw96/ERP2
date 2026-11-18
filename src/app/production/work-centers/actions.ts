"use server";

import { redirect } from "next/navigation";
import { withDb } from "@/db/request";
import { describeFailure } from "@/db/status";
import { createWorkCenter, updateWorkCenter, type WorkCenterSaveResult } from "@/db/work-centers";
import { workCenterValues } from "@/lib/work-center-input";

// 작업장 등록 · 수정의 입구. 누구나 부를 수 있는 POST 라(데모는 로그인이 없다, ADR 0004) 화면을 믿지 않고
// src/db/work-centers.ts 가 같은 규칙으로 다시 본다. 실패 로그는 오류 코드만 남긴다 — 방문자가 넣은 글자는 남기지 않는다.

export type WorkCenterFormState = Extract<WorkCenterSaveResult, { ok: false }> | { ok: true } | null;

const FAILED = "저장하지 못했습니다 — 잠시 뒤 다시 저장하세요";

export async function createWorkCenterAction(_prev: WorkCenterFormState, form: FormData): Promise<WorkCenterFormState> {
  const values = workCenterValues(form);
  let result: WorkCenterSaveResult;
  try {
    result = await withDb((db) => createWorkCenter(db, values));
  } catch (error) {
    console.error(`작업장 등록 실패: ${describeFailure(error, "code-only")}`);
    return { ok: false, errors: {}, formError: FAILED, values };
  }
  if (!result.ok) return result;
  redirect(`/production/work-centers?saved=${result.code}`);
}

export async function updateWorkCenterAction(
  code: string,
  _prev: WorkCenterFormState,
  form: FormData,
): Promise<WorkCenterFormState> {
  const values = workCenterValues(form);
  // 화면을 연 때의 버전 — 그 사이 다른 사람이 고쳤으면 저장하지 않는다.
  const version = form.get("version");
  let result: Awaited<ReturnType<typeof updateWorkCenter>>;
  try {
    result = await withDb((db) => updateWorkCenter(db, code, values, typeof version === "string" ? version : ""));
  } catch (error) {
    console.error(`작업장 수정 실패: ${describeFailure(error, "code-only")}`);
    return { ok: false, errors: {}, formError: FAILED, values };
  }
  if (!result.ok) {
    if ("notFound" in result)
      return { ok: false, errors: {}, formError: "없는 작업장입니다 — 목록에서 다시 고르세요", values };
    return result;
  }
  redirect(`/production/work-centers?saved=${result.code}`);
}
