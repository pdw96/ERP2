"use server";

import { redirect } from "next/navigation";
import {
  confirmSalesPlan,
  parseSalesPlanFilter,
  saveSalesPlan,
  unconfirmSalesPlan,
  type SalesPlanSaveResult,
} from "@/db/sales-plans";
import { withDb } from "@/db/request";
import { describeFailure } from "@/db/status";
import type { SalesPlanCellInput, SalesPlanConfirmInput } from "@/lib/sales-plan-input";
import { koreaToday } from "@/lib/today";
import { isMonday } from "@/lib/weeks";
import { CONFIRM_PATH, ENTRY_PATH, type Back, type PlanPath } from "./paths";

// 판매계획의 입구 — 저장(메뉴 「판매계획 등록」) · 확정 · 확정 취소(메뉴 「판매계획 확정」). 누구나 부를 수 있는 POST 라
// (데모는 로그인이 없다, ADR 0004) 화면을 믿지 않고 src/db/sales-plans.ts 가 같은 규칙으로 다시 본다. 실패 로그는 오류 코드만
// 남긴다 — 넣은 글자는 남기지 않는다.

export type SalesPlanActionState = SalesPlanSaveResult | null;

/** 서면 주소에 싣는 이름 — 저장 saved · 확정 confirmed · 확정 취소 unconfirmed. */
type Done = "saved" | "confirmed" | "unconfirmed";

/**
 * 서고 돌아갈 주소 — 경로는 동작마다 정한 상수(저장은 등록, 확정 · 확정 취소는 확정 메뉴)이고 back 에서 고르지 않는다.
 * 쪽(from) · 거르기 값은 꼴이 맞는 것만 싣는다(빈 값 · 틀린 값은 뺀다). 끝에 바꾼 칸 수.
 */
function backHref(path: PlanPath, back: unknown, done: Done, changed: number): string {
  const b = (typeof back === "object" && back !== null ? back : {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" ? v : undefined);
  const from = text(b.from);
  const filter = parseSalesPlanFilter({ customer: text(b.customer), item: text(b.item) });
  const query = new URLSearchParams();
  if (from && isMonday(from)) query.set("from", from);
  if (filter.customer) query.set("customer", filter.customer);
  if (filter.item) query.set("item", filter.item);
  query.set(done, String(changed));
  return `${path}?${query}`;
}

/** 셋이 같은 꼴 — DB 에 맡기고, 예외는 코드만 로그에 남겨 「잠시 뒤 다시」를 돌려주고, 거절은 까닭 그대로, 서면 돌아간다. */
async function run(
  verb: string,
  path: PlanPath,
  done: Done,
  back: unknown,
  write: (today: string) => Promise<SalesPlanSaveResult>,
): Promise<SalesPlanActionState> {
  let result: SalesPlanSaveResult;
  try {
    result = await write(koreaToday());
  } catch (error) {
    console.error(`판매계획 ${verb} 실패: ${describeFailure(error, "code-only")}`);
    return { ok: false, errors: {}, formError: `${verb}하지 못했습니다 — 잠시 뒤 다시 ${verb}하세요` };
  }
  if (!result.ok) return result;
  redirect(backHref(path, back, done, result.changed));
}

/** 바뀐 칸들의 저장 — 서면 바꾼 칸 수(바뀐 것이 없으면 0)를 주소에 싣고 「판매계획 등록」을 같은 쪽 · 같은 거르기로 다시 연다. */
export async function saveSalesPlanAction(cells: SalesPlanCellInput[], back: Back): Promise<SalesPlanActionState> {
  return run("저장", ENTRY_PATH, "saved", back, (today) => withDb((db) => saveSalesPlan(db, cells, today)));
}

/** 고른 칸들의 확정 — 서면 확정한 칸 수를 주소에 싣고 「판매계획 확정」을 같은 쪽 · 같은 거르기로 다시 연다. */
export async function confirmSalesPlanAction(
  cells: SalesPlanConfirmInput[],
  back: Back,
): Promise<SalesPlanActionState> {
  return run("확정", CONFIRM_PATH, "confirmed", back, (today) => withDb((db) => confirmSalesPlan(db, cells, today)));
}

/** 고른 칸들의 확정 취소 — 서면 확정 취소한 칸 수를 주소에 싣고 「판매계획 확정」을 같은 쪽 · 같은 거르기로 다시 연다. */
export async function unconfirmSalesPlanAction(
  cells: SalesPlanConfirmInput[],
  back: Back,
): Promise<SalesPlanActionState> {
  return run("확정 취소", CONFIRM_PATH, "unconfirmed", back, (today) =>
    withDb((db) => unconfirmSalesPlan(db, cells, today)),
  );
}
