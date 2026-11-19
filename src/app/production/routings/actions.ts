"use server";

import { redirect } from "next/navigation";
import { deleteRouting, saveRouting, type RoutingSaveResult } from "@/db/routings";
import { withDb } from "@/db/request";
import { describeFailure } from "@/db/status";
import { routingValues } from "@/lib/routing-input";

// 라우팅 등록의 입구(메뉴 「라우팅」) — 저장 · 지우기. 누구나 부를 수 있는 POST 라(데모는 로그인이 없다, ADR 0004) 화면을 믿지 않고
// src/db/routings.ts 가 같은 규칙으로 다시 본다. 실패 로그는 오류 코드만 남긴다 — 넣은 글자(비고 따위)는 남기지 않는다.

export type RoutingFormState = RoutingSaveResult | null;
export type RoutingDeleteState = { formError: string } | null;

/** 한 품목의 라우팅 저장 — 서면 남긴 이력 줄 수(바뀐 것이 없으면 0)를 주소에 싣고 다시 연다. */
export async function saveRoutingAction(_prev: RoutingFormState, form: FormData): Promise<RoutingFormState> {
  const values = routingValues(form);
  let result: RoutingSaveResult;
  try {
    result = await withDb((db) => saveRouting(db, values));
  } catch (error) {
    console.error(`라우팅 저장 실패: ${describeFailure(error, "code-only")}`);
    return {
      ok: false,
      errors: { steps: {}, materials: {} },
      formError: "저장하지 못했습니다 — 잠시 뒤 다시 저장하세요",
      values,
    };
  }
  if (!result.ok) return result;
  redirect(`/production/routings/${result.code}?saved=${result.changed}`);
}

export async function deleteRoutingAction(code: string, version: string): Promise<RoutingDeleteState> {
  if (typeof code !== "string" || typeof version !== "string") return { formError: "없는 라우팅입니다" };
  let result: Awaited<ReturnType<typeof deleteRouting>>;
  try {
    result = await withDb((db) => deleteRouting(db, code, version));
  } catch (error) {
    console.error(`라우팅 지우기 실패: ${describeFailure(error, "code-only")}`);
    return { formError: "지우지 못했습니다 — 잠시 뒤 다시 누르세요" };
  }
  if (!result.ok)
    return { formError: "notFound" in result ? "없는 라우팅입니다 — 화면을 새로 여세요" : result.formError };
  redirect(`/production/routings?deleted=${result.code}`);
}
