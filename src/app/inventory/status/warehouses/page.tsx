import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { CodeSelect, Notices, Pager, SortTh, type Filters } from "@/components/sort-pager";
import { withDb } from "@/db/request";
import { historyOptions } from "@/db/stock-history";
import { listWarehouseStock, type WarehouseStockRow } from "@/db/stock-status";
import { ITEM_TYPES } from "@/lib/master-codes";
import { parseWarehouseStockQuery, type WarehouseStockQuery, type WarehouseStockSort } from "@/lib/stock-query";

export const metadata: Metadata = { title: "창고별 재고 — ERP2" };

const PATH = "/inventory/status/warehouses";

// 재고 › 재고관리 › 창고별 재고(조각 「재고 현황」 성공 기준 5) — 창고 하나 × 품목 하나가 한 줄(그 창고 안의 LOT 합), 수량이 있는 줄만.
// 불량창고의 줄은 모든 수량이 불량 칸이다(ADR 0023 의 2). 잔액을 읽기만 한다 — 재고를 바꾸는 단추가 없다.
// 칸 차례 · 처음 세우기 · 휴대폰 폭은 설계 「2026-11-11 — PR B 를 열기 전에 정한 것」.
export default function WarehouseStockPage({ searchParams }: PageProps<"/inventory/status/warehouses">) {
  return (
    <section>
      <p className="text-sm text-muted">
        <Link href="/inventory" className="underline-offset-4 hover:underline">
          재고
        </Link>{" "}
        › 재고관리 › 창고별 재고
      </p>
      <h1 className="mt-1 text-3xl leading-tight font-semibold">창고별 재고</h1>
      <p className="mt-1 max-w-3xl text-muted">
        창고마다 그 안에 있는 품목의 지금 재고를 봅니다. 불량창고에 있는 재고는 다 불량이라 가용재고에 들지 않습니다.
        재고를 고치려면 「수불관리」의 등록 · 실사로 갑니다.
      </p>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <Results searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function Results({ searchParams }: Pick<PageProps<"/inventory/status/warehouses">, "searchParams">) {
  const params = await searchParams;
  await connection();
  const { query, notices } = parseWarehouseStockQuery(params);
  let data;
  try {
    data = await withDb(async (db) => ({
      options: await historyOptions(db),
      page: await listWarehouseStock(db, query),
    }));
  } catch (error) {
    return <LoadFailed error={error} what="창고별 재고" />;
  }
  const filters: Filters = { wh: query.warehouse, item: query.item, type: query.itemType };
  const sorted = {
    ...filters,
    sort: query.sort === "warehouse" && query.dir === "asc" ? undefined : query.sort,
    dir: query.dir === "desc" ? "desc" : undefined,
  };
  return (
    <>
      <Form
        key={JSON.stringify(filters)}
        action={PATH}
        replace
        role="search"
        aria-label="창고별 재고 거르기"
        className="mt-6 grid max-w-4xl gap-3 border-y border-rule bg-white px-4 py-4 sm:grid-cols-3 sm:items-end"
      >
        <CodeSelect name="wh" label="창고" value={query.warehouse} options={data.options.warehouses} />
        <CodeSelect name="item" label="품목" value={query.item} options={data.options.items} />
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">품목 유형</span>
          <select
            name="type"
            defaultValue={query.itemType ?? ""}
            className="w-full min-w-0 rounded border border-rule px-3 py-2 text-base"
          >
            <option value="">전체</option>
            {ITEM_TYPES.map((t) => (
              <option key={t.code} value={t.code}>
                {t.name}
              </option>
            ))}
          </select>
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
      <WarehouseStockTable rows={data.page.rows} query={query} filters={filters} />
      {data.page.pages > 1 && <Pager {...data.page} path={PATH} params={sorted} />}
    </>
  );
}

type Col = { key: WarehouseStockSort; label: string; numeric?: boolean };
const COLS: Col[] = [
  { key: "itemName", label: "품목명" },
  { key: "spec", label: "규격" },
  { key: "type", label: "품목 유형" },
  { key: "unit", label: "단위" },
  { key: "onHand", label: "실재고", numeric: true },
  { key: "qc", label: "검사대기", numeric: true },
  { key: "defect", label: "불량", numeric: true },
  { key: "available", label: "가용재고", numeric: true },
];

// 휴대폰 폭에서 표를 옆으로 밀어도 창고 · 품목코드가 왼쪽에 남는다.
const STICKY = "sticky z-10 bg-white";

function WarehouseStockTable({
  rows,
  query,
  filters,
}: {
  rows: WarehouseStockRow[];
  query: WarehouseStockQuery;
  filters: Filters;
}) {
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
      aria-label="창고별 재고 표"
    >
      <table className="w-max min-w-full border-collapse text-left text-sm">
        <caption className="sr-only">창고별 재고 — 창고 · 품목마다 실재고 · 검사대기 · 불량 · 가용재고</caption>
        <thead>
          <tr className="border-b-2 border-machine">
            {th({ key: "warehouse", label: "창고" }, `${STICKY} left-0`)}
            {th(
              { key: "item", label: "품목코드" },
              `${STICKY} left-[7.5rem] shadow-[inset_-1px_0_0_var(--color-rule)]`,
            )}
            {COLS.map((c) => th(c))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={2 + COLS.length} className="px-5 py-8 text-muted">
                이 거르기에 재고가 있는 줄이 없습니다.
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={`${r.warehouseCode}|${r.itemCode}`} className="border-b border-rule align-top">
              <th
                scope="row"
                className={`${STICKY} left-0 w-[7.5rem] px-2 py-2 text-left font-normal whitespace-nowrap`}
              >
                <span className="font-mono">{r.warehouseCode}</span> {r.warehouseName}
              </th>
              <td
                className={`${STICKY} left-[7.5rem] px-2 py-2 font-mono whitespace-nowrap shadow-[inset_-1px_0_0_var(--color-rule)]`}
              >
                {r.itemCode}
              </td>
              <td className="px-2 py-2 whitespace-nowrap">{r.itemName}</td>
              <td className="max-w-[9rem] min-w-[7rem] px-2 py-2">{r.spec}</td>
              <td className="px-2 py-2 whitespace-nowrap">{r.itemTypeName}</td>
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
