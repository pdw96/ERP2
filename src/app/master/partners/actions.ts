"use server";

import { redirect } from "next/navigation";
import {
  allCountries,
  createPartner,
  loadPartnersForSheet,
  parsePartnerFilter,
  savePartnerRows,
  updatePartner,
  type PartnerSaveResult,
} from "@/db/partners";
import { withDb } from "@/db/request";
import { describeFailure } from "@/db/status";
import { partnerValues } from "@/lib/partner-input";
import { readSheetPayload, type SheetLoad, type SheetResult } from "@/lib/sheet";
import { partnerSheetColumns } from "@/lib/sheet-columns";

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

/** 수정 — 화면을 연 때의 버전(`version`)을 함께 받는다. 그 사이 다른 사람이 고쳤으면 저장하지 않는다(PR J). */
export async function updatePartnerAction(
  code: string,
  _prev: PartnerFormState,
  form: FormData,
): Promise<PartnerFormState> {
  const values = partnerValues(form);
  const version = form.get("version");
  let result: Awaited<ReturnType<typeof updatePartner>>;
  try {
    result = await withDb((db) => updatePartner(db, code, values, typeof version === "string" ? version : ""));
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

/**
 * 시트형 등록 · 고침(PR F · J) — 맞는 줄만 저장하고, 틀린 줄은 넣은 글자 그대로 까닭과 함께 시트로 돌려준다. 목록으로 가지 않는다.
 * 줄은 칸 key → 글자의 JSON 하나(`rows`)로 온다. 칸 key 만 쓰므로 칸의 안내(공통코드 값)는 비워서 만든다.
 */
export async function savePartnerSheetAction(_prev: SheetResult | null, form: FormData): Promise<SheetResult> {
  const payload = readSheetPayload(form.get("rows"), partnerSheetColumns([]));
  if (!payload.ok) return { saved: [], rejected: [], formError: payload.formError };
  try {
    return await withDb((db) => savePartnerRows(db, payload.rows));
  } catch (error) {
    console.error(`거래처 시트 등록 실패: ${describeFailure(error, "code-only")}`);
    return { saved: [], rejected: payload.rows.map((row) => ({ row, errors: {} })), formError: FAILED };
  }
}

/**
 * 시트에 기존 거래처 불러오기(PR J) — 등록의 목록과 같은 찾기 · 거르기에 국가를 더해(주소의 이름과 같은 칸 이름) 코드 순 앞 100건.
 * 읽기만 한다. 없는 값은 거르지 않고 알린다(목록과 같다).
 */
export async function loadPartnerSheetAction(form: FormData): Promise<SheetLoad> {
  const params = Object.fromEntries(
    ["q", "role", "country", "inactive"].map((k) => {
      const v = form.get(k);
      return [k, typeof v === "string" ? v : undefined];
    }),
  );
  try {
    return await withDb(async (db) => {
      const { filter, notices } = parsePartnerFilter(params, await allCountries(db));
      const { rows, total } = await loadPartnersForSheet(db, filter);
      return { rows, total, notices: notices.map((n) => n.message) };
    });
  } catch (error) {
    console.error(`거래처 시트 불러오기 실패: ${describeFailure(error, "code-only")}`);
    return { rows: [], total: 0, notices: [], formError: "불러오지 못했습니다 — 잠시 뒤 다시 불러오세요" };
  }
}
