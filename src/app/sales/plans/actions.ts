"use server";

import { redirect } from "next/navigation";
import { parseSalesPlanFilter, saveSalesPlan, type SalesPlanSaveResult } from "@/db/sales-plans";
import { withDb } from "@/db/request";
import { describeFailure } from "@/db/status";
import type { SalesPlanCellInput } from "@/lib/sales-plan-input";
import { koreaToday } from "@/lib/today";
import { isMonday } from "@/lib/weeks";

// 판매계획의 입구(메뉴 「판매계획」) — 저장. 누구나 부를 수 있는 POST 라(데모는 로그인이 없다, ADR 0004) 화면을 믿지 않고
// src/db/sales-plans.ts 가 같은 규칙으로 다시 본다. 실패 로그는 오류 코드만 남긴다 — 넣은 글자는 남기지 않는다.

export type SalesPlanActionState = SalesPlanSaveResult | null;

/** 저장 뒤 돌아갈 주소 — 쪽(from) · 거르기 값은 꼴이 맞는 것만 싣는다(빈 값 · 틀린 값은 뺀다). */
function backHref(back: unknown, changed: number): string {
  const b = (typeof back === "object" && back !== null ? back : {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" ? v : undefined);
  const from = text(b.from);
  const filter = parseSalesPlanFilter({ customer: text(b.customer), item: text(b.item) });
  const query = new URLSearchParams();
  if (from && isMonday(from)) query.set("from", from);
  if (filter.customer) query.set("customer", filter.customer);
  if (filter.item) query.set("item", filter.item);
  query.set("saved", String(changed));
  return `/sales/plans?${query}`;
}

/** 바뀐 칸들의 저장 — 서면 바꾼 칸 수(바뀐 것이 없으면 0)를 주소에 싣고 같은 쪽 · 같은 거르기로 다시 연다. */
export async function saveSalesPlanAction(
  cells: SalesPlanCellInput[],
  back: { from: string; customer: string; item: string },
): Promise<SalesPlanActionState> {
  let result: SalesPlanSaveResult;
  try {
    result = await withDb((db) => saveSalesPlan(db, cells, koreaToday()));
  } catch (error) {
    console.error(`판매계획 저장 실패: ${describeFailure(error, "code-only")}`);
    return { ok: false, errors: {}, formError: "저장하지 못했습니다 — 잠시 뒤 다시 저장하세요" };
  }
  if (!result.ok) return result;
  redirect(backHref(back, result.changed));
}
