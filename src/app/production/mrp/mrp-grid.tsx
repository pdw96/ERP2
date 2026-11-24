import Link from "next/link";
import type { ReactNode } from "react";
import { milliOf, shownQty } from "@/app/sales/plans/plan-qty";
import { WeekHead } from "@/app/sales/plans/plan-table";
import type { MrpGridRow, openMrpGrid } from "@/db/mrp";
import { addWeeks, PAGE_WEEKS, weekLabel } from "@/lib/weeks";
import { mrpGridHref } from "./paths";

// 품목별 MRP 표(메뉴 「MRP」) — 가장 새 실행의 품목마다 머리(가용 · 안전 · 최소 · 배수 · 리드타임)와 다섯 줄, 칸은 13주. 읽기만 한다.
// - 총소요 · 입고예정 · 예상재고 · 계획오더(입고) · 계획오더(시작). 입고예정은 원천(작업지시 · 발주)이 아직 없어 늘 0 이다.
// - 예상재고는 음수면 빨강(「부족」), 0 이상이고 안전재고 밑이면 주황이다.
// - 완제품은 MPS 수량이 그대로 계획오더라 총소요 · 예상재고를 셈하지 않는다 — 그 두 줄은 「MPS 에서 계산」(MPS 화면이 든다).
// - 쪽은 실행 주에서 13주씩 넷(실행 주 + 13주 × 0 ~ 3). 첫 쪽에는 ◀ 가, 마지막 쪽에는 ▶ 가 없다.

type Grid = Awaited<ReturnType<typeof openMrpGrid>>;

const PAGES = 4;
const ZERO = BigInt(0);
const NOT_RUN = "아직 MRP 를 실행하지 않았습니다 — [MRP 실행]을 누르세요";

const shown = (qty: string | null) => (qty === null ? "" : shownQty(qty));

export function MrpGrid({ grid, thisWeek }: { grid: Grid; thisWeek: string }) {
  const { run, runWeek, weeks, rows } = grid;
  if (!run || !runWeek)
    return <p className="mt-4 border border-dashed border-rule px-5 py-6 text-center text-sm text-muted">{NOT_RUN}</p>;

  // 쪽 — 실행 주에서 13주씩 넷, 앞 · 뒤 쪽이 있을 때만 링크.
  const starts = Array.from({ length: PAGES }, (_, k) => addWeeks(runWeek, PAGE_WEEKS * k));
  const at = starts.indexOf(weeks[0]);
  const prev = at > 0 ? starts[at - 1] : undefined;
  const next = at >= 0 && at < starts.length - 1 ? starts[at + 1] : undefined;
  const nameCol = "sticky left-0 w-40 min-w-40 px-2 sm:w-72 sm:min-w-72";
  const headLine = "shadow-[inset_0_-2px_0_var(--color-machine)]";

  return (
    <>
      <nav aria-label="주 넘기기" className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {prev && (
          <Link href={mrpGridHref(prev)} className="font-semibold underline underline-offset-4">
            ◀ 앞 {PAGE_WEEKS}주
          </Link>
        )}
        <span className="tabular-nums">
          {weekLabel(weeks[0], thisWeek)} ~ {weekLabel(weeks[weeks.length - 1], thisWeek)}
        </span>
        {next && (
          <Link href={mrpGridHref(next)} className="font-semibold underline underline-offset-4">
            뒤 {PAGE_WEEKS}주 ▶
          </Link>
        )}
      </nav>
      <div
        className="relative mt-2 max-h-[70vh] overflow-auto border border-rule bg-white"
        tabIndex={0}
        role="region"
        aria-label="품목별 MRP 표"
      >
        <table className="border-separate border-spacing-0 text-left text-sm">
          <caption className="sr-only">
            품목별 MRP — 품목마다 총소요 · 입고예정 · 예상재고 · 계획오더(입고) · 계획오더(시작), 칸은{" "}
            {weekLabel(weeks[0], thisWeek)}부터 {PAGE_WEEKS}주
          </caption>
          <thead>
            <tr>
              <th scope="col" className={`${nameCol} top-0 z-30 bg-floor py-2 ${headLine}`}>
                품목 · 구분
              </th>
              {weeks.map((w) => (
                <WeekHead key={w} week={w} thisWeek={thisWeek} />
              ))}
            </tr>
          </thead>
          {rows.length === 0 && (
            <tbody>
              <tr>
                <td colSpan={weeks.length + 1} className="px-5 py-6 text-muted">
                  <span className="sticky left-5">총소요도 계획오더도 있는 품목이 없습니다</span>
                </td>
              </tr>
            </tbody>
          )}
          {rows.map((r) => (
            <ItemRows key={r.item.code} row={r} weeks={weeks} thisWeek={thisWeek} nameCol={nameCol} />
          ))}
        </table>
      </div>
    </>
  );
}

