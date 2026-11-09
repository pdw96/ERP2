"use client";

import { useActionState, useState } from "react";
import { cancelMoveAction, type CancelState } from "./actions";

// 전표의 「취소」(성공 기준 5) — 한 번 더 묻고 보낸다. 취소하면 반대 수량의 전표가 새 번호로 생기고 원래 전표에 「취소됨」이 붙는다.
export function CancelMove({ code }: { code: string }) {
  const [state, action, pending] = useActionState<CancelState, FormData>(() => cancelMoveAction(code), null);
  const [asking, setAsking] = useState(false);
  return (
    <section className="mt-8 max-w-3xl border-t-2 border-machine pt-4">
      <h2 className="text-lg font-semibold">취소</h2>
      <p className="text-sm text-muted">
        저장한 전표는 고치거나 지우지 않습니다. 취소하면 반대 수량의 전표가 오늘 날짜의 새 번호로 생기고, 이 전표에
        「취소됨」이 붙습니다. 이미 나간 재고가 있어 0 밑으로 가면 취소도 막습니다.
      </p>
      {state?.formError && (
        <p role="alert" className="mt-3 border-l-4 border-red-700 bg-white px-4 py-3 text-sm font-semibold">
          취소하지 않았습니다 — {state.formError}
        </p>
      )}
      {asking ? (
        <form action={action} className="mt-3 flex flex-wrap items-center gap-3">
          <span>
            <span className="font-mono">{code}</span> 를 취소할까요?
          </span>
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-red-700 px-5 py-2 font-semibold text-white hover:bg-red-800 disabled:opacity-60"
          >
            {pending ? "취소 중…" : "취소 전표 만들기"}
          </button>
          <button
            type="button"
            onClick={() => setAsking(false)}
            className="px-3 py-2 text-muted underline underline-offset-4"
          >
            그만두기
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAsking(true)}
          className="mt-3 rounded border border-red-700 bg-white px-5 py-2 font-semibold text-red-700 hover:bg-red-50"
        >
          이 전표 취소
        </button>
      )}
    </section>
  );
}
