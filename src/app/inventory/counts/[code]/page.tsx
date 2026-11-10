import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { withDb } from "@/db/request";
import { getCount } from "@/db/stock-counts";
import { stockStatusName } from "@/lib/count-input";
import { StatusTag } from "../count-list";

export const metadata: Metadata = { title: "재고 실사 — ERP2" };

// 재고 › 수불관리 › 재고 실사 › 실사 하나 — 줄마다 장부 · 실물 · 차이. 확정한 실사는 확정 때의 장부를, 작성 중은 지금의 장부를 보인다.
// 작성 중이면 입력 화면으로 이어 넣는 링크, 확정했으면 조정 전표로 가는 링크가 있다.
export default function CountPage({ params, searchParams }: PageProps<"/inventory/counts/[code]">) {
  return (
    <section className="max-w-5xl">
      <Suspense
        fallback={
          <>
            <Trail />
            <p className="mt-8 text-muted">불러오는 중입니다.</p>
          </>
        }
      >
        <Count params={params} searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

function Trail() {
  return (
    <p className="text-sm text-muted">
      <Link href="/inventory" className="underline-offset-4 hover:underline">
        재고
      </Link>{" "}
      › 수불관리 ›{" "}
      <Link href="/inventory/counts" className="underline-offset-4 hover:underline">
        재고 실사
      </Link>
    </p>
  );
}

async function Count({ params, searchParams }: Pick<PageProps<"/inventory/counts/[code]">, "params" | "searchParams">) {
  const { code } = await params;
  const { confirmed, canceled } = await searchParams;
  await connection();
  let count;
  try {
    count = await withDb((db) => getCount(db, decodeURIComponent(code)));
  } catch (error) {
    return <LoadFailed what="재고 실사" error={error} />;
  }
  if (!count) notFound();
  const isDraft = count.status === "DRAFT";
  const isConfirmed = count.status === "CONFIRMED";
  return (
    <>
      <Trail />
      {confirmed === "1" && isConfirmed && (
        <div role="status" className="mt-4 border-l-4 border-safety bg-white px-5 py-3">
          <p>
            <span className="font-mono font-semibold">{count.code}</span> 를 확정했습니다 —{" "}
            {count.moveCode ? (
              <>
                차이를 조정 전표{" "}
                <Link href={`/inventory/moves/${count.moveCode}`} className="font-mono underline underline-offset-4">
                  {count.moveCode}
                </Link>{" "}
                로 재고에 반영했습니다.
              </>
            ) : (
              "장부와 실물이 같아 조정 전표는 없습니다."
            )}
          </p>
        </div>
      )}
      {canceled === "1" && count.status === "CANCELED" && (
        <div role="status" className="mt-4 border-l-4 border-safety bg-white px-5 py-3">
          <p>
            <span className="font-mono font-semibold">{count.code}</span> 를 취소했습니다 — 재고는 바뀌지 않았습니다. 이
            창고에 새 실사를 열 수 있습니다.
          </p>
        </div>
      )}
      <h1 className="mt-3 text-3xl leading-tight font-semibold">
        <span className="font-mono">{count.code}</span>
      </h1>
      <dl className="mt-3 grid max-w-3xl gap-x-6 gap-y-1 sm:grid-cols-[8rem_1fr]">
        <dt className="text-muted">창고</dt>
        <dd>{count.warehouse}</dd>
        <dt className="text-muted">상태</dt>
        <dd>
          <StatusTag status={count.status} name={count.statusName} />
        </dd>
        <dt className="text-muted">처음 저장</dt>
        <dd className="font-mono">{count.countDate}</dd>
        {isConfirmed && (
          <>
            <dt className="text-muted">확정일자</dt>
            <dd className="font-mono">{count.confirmedDate}</dd>
            <dt className="text-muted">조정 전표</dt>
            <dd>
              {count.moveCode ? (
                <>
                  <Link href={`/inventory/moves/${count.moveCode}`} className="font-mono underline underline-offset-4">
                    {count.moveCode}
                  </Link>{" "}
                  <span className="text-sm text-muted">조정사유 실사 차이</span>
                </>
              ) : (
                <span className="text-muted">없음 — 장부와 실물이 같았습니다</span>
              )}
            </dd>
          </>
        )}
      </dl>
      <p className="mt-3 max-w-3xl text-sm text-muted">
        {isConfirmed
          ? "장부는 확정하는 순간의 장부입니다. 확정한 실사는 고치지 못합니다 — 바로잡으려면 그 조정 전표를 취소합니다."
          : isDraft
            ? "작성 중입니다 — 장부는 지금의 장부이고, 확정은 확정하는 순간의 장부와 견줍니다."
            : "취소한 실사입니다 — 재고는 바뀌지 않았습니다."}
      </p>

      <div className="relative mt-6 overflow-x-auto">
        <table className="w-full min-w-[48rem] border-collapse bg-white text-left">
          <caption className="sr-only">실사 줄</caption>
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
                상태
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                장부
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                실물
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                차이
              </th>
            </tr>
          </thead>
          <tbody>
            {count.lineRows.map((l) => (
              <tr key={l.lineNo} className="border-b border-rule align-top">
                <td className="px-3 py-2.5 text-right font-mono text-sm text-muted">{l.lineNo}</td>
                <td className="px-3 py-2.5">
                  <span className="font-mono text-sm">{l.itemCode}</span> {l.itemName}
                  {l.added && <span className="ml-2 rounded border border-rule px-1.5 py-0.5 text-xs">더한 줄</span>}
                </td>
                <td className="px-3 py-2.5 font-mono text-sm">{l.lot || "—"}</td>
                <td className="px-3 py-2.5 text-sm whitespace-nowrap">{stockStatusName(l.status)}</td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">{l.book ?? "—"}</td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
                  {l.counted ?? <span className="text-muted">비움</span>}{" "}
                  <span className="text-xs text-muted">{l.unit}</span>
                </td>
                <td
                  className={`px-3 py-2.5 text-right whitespace-nowrap tabular-nums ${l.diff ? "font-semibold" : "text-muted"}`}
                >
                  {l.diff ?? (l.book !== null && l.counted !== null ? "0" : "")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
        {isDraft && (
          <Link
            href={`/inventory/counts?warehouse=${count.warehouseCode}`}
            className="font-semibold underline underline-offset-4 hover:text-machine"
          >
            입력 화면에서 이어 넣기
          </Link>
        )}
        <Link href="/inventory/counts" className="text-muted underline underline-offset-4 hover:text-ink">
          재고 실사로
        </Link>
      </p>
    </>
  );
}
