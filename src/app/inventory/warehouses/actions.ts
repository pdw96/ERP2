"use server";

import { redirect } from "next/navigation";
import { withDb } from "@/db/request";
import { describeFailure } from "@/db/status";
import { createWarehouse, updateWarehouse, type WarehouseSaveResult } from "@/db/warehouses";
import { warehouseValues } from "@/lib/warehouse-input";

// 창고 등록 · 수정의 입구. 누구나 부를 수 있는 POST 라(데모는 로그인이 없다, ADR 0004) 화면을 믿지 않고
// src/db/warehouses.ts 가 같은 규칙으로 다시 본다. 실패 로그는 오류 코드만 남긴다 — 방문자가 넣은 글자는 남기지 않는다(대장 NC-6).

export type WarehouseFormState = Extract<WarehouseSaveResult, { ok: false }> | { ok: true } | null;

const FAILED = "저장하지 못했습니다 — 잠시 뒤 다시 저장하세요";

export async function createWarehouseAction(_prev: WarehouseFormState, form: FormData): Promise<WarehouseFormState> {
  const values = warehouseValues(form);
  let result: WarehouseSaveResult;
  try {
    result = await withDb((db) => createWarehouse(db, values));
  } catch (error) {
    console.error(`창고 등록 실패: ${describeFailure(error, "code-only")}`);
    return { ok: false, errors: {}, formError: FAILED, values };
  }
  if (!result.ok) return result;
  redirect(`/inventory/warehouses?saved=${result.code}`);
}

export async function updateWarehouseAction(
  code: string,
  _prev: WarehouseFormState,
  form: FormData,
): Promise<WarehouseFormState> {
  const values = warehouseValues(form);
  let result: Awaited<ReturnType<typeof updateWarehouse>>;
  try {
    result = await withDb((db) => updateWarehouse(db, code, values));
  } catch (error) {
    console.error(`창고 수정 실패: ${describeFailure(error, "code-only")}`);
    return { ok: false, errors: {}, formError: FAILED, values };
  }
  if (!result.ok) {
    if ("notFound" in result)
      return { ok: false, errors: {}, formError: "없는 창고입니다 — 목록에서 다시 고르세요", values };
    return result;
  }
  redirect(`/inventory/warehouses?saved=${result.code}`);
}
