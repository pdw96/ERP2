"use client";

import Link from "next/link";
import { startTransition, useActionState } from "react";
import type { ConfirmPreview } from "@/db/stock-counts";
import { stockStatusName } from "@/lib/count-input";
import { confirmCountAction, type CountActionState } from "./actions";

// 확정의 두 걸음(설계 「2026-11-09 — PR E 를 열기 전에 정한 것」) — 저장한 실사를 지금의 장부로 다시 센 차이 줄과 경고(연 뒤의 수불 · 줄 밖의 재고)를
// 보이고, 거기서 한 번 더 「확정」해야 조정 전표가 생긴다. 실물 수량을 비운 줄이 있으면 확정 단추가 없다(저자 판정).
export function ConfirmPanel({
  preview,
  previewError,
  onBack,
}: {
  preview?: ConfirmPreview;
  previewError?: string;
  onBack: () => void;
}) {
  const [state, action, pending] = useActionState<CountActionState, FormData>(
    () => (preview ? confirmCountAction(preview.code, preview.version) : Promise.resolve(null)),
    null,
  );
  const back = (
    <button
      type="button"
      onClick={onBack}
      className="rounded border border-machine bg-white px-5 py-2.5 font-semibold hover:bg-floor"
    >
      돌아가 고치기
    </button>
  );
  if (!preview)
    return (
      <section className="mt-6 max-w-3xl border-l-4 border-red-700 bg-white px-5 py-4">
        <p role="alert" className="font-semibold">
          {previewError}
        </p>
        <div className="mt-3">{back}</div>
      </section>
    );

  const warned = preview.movesAfter.length > 0 || preview.outside.length > 0;
  return (
    <section className="mt-6 max-w-5xl border-t-4 border-machine bg-white px-5 py-5" aria-labelledby="confirm-title">
      <h2 id="confirm-title" className="text-xl font-semibold">
        <span className="font-mono">{preview.code}</span> 확정 — {preview.warehouse.code} {preview.warehouse.name}
      </h2>
      <p className="mt-1 text-sm text-muted">
        작성 중으로 저장했습니다. 아래는 지금의 장부와 견준 차이입니다 — 확정하면 차이가 있는 줄이 조정사유 「실사
        차이」의 조정 전표 한 장(오늘 날짜)이 되고, 그 줄의 재고가 실물 수량이 됩니다. 확정한 실사는 고치지 못합니다 —
        바로잡으려면 그 조정 전표를 취소합니다.
      </p>

      {preview.blanks.length > 0 && (
        <div role="alert" className="mt-4 border-l-4 border-red-700 bg-floor px-4 py-3">
          <p className="font-semibold">
            실물 수량을 비운 줄이 {preview.blanks.length}개 있어 확정할 수 없습니다 — 0 을 포함해 모든 줄을 넣으세요.
          </p>
          <ul className="mt-1 list-inside list-disc text-sm">
            {preview.blanks.map((b) => (
              <li key={b.lineNo}>
                줄 {b.lineNo} — <span className="font-mono">{b.itemCode}</span> {b.itemName}
                {b.lot && <span className="font-mono"> · {b.lot}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {warned && (
        <div className="mt-4 border-l-4 border-safety bg-floor px-4 py-3">
          <p className="font-semibold">확인하세요</p>
          {preview.movesAfter.length > 0 && (
            <p className="mt-1 text-sm">
              실사를 연 뒤 이 창고에 수불이 {preview.movesAfter.length}건 있었습니다 — 실물을 센 때와 지금의 장부가 다를
              수 있습니다:{" "}
              {preview.movesAfter.map((code, i) => (
                <span key={code}>
                  {i > 0 && ", "}
                  <Link href={`/inventory/moves/${code}`} className="font-mono underline underline-offset-4">
                    {code}
                  </Link>
                </span>
              ))}
            </p>
          )}
          {preview.outside.length > 0 && (
            <>
              <p className="mt-1 text-sm">
                실사 줄에 없는 이 창고의 재고 {preview.outside.length}줄 — 확정해도 손대지 않습니다:
              </p>
              <ul className="mt-1 list-inside list-disc text-sm">
                {preview.outside.map((o) => (
                  <li key={`${o.itemCode}|${o.lot}|${o.status}`}>
                    <span className="font-mono">{o.itemCode}</span> {o.itemName}
                    {o.lot && <span className="font-mono"> · {o.lot}</span>} · {stockStatusName(o.status)} {o.qty}{" "}
                    {o.unit}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <h3 className="mt-5 font-semibold">차이 {preview.diffs.length}줄</h3>
      {preview.diffs.length === 0 ? (
        <p className="mt-1 text-sm text-muted">장부와 실물이 모두 같습니다 — 확정하면 전표 없이 확정만 됩니다.</p>
      ) : (
        <div className="relative mt-2 overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
            <caption className="sr-only">확정하면 생기는 조정</caption>
            <thead className="border-b-2 border-machine">
              <tr>
                <th scope="col" className="w-10 px-2 py-2 text-right">
                  #
                </th>
                <th scope="col" className="px-2 py-2">
                  품목
                </th>
                <th scope="col" className="px-2 py-2">
                  LOT번호
                </th>
                <th scope="col" className="px-2 py-2 text-right">
                  장부
                </th>
                <th scope="col" className="px-2 py-2 text-right">
                  실물
                </th>
                <th scope="col" className="px-2 py-2 text-right">
                  차이(조정)
                </th>
              </tr>
            </thead>
            <tbody>
              {preview.diffs.map((d) => (
                <tr key={d.lineNo} className="border-b border-rule">
                  <td className="px-2 py-2 text-right font-mono text-muted">{d.lineNo}</td>
                  <td className="px-2 py-2">
                    <span className="font-mono">{d.itemCode}</span> {d.itemName}
                    {d.status === "QC" && <span className="ml-1 text-xs text-muted">(검사대기)</span>}
                  </td>
                  <td className="px-2 py-2 font-mono">{d.lot || "—"}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{d.book}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{d.counted}</td>
                  <td className="px-2 py-2 text-right font-semibold whitespace-nowrap tabular-nums">
                    {d.diff} {d.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {state?.formError && (
        <p role="alert" className="mt-4 border-l-4 border-red-700 bg-white px-4 py-3 text-sm font-semibold">
          확정하지 않았습니다 — {state.formError}
        </p>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {preview.blanks.length === 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => action(new FormData()))}
            className="rounded bg-machine px-6 py-2.5 font-semibold text-white hover:bg-machine-deep disabled:opacity-60"
          >
            {pending ? "확정 중…" : preview.diffs.length ? `확정 — 조정 전표 만들기` : "확정"}
          </button>
        )}
        {back}
      </div>
    </section>
  );
}
