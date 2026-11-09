import Link from "next/link";
import type { MoveSummary } from "@/db/stock";

// 최근 전표 표 — 일자 · 전표 번호 · 유형(사유) · 줄 수 · 비고, 취소됨 · 취소 전표 표시. 넓은 표는 휴대폰 폭에서 옆으로 민다.
export function MoveList({ rows }: { rows: MoveSummary[] }) {
  if (rows.length === 0)
    return (
      <p className="mt-6 border border-dashed border-rule px-5 py-8 text-center text-muted">등록된 전표가 없습니다.</p>
    );
  return (
    <>
      <h2 className="mt-8 text-lg font-semibold">최근 전표</h2>
      <p className="text-sm text-muted">등록한 차례의 거꾸로 {rows.length}장까지.</p>
      <div className="relative mt-2 overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse bg-white text-left">
          <caption className="sr-only">최근 수불 전표</caption>
          <thead className="border-b-2 border-machine text-sm">
            <tr>
              <th scope="col" className="w-28 px-3 py-2">
                수불일자
              </th>
              <th scope="col" className="w-44 px-3 py-2">
                전표번호
              </th>
              <th scope="col" className="w-32 px-3 py-2">
                수불구분
              </th>
              <th scope="col" className="w-16 px-3 py-2 text-right">
                줄
              </th>
              <th scope="col" className="px-3 py-2">
                비고
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.code} className={`border-b border-rule align-top ${m.canceledBy ? "text-muted" : ""}`}>
                <td className="px-3 py-2.5 font-mono text-sm whitespace-nowrap">{m.moveDate}</td>
                <td className="px-3 py-2.5 font-mono text-sm whitespace-nowrap">
                  <Link
                    href={`/inventory/moves/${m.code}`}
                    className="font-semibold text-ink underline underline-offset-4 hover:text-machine"
                  >
                    {m.code}
                  </Link>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {m.moveTypeName}
                  {m.cancels && <Tag>취소 전표</Tag>}
                  {m.canceledBy && <Tag>취소됨</Tag>}
                </td>
                <td className="px-3 py-2.5 text-right">{m.lines}</td>
                <td className="px-3 py-2.5 wrap-anywhere">{m.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function Tag({ children }: { children: string }) {
  return <span className="ml-2 rounded border border-rule px-1.5 py-0.5 text-xs whitespace-nowrap">{children}</span>;
}
