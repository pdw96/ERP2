import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { withDb } from "@/db/request";
import { getMove } from "@/db/stock";
import { CancelMove } from "../cancel-move";
import { Tag } from "../move-list";

export const metadata: Metadata = { title: "수불 전표 — ERP2" };

// 재고 › 수불관리 › 수불 등록 › 전표 하나 — 줄과 「취소」. 주소는 전표 번호다.
export default function MovePage({ params, searchParams }: PageProps<"/inventory/moves/[code]">) {
  return (
    <section className="max-w-5xl">
      <p className="text-sm text-muted">
        <Link href="/inventory" className="underline-offset-4 hover:underline">
          재고
        </Link>{" "}
        › 수불관리 ›{" "}
        <Link href="/inventory/moves" className="underline-offset-4 hover:underline">
          수불 등록
        </Link>{" "}
        › 전표
      </p>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <Move params={params} searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function Move({ params, searchParams }: Pick<PageProps<"/inventory/moves/[code]">, "params" | "searchParams">) {
  const { code } = await params;
  const { saved } = await searchParams;
  await connection();
  let move;
  try {
    move = await withDb((db) => getMove(db, decodeURIComponent(code)));
  } catch (error) {
    return <LoadFailed what="수불 전표" error={error} />;
  }
  if (!move) notFound();
  const isXfer = move.lineRows.some((l) => l.from && l.to);
  return (
    <>
      {saved === "1" && (
        <div role="status" className="mt-4 border-l-4 border-safety bg-white px-5 py-3">
          <p>
            <span className="font-mono font-semibold">{move.code}</span> 를 저장했습니다 — 재고에 반영했습니다.
          </p>
        </div>
      )}
      <h1 className="mt-3 text-3xl leading-tight font-semibold">
        <span className="font-mono">{move.code}</span>
      </h1>
      <dl className="mt-3 grid max-w-3xl gap-x-6 gap-y-1 sm:grid-cols-[8rem_1fr]">
        <dt className="text-muted">수불일자</dt>
        <dd className="font-mono">{move.moveDate}</dd>
        <dt className="text-muted">수불구분</dt>
        <dd>
          {move.moveTypeName}
          {move.reasonName && ` — 조정사유 ${move.reasonName}`}
          {move.canceledBy && <Tag>취소됨</Tag>}
          {move.cancels && <Tag>취소 전표</Tag>}
        </dd>
        {move.note && (
          <>
            <dt className="text-muted">비고</dt>
            <dd className="wrap-anywhere">{move.note}</dd>
          </>
        )}
        {move.cancels && (
          <>
            <dt className="text-muted">취소한 전표</dt>
            <dd>
              <Link href={`/inventory/moves/${move.cancels}`} className="font-mono underline underline-offset-4">
                {move.cancels}
              </Link>
            </dd>
          </>
        )}
        {move.canceledBy && (
          <>
            <dt className="text-muted">취소 전표</dt>
            <dd>
              <Link href={`/inventory/moves/${move.canceledBy}`} className="font-mono underline underline-offset-4">
                {move.canceledBy}
              </Link>
            </dd>
          </>
        )}
      </dl>

      <div className="relative mt-6 overflow-x-auto">
        <table className="w-full min-w-[44rem] border-collapse bg-white text-left">
          <caption className="sr-only">전표의 줄</caption>
          <thead className="border-b-2 border-machine text-sm">
            <tr>
              <th scope="col" className="w-10 px-3 py-2 text-right">
                #
              </th>
              <th scope="col" className="px-3 py-2">
                품목
              </th>
              <th scope="col" className="px-3 py-2">
                LOT번호
              </th>
              <th scope="col" className="px-3 py-2">
                {isXfer ? "출고창고 → 입고창고" : "창고"}
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                수량
              </th>
            </tr>
          </thead>
          <tbody>
            {move.lineRows.map((l) => (
              <tr key={l.lineNo} className="border-b border-rule align-top">
                <td className="px-3 py-2.5 text-right font-mono text-sm text-muted">{l.lineNo}</td>
                <td className="px-3 py-2.5">
                  <span className="font-mono text-sm">{l.itemCode}</span> {l.itemName}
                </td>
                <td className="px-3 py-2.5 font-mono text-sm">{l.lot || "—"}</td>
                <td className="px-3 py-2.5 text-sm">
                  {l.from && l.to ? `${l.from} → ${l.to}` : l.to ? `→ ${l.to} (듦)` : `${l.from} → (나감)`}
                </td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  {l.qty} {l.unit}
                  {l.entered && <span className="block text-xs text-muted">넣은 값 {l.entered}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!move.canceledBy && !move.cancels && <CancelMove code={move.code} />}
      <p className="mt-8">
        <Link href="/inventory/moves" className="text-muted underline underline-offset-4 hover:text-ink">
          최근 전표로
        </Link>
      </p>
    </>
  );
}
