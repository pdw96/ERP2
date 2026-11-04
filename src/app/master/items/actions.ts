"use server";

import { redirect } from "next/navigation";
import { createItem, createItemRows, updateItem, type SaveResult } from "@/db/items";
import { withDb } from "@/db/request";
import { describeFailure } from "@/db/status";
import { itemValues } from "@/lib/item-input";
import { readSheetPayload, type SheetResult } from "@/lib/sheet";
import { itemSheetColumns } from "@/lib/sheet-columns";

// 품목 등록 · 수정의 입구. 누구나 부를 수 있는 POST 라(데모는 로그인이 없다, ADR 0004) 화면을 믿지 않고
// src/db/items.ts 가 같은 규칙으로 다시 본다. 실패 로그는 오류 코드만 남긴다 — 방문자가 넣은 글자는 남기지 않는다(대장 NC-6).

export type ItemFormState = Extract<SaveResult, { ok: false }> | { ok: true } | null;

const FAILED = "저장하지 못했습니다 — 잠시 뒤 다시 저장하세요";

export async function createItemAction(_prev: ItemFormState, form: FormData): Promise<ItemFormState> {
  const values = itemValues(form);
  let result: SaveResult;
  try {
    result = await withDb((db) => createItem(db, values));
  } catch (error) {
    console.error(`품목 등록 실패: ${describeFailure(error, "code-only")}`);
    return { ok: false, errors: {}, formError: FAILED, values };
  }
  if (!result.ok) return result;
  redirect(`/master/items?saved=${result.code}`);
}

export async function updateItemAction(code: string, _prev: ItemFormState, form: FormData): Promise<ItemFormState> {
  const values = itemValues(form);
  let result: Awaited<ReturnType<typeof updateItem>>;
  try {
    result = await withDb((db) => updateItem(db, code, values));
  } catch (error) {
    console.error(`품목 수정 실패: ${describeFailure(error, "code-only")}`);
    return { ok: false, errors: {}, formError: FAILED, values };
  }
  if (!result.ok) {
    if ("notFound" in result)
      return { ok: false, errors: {}, formError: "없는 품목입니다 — 목록에서 다시 고르세요", values };
    return result;
  }
  redirect(`/master/items?saved=${result.code}`);
}

/**
 * 시트형 등록(PR F) — 맞는 줄만 저장하고, 틀린 줄은 넣은 글자 그대로 까닭과 함께 시트로 돌려준다. 목록으로 가지 않는다.
 * 줄은 칸 key → 글자의 JSON 하나(`rows`)로 온다. 칸 key 만 쓰므로 칸의 안내(공통코드 값)는 비워서 만든다.
 */
export async function saveItemSheetAction(_prev: SheetResult | null, form: FormData): Promise<SheetResult> {
  const payload = readSheetPayload(form.get("rows"), itemSheetColumns([]));
  if (!payload.ok) return { saved: [], rejected: [], formError: payload.formError };
  try {
    return await withDb((db) => createItemRows(db, payload.rows));
  } catch (error) {
    console.error(`품목 시트 등록 실패: ${describeFailure(error, "code-only")}`);
    return { saved: [], rejected: payload.rows.map((row) => ({ row, errors: {} })), formError: FAILED };
  }
}
