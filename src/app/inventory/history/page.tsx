import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { CodeSelect, Notices, Pager, PeriodFields, SortTh, type Filters } from "@/components/sort-pager";
import { withDb } from "@/db/request";
import { historyOptions, listHistory, type HistoryRow } from "@/db/stock-history";
import { MOVE_TYPES } from "@/lib/master-codes";
import { parseHistoryQuery, type HistoryQuery, type HistorySort } from "@/lib/stock-query";
import { koreaToday } from "@/lib/today";
import { Tag } from "../moves/move-list";

export const metadata: Metadata = { title: "수불 이력 — ERP2" };

const PATH = "/inventory/history";

// 재고 › 수불관리 › 수불 이력(성공 기준 8) — 수불 줄 한 건마다. 기간 · 품목 · 창고 · LOT · 유형으로 거르고, 칸 머리를 눌러 세운다.
// 처음 열면 최근 30일, 오래된 것부터 100줄씩(저자 판정 — 설계 「2026-11-09 — PR D 를 열기 전에 정한 것」).
export default function HistoryPage({ searchParams }: PageProps<"/inventory/history">) {
  return (
    <section>
      <p className="text-sm text-muted">
        <Link href="/inventory" className="underline-offset-4 hover:underline">
          재고
        </Link>{" "}
        › 수불관리 › 수불 이력
      </p>
      <h1 className="mt-1 text-3xl leading-tight font-semibold">수불 이력</h1>
      <p className="mt-1 max-w-3xl text-muted">
        수불 줄을 한 건씩 봅니다. 칸 머리를 누르면 그 칸으로 세우고, 다시 누르면 거꾸로 세웁니다.
      </p>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <Results searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function Results({ searchParams }: Pick<PageProps<"/inventory/history">, "searchParams">) {
  const params = await searchParams;
  await connection();
  const { query, notices } = parseHistoryQuery(params, koreaToday());
  let data;
  try {
    data = await withDb(async (db) => ({ options: await historyOptions(db), page: await listHistory(db, query) }));
  } catch (error) {
    return <LoadFailed error={error} what="수불 이력" />;
  }
  const filters: Filters = {
    from: query.from,
    to: query.to,
    item: query.item,
    wh: query.warehouse,
    lot: query.lot,
    type: query.moveType,
  };
  const sorted = {
    ...filters,
    sort: query.sort === "date" && query.dir === "asc" ? undefined : query.sort,
    dir: query.dir === "desc" ? "desc" : undefined,
  };
  return (
    <>
      <Form
        key={JSON.stringify(filters)}
        action={PATH}
        replace
        role="search"
        aria-label="수불 이력 거르기"
        className="mt-6 grid max-w-6xl gap-3 border-y border-rule bg-white px-4 py-4 sm:grid-cols-2 sm:items-end lg:grid-cols-[2fr_repeat(4,minmax(0,1fr))]"
      >
        <PeriodFields from={query.from} to={query.to} />
        <CodeSelect name="item" label="품목" value={query.item} options={data.options.items} />
        <CodeSelect name="wh" label="창고" value={query.warehouse} options={data.options.warehouses} />
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">LOT</span>
          <input
            type="search"
            name="lot"
            defaultValue={query.lot}
            maxLength={30}
            placeholder="글자가 같은 LOT"
            className="w-full min-w-0 rounded border border-rule px-3 py-2 text-base"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">유형</span>
          <select
            name="type"
            defaultValue={query.moveType ?? ""}
            className="w-full min-w-0 rounded border border-rule px-3 py-2 text-base"
          >
            <option value="">전체</option>
            {MOVE_TYPES.map((t) => (
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
            찾기
          </button>
          <Link href={PATH} className="text-sm text-muted underline underline-offset-4 hover:text-ink">
            처음대로
          </Link>
        </div>
        <Notices notices={notices} />
      </Form>
      {data.page.total === 0 ? (
        <p className="mt-6 border border-dashed border-rule px-5 py-8 text-center text-muted">
          이 기간 · 거르기에 맞는 수불이 없습니다.
        </p>
      ) : (
        <>
          <Pager {...data.page} path={PATH} params={sorted} />
          <p className="text-sm text-muted md:hidden">표를 옆으로 밀면 다른 열이 보입니다</p>
          <HistoryTable rows={data.page.rows} query={query} filters={filters} />
          {data.page.pages > 1 && <Pager {...data.page} path={PATH} params={sorted} />}
        </>
      )}
    </>
  );
}

const COLUMNS: { key: HistorySort; label: string; numeric?: boolean }[] = [
  { key: "date", label: "일자" },
  { key: "code", label: "전표 번호" },
  { key: "type", label: "유형" },
  { key: "reason", label: "사유" },
  { key: "item", label: "품목 코드" },
  { key: "itemName", label: "품명" },
  { key: "lot", label: "LOT" },
  { key: "from", label: "보내는 창고" },
  { key: "to", label: "받는 창고" },
  { key: "qty", label: "수량", numeric: true },
  { key: "unit", label: "단위" },
  { key: "entered", label: "넣은 수량", numeric: true },
  { key: "cancel", label: "취소" },
  { key: "ref", label: "가리키는 문서" },
  { key: "note", label: "비고" },
];

const dash = (s: string | null | undefined) => (s ? s : <span className="text-muted">—</span>);

function HistoryTable({ rows, query, filters }: { rows: HistoryRow[]; query: HistoryQuery; filters: Filters }) {
  return (
    <div
      className="relative mt-2 overflow-x-auto border-x border-rule bg-white"
      tabIndex={0}
      role="region"
      aria-label="수불 이력 표"
    >
      <table className="w-max min-w-full border-collapse text-left text-sm">
        <caption className="sr-only">수불 이력 — 수불 줄 한 건마다</caption>
        <thead className="border-b-2 border-machine">
          <tr>
            {COLUMNS.map((c) => (
              <SortTh
                key={c.key}
                label={c.label}
                sortKey={c.key}
                sort={query.sort}
                dir={query.dir}
                path={PATH}
                filters={filters}
                numeric={c.numeric}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className={`border-b border-rule align-top ${r.canceledBy || r.cancels ? "text-muted" : ""}`}
            >
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
              <td className="px-3 py-2 whitespace-nowrap">{dash(r.reasonName)}</td>
              <td className="px-3 py-2 font-mono whitespace-nowrap">{r.itemCode}</td>
              <td className="px-3 py-2 whitespace-nowrap">{r.itemName}</td>
              <td className="px-3 py-2 font-mono whitespace-nowrap">{dash(r.lot)}</td>
              <td className="px-3 py-2 whitespace-nowrap">{dash(r.from)}</td>
              <td className="px-3 py-2 whitespace-nowrap">{dash(r.to)}</td>
              <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{r.qty}</td>
              <td className="px-3 py-2 whitespace-nowrap">{r.unit}</td>
              <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{dash(r.entered)}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                {r.cancels ? <Tag>취소 전표</Tag> : r.canceledBy ? <Tag>취소됨</Tag> : dash(null)}
              </td>
              <td className="px-3 py-2 font-mono whitespace-nowrap">
                {r.cancels || r.canceledBy ? (
                  <Link
                    href={`/inventory/moves/${r.cancels ?? r.canceledBy}`}
                    className="underline underline-offset-4 hover:text-machine"
                  >
                    {r.cancels ?? r.canceledBy}
                  </Link>
                ) : (
                  dash(null)
                )}
              </td>
              <td className="max-w-72 min-w-32 px-3 py-2 wrap-anywhere">{dash(r.note)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
