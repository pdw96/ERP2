import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { Notices, Pager, SortTh, type Filters } from "@/components/sort-pager";
import { withDb } from "@/db/request";
import { listItemStock, type ItemStockRow } from "@/db/stock-status";
import { ITEM_TYPES } from "@/lib/master-codes";
import { parseItemStockQuery, SEARCH_MAX, type ItemStockQuery, type ItemStockSort } from "@/lib/stock-query";

export const metadata: Metadata = { title: "품목별 재고 — ERP2" };

const PATH = "/inventory/status/items";

// 재고 › 재고관리 › 품목별 재고(조각 「재고 현황」 성공 기준 3 · 4) — 품목마다 모든 창고 · LOT 의 합. 실재고 · 검사대기 · 불량 · 가용재고와
// 안전재고 · 미달(ADR 0023). 「사용」인 품목은 재고가 0 이어도 보인다. 잔액을 읽기만 한다 — 재고를 바꾸는 단추가 없다.
// 칸 차례 · 처음 세우기 · 휴대폰 폭은 설계 「2026-11-11 — PR A 를 열기 전에 정한 것」.
export default function ItemStockPage({ searchParams }: PageProps<"/inventory/status/items">) {
  return (
    <section>
      <p className="text-sm text-muted">
        <Link href="/inventory" className="underline-offset-4 hover:underline">
          재고
        </Link>{" "}
        › 재고관리 › 품목별 재고
      </p>
      <h1 className="mt-1 text-3xl leading-tight font-semibold">품목별 재고</h1>
      <p className="mt-1 max-w-3xl text-muted">
        품목마다 모든 창고의 지금 재고를 봅니다. 실재고 = 검사대기 + 불량 + 가용재고이고, 가용재고가 안전재고보다 적으면
        「미달」입니다. 재고를 고치려면 「수불관리」의 등록 · 실사로 갑니다.
      </p>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <Results searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function Results({ searchParams }: Pick<PageProps<"/inventory/status/items">, "searchParams">) {
  const params = await searchParams;
  await connection();
  const { query, notices } = parseItemStockQuery(params);
  let page;
  try {
    page = await withDb((db) => listItemStock(db, query));
  } catch (error) {
    return <LoadFailed error={error} what="품목별 재고" />;
  }
  const filters: Filters = { q: query.q, type: query.itemType, short: query.shortOnly ? "1" : undefined };
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
        aria-label="품목별 재고 거르기"
        className="mt-6 grid max-w-4xl gap-3 border-y border-rule bg-white px-4 py-4 sm:grid-cols-2 sm:items-end lg:grid-cols-[2fr_1fr_auto]"
      >
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">찾기</span>
          <input
            type="search"
            name="q"
            defaultValue={query.q ?? ""}
            maxLength={SEARCH_MAX}
            placeholder="품목코드 · 품목명"
            className="w-full min-w-0 rounded border border-rule px-3 py-2 text-base"
          />
        </label>
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
        <label className="flex items-center gap-2 py-2 text-sm font-semibold">
          <input type="checkbox" name="short" value="1" defaultChecked={query.shortOnly} className="size-4" />
          미달만
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
      <Pager {...page} path={PATH} params={sorted} unit="품목" />
      <p className="text-sm text-muted md:hidden">표를 옆으로 밀면 다른 열이 보입니다</p>
      <ItemStockTable rows={page.rows} query={query} filters={filters} />
      {page.pages > 1 && <Pager {...page} path={PATH} params={sorted} unit="품목" />}
    </>
  );
}

type Col = { key: ItemStockSort; label: string; numeric?: boolean };
const COLS: Col[] = [
  { key: "spec", label: "규격" },
  { key: "type", label: "품목 유형" },
  { key: "unit", label: "단위" },
  { key: "onHand", label: "실재고", numeric: true },
  { key: "qc", label: "검사대기", numeric: true },
  { key: "defect", label: "불량", numeric: true },
  { key: "available", label: "가용재고", numeric: true },
  { key: "safety", label: "안전재고", numeric: true },
  { key: "short", label: "미달", numeric: true },
];

// 휴대폰 폭에서 표를 옆으로 밀어도 품목코드 · 품목명이 왼쪽에 남는다(「품목 조회」와 같은 틀).
const STICKY = "sticky z-10 bg-white";

function ItemStockTable({ rows, query, filters }: { rows: ItemStockRow[]; query: ItemStockQuery; filters: Filters }) {
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
      className={className}
    />
  );
  const num = "px-3 py-2 text-right whitespace-nowrap tabular-nums";
  return (
    <div
      className="relative mt-2 overflow-x-auto border-x border-rule bg-white"
      tabIndex={0}
      role="region"
      aria-label="품목별 재고 표"
    >
      <table className="w-max min-w-full border-collapse text-left text-sm">
        <caption className="sr-only">
          품목별 재고 — 품목마다 실재고 · 검사대기 · 불량 · 가용재고 · 안전재고 · 미달
        </caption>
        <thead>
          <tr className="border-b-2 border-machine">
            {th({ key: "item", label: "품목코드" }, `${STICKY} left-0`)}
            {th(
              { key: "itemName", label: "품목명" },
              `${STICKY} left-[6.5rem] shadow-[inset_-1px_0_0_var(--color-rule)]`,
            )}
            {COLS.map((c) => th(c))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={2 + COLS.length} className="px-5 py-8 text-muted">
                이 거르기에 맞는 품목이 없습니다.
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.itemCode} className="border-b border-rule align-top">
              <th
                scope="row"
                className={`${STICKY} left-0 w-[6.5rem] px-3 py-2 text-left font-mono font-normal whitespace-nowrap`}
              >
                {r.itemCode}
              </th>
              <td
                className={`${STICKY} left-[6.5rem] px-3 py-2 whitespace-nowrap shadow-[inset_-1px_0_0_var(--color-rule)]`}
              >
                {r.itemName}
                {!r.active && <span className="ml-1 text-xs text-muted">(사용 안 함)</span>}
              </td>
              <td className="px-3 py-2 whitespace-nowrap">{r.spec}</td>
              <td className="px-3 py-2 whitespace-nowrap">{r.itemTypeName}</td>
              <td className="px-3 py-2 whitespace-nowrap">{r.unit}</td>
              <td className={`${num} font-semibold`}>{r.onHand}</td>
              <td className={num}>{r.qc}</td>
              <td className={num}>{r.defect}</td>
              <td className={`${num} font-semibold`}>{r.available}</td>
              <td className={num}>{r.safety}</td>
              <td className={num}>
                {r.short !== null && (
                  <span className="font-semibold text-red-700">
                    미달 <span className="tabular-nums">{r.short}</span>
                    <span className="sr-only"> 모자람</span>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
