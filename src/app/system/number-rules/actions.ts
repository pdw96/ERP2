"use server";

import { redirect } from "next/navigation";
import { createNumberRule, updateNumberRule, type NumberRuleSaveResult } from "@/db/number-rules";
import { withDb } from "@/db/request";
import { describeFailure } from "@/db/status";
import { numberRuleValues } from "@/lib/number-rule-input";

// 번호 규칙 등록 · 수정의 입구. 누구나 부를 수 있는 POST 라(데모는 로그인이 없다, ADR 0004) 화면을 믿지 않고
// src/db/number-rules.ts 가 같은 규칙으로 다시 본다. 실패 로그는 오류 코드만 남긴다 — 방문자가 넣은 글자는 남기지 않는다(대장 NC-6).

export type NumberRuleFormState = Extract<NumberRuleSaveResult, { ok: false }> | { ok: true } | null;

const FAILED = "저장하지 못했습니다 — 잠시 뒤 다시 저장하세요";

export async function createNumberRuleAction(_prev: NumberRuleFormState, form: FormData): Promise<NumberRuleFormState> {
  const values = numberRuleValues(form);
  let result: NumberRuleSaveResult;
  try {
    result = await withDb((db) => createNumberRule(db, values));
  } catch (error) {
    console.error(`번호 규칙 등록 실패: ${describeFailure(error, "code-only")}`);
    return { ok: false, errors: {}, formError: FAILED, values };
  }
  if (!result.ok) return result;
  redirect(`/system/number-rules?saved=${result.code}`);
}

/** 수정 — 화면을 연 때의 버전(`version`)을 함께 받는다. 그 사이 다른 사람이 고쳤으면 저장하지 않는다. */
export async function updateNumberRuleAction(
  code: string,
  _prev: NumberRuleFormState,
  form: FormData,
): Promise<NumberRuleFormState> {
  const values = numberRuleValues(form);
  const version = form.get("version");
  let result: Awaited<ReturnType<typeof updateNumberRule>>;
  try {
    result = await withDb((db) => updateNumberRule(db, code, values, typeof version === "string" ? version : ""));
  } catch (error) {
    console.error(`번호 규칙 수정 실패: ${describeFailure(error, "code-only")}`);
    return { ok: false, errors: {}, formError: FAILED, values };
  }
  if (!result.ok) {
    if ("notFound" in result)
      return { ok: false, errors: {}, formError: "없는 번호 규칙입니다 — 목록에서 다시 고르세요", values };
    return result;
  }
  redirect(`/system/number-rules?saved=${result.code}`);
}
