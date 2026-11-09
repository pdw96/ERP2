"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { MoveFormOptions } from "@/db/stock";
import type { MoveType } from "@/lib/master-codes";
import { saveMoveAction, type MoveFormState } from "./actions";
import { MoveForm } from "./move-form";

// 등록 메뉴의 입력 — 저장되면 같은 화면에 남아, 맨 위에 저장한 전표번호(전표 보기로 가는 링크)를 보이고 입력을 비워 다음 전표를 받는다
// (설계 「2026-11-09 — PR F 를 열기 전에 정한 것」의 메뉴의 첫 화면). 거절되면 넣은 값과 까닭이 그대로 남는다.
export function MoveEntry({
  options,
  today,
  moveType,
}: {
  options: MoveFormOptions;
  today: string;
  moveType: MoveType;
}) {
  const [state, formAction, pending] = useActionState<MoveFormState, FormData>(saveMoveAction, null);
  // 저장된 횟수 — 입력의 key 라 저장될 때마다 입력이 처음 모양으로 다시 그려진다(받은 결과가 바뀔 때 한 번).
  const [saves, setSaves] = useState(0);
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state?.ok) setSaves((n) => n + 1);
  }
  const saved = state?.ok ? state.code : null;

  return (
    <>
      {saved && (
        <div role="status" className="mt-6 max-w-3xl border-l-4 border-safety bg-white px-5 py-3">
          <p>
            <Link href={`/inventory/moves/${saved}`} className="font-mono font-semibold underline underline-offset-4">
              {saved}
            </Link>{" "}
            를 저장했습니다 — 재고에 반영했습니다. 다음 전표를 넣으세요.
          </p>
        </div>
      )}
      <MoveForm
        key={saves}
        options={options}
        today={today}
        moveType={moveType}
        state={state}
        formAction={formAction}
        pending={pending}
      />
    </>
  );
}
