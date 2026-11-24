import Form from "next/form";
import Link from "next/link";
import { shownQty } from "@/app/sales/plans/plan-qty";
import { Pager, type Filters } from "@/components/sort-pager";
import type { MrpOrderQuery, openMrpOrders } from "@/db/mrp";
import { ITEM_TYPES } from "@/lib/master-codes";
import { WEEKDAY_NAMES } from "@/lib/mrp-calc";
import { toMs } from "@/lib/weeks";
import { MRP_PATH } from "./paths";

// 계획오더 목록(메뉴 「MRP」) — 가장 새 실행의 계획오더를 번호 차례로, 쪽당 100줄. 거르기는 구분 · 품목 유형 · 늦은 것만(GET 폼, 주소에 남는다).
// 날짜는 「MM-DD(요일)」, 비고는 「N일 늦음」(빨강 — 시작일을 실행한 날로 당긴 날수)과 「BOM 없음」(생산인데 펼칠 BOM 줄이 없음). 읽기만 한다.

type Orders = Awaited<ReturnType<typeof openMrpOrders>>;

const KIND: Record<"MAKE" | "BUY", string> = { MAKE: "생산", BUY: "구매" };
const NOT_RUN = "아직 MRP 를 실행하지 않았습니다 — [MRP 실행]을 누르세요";

/** 「11-24(화)」 — 요일은 UTC 날짜로 센다(서버의 지역 시각에 기대지 않는다). */
function shortDate(date: string): string {
  const weekday = WEEKDAY_NAMES[(new Date(toMs(date)).getUTCDay() + 6) % 7];
  return `${date.slice(5, 7)}-${date.slice(8, 10)}(${weekday})`;
}

/** 주소에 남기는 거르기 — 기본값(전체 · 늦음 끔)은 싣지 않는다. */
function filtersOf(q: MrpOrderQuery): Filters {
  return { kind: q.kind ?? undefined, type: q.itemType ?? undefined, late: q.lateOnly ? "1" : undefined };
}

export function MrpOrders({ orders, query }: { orders: Orders; query: MrpOrderQuery }) {
  if (!orders.run)
    return <p className="mt-4 border border-dashed border-rule px-5 py-6 text-center text-sm text-muted">{NOT_RUN}</p>;
  const filters = filtersOf(query);
  const filtered = Object.values(filters).some((v) => v !== undefined);
  const select = "w-full min-w-0 rounded border border-rule px-3 py-2 text-base";
  const cell = "px-2 py-2 whitespace-nowrap";
  const num = `${cell} text-right tabular-nums`;

  return (
    <>
      <Form
        key={JSON.stringify(filters)}
        action={MRP_PATH}
        replace
        role="search"
        aria-label="계획오더 거르기"
        className="mt-4 grid max-w-4xl gap-3 border-y border-rule bg-white px-4 py-4 sm:grid-cols-3 sm:items-end"
      >
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">구분</span>
          <select name="kind" defaultValue={query.kind ?? ""} className={select}>
            <option value="">전체</option>
            <option value="MAKE">생산</option>
            <option value="BUY">구매</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">품목 유형</span>
          <select name="type" defaultValue={query.itemType ?? ""} className={select}>
            <option value="">전체</option>
            {ITEM_TYPES.map((t) => (
              <option key={t.code} value={t.code}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 py-2 text-sm font-semibold">
          <input type="checkbox" name="late" value="1" defaultChecked={query.lateOnly} className="size-4" />
          늦은 것만
        </label>
        <div className="flex items-center gap-3 sm:col-span-full">
          <button type="submit" className="rounded border border-machine px-5 py-2 font-semibold hover:bg-floor">
            보기
          </button>
          <Link href={MRP_PATH} className="text-sm text-muted underline underline-offset-4 hover:text-ink">
            처음대로
          </Link>
        </div>
      </Form>
      <Pager {...orders} path={MRP_PATH} params={filters} unit="건" />
      <p className="text-sm text-muted md:hidden">표를 옆으로 밀면 다른 열이 보입니다</p>
      <div
        className="relative mt-2 overflow-x-auto border-x border-rule bg-white"
        tabIndex={0}
        role="region"
        aria-label="계획오더 표"
      >
        <table className="w-max min-w-full border-collapse text-left text-sm">
          <caption className="sr-only">계획오더 — 번호 · 구분 · 품목 · 수량 · 단위 · 시작일 · 완성일 · 비고</caption>
          <thead>
            <tr className="border-b-2 border-machine">
              <th scope="col" className={cell}>
                번호
              </th>
              <th scope="col" className={cell}>
                구분
              </th>
              <th scope="col" className={cell}>
                품목
              </th>
              <th scope="col" className={`${cell} text-right`}>
                수량
              </th>
              <th scope="col" className={cell}>
                단위
              </th>
              <th scope="col" className={cell}>
                시작일
              </th>
              <th scope="col" className={cell}>
                완성일
              </th>
              <th scope="col" className={cell}>
                비고
              </th>
            </tr>
          </thead>
          <tbody>
            {orders.rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-8 text-muted">
                  {filtered ? "이 거르기에 맞는 계획오더가 없습니다" : "계획오더가 없습니다 — 모자란 품목이 없습니다"}
                </td>
              </tr>
            )}
            {orders.rows.map((r) => (
              <tr key={r.number} className="border-b border-rule align-top">
                <td className={`${cell} font-mono`}>{r.number}</td>
                <td className={cell}>{KIND[r.kind]}</td>
                <td className="px-2 py-2">
                  <span className="font-mono">{r.item.code}</span> {r.item.name}
                  {!r.item.active && (
                    <span className="ml-1 inline-block rounded-sm border border-muted px-1 text-xs whitespace-nowrap text-muted">
                      사용 안 함
                    </span>
                  )}
                </td>
                <td className={`${num} font-semibold`}>{shownQty(r.qty)}</td>
                <td className={cell}>{r.unit}</td>
                <td className={`${cell} tabular-nums`}>{shortDate(r.startDate)}</td>
                <td className={`${cell} tabular-nums`}>{shortDate(r.dueDate)}</td>
                <td className={cell}>
                  {r.lateDays > 0 && <span className="font-semibold text-red-700">{r.lateDays}일 늦음</span>}
                  {r.lateDays > 0 && r.noBom && " · "}
                  {r.noBom && <span>BOM 없음</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {orders.pages > 1 && <Pager {...orders} path={MRP_PATH} params={filters} unit="건" />}
    </>
  );
}
