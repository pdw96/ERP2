"use server";

import { redirect } from "next/navigation";
import { createCode, updateCode, type CodeNotFound, type CodeSaveResult } from "@/db/codes";
import { withDb } from "@/db/request";
import { describeFailure } from "@/db/status";
import { codeValues } from "@/lib/code-input";

// 공통코드 값 추가 · 수정의 입구. 누구나 부를 수 있는 POST 라(데모는 로그인이 없다, ADR 0004) 화면을 믿지 않고
// src/db/codes.ts 가 같은 규칙으로 다시 본다 — 시스템 코드 묶음이면 거절한다. 실패 로그는 오류 코드만 남긴다(대장 NC-6).

export type CodeFormState = Extract<CodeSaveResult, { ok: false }> | { ok: true } | null;

const FAILED = "저장하지 못했습니다 — 잠시 뒤 다시 저장하세요";
const NOT_FOUND = "없는 묶음이나 값입니다 — 목록에서 다시 고르세요";

function settle(group: string, result: CodeSaveResult | CodeNotFound, values: ReturnType<typeof codeValues>) {
  if (!result.ok) {
    if ("notFound" in result) return { ok: false as const, errors: {}, formError: NOT_FOUND, values };
    return result;
  }
  redirect(`/system/codes/${group}?saved=${result.code}`);
}

export async function createCodeAction(group: string, _prev: CodeFormState, form: FormData): Promise<CodeFormState> {
  const values = codeValues(form);
  let result: CodeSaveResult | CodeNotFound;
  try {
    result = await withDb((db) => createCode(db, group, values));
  } catch (error) {
    console.error(`공통코드 추가 실패: ${describeFailure(error, "code-only")}`);
    return { ok: false, errors: {}, formError: FAILED, values };
  }
  return settle(group, result, values);
}

export async function updateCodeAction(
  group: string,
  code: string,
  _prev: CodeFormState,
  form: FormData,
): Promise<CodeFormState> {
  const values = codeValues(form);
  let result: CodeSaveResult | CodeNotFound;
  try {
    result = await withDb((db) => updateCode(db, group, code, values));
  } catch (error) {
    console.error(`공통코드 수정 실패: ${describeFailure(error, "code-only")}`);
    return { ok: false, errors: {}, formError: FAILED, values };
  }
  return settle(group, result, values);
}