/** 품목 하나의 줄 묶음 — 머리 줄과 다섯 줄. */
function ItemRows({
  row,
  weeks,
  thisWeek,
  nameCol,
}: {
  row: MrpGridRow;
  weeks: string[];
  thisWeek: string;
  nameCol: string;
}) {
  const { item } = row;
  const safety = milliOf(row.safety);
  const line = "border-b border-rule";
  const now = (w: string) => (w === thisWeek ? "bg-safety/10" : "");
  const qtyCell = `${line} px-2.5 py-1.5 text-right tabular-nums whitespace-nowrap`;
  const label = (text: string) => (
    <th scope="row" className={`${nameCol} ${line} z-10 bg-white py-1.5 font-normal text-muted`}>
      {text}
    </th>
  );
  /** 한 줄의 칸들 — 칸의 속과 덧붙일 class 는 부르는 쪽이 고른다. */
  const weekCells = (testId: string, content: (w: string) => ReactNode, extra?: (w: string) => string) =>
    weeks.map((w) => (
      <td key={w} data-testid={`${testId}-${item.code}-${w}`} className={`${qtyCell} ${now(w)} ${extra?.(w) ?? ""}`}>
        {content(w)}
      </td>
    ));
  /** 완제품의 총소요 · 예상재고 — 13주를 한 칸으로. */
  const fromMps = (
    <td colSpan={weeks.length} className={`${line} px-2.5 py-1.5 text-muted`}>
      <span className="sticky left-44 sm:left-76">MPS 에서 계산</span>
    </td>
  );
  const projectedOf = (w: string) => {
    const text = row.cells[w]?.projected ?? null;
    const qty = text === null ? null : milliOf(text);
    return { text, short: qty !== null && qty < ZERO, low: qty !== null && qty >= ZERO && qty < safety };
  };

  return (
    <tbody>
      <tr>
        <th
          scope="rowgroup"
          colSpan={weeks.length + 1}
          data-testid={`item-${item.code}`}
          className={`${line} border-t-2 border-t-machine bg-floor px-2 py-1.5 text-left font-normal`}
        >
          <span className="sticky left-2 tabular-nums">
            <span className="font-mono font-semibold">{item.code}</span>{" "}
            <span className="font-semibold">{item.name}</span>
            <span className="text-muted">
              {" "}
              · 가용 {shownQty(row.available)} · 안전 {shownQty(row.safety)}
              {!item.active && "(사용 안 함)"} · 최소 {shownQty(row.minLot)} · 배수 {shownQty(row.multiple)} · 리드타임{" "}
              {row.leadTimeDays}일
            </span>
          </span>
        </th>
      </tr>
      <tr>
        {label("총소요")}
        {row.fromMps ? fromMps : weekCells("gross", (w) => shown(row.cells[w]?.gross ?? null))}
      </tr>
      <tr>
        {label("입고예정")}
        {weekCells(
          "scheduled",
          () => "0",
          () => "text-muted",
        )}
      </tr>
      <tr>
        {label("예상재고")}
        {row.fromMps
          ? fromMps
          : weekCells(
              "projected",
              (w) => {
                const { text, short, low } = projectedOf(w);
                return (
                  <>
                    {shown(text)}
                    {short && <span className="sr-only">부족</span>}
                    {low && <span className="sr-only">안전재고 밑</span>}
                  </>
                );
              },
              (w) => {
                const { short, low } = projectedOf(w);
                return short ? "font-semibold text-red-700" : low ? "text-orange-700" : "";
              },
            )}
      </tr>
      <tr>
        {label("계획오더(입고)")}
        {weekCells("receipt", (w) => shown(row.cells[w]?.receipt ?? null))}
      </tr>
      <tr>
        {label("계획오더(시작)")}
        {weekCells("release", (w) => shown(row.cells[w]?.release ?? null))}
      </tr>
    </tbody>
  );
}
