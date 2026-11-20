import { SALES_PLAN_HISTORY_SHOWN, type SalesPlanChangeRow } from "@/db/sales-plans";
import { weekLabel } from "@/lib/weeks";
import { shownQty } from "./plan-qty";

// 판매계획의 고친 이력(메뉴 「판매계획 등록」) — 최근 것부터, 저장 · 확정 · 확정 취소한 칸마다 한 줄. 범위는 위의 거르기와 같다(고객 · 품목, 모든 주).
// 확정 · 확정 취소 줄은 수량이 바뀌지 않아(전 = 후) 그때 수량 하나만 보인다.
// 누가 고쳤는지는 아직 남지 않는다 — 로그인이 생긴 뒤(BOM · 라우팅과 같다). 읽기만 한다.

const shown = (qty: string | null) => (qty === null ? "—" : shownQty(qty));
const KIND: Record<SalesPlanChangeRow["kind"], string> = { EDIT: "고침", CONFIRM: "확정", UNCONFIRM: "확정 취소" };

export function SalesPlanHistory({
  rows,
  total,
  thisWeek,
}: {
  rows: SalesPlanChangeRow[];
  total: number;
  /** 이번 주(월요일) — 주 머리의 해를 가른다(「48주」 · 「2027년 1주」). */
  thisWeek: string;
}) {
  return (
    <section className="mt-10 border-t border-rule pt-4" aria-labelledby="sales-plan-history">
      <h2 id="sales-plan-history" className="font-semibold">
        고친 이력
      </h2>
      <p className="text-sm text-muted">
        저장할 때마다 바뀐 칸이, 확정 · 확정 취소할 때마다 그 칸이 한 줄씩 남습니다(최근 것부터). 위의 거르기와 같은
        범위이고, 일시는 한국 시각입니다. 누가 고쳤는지는 로그인이 생긴 뒤 남깁니다.
      </p>
      {total > SALES_PLAN_HISTORY_SHOWN && (
        <p className="mt-1 text-sm">
          최근 {SALES_PLAN_HISTORY_SHOWN}줄만 보입니다(전체 {total.toLocaleString("ko-KR")}줄)
        </p>
      )}
      {rows.length === 0 ? (
        <p className="mt-3 border border-dashed border-rule px-5 py-6 text-center text-sm text-muted">
          고친 이력이 없습니다
        </p>
      ) : (
        <div
          className="relative mt-3 overflow-x-auto border-x border-rule bg-white"
          tabIndex={0}
          role="region"
          aria-label="고친 이력 표"
        >
          <table className="w-full min-w-[50rem] border-collapse text-left text-sm">
            <caption className="sr-only">
              판매계획 고친 이력 — 일시 · 고객 · 품목 · 주 · 구분 · 전 · 후(확정 · 확정 취소는 그때 수량 하나)
            </caption>
            <thead className="border-b-2 border-machine">
              <tr>
                <th scope="col" className="w-36 px-2 py-2">
                  일시
                </th>
                <th scope="col" className="px-2 py-2">
                  고객
                </th>
                <th scope="col" className="px-2 py-2">
                  품목
                </th>
                <th scope="col" className="w-24 px-2 py-2">
                  주
                </th>
                <th scope="col" className="w-24 px-2 py-2">
                  구분
                </th>
                <th scope="col" className="w-28 px-2 py-2 text-right">
                  전
                </th>
                <th scope="col" className="w-28 px-2 py-2 text-right">
                  후
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-rule align-top">
                  <td className="px-2 py-1.5 whitespace-nowrap text-muted tabular-nums">{r.savedAt}</td>
                  <td className="px-2 py-1.5">
                    <span className="font-mono">{r.customer.code}</span> {r.customer.name}
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="font-mono">{r.item.code}</span> {r.item.name}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{weekLabel(r.week, thisWeek)}</td>
                  <td className={`px-2 py-1.5 whitespace-nowrap ${r.kind === "EDIT" ? "" : "font-semibold"}`}>
                    {KIND[r.kind]}
                  </td>
                  {r.kind === "EDIT" ? (
                    <>
                      <td className="px-2 py-1.5 text-right tabular-nums">{shown(r.before)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{shown(r.after)}</td>
                    </>
                  ) : (
                    <td colSpan={2} className="px-2 py-1.5 text-right tabular-nums">
                      {shown(r.after)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
