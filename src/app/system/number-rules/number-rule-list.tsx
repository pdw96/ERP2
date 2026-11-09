import Link from "next/link";
import type { NumberRule } from "@/db/number-rules";
import { itemTypeName } from "@/lib/master-codes";
import { dateFormatLabel, formatLotNumber, separatorLabel } from "@/lib/number-rule-fields";

// 번호 규칙의 표 — 꼴(머리 · 구분자 · 날짜 꼴 · 일련 자릿수)과 오늘 날짜의 첫 번호를 함께 보인다. 넓은 표는 옆으로 민다.
export function NumberRuleTable({
  rules,
  today,
  savedCode,
}: {
  rules: NumberRule[];
  today: string;
  savedCode?: string;
}) {
  if (rules.length === 0)
    return (
      <p className="mt-6 border border-dashed border-rule px-5 py-8 text-center text-muted">등록된 규칙이 없습니다.</p>
    );
  return (
    <>
      <p className="mt-6 text-sm text-muted">
        {rules.length}개 · 번호의 예는 오늘({today}) 첫 번호입니다
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[44rem] border-collapse bg-white text-left">
          <caption className="sr-only">번호 규칙 목록</caption>
          <thead className="border-b-2 border-machine text-sm">
            <tr>
              <th scope="col" className="px-3 py-2">
                코드
              </th>
              <th scope="col" className="px-3 py-2">
                이름
              </th>
              <th scope="col" className="px-3 py-2">
                머리
              </th>
              <th scope="col" className="px-3 py-2">
                구분자
              </th>
              <th scope="col" className="px-3 py-2">
                날짜 꼴
              </th>
              <th scope="col" className="px-3 py-2">
                일련
              </th>
              <th scope="col" className="px-3 py-2">
                번호의 예
              </th>
              <th scope="col" className="px-3 py-2">
                기본
              </th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr
                key={r.id}
                className={`border-b border-rule align-top ${r.code === savedCode ? "bg-safety/15" : ""} ${
                  r.active ? "" : "text-muted"
                }`}
              >
                <td className="px-3 py-2.5 font-mono text-sm whitespace-nowrap">
                  <Link
                    href={`/system/number-rules/${r.code}`}
                    className="font-semibold text-ink underline underline-offset-4 hover:text-machine"
                  >
                    {r.code}
                  </Link>
                </td>
                <td className="px-3 py-2.5 wrap-anywhere">
                  <span className="font-semibold">{r.name}</span>
                  {!r.active && (
                    <span className="ml-2 rounded border border-rule px-1.5 py-0.5 text-xs whitespace-nowrap">
                      사용 안 함
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 font-mono text-sm">{r.prefix || "없음"}</td>
                <td className="px-3 py-2.5 text-sm whitespace-nowrap">{separatorLabel(r.separator)}</td>
                <td className="px-3 py-2.5 font-mono text-sm">{dateFormatLabel(r.dateFormat)}</td>
                <td className="px-3 py-2.5 text-sm whitespace-nowrap">{r.seqDigits}자리</td>
                <td className="px-3 py-2.5 font-mono text-sm whitespace-nowrap">{formatLotNumber(r, today, 1)}</td>
                <td className="px-3 py-2.5 text-sm whitespace-nowrap">
                  {r.defaultFor ? `${itemTypeName(r.defaultFor)}의 기본` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
