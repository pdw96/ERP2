"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { withDb } from "@/db/request";
import { describeFailure } from "@/db/status";
import { cancelMove, onHand, saveMove, type MoveSaveResult, type OnHand } from "@/db/stock";
import { moveValues } from "@/lib/move-input";
import { koreaToday } from "@/lib/today";

// 수불 등록 · 취소의 입구(조각 「재고 수불」 PR C — 등록 메뉴 넷이 같이 부른다, PR F). 누구나 부를 수 있는 POST 라(데모는 로그인이 없다, ADR 0004) 화면을 믿지 않고
// src/db/stock.ts 가 같은 규칙으로 다시 본다. 실패 로그는 오류 코드만 남긴다 — 방문자가 넣은 글자(비고 · LOT)는 남기지 않는다(설계 ②).

/** 저장의 결과 — 저장되면 전표번호, 거절되면 까닭. 등록 화면은 그대로 남아 다음 전표를 넣는다(ADR 0020). */
export type MoveFormState = MoveSaveResult | null;
export type CancelState = { formError: string } | null;

const FAILED = "저장하지 못했습니다 — 잠시 뒤 다시 저장하세요";

export async function saveMoveAction(_prev: MoveFormState, form: FormData): Promise<MoveFormState> {
  const values = moveValues(form);
  let result: MoveSaveResult;
  try {
    result = await withDb((db) => saveMove(db, values, koreaToday()));
  } catch (error) {
    console.error(`수불 등록 실패: ${describeFailure(error, "code-only")}`);
    return { ok: false, errors: { header: {}, lines: {} }, formError: FAILED, values };
  }
  // 저장되면 같은 화면에 남는다 — 화면을 다시 그려 그 메뉴의 최근 전표에 방금 넣은 전표가 들게 한다.
  if (result.ok) refresh();
  return result;
}

export async function cancelMoveAction(code: string): Promise<CancelState> {
  let result: Awaited<ReturnType<typeof cancelMove>>;
  try {
    result = await withDb((db) => cancelMove(db, code, koreaToday()));
  } catch (error) {
    console.error(`수불 취소 실패: ${describeFailure(error, "code-only")}`);
    return { formError: "취소하지 못했습니다 — 잠시 뒤 다시 누르세요" };
  }
  if (!result.ok)
    return { formError: "notFound" in result ? "없는 전표입니다 — 목록에서 다시 고르세요" : result.formError };
  redirect(`/inventory/moves/${result.code}?saved=1`);
}

/** 한 품목 · 창고의 가용 재고(LOT 마다) — 줄의 LOT 고르기가 부른다. 읽기만 한다. */
export async function onHandAction(itemCode: string, warehouseCode: string): Promise<OnHand[] | null> {
  if (typeof itemCode !== "string" || typeof warehouseCode !== "string" || itemCode.length > 20) return null;
  try {
    return await withDb((db) => onHand(db, itemCode, warehouseCode));
  } catch (error) {
    console.error(`가용 재고 불러오기 실패: ${describeFailure(error, "code-only")}`);
    return null;
  }
}
