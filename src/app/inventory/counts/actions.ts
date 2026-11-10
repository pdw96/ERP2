"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { withDb } from "@/db/request";
import { describeFailure } from "@/db/status";
import {
  cancelCount,
  confirmCount,
  previewConfirm,
  saveCount,
  type ConfirmPreview,
  type CountSaveResult,
} from "@/db/stock-counts";
import { countValues } from "@/lib/count-input";
import { koreaToday } from "@/lib/today";

// 재고 실사의 입구(조각 「재고 수불」 PR E) — 저장(작성 중) · 확정 화면 · 확정 · 취소. 누구나 부를 수 있는 POST 라(데모는 로그인이 없다, ADR 0004)
// 화면을 믿지 않고 src/db/stock-counts.ts 가 같은 규칙으로 다시 본다. 실패 로그는 오류 코드만 남긴다 — 넣은 글자(LOT)는 남기지 않는다(설계 ②).

/** 저장의 결과 — 「확정…」으로 저장했으면 확정 화면(preview)을 함께 돌려준다. */
export type CountFormState =
  (CountSaveResult & { preview?: ConfirmPreview; previewError?: string; at?: number }) | null;
export type CountActionState = { formError: string } | null;

const FAILED = "저장하지 못했습니다 — 잠시 뒤 다시 저장하세요";

export async function saveCountAction(_prev: CountFormState, form: FormData): Promise<CountFormState> {
  const values = countValues(form);
  const toConfirm = form.get("intent") === "confirm";
  let result: CountSaveResult;
  try {
    result = await withDb((db) => saveCount(db, values, koreaToday()));
  } catch (error) {
    console.error(`재고 실사 저장 실패: ${describeFailure(error, "code-only")}`);
    return { ok: false, errors: { lines: {} }, formError: FAILED, values };
  }
  if (!result.ok) return result;
  // 저장되면 같은 화면을 다시 그린다 — 입력이 새 번호 · 버전으로 열린다.
  refresh();
  if (!toConfirm) return { ...result, at: Date.now() };
  try {
    const preview = await withDb((db) => previewConfirm(db, result.code));
    if ("code" in preview) return { ...result, preview, at: Date.now() };
    return { ...result, previewError: "formError" in preview ? preview.formError : "없는 실사입니다", at: Date.now() };
  } catch (error) {
    console.error(`재고 실사 확정 화면 실패: ${describeFailure(error, "code-only")}`);
    return { ...result, previewError: "확정 화면을 불러오지 못했습니다 — 다시 누르세요", at: Date.now() };
  }
}

export async function confirmCountAction(code: string, version: string): Promise<CountActionState> {
  if (typeof code !== "string" || typeof version !== "string") return { formError: "없는 실사입니다" };
  let result: Awaited<ReturnType<typeof confirmCount>>;
  try {
    result = await withDb((db) => confirmCount(db, code, version, koreaToday()));
  } catch (error) {
    console.error(`재고 실사 확정 실패: ${describeFailure(error, "code-only")}`);
    return { formError: "확정하지 못했습니다 — 잠시 뒤 다시 누르세요" };
  }
  if (!result.ok)
    return { formError: "notFound" in result ? "없는 실사입니다 — 화면을 새로 여세요" : result.formError };
  redirect(`/inventory/counts/${result.code}?confirmed=1`);
}

export async function cancelCountAction(code: string): Promise<CountActionState> {
  if (typeof code !== "string") return { formError: "없는 실사입니다" };
  let result: Awaited<ReturnType<typeof cancelCount>>;
  try {
    result = await withDb((db) => cancelCount(db, code));
  } catch (error) {
    console.error(`재고 실사 취소 실패: ${describeFailure(error, "code-only")}`);
    return { formError: "취소하지 못했습니다 — 잠시 뒤 다시 누르세요" };
  }
  if (!result.ok)
    return { formError: "notFound" in result ? "없는 실사입니다 — 화면을 새로 여세요" : result.formError };
  redirect(`/inventory/counts/${result.code}?canceled=1`);
}
