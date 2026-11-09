import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { CodeSelect, Notices, Pager, PeriodFields, SortTh, type Filters } from "@/components/sort-pager";
import { withDb } from "@/db/request";
import { historyOptions, listLedger, type LedgerRow } from "@/db/stock-history";
import { basisOf, parseLedgerQuery, queryString, type LedgerQuery, type LedgerSort } from "@/lib/stock-query";
import { koreaToday } from "@/lib/today";

export const metadata: Metadata = { title: "수불부 — ERP2" };

const PATH = "/inventory/ledger";

// 재고 › 수불관리 › 수불부(성공 기준 9) — 품목마다 기초 · 입고 · 출고 · 기말. 창고를 고르면 그 창고 몫(이동이 들고 남),
// 고르지 않으면 모든 창고의 합(이동이 빠져 「이동」 칸을 감춘다). 어떻게 셌는지는 표 위 「모두 N품목」 줄에 보인다. 품목을 누르면 그 기간의 거래와 잔량(저자 판정 —
// 설계 「2026-11-09 — PR D 를 열기 전에 정한 것」). 칸 머리를 눌러 세운다.
export default function LedgerPage({ searchParams }: PageProps<"/inventory/ledger">) {
  return (
    <section>
      <p className="text-sm text-muted">
        <Link href="/inventory" className="underline-offset-4 hover:underline">
          재고
        </Link>{" "}
        › 수불관리 › 수불부
      </p>
      <h1 className="mt-1 text-3xl leading-tight font-semibold">수불부</h1>
      <p className="mt-1 max-w-3xl text-muted">
        기간의 기초 · 입고 · 출고 · 기말을 품목마다 봅니다. 기초 + 입고 계 − 출고 계 = 기말입니다. 품목 코드를 누르면 그
        기간의 거래가 잔량과 함께 보입니다.
      </p>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <Results searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function Results({ searchParams }: Pick<PageProps<"/inventory/ledger">, "searchParams">) {
  const params = await searchParams;
  await connection();
  const { query, notices } = parseLedgerQuery(params, koreaToday());
  let data;
  try {
    data = await withDb(async (db) => ({ options: await historyOptions(db), page: await listLedger(db, query) }));
  } catch (error) {
    return <LoadFailed error={error} what="수불부" />;
  }
  const filters: Filters = { from: query.from, to: query.to, item: query.item, wh: query.warehouse };
  const basis = basisOf(query.warehouse, data.options.warehouses);
  const sorted = {
    ...filters,
    sort: query.sort === "item" && query.dir === "asc" ? undefined : query.sort,
    dir: query.dir === "desc" ? "desc" : undefined,
  };
  return (
    <>
      <Form
        key={JSON.stringify(filters)}
        action={PATH}
        replace
        role="search"
        aria-label="수불부 거르기"
        className="mt-6 grid max-w-4xl gap-3 border-y border-rule bg-white px-4 py-4 sm:grid-cols-2 sm:items-end lg:grid-cols-[2fr_repeat(2,minmax(0,1fr))]"
      >
        <PeriodFields from={query.from} to={query.to} />
        <CodeSelect name="item" label="품목" value={query.item} options={data.options.items} />
        <CodeSelect name="wh" label="창고" value={query.warehouse} options={data.options.warehouses} />
        {sorted.sort && <input type="hidden" name="sort" value={sorted.sort} />}
        {sorted.dir && <input type="hidden" name="dir" value={sorted.dir} />}
        <div className="flex items-center gap-3 sm:col-span-full">
          <button type="submit" className="rounded border border-machine px-5 py-2 font-semibold hover:bg-floor">
            보기
          </button>
          <Link href={PATH} className="text-sm text-muted underline underline-offset-4 hover:text-ink">
            처음대로
          </Link>
        </div>
        <Notices notices={notices} />
      </Form>
      {data.page.total === 0 ? (
        <p className="mt-6 border border-dashed border-rule px-5 py-8 text-center text-muted">
          이 기간 · 거르기에 기초 · 입고 · 출고가 있는 품목이 없습니다.
        </p>
      ) : (
        <>
          <Pager {...data.page} path={PATH} params={sorted} unit="품목" basis={basis} />
          <p className="text-sm text-muted md:hidden">표를 옆으로 밀면 다른 열이 보입니다</p>
          <LedgerTable rows={data.page.rows} query={query} filters={filters} />
          {data.page.pages > 1 && <Pager {...data.page} path={PATH} params={sorted} unit="품목" basis={basis} />}
        </>
      )}
    </>
  );
}

type Col = { key: LedgerSort; label: string };
// 입고 · 출고의 칸은 수불 유형의 이름이다 — 뒤 조각이 유형(구매입고 · 생산입고 따위)을 더하면 칸이 는다.
const IN_COLS: Col[] = [
  { key: "inIn", label: "기타입고" },
  { key: "inXfer", label: "이동" },
  { key: "inAdj", label: "조정" },
  { key: "inTotal", label: "입고 계" },
];
const OUT_COLS: Col[] = [
  { key: "outOut", label: "기타출고" },
  { key: "outXfer", label: "이동" },
  { key: "outAdj", label: "조정" },
  { key: "outTotal", label: "출고 계" },
];

function LedgerTable({ rows, query, filters }: { rows: LedgerRow[]; query: LedgerQuery; filters: Filters }) {
  const showXfer = !!query.warehouse;
  const inCols = IN_COLS.filter((c) => showXfer || c.key !== "inXfer");
  const outCols = OUT_COLS.filter((c) => showXfer || c.key !== "outXfer");
  const th = (c: Col, numeric = true, className = "") => (
    <SortTh
      key={c.key}
      label={c.label}
      sortKey={c.key}
      sort={query.sort}
      dir={query.dir}
      path={PATH}
      filters={filters}
      numeric={numeric}
      className={className}
    />
  );
  const detail = (code: string) =>
    `${PATH}/${code}${queryString({ from: query.from, to: query.to, wh: query.warehouse })}`;
  const num = "px-3 py-2 text-right whitespace-nowrap tabular-nums";
  return (
    <div
      className="relative mt-2 overflow-x-auto border-x border-rule bg-white"
      tabIndex={0}
      role="region"
      aria-label="수불부 표"
    >
      <table className="w-max min-w-full border-collapse text-left text-sm">
        <caption className="sr-only">수불부 — 품목마다 기초 · 입고 · 출고 · 기말</caption>
        <thead>
          <tr className="border-b border-rule">
            <td colSpan={4} />
            <th scope="colgroup" colSpan={inCols.length} className="border-l border-rule px-3 py-1 text-center">
              입고
            </th>
            <th scope="colgroup" colSpan={outCols.length} className="border-l border-rule px-3 py-1 text-center">
              출고
            </th>
            <td className="border-l border-rule" />
          </tr>
          <tr className="border-b-2 border-machine">
            {th({ key: "item", label: "품목 코드" }, false)}
            {th({ key: "itemName", label: "품명" }, false)}
            {th({ key: "unit", label: "단위" }, false)}
            {th({ key: "opening", label: "기초" })}
            {inCols.map((c, i) => th(c, true, i === 0 ? "border-l border-rule" : ""))}
            {outCols.map((c, i) => th(c, true, i === 0 ? "border-l border-rule" : ""))}
            {th({ key: "closing", label: "기말" }, true, "border-l border-rule")}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.itemCode} className="border-b border-rule align-top">
              <th scope="row" className="px-3 py-2 text-left font-mono font-normal whitespace-nowrap">
                <Link
                  href={detail(r.itemCode)}
                  className="font-semibold text-ink underline underline-offset-4 hover:text-machine"
                >
                  {r.itemCode}
                </Link>
              </th>
              <td className="px-3 py-2 whitespace-nowrap">{r.itemName}</td>
              <td className="px-3 py-2 whitespace-nowrap">{r.unit}</td>
              <td className={num}>{r.opening}</td>
              {inCols.map((c, i) => (
                <td
                  key={c.key}
                  className={`${num} ${i === 0 ? "border-l border-rule" : ""} ${c.key === "inTotal" ? "font-semibold" : ""}`}
                >
                  {r[c.key as keyof LedgerRow]}
                </td>
              ))}
              {outCols.map((c, i) => (
                <td
                  key={c.key}
                  className={`${num} ${i === 0 ? "border-l border-rule" : ""} ${c.key === "outTotal" ? "font-semibold" : ""}`}
                >
                  {r[c.key as keyof LedgerRow]}
                </td>
              ))}
              <td className={`${num} border-l border-rule font-semibold`}>{r.closing}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
