import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { CodeSelect, Notices, Pager, SortTh, type Filters } from "@/components/sort-pager";
import { withDb } from "@/db/request";
import { historyOptions } from "@/db/stock-history";
import { listLotStock, type LotStockRow } from "@/db/stock-status";
import { parseLotStockQuery, type LotStockQuery, type LotStockSort } from "@/lib/stock-query";

export const metadata: Metadata = { title: "LOT별 재고 — ERP2" };

const PATH = "/inventory/status/lots";

// 재고 › 재고관리 › LOT별 재고(조각 「재고 현황」 성공 기준 6 · 7) — LOT 관리 품목의 품목 × 창고 × LOT 가 한 줄, 수량이 있는 줄만(ADR 0025).
// 품목별 재고에서 LOT 관리 품목을 누르면 그 품목으로 걸러져 열린다(ADR 0023 의 6). 잔액을 읽기만 한다.
// 칸 차례 · 처음 세우기 · 휴대폰 폭은 설계 「2026-11-11 — PR B 를 열기 전에 정한 것」.
export default function LotStockPage({ searchParams }: PageProps<"/inventory/status/lots">) {
  return (
    <section>
      <p className="text-sm text-muted">
        <Link href="/inventory" className="underline-offset-4 hover:underline">
          재고
        </Link>{" "}
        › 재고관리 › LOT별 재고
      </p>
      <h1 className="mt-1 text-3xl leading-tight font-semibold">LOT별 재고</h1>
      <p className="mt-1 max-w-3xl text-muted">
        LOT 마다 어느 창고에 몇 개 있는지 봅니다. LOT 관리 품목만 보이고, LOT 관리를 하지 않는 품목은 「창고별
        재고」에서 봅니다. 재고를 고치려면 「수불관리」의 등록 · 실사로 갑니다.
      </p>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <Results searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function Results({ searchParams }: Pick<PageProps<"/inventory/status/lots">, "searchParams">) {
  const params = await searchParams;
  await connection();
  const { query, notices } = parseLotStockQuery(params);
  let data;
  try {
    data = await withDb(async (db) => ({ options: await historyOptions(db), page: await listLotStock(db, query) }));
  } catch (error) {
    return <LoadFailed error={error} what="LOT별 재고" />;
  }
  const filters: Filters = { item: query.item, wh: query.warehouse, lot: query.lot };
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
        aria-label="LOT별 재고 거르기"
        className="mt-6 grid max-w-4xl gap-3 border-y border-rule bg-white px-4 py-4 sm:grid-cols-3 sm:items-end"
      >
        <CodeSelect name="item" label="품목" value={query.item} options={data.options.items} />
        <CodeSelect name="wh" label="창고" value={query.warehouse} options={data.options.warehouses} />
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">LOT번호</span>
          <input
            type="search"
            name="lot"
            defaultValue={query.lot ?? ""}
            maxLength={30}
            placeholder="LOT번호 그대로"
            className="w-full min-w-0 rounded border border-rule px-3 py-2 text-base"
          />
        </label>
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
      <Pager {...data.page} path={PATH} params={sorted} />
      <p className="text-sm text-muted md:hidden">표를 옆으로 밀면 다른 열이 보입니다</p>
      <LotStockTable rows={data.page.rows} query={query} filters={filters} />
      {data.page.pages > 1 && <Pager {...data.page} path={PATH} params={sorted} />}
    </>
  );
}

type Col = { key: LotStockSort; label: string; numeric?: boolean };
const COLS: Col[] = [
  { key: "warehouse", label: "창고" },
  { key: "itemName", label: "품목명" },
  { key: "unit", label: "단위" },
  { key: "onHand", label: "실재고", numeric: true },
  { key: "qc", label: "검사대기", numeric: true },
  { key: "defect", label: "불량", numeric: true },
  { key: "available", label: "가용재고", numeric: true },
];

// 휴대폰 폭에서 표를 옆으로 밀어도 품목코드 · LOT번호가 왼쪽에 남는다.
const STICKY = "sticky z-10 bg-white";

function LotStockTable({ rows, query, filters }: { rows: LotStockRow[]; query: LotStockQuery; filters: Filters }) {
  const th = (c: Col, className = "") => (
    <SortTh
      key={c.key}
      label={c.label}
      sortKey={c.key}
      sort={query.sort}
      dir={query.dir}
      path={PATH}
      filters={filters}
      numeric={c.numeric}
      className={`px-2! ${className}`}
    />
  );
  const num = "px-2 py-2 text-right whitespace-nowrap tabular-nums";
  return (
    <div
      className="relative mt-2 overflow-x-auto border-x border-rule bg-white"
      tabIndex={0}
      role="region"
      aria-label="LOT별 재고 표"
    >
      <table className="w-max min-w-full border-collapse text-left text-sm">
        <caption className="sr-only">LOT별 재고 — 품목 · LOT · 창고마다 실재고 · 검사대기 · 불량 · 가용재고</caption>
        <thead>
          <tr className="border-b-2 border-machine">
            {th({ key: "item", label: "품목코드" }, `${STICKY} left-0`)}
            {th({ key: "lot", label: "LOT번호" }, `${STICKY} left-[6.5rem] shadow-[inset_-1px_0_0_var(--color-rule)]`)}
            {COLS.map((c) => th(c))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={2 + COLS.length} className="px-5 py-8 text-muted">
                이 거르기에 재고가 있는 LOT 가 없습니다.
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={`${r.itemCode}|${r.lot}|${r.warehouseCode}`} className="border-b border-rule align-top">
              <th
                scope="row"
                className={`${STICKY} left-0 w-[6.5rem] px-2 py-2 text-left font-mono font-normal whitespace-nowrap`}
              >
                {r.itemCode}
              </th>
              <td
                className={`${STICKY} left-[6.5rem] px-2 py-2 font-mono whitespace-nowrap shadow-[inset_-1px_0_0_var(--color-rule)]`}
              >
                {r.lot}
              </td>
              <td className="px-2 py-2 whitespace-nowrap">
                <span className="font-mono">{r.warehouseCode}</span> {r.warehouseName}
              </td>
              <td className="px-2 py-2 whitespace-nowrap">{r.itemName}</td>
              <td className="px-2 py-2 whitespace-nowrap">{r.unit}</td>
              <td className={`${num} font-semibold`}>{r.onHand}</td>
              <td className={num}>{r.qc}</td>
              <td className={`${num} ${r.isDefect ? "font-semibold text-red-700" : ""}`}>{r.defect}</td>
              <td className={`${num} font-semibold`}>{r.available}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
