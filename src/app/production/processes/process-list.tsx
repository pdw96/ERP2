import Form from "next/form";
import Link from "next/link";
import { SavedNotice as Notice } from "@/components/saved-notice";
import type { Process, ProcessFilter, ProcessFilterNotice } from "@/db/processes";

// 공정 목록 화면의 부품 — 찾기, 표, 저장 뒤의 알림.

export function ProcessSearch({ filter, notices }: { filter: ProcessFilter; notices: ProcessFilterNotice[] }) {
  const filtered = !!(filter.q || filter.includeInactive);
  return (
    <Form
      key={JSON.stringify(filter)}
      action="/production/processes"
      replace
      role="search"
      aria-label="공정 찾기"
      className="mt-6 grid gap-3 border-y border-rule bg-white px-4 py-4 sm:grid-cols-[1fr_auto_auto] sm:items-end"
    >
      <label className="grid gap-1 text-sm">
        <span className="font-semibold">코드 · 공정명</span>
        <input
          type="search"
          name="q"
          defaultValue={filter.q}
          maxLength={50}
          placeholder="예: DA, 본딩"
          className="w-full min-w-0 rounded border border-rule px-3 py-2 text-base"
        />
      </label>
      <label className="flex items-center gap-2 py-2 text-sm">
        <input
          type="checkbox"
          name="inactive"
          value="1"
          defaultChecked={filter.includeInactive}
          className="size-5 accent-machine"
        />
        사용 안 함 포함
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" className="rounded border border-machine px-5 py-2 font-semibold hover:bg-floor">
          찾기
        </button>
        {filtered && (
          <Link href="/production/processes" className="text-sm text-muted underline underline-offset-4 hover:text-ink">
            처음대로
          </Link>
        )}
      </div>
      {notices.length > 0 && (
        <ul role="status" className="text-sm font-semibold text-red-700 sm:col-span-full">
          {notices.map((n) => (
            <li key={n.field}>{n.message}</li>
          ))}
        </ul>
      )}
    </Form>
  );
}

export function SavedNotice({ process, shown }: { process: Process; shown: boolean }) {
  return (
    <Notice
      code={process.code}
      name={process.name}
      active={process.active}
      shown={shown}
      listHref="/production/processes"
    />
  );
}

export function ProcessList({
  rows,
  filter,
  savedCode,
}: {
  rows: Process[];
  filter: ProcessFilter;
  savedCode?: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="mt-6 border border-dashed border-rule px-5 py-8 text-center text-muted">
        {filter.q ? "찾는 공정이 없습니다." : "등록된 공정이 없습니다."}
      </p>
    );
  }
  return (
    <>
      <p className="mt-4 text-sm text-muted" aria-live="polite">
        {rows.length}개{filter.includeInactive ? " · 사용 안 함 포함" : ""}
      </p>
      <table className="mt-2 w-full border-collapse bg-white text-left">
        <caption className="sr-only">공정 목록</caption>
        <thead className="border-b-2 border-machine text-sm">
          <tr>
            <th scope="col" className="w-28 px-3 py-2">
              코드
            </th>
            <th scope="col" className="px-3 py-2">
              공정명
            </th>
            <th scope="col" className="px-3 py-2">
              비고
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr
              key={p.id}
              className={`border-b border-rule align-top ${p.code === savedCode ? "bg-safety/15" : ""} ${
                p.active ? "" : "text-muted"
              }`}
            >
              <td className="px-3 py-2.5 font-mono text-sm whitespace-nowrap">
                <Link
                  href={`/production/processes/${p.code}`}
                  className="font-semibold text-ink underline underline-offset-4 hover:text-machine"
                >
                  {p.code}
                </Link>
              </td>
              <td className="px-3 py-2.5 wrap-anywhere">
                <span className="font-semibold">{p.name}</span>
                {!p.active && (
                  <span className="ml-2 rounded border border-rule px-1.5 py-0.5 text-xs whitespace-nowrap">
                    사용 안 함
                  </span>
                )}
              </td>
              <td className="px-3 py-2.5 text-sm wrap-anywhere whitespace-pre-line">{p.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
