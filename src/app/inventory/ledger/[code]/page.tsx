import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { CodeSelect, Notices, Pager, PeriodFields } from "@/components/sort-pager";
import { withDb } from "@/db/request";
import { getLedgerDetail, historyOptions } from "@/db/stock-history";
import { ITEM_CODE, basisOf, parseLedgerDetailQuery, queryString } from "@/lib/stock-query";
import { koreaToday } from "@/lib/today";

export const metadata: Metadata = { title: "수불부 — 품목의 거래 — ERP2" };

// 재고 › 수불관리 › 수불부 › 품목 하나 — 그 기간의 거래를 일자 차례로, 잔량은 기초에서 시작해 기말에서 끝난다(저자 판정).
// 잔량이 쌓이는 표라 늘 오래된 것부터이고 칸 머리로 세우지 않는다. 창고를 고르지 않으면 이동은 빠진다.
export default function LedgerDetailPage({ params, searchParams }: PageProps<"/inventory/ledger/[code]">) {
  return (
    <section>
      <p className="text-sm text-muted">
        <Link href="/inventory" className="underline-offset-4 hover:underline">
          재고
        </Link>{" "}
        › 수불관리 ›{" "}
        <Link href="/inventory/ledger" className="underline-offset-4 hover:underline">
          수불부
        </Link>{" "}
        › 품목의 거래
      </p>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <Detail params={params} searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function Detail({
  params,
  searchParams,
}: Pick<PageProps<"/inventory/ledger/[code]">, "params" | "searchParams">) {
  const code = decodeURIComponent((await params).code);
  const sp = await searchParams;
  await connection();
  if (!ITEM_CODE.test(code)) notFound();
  const { query, notices } = parseLedgerDetailQuery(sp, koreaToday());
  const pageNo = Number(Array.isArray(sp.page) ? sp.page[0] : sp.page);
  let data;
  try {
    data = await withDb(async (db) => ({
      options: await historyOptions(db),
      detail: await getLedgerDetail(db, code, {
        ...query,
        page: Number.isInteger(pageNo) && pageNo >= 1 ? pageNo : 1,
      }),
    }));
  } catch (error) {
    return <LoadFailed error={error} what="수불부" />;
  }
  const d = data.detail;
  if (!d) notFound();
  const path = `/inventory/ledger/${d.item.code}`;
  const keep = { from: query.from, to: query.to, wh: query.warehouse };
  const num = "px-3 py-2 text-right whitespace-nowrap tabular-nums";
  return (
    <>
      <h1 className="mt-1 text-3xl leading-tight font-semibold">
        <span className="font-mono">{d.item.code}</span> {d.item.name}
      </h1>
      <p className="mt-1 text-muted">
        {query.from} ~ {query.to} · {basisOf(query.warehouse, data.options.warehouses)} · 단위 {d.item.unit}
      </p>
      <Form
        key={JSON.stringify(keep)}
        action={path}
        replace
        role="search"
        aria-label="기간 · 창고"
        className="mt-4 grid max-w-3xl gap-3 border-y border-rule bg-white px-4 py-4 sm:grid-cols-3 sm:items-end"
      >
        <PeriodFields from={query.from} to={query.to} />
        <CodeSelect name="wh" label="창고" value={query.warehouse} options={data.options.warehouses} />
        <div className="flex items-center gap-3 sm:col-span-full">
          <button type="submit" className="rounded border border-machine px-5 py-2 font-semibold hover:bg-floor">
            보기
          </button>
          <Link
            href={`/inventory/ledger${queryString({ ...keep, item: d.item.code })}`}
            className="text-sm text-muted underline underline-offset-4 hover:text-ink"
          >
            수불부로
          </Link>
        </div>
        <Notices notices={notices} />
      </Form>

      <dl className="mt-4 grid max-w-xl grid-cols-2 gap-px border border-rule bg-rule text-sm sm:grid-cols-4">
        {[
          ["기초", d.opening],
          ["입고 계", d.inTotal],
          ["출고 계", d.outTotal],
          ["기말", d.closing],
        ].map(([label, value]) => (
          <div key={label} className="bg-white px-3 py-2">
            <dt className="text-muted">{label}</dt>
            <dd className="text-right text-lg font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      {d.total === 0 ? (
        <p className="mt-6 border border-dashed border-rule px-5 py-8 text-center text-muted">
          이 기간에 이 품목의 거래가 없습니다.
        </p>
      ) : (
        <>
          <Pager total={d.total} page={d.page} pages={d.pages} path={path} params={keep} unit="건" />
          <div
            className="relative mt-2 overflow-x-auto border-x border-rule bg-white"
            tabIndex={0}
            role="region"
            aria-label="거래 표"
          >
            <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
              <caption className="sr-only">
                {d.item.code} 의 거래 — 일자 차례, 잔량은 기초 {d.opening} 에서 시작
              </caption>
              <thead className="border-b-2 border-machine">
                <tr>
                  <th scope="col" className="px-3 py-2">
                    일자
                  </th>
                  <th scope="col" className="px-3 py-2">
                    전표 번호
                  </th>
                  <th scope="col" className="px-3 py-2">
                    유형
                  </th>
                  <th scope="col" className="px-3 py-2 text-right">
                    입고
                  </th>
                  <th scope="col" className="px-3 py-2 text-right">
                    출고
                  </th>
                  <th scope="col" className="px-3 py-2 text-right">
                    잔량
                  </th>
                </tr>
              </thead>
              <tbody>
                {d.page === 1 && (
                  <tr className="border-b border-rule text-muted">
                    <td className="px-3 py-2 font-mono whitespace-nowrap">{query.from}</td>
                    <td className="px-3 py-2" colSpan={4}>
                      기초
                    </td>
                    <td className={num}>{d.opening}</td>
                  </tr>
                )}
                {d.rows.map((r, i) => (
                  <tr key={`${r.code}-${i}`} className="border-b border-rule">
                    <td className="px-3 py-2 font-mono whitespace-nowrap">{r.moveDate}</td>
                    <td className="px-3 py-2 font-mono whitespace-nowrap">
                      <Link
                        href={`/inventory/moves/${r.code}`}
                        className="font-semibold text-ink underline underline-offset-4 hover:text-machine"
                      >
                        {r.code}
                      </Link>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.moveTypeName}</td>
                    <td className={num}>{r.in ?? ""}</td>
                    <td className={num}>{r.out ?? ""}</td>
                    <td className={`${num} font-semibold`}>{r.balance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {d.pages > 1 && <Pager total={d.total} page={d.page} pages={d.pages} path={path} params={keep} unit="건" />}
        </>
      )}
    </>
  );
}
