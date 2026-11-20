import type { ReactNode } from "react";
import type { PlanCustomer, PlanItem, SalesPlanCell, SalesPlanSheet } from "@/db/sales-plans";
import { PAGE_WEEKS, weekLabel, weekRange } from "@/lib/weeks";
import { shownQty } from "./plan-qty";

// 판매계획 두 메뉴(「판매계획 등록」 · 「판매계획 확정」)가 같이 쓰는 표 — 머리 줄(주 머리), 줄 머리(고객 · 품목), 품목 합계,
// 거절 알림. 칸(등록은 입력 칸, 확정은 글자)과 줄 앞 칸(확정의 체크박스)만 화면마다 다르다.
// 표는 화면 안에서 세로 · 가로로 밀고(머리는 위에, 줄 앞 칸 · 고객 · 품목은 왼쪽에 붙는다), 페이지는 옆으로 밀리지 않는다.

export type PlanRow = { customer: PlanCustomer; item: PlanItem; cells: Record<string, SalesPlanCell>; added?: boolean };

export const pairOf = (customer: string, item: string) => `${customer}|${item}`;
/** 칸의 까닭이 붙는 id — 열쇠는 cellKey. */
export const errorId = (key: string) => `plan-err-${key.replaceAll("|", "-")}`;

export function PlanTable({
  sheet,
  rows,
  empty,
  lead,
  rowExtra,
  cell,
}: {
  sheet: SalesPlanSheet;
  rows: PlanRow[];
  /** 줄이 없을 때의 안내(거르지 않은 화면). */
  empty: string;
  /** 줄 앞 칸(2.5rem) — 머리와 줄마다. 없으면 고객 · 품목이 맨 왼쪽이다. */
  lead?: { head: ReactNode; cell: (row: PlanRow) => ReactNode };
  /** 줄 머리 아래에 덧붙이는 것(새 줄 표시 · 지우기). */
  rowExtra?: (row: PlanRow) => ReactNode;
  /** 한 칸의 속 — 감싸는 <td> 는 표가 그린다. */
  cell: (row: PlanRow, week: string) => ReactNode;
}) {
  const { thisWeek, weeks } = sheet;
  // 왼쪽에 붙는 칸 — 줄 앞 칸(2.5rem) · 고객 · 품목. 위에 붙는 머리는 아래 줄에 선을 그림자로 긋는다(붙은 칸에는 테두리가 따라오지 않는다).
  const leadCol = "sticky left-0 w-10 min-w-10 px-2";
  const nameCol = `sticky ${lead ? "left-10" : "left-0"} w-40 min-w-40 px-2 sm:w-60 sm:min-w-60`;
  const headCell = "sticky top-0 bg-floor";
  const headLine = "shadow-[inset_0_-2px_0_var(--color-machine)]";
  const leftSpan = lead ? 2 : 1;
  const columns = weeks.length + leftSpan;
  const line = "border-b border-rule";

  return (
    <div
      className="relative mt-2 max-h-[60vh] overflow-auto border border-rule bg-white"
      tabIndex={0}
      role="region"
      aria-label="판매계획 표"
    >
      <table className="border-separate border-spacing-0 text-left text-sm">
        <caption className="sr-only">
          판매계획 — 줄은 고객 · 품목, 칸은 {weekLabel(weeks[0], thisWeek)}부터 {PAGE_WEEKS}주
        </caption>
        <thead>
          <tr>
            {lead && (
              <th scope="col" className={`${leadCol} ${headCell} ${headLine} z-30 py-2`}>
                {lead.head}
              </th>
            )}
            <th scope="col" className={`${nameCol} ${headCell} ${headLine} z-30 py-2`}>
              고객 · 품목
            </th>
            {weeks.map((w) => {
              const now = w === thisWeek;
              return (
                <th
                  key={w}
                  scope="col"
                  className={`${headCell} z-20 min-w-28 px-1.5 py-2 text-right align-bottom whitespace-nowrap ${
                    now ? "shadow-[inset_0_-4px_0_var(--color-safety)]" : headLine
                  } ${w < thisWeek ? "text-muted" : ""}`}
                >
                  {now && (
                    <span className="mb-0.5 inline-block rounded-sm bg-safety px-1 text-xs font-semibold text-ink">
                      이번 주
                    </span>
                  )}
                  <span className="block font-semibold">{weekLabel(w, thisWeek)}</span>
                  <span className="block text-xs font-normal text-muted tabular-nums">{weekRange(w)}</span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns} className="px-5 py-6 text-muted">
                <span className="sticky left-5">{sheet.filtered ? "거른 범위에 판매계획이 없습니다" : empty}</span>
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={pairOf(r.customer.code, r.item.code)} className="align-top">
              {lead && <td className={`${leadCol} ${line} z-10 bg-white py-2 text-center`}>{lead.cell(r)}</td>}
              <th scope="row" className={`${nameCol} ${line} z-10 bg-white py-1.5 font-normal`}>
                <span className="block wrap-anywhere">
                  {r.customer.name}
                  <span className="font-mono text-xs text-muted">({r.customer.code})</span>
                  {!r.customer.isCustomer && <Badge>매출처 아님</Badge>}
                  {!r.customer.active && <Badge>사용 안 함</Badge>}
                </span>
                <span className="block wrap-anywhere">
                  <span className="font-mono">{r.item.code}</span> {r.item.name}{" "}
                  <span className="text-muted">· {r.item.unit}</span>
                  {!r.item.active && <Badge>사용 안 함</Badge>}
                </span>
                {rowExtra?.(r)}
              </th>
              {weeks.map((w) => (
                <td key={w} className={`relative p-1 ${line} ${w === thisWeek ? "bg-safety/10" : ""}`}>
                  {cell(r, w)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tbody>
          <tr>
            <th scope="colgroup" colSpan={columns} className="border-t-2 border-machine bg-floor px-2 py-2 text-left">
              <span className="sticky left-2 inline-block">
                품목 합계(확정 — MPS 가 받는 수요)
                {sheet.unconfirmed > 0 && (
                  <span className="block text-xs font-normal text-muted">
                    미확정 {sheet.unconfirmed.toLocaleString("ko-KR")}칸은 확정해야 합계에 듭니다
                  </span>
                )}
                {sheet.filtered && (
                  <span className="block text-xs font-normal text-muted">
                    거른 줄만 보이지만 합계는 전체 고객입니다
                  </span>
                )}
              </span>
            </th>
          </tr>
          {sheet.totals.length === 0 && (
            <tr>
              <td colSpan={columns} className="px-5 py-4 text-muted">
                <span className="sticky left-5">이 {PAGE_WEEKS}주에 확정한 판매계획이 없습니다</span>
              </td>
            </tr>
          )}
          {/* 품목 합계 — 서버가 준 확정 칸만의 합 그대로(넣는 대로 바뀌지 않는다). */}
          {sheet.totals.map((t) => (
            <tr key={t.item.code}>
              <th
                scope="row"
                colSpan={leftSpan}
                className="sticky left-0 z-10 border-b border-rule bg-white px-2 py-1.5 font-normal"
              >
                <span className="font-mono">{t.item.code}</span> {t.item.name}{" "}
                <span className="text-muted">· {t.item.unit}</span>
              </th>
              {weeks.map((w) => {
                const qty = t.cells[w];
                return (
                  <td
                    key={w}
                    data-testid={`total-${t.item.code}-${w}`}
                    className={`border-b border-rule px-2.5 py-1.5 text-right font-semibold tabular-nums ${
                      w === thisWeek ? "bg-safety/10" : ""
                    }`}
                  >
                    {qty === undefined ? "" : shownQty(qty)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 저장 · 확정 · 확정 취소가 거절됐을 때 표 위의 알림 — 칸마다의 까닭은 칸 아래에 붙는다. */
export function PlanFailure({
  verb,
  formError,
  wrongLine,
}: {
  verb: string;
  formError: string | null;
  wrongLine?: string;
}) {
  return (
    <div role="alert" className="mt-4 max-w-3xl border-l-4 border-red-700 bg-white px-5 py-4">
      <p className="font-semibold">
        {verb}하지 않았습니다 — 칸이 하나라도 틀리면 아무것도 {verb}되지 않습니다.
      </p>
      {formError && <p className="mt-1 text-sm">{formError}</p>}
      {wrongLine && <p className="mt-1 text-sm">{wrongLine}</p>}
    </div>
  );
}

/** 「확정」 표시 — 칸 안쪽 왼쪽, 가운데 높이(칸 윗 테두리에 걸치지 않는다). */
export function FixedChip() {
  return (
    <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 rounded-sm bg-machine px-0.5 text-[0.625rem] leading-tight text-white">
      확정
    </span>
  );
}

function Badge({ children }: { children: string }) {
  return (
    <span className="ml-1 inline-block rounded-sm border border-muted px-1 text-xs whitespace-nowrap text-muted">
      {children}
    </span>
  );
}
