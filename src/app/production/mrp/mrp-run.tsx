"use client";

import { useActionState } from "react";
import { WEEKDAY_NAMES } from "@/lib/mrp-calc";
import { runMrpAction, saveMrpSettingAction, type MrpActionState } from "./actions";

// [MRP 실행]과 완성일 기준 요일(메뉴 「MRP」).
// - 실행은 MPS 를 BOM 으로 펼쳐 계획오더를 새로 내고 지난 결과를 갈아 끼운다. 서면 주소가 바뀌어 화면이 새로 열린다(알림은 페이지가 보인다).
// - 기준 요일은 MPS 의 주별 수량을 그 주의 어느 요일에 완성하는 것으로 잡을지다(회사 기준값, 처음 값 월). 바꾸면 다음 실행부터 적용한다.
// - 둘 다 보던 탭이 품목별 MRP 표면 view=grid 를 함께 보내 같은 탭으로 돌아온다. 거절 · 실패의 까닭은 그 폼 아래(role=alert)에 그대로 보인다.

const buttonClass =
  "rounded border border-machine bg-white px-5 py-2 font-semibold hover:bg-floor disabled:cursor-not-allowed disabled:opacity-50";

function Failure({ state }: { state: MrpActionState }) {
  if (!state) return null;
  return (
    <p role="alert" className="mt-2 max-w-3xl border-l-4 border-red-700 bg-white px-4 py-3 text-sm font-semibold">
      {state.formError}
    </p>
  );
}

export function MrpRun({
  lastRun,
  dueWeekday,
  grid,
}: {
  /** 마지막 실행 일시(한국 시각 「YYYY-MM-DD HH:mm」) — 실행한 적이 없으면 null. */
  lastRun: string | null;
  /** 지금의 완성일 기준 요일 — 1(월) ~ 7(일). */
  dueWeekday: number;
  /** 보던 탭이 품목별 MRP 표인가. */
  grid: boolean;
}) {
  const [ran, runAction, running] = useActionState<MrpActionState, FormData>(runMrpAction, null);
  const [saved, saveAction, saving] = useActionState<MrpActionState, FormData>(saveMrpSettingAction, null);
  const view = grid && <input type="hidden" name="view" value="grid" />;

  return (
    <div className="mt-6 grid max-w-3xl gap-4 border-y border-rule bg-white px-4 py-4">
      <form action={runAction}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className={lastRun ? "tabular-nums" : "font-semibold"}>
            {lastRun ? `마지막 실행 ${lastRun}` : "아직 MRP 를 실행하지 않았습니다 — [MRP 실행]을 누르세요"}
          </p>
          {view}
          <button
            type="submit"
            disabled={running}
            className="rounded bg-machine px-6 py-2.5 font-semibold text-white hover:bg-machine-deep disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? "실행 중…" : "MRP 실행"}
          </button>
        </div>
        <Failure state={ran} />
      </form>
      <form action={saveAction} className="border-t border-rule pt-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <label htmlFor="mrp-due-weekday" className="font-semibold">
            완성일 기준 요일
          </label>
          <select
            id="mrp-due-weekday"
            name="dueWeekday"
            defaultValue={String(dueWeekday)}
            className="rounded border border-rule px-3 py-2 text-base"
          >
            {WEEKDAY_NAMES.map((name, i) => (
              <option key={name} value={String(i + 1)}>
                {name}
              </option>
            ))}
          </select>
          {view}
          <button type="submit" disabled={saving} className={buttonClass}>
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
        <p className="mt-1 text-sm text-muted">
          MPS 의 주별 수량을 그 주의 이 요일에 완성하는 것으로 잡습니다. 바꾸면 다음 실행부터 적용합니다.
        </p>
        <Failure state={saved} />
      </form>
    </div>
  );
}
