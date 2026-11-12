"use server";

import { redirect } from "next/navigation";
import { deleteBom, saveBom, type BomSaveResult } from "@/db/boms";
import { withDb } from "@/db/request";
import { describeFailure } from "@/db/status";
import { bomValues } from "@/lib/bom-input";

// BOM 등록의 입구(조각 「BOM」 PR A) — 저장 · 지우기. 누구나 부를 수 있는 POST 라(데모는 로그인이 없다, ADR 0004) 화면을 믿지 않고
// src/db/boms.ts 가 같은 규칙으로 다시 본다. 실패 로그는 오류 코드만 남긴다 — 넣은 글자(비고 따위)는 남기지 않는다(설계 ②).

export type BomFormState = BomSaveResult | null;
export type BomDeleteState = { formError: string } | null;

export async function saveBomAction(_prev: BomFormState, form: FormData): Promise<BomFormState> {
  const values = bomValues(form);
  let result: BomSaveResult;
  try {
    result = await withDb((db) => saveBom(db, values));
  } catch (error) {
    console.error(`BOM 저장 실패: ${describeFailure(error, "code-only")}`);
    return {
      ok: false,
      errors: { header: {}, lines: {} },
      formError: "저장하지 못했습니다 — 잠시 뒤 다시 저장하세요",
      values,
    };
  }
  if (!result.ok) return result;
  redirect(`/production/bom/${result.code}?saved=1`);
}

export async function deleteBomAction(code: string, version: string): Promise<BomDeleteState> {
  if (typeof code !== "string" || typeof version !== "string") return { formError: "없는 BOM 입니다" };
  let result: Awaited<ReturnType<typeof deleteBom>>;
  try {
    result = await withDb((db) => deleteBom(db, code, version));
  } catch (error) {
    console.error(`BOM 지우기 실패: ${describeFailure(error, "code-only")}`);
    return { formError: "지우지 못했습니다 — 잠시 뒤 다시 누르세요" };
  }
  if (!result.ok)
    return { formError: "notFound" in result ? "없는 BOM 입니다 — 화면을 새로 여세요" : result.formError };
  redirect(`/production/bom?deleted=${result.code}`);
}
