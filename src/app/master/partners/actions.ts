"use server";

import { redirect } from "next/navigation";
import { createPartner, updatePartner, type PartnerSaveResult } from "@/db/partners";
import { withDb } from "@/db/request";
import { describeFailure } from "@/db/status";
import { partnerValues } from "@/lib/partner-input";

// 거래처 등록 · 수정의 입구. 누구나 부를 수 있는 POST 라(데모는 로그인이 없다, ADR 0004) 화면을 믿지 않고
// src/db/partners.ts 가 같은 규칙으로 다시 본다. 실패 로그는 오류 코드만 남긴다 — 방문자가 넣은 글자는 남기지 않는다(대장 NC-6).

export type PartnerFormState = Extract<PartnerSaveResult, { ok: false }> | { ok: true } | null;

const FAILED = "저장하지 못했습니다 — 잠시 뒤 다시 저장하세요";

export async function createPartnerAction(_prev: PartnerFormState, form: FormData): Promise<PartnerFormState> {
  const values = partnerValues(form);
  let result: PartnerSaveResult;
  try {
    result = await withDb((db) => createPartner(db, values));
  } catch (error) {
    console.error(`거래처 등록 실패: ${describeFailure(error, "code-only")}`);
    return { ok: false, errors: {}, formError: FAILED, values };
  }
  if (!result.ok) return result;
  redirect(`/master/partners?saved=${result.code}`);
}

export async function updatePartnerAction(
  code: string,
  _prev: PartnerFormState,
  form: FormData,
): Promise<PartnerFormState> {
  const values = partnerValues(form);
  let result: Awaited<ReturnType<typeof updatePartner>>;
  try {
    result = await withDb((db) => updatePartner(db, code, values));
  } catch (error) {
    console.error(`거래처 수정 실패: ${describeFailure(error, "code-only")}`);
    return { ok: false, errors: {}, formError: FAILED, values };
  }
  if (!result.ok) {
    if ("notFound" in result)
      return { ok: false, errors: {}, formError: "없는 거래처입니다 — 목록에서 다시 고르세요", values };
    return result;
  }
  redirect(`/master/partners?saved=${result.code}`);
}
