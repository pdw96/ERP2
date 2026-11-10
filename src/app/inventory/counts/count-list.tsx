import Link from "next/link";
import type { CountSummary } from "@/db/stock-counts";

// 최근 실사 — 모든 창고 · 모든 상태, 등록한 차례의 거꾸로(저자 판정). 넓은 표는 휴대폰 폭에서 옆으로 민다.
export function CountList({ rows }: { rows: CountSummary[] }) {
  const title = <h2 className="text-lg font-semibold">최근 실사</h2>;
  if (rows.length === 0)
    return (
      <>
        {title}
        <p className="mt-2 border border-dashed border-rule px-5 py-8 text-center text-muted">
          등록된 실사가 없습니다.
        </p>
      </>
    );
  return (
    <>
      {title}
      <p className="text-sm text-muted">
        등록한 차례의 거꾸로 {rows.length}건까지 — 모든 창고 · 작성 중 · 확정 · 취소. 실사 차이는 「재고조정 등록」과
        「수불 이력」에서도 보입니다.
      </p>
      <div className="relative mt-2 overflow-x-auto">
        <table className="w-full min-w-[46rem] border-collapse bg-white text-left">
          <caption className="sr-only">최근 재고 실사</caption>
          <thead className="border-b-2 border-machine text-sm">
            <tr>
              <th scope="col" className="w-44 px-3 py-2">
                실사번호
              </th>
              <th scope="col" className="px-3 py-2">
                창고
              </th>
              <th scope="col" className="w-24 px-3 py-2">
                상태
              </th>
              <th scope="col" className="w-28 px-3 py-2">
                확정일자
              </th>
              <th scope="col" className="w-16 px-3 py-2 text-right">
                줄
              </th>
              <th scope="col" className="w-44 px-3 py-2">
                조정 전표
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr
                key={c.code}
                className={`border-b border-rule align-top ${c.status === "CANCELED" ? "text-muted" : ""}`}
              >
                <td className="px-3 py-2.5 font-mono text-sm whitespace-nowrap">
                  <Link
                    href={`/inventory/counts/${c.code}`}
                    className="font-semibold text-ink underline underline-offset-4 hover:text-machine"
                  >
                    {c.code}
                  </Link>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">{c.warehouse}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <StatusTag status={c.status} name={c.statusName} />
                </td>
                <td className="px-3 py-2.5 font-mono text-sm whitespace-nowrap">{c.confirmedDate ?? "—"}</td>
                <td className="px-3 py-2.5 text-right">{c.lines}</td>
                <td className="px-3 py-2.5 font-mono text-sm whitespace-nowrap">
                  {c.moveCode ? (
                    <Link
                      href={`/inventory/moves/${c.moveCode}`}
                      className="underline underline-offset-4 hover:text-machine"
                    >
                      {c.moveCode}
                    </Link>
                  ) : c.status === "CONFIRMED" ? (
                    <span className="text-muted">차이 없음</span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** 실사의 상태 — 작성 중은 눈에 띄게, 취소는 흐리게. */
export function StatusTag({ status, name }: { status: string; name: string }) {
  const tone =
    status === "DRAFT"
      ? "border-safety bg-safety/15 font-semibold"
      : status === "CANCELED"
        ? "border-rule text-muted"
        : "border-machine";
  return <span className={`rounded border px-1.5 py-0.5 text-xs whitespace-nowrap ${tone}`}>{name}</span>;
}
