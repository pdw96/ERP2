"use server";

import { redirect } from "next/navigation";
import { createProcess, updateProcess, type ProcessSaveResult } from "@/db/processes";
import { withDb } from "@/db/request";
import { describeFailure } from "@/db/status";
import { processValues } from "@/lib/process-input";

// 공정 등록 · 수정의 입구. 누구나 부를 수 있는 POST 라(데모는 로그인이 없다, ADR 0004) 화면을 믿지 않고
// src/db/processes.ts 가 같은 규칙으로 다시 본다. 실패 로그는 오류 코드만 남긴다 — 방문자가 넣은 글자는 남기지 않는다.

export type ProcessFormState = Extract<ProcessSaveResult, { ok: false }> | { ok: true } | null;

const FAILED = "저장하지 못했습니다 — 잠시 뒤 다시 저장하세요";

export async function createProcessAction(_prev: ProcessFormState, form: FormData): Promise<ProcessFormState> {
  const values = processValues(form);
  let result: ProcessSaveResult;
  try {
    result = await withDb((db) => createProcess(db, values));
  } catch (error) {
    console.error(`공정 등록 실패: ${describeFailure(error, "code-only")}`);
    return { ok: false, errors: {}, formError: FAILED, values };
  }
  if (!result.ok) return result;
  redirect(`/production/processes?saved=${result.code}`);
}

export async function updateProcessAction(
  code: string,
  _prev: ProcessFormState,
  form: FormData,
): Promise<ProcessFormState> {
  const values = processValues(form);
  // 화면을 연 때의 버전 — 그 사이 다른 사람이 고쳤으면 저장하지 않는다.
  const version = form.get("version");
  let result: Awaited<ReturnType<typeof updateProcess>>;
  try {
    result = await withDb((db) => updateProcess(db, code, values, typeof version === "string" ? version : ""));
  } catch (error) {
    console.error(`공정 수정 실패: ${describeFailure(error, "code-only")}`);
    return { ok: false, errors: {}, formError: FAILED, values };
  }
  if (!result.ok) {
    if ("notFound" in result)
      return { ok: false, errors: {}, formError: "없는 공정입니다 — 목록에서 다시 고르세요", values };
    return result;
  }
  redirect(`/production/processes?saved=${result.code}`);
}
