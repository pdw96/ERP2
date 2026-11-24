"use server";

import { redirect } from "next/navigation";
import { runMrp, saveMrpSettings } from "@/db/mrp";
import { withDb } from "@/db/request";
import { describeFailure } from "@/db/status";
import { MRP_PATH } from "./paths";

// MRP 의 입구 — [MRP 실행] · 완성일 기준 요일 저장(메뉴 「MRP」). 누구나 부를 수 있는 POST 라(데모는 로그인이 없다, ADR 0004) 화면을 믿지 않고
// src/db/mrp.ts 가 다시 본다. 실패 로그는 오류 코드만 남긴다 — 넣은 글자는 남기지 않는다.

export type MrpActionState = { ok: false; formError: string } | null;

/** 서고 돌아갈 주소 — 경로는 상수이고, 보던 탭은 품목별 MRP 표(view=grid)일 때만 싣는다. 끝에 결과. */
function backHref(form: FormData, done: [string, string]): string {
  const query = new URLSearchParams();
  if (form.get("view") === "grid") query.set("view", "grid");
  query.set(...done);
  return `${MRP_PATH}?${query}`;
}

/** 둘이 같은 꼴 — DB 에 맡기고, 예외는 코드만 로그에 남겨 「잠시 뒤 다시」를 돌려주고, 거절은 까닭 그대로, 서면 돌아간다. */
async function run<T extends { ok: true }>(
  verb: string,
  form: FormData,
  write: () => Promise<T | { ok: false; formError: string }>,
  done: (result: T) => [string, string],
): Promise<MrpActionState> {
  let result: T | { ok: false; formError: string };
  try {
    result = await write();
  } catch (error) {
    console.error(`MRP ${verb} 실패: ${describeFailure(error, "code-only")}`);
    return { ok: false, formError: `${verb}하지 못했습니다 — 잠시 뒤 다시 ${verb}하세요` };
  }
  if (!result.ok) return { ok: false, formError: result.formError };
  redirect(backHref(form, done(result)));
}

/** [MRP 실행] — 서면 낸 계획오더 수를 주소에 싣고 같은 탭을 다시 연다. */
export async function runMrpAction(_: unknown, form: FormData): Promise<MrpActionState> {
  return run(
    "실행",
    form,
    () => withDb((db) => runMrp(db)),
    (r) => ["ran", String(r.orders)],
  );
}

/** 완성일 기준 요일 저장 — 바뀌었으면 setting=saved, 같으면 setting=same. 값의 검사는 saveMrpSettings 가 한다. */
export async function saveMrpSettingAction(_: unknown, form: FormData): Promise<MrpActionState> {
  return run(
    "저장",
    form,
    () => withDb((db) => saveMrpSettings(db, form.get("dueWeekday"))),
    (r) => ["setting", r.changed ? "saved" : "same"],
  );
}
