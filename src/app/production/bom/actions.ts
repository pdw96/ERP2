"use server";

import { redirect } from "next/navigation";
import { deleteBom, openSubBom, saveBoms, type BomTreeSaveResult, type SubBom } from "@/db/boms";
import { withDb } from "@/db/request";
import { describeFailure } from "@/db/status";
import { bomTreeValues, ITEM_CODE } from "@/lib/bom-input";

// BOM 등록의 입구(조각 「BOM」 PR A · C) — 저장(맨 위 BOM 과 펼친 반제품 BOM 들) · 지우기 · 펼칠 반제품의 BOM 읽기. 누구나 부를 수 있는 POST 라
// (데모는 로그인이 없다, ADR 0004) 화면을 믿지 않고 src/db/boms.ts 가 같은 규칙으로 다시 본다. 실패 로그는 오류 코드만 남긴다 — 넣은 글자(비고 따위)는
// 남기지 않는다(설계 ②).

export type BomFormState = BomTreeSaveResult | null;
export type BomDeleteState = { formError: string } | null;

/** 한 BOM 화면의 저장 — 맨 위 BOM 과 펼친 반제품 BOM 들을 한 번에(ADR 0028 의 1). 서면 바뀐 BOM 수를 주소에 싣고 다시 연다. */
export async function saveBomTreeAction(_prev: BomFormState, form: FormData): Promise<BomFormState> {
  const values = bomTreeValues(form);
  let result: BomTreeSaveResult;
  try {
    result = await withDb((db) => saveBoms(db, values));
  } catch (error) {
    console.error(`BOM 저장 실패: ${describeFailure(error, "code-only")}`);
    return {
      ok: false,
      errors: { header: {}, lines: {} },
      formError: "저장하지 못했습니다 — 잠시 뒤 다시 저장하세요",
      subs: {},
      values,
    };
  }
  if (!result.ok) return result;
  redirect(`/production/bom/${result.code}?saved=${result.changed.length}`);
}

/** 펼칠 반제품의 BOM 을 읽는다 — DB 에 쓰지 않는다. */
export async function openSubBomAction(
  code: string,
): Promise<{ ok: true; sub: SubBom } | { ok: false; message: string }> {
  if (typeof code !== "string" || !ITEM_CODE.test(code)) return { ok: false, message: "없는 품목입니다" };
  try {
    return await withDb((db) => openSubBom(db, code));
  } catch (error) {
    console.error(`반제품 BOM 읽기 실패: ${describeFailure(error, "code-only")}`);
    return { ok: false, message: "불러오지 못했습니다 — 잠시 뒤 다시 누르세요" };
  }
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
