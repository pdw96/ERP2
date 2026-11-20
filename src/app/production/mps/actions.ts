"use server";

import { redirect } from "next/navigation";
import { confirmMps, saveMps, unconfirmMps, type MpsResult } from "@/db/mps";
import { withDb } from "@/db/request";
import { describeFailure } from "@/db/status";
import type { MpsCellInput, MpsConfirmInput } from "@/lib/mps-input";
import { koreaToday } from "@/lib/today";
import { isMonday } from "@/lib/weeks";
import { MPS_PATH, type MpsBack } from "./paths";

// MPS 의 입구 — 저장 · 확정 · 확정 취소(메뉴 「MPS」). 누구나 부를 수 있는 POST 라(데모는 로그인이 없다, ADR 0004) 화면을 믿지 않고
// src/db/mps.ts 가 같은 규칙으로 다시 본다. 실패 로그는 오류 코드만 남긴다 — 넣은 글자는 남기지 않는다.

export type MpsActionState = MpsResult | null;

/** 서면 주소에 싣는 이름 — 저장 saved · 확정 confirmed · 확정 취소 unconfirmed. */
type Done = "saved" | "confirmed" | "unconfirmed";

/** 서고 돌아갈 주소 — 경로는 상수이고 back 에서 고르지 않는다. 쪽(from)은 월요일일 때만 싣는다. 끝에 바꾼 칸 수. */
function backHref(back: unknown, done: Done, changed: number): string {
  const from = typeof back === "object" && back !== null ? (back as Record<string, unknown>).from : undefined;
  const query = new URLSearchParams();
  if (typeof from === "string" && isMonday(from)) query.set("from", from);
  query.set(done, String(changed));
  return `${MPS_PATH}?${query}`;
}

/** 셋이 같은 꼴 — DB 에 맡기고, 예외는 코드만 로그에 남겨 「잠시 뒤 다시」를 돌려주고, 거절은 까닭 그대로, 서면 돌아간다. */
async function run(
  verb: string,
  done: Done,
  back: unknown,
  write: (today: string) => Promise<MpsResult>,
): Promise<MpsActionState> {
  let result: MpsResult;
  try {
    result = await write(koreaToday());
  } catch (error) {
    console.error(`MPS ${verb} 실패: ${describeFailure(error, "code-only")}`);
    return { ok: false, errors: {}, formError: `${verb}하지 못했습니다 — 잠시 뒤 다시 ${verb}하세요` };
  }
  if (!result.ok) return result;
  redirect(backHref(back, done, result.changed));
}

/** 바뀐 칸들의 저장(수량을 치면 고정, 비우면 고정 풀기) — 서면 바꾼 칸 수를 주소에 싣고 같은 쪽을 다시 연다. */
export async function saveMpsAction(cells: MpsCellInput[], back: MpsBack): Promise<MpsActionState> {
  return run("저장", "saved", back, (today) => withDb((db) => saveMps(db, cells, today)));
}

/** 고른 품목의 안을 그대로 고정 — 서면 고정한 칸 수를 주소에 싣고 같은 쪽을 다시 연다. */
export async function confirmMpsAction(cells: MpsConfirmInput[], back: MpsBack): Promise<MpsActionState> {
  return run("확정", "confirmed", back, (today) => withDb((db) => confirmMps(db, cells, today)));
}

/** 고른 품목의 고정을 풀어 안으로 — 서면 푼 칸 수를 주소에 싣고 같은 쪽을 다시 연다. */
export async function unconfirmMpsAction(cells: MpsConfirmInput[], back: MpsBack): Promise<MpsActionState> {
  return run("확정 취소", "unconfirmed", back, (today) => withDb((db) => unconfirmMps(db, cells, today)));
}
