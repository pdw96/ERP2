import Link from "next/link";
import type { ReactNode } from "react";
import { iga } from "@/lib/josa";

// 조회 화면의 넓은 표(품목 조회 · 거래처 조회, ADR 0013) — 고칠 수 없는 화면이다.
// 모든 칸을 한 줄에 두고, 휴대폰 폭에서는 표를 옆으로 밀어 본다. 코드 · 이름 칸은 왼쪽에 붙어 밀어도 남는다(저자 판정 2026-11-04).
// 코드를 누르면 등록의 수정 화면으로 간다.

export type InquiryColumn<Row> = {
  label: string;
  cell: (row: Row) => ReactNode;
  /** 수량처럼 오른쪽에 맞추는 칸. */
  numeric?: boolean;
  /** 비고 · 주소처럼 긴 글 — 칸의 넓이를 두고 접는다. 아니면 한 줄로 둔다. */
  long?: boolean;
  mono?: boolean;
};

type Base = { id: number; code: string; name: string; active: boolean };

// 왼쪽에 붙는 칸 — 밀어도 남게 바탕을 칠하고, 오른쪽 가장자리를 선으로 가른다.
const STICKY = "sticky left-0 z-10 bg-white shadow-[inset_-1px_0_0_var(--color-rule)]";

export function InquiryTable<Row extends Base>({
  rows,
  columns,
  what,
  nameLabel,
  editHref,
  includeInactive,
  narrowed,
}: {
  rows: readonly Row[];
  columns: readonly InquiryColumn<Row>[];
  /** 「품목」 · 「거래처」 — 표의 이름과 빈 알림. */
  what: string;
  /** 왼쪽 칸에서 코드 밑에 보이는 이름의 칸 이름 — 「품명」 · 「거래처명」. */
  nameLabel: string;
  editHref: (code: string) => string;
  includeInactive: boolean;
  /** 찾기 · 거르기가 걸렸는지 — 빈 알림의 말을 가른다. */
  narrowed: boolean;
}) {
  if (rows.length === 0) {
    return (
      <p className="mt-6 border border-dashed border-rule px-5 py-8 text-center text-muted">
        {narrowed ? `찾는 ${iga(what)} 없습니다.` : `등록된 ${iga(what)} 없습니다.`}
      </p>
    );
  }
  return (
    <>
      <p className="mt-4 text-sm text-muted" aria-live="polite">
        {rows.length}개{includeInactive ? " · 사용 안 함 포함" : ""}
        <span className="md:hidden"> · 표를 옆으로 밀면 다른 열이 보입니다</span>
      </p>
      <div
        className="mt-2 overflow-x-auto border-x border-rule bg-white"
        tabIndex={0}
        role="region"
        aria-label={`${what} 조회 표`}
      >
        <table className="w-max min-w-full border-collapse text-left text-sm">
          <caption className="sr-only">{what} 조회 — 모든 열</caption>
          <thead className="border-b-2 border-machine">
            <tr>
              <th scope="col" className={`${STICKY} px-3 py-2 whitespace-nowrap`}>
                코드 · {nameLabel}
              </th>
              {columns.map((c) => (
                <th
                  key={c.label}
                  scope="col"
                  className={`px-3 py-2 whitespace-nowrap ${c.numeric ? "text-right" : ""}`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={`border-b border-rule align-top ${row.active ? "" : "text-muted"}`}>
                <th
                  scope="row"
                  className={`${STICKY} w-40 max-w-40 px-3 py-2 text-left font-normal sm:w-56 sm:max-w-56`}
                >
                  <Link
                    href={editHref(row.code)}
                    className="font-mono font-semibold text-ink underline underline-offset-4 hover:text-machine"
                  >
                    {row.code}
                  </Link>
                  <span className="block font-semibold wrap-anywhere">{row.name}</span>
                </th>
                {columns.map((c) => (
                  <td
                    key={c.label}
                    className={`px-3 py-2 ${c.numeric ? "text-right tabular-nums" : ""} ${c.mono ? "font-mono" : ""} ${
                      c.long ? "max-w-72 min-w-48 whitespace-pre-line wrap-anywhere" : "whitespace-nowrap"
                    }`}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** 빈 글 칸은 「—」로. */
export const orDash = (s: string | null | undefined) => (s ? s : "—");

/** 마지막 수정일 — 한국 시각의 날짜(2026-11-04). */
export const dateKst = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
