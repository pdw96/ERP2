import Form from "next/form";
import Link from "next/link";
import type { ProcessChoice, RoutingFilter, RoutingFilterNotice, RoutingListRow } from "@/db/routings";
import { itemTypeName } from "@/lib/master-codes";

// 라우팅 목록 화면의 부품 — 찾기, 표.

const field = "w-full min-w-0 rounded border border-rule px-3 py-2 text-base";

export function RoutingSearch({
  filter,
  notices,
  processes,
}: {
  filter: RoutingFilter;
  notices: RoutingFilterNotice[];
  processes: ProcessChoice[];
}) {
  const filtered = !!(filter.q || filter.process || filter.workCenter);
  return (
    <Form
      key={JSON.stringify(filter)}
      action="/production/routings"
      replace
      role="search"
      aria-label="라우팅 찾기"
      className="mt-4 grid gap-3 border-y border-rule bg-white px-4 py-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
    >
      <label className="grid gap-1 text-sm">
        <span className="font-semibold">품목코드 · 품명</span>
        <input
          type="search"
          name="q"
          defaultValue={filter.q}
          maxLength={50}
          placeholder="예: FG-0001"
          className={field}
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-semibold">공정</span>
        <select name="process" defaultValue={filter.process} className={field}>
          <option value="">모든 공정</option>
          {processes.map((p) => (
            <option key={p.code} value={p.code}>
              {p.code} {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-semibold">작업장</span>
        <select name="workCenter" defaultValue={filter.workCenter} className={field}>
          <option value="">모든 작업장</option>
          {processes.flatMap((p) =>
            p.workCenters.map((w) => (
              <option key={w.code} value={w.code}>
                {w.code} {w.name}
              </option>
            )),
          )}
        </select>
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" className="rounded border border-machine px-5 py-2 font-semibold hover:bg-floor">
          찾기
        </button>
        {filtered && (
          <Link href="/production/routings" className="text-sm text-muted underline underline-offset-4 hover:text-ink">
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

const heads = ["품목", "품명", "유형", "공정 흐름", "공정 수", "준비시간 합(분)", "개당 시간 합(초)"];

export function RoutingList({ rows, filter }: { rows: RoutingListRow[]; filter: RoutingFilter }) {
  if (rows.length === 0) {
    return (
      <p className="mt-6 border border-dashed border-rule px-5 py-8 text-center text-muted">
        {filter.q || filter.process || filter.workCenter ? "찾는 라우팅이 없습니다" : "등록된 라우팅이 없습니다"}
      </p>
    );
  }
  return (
    <>
      <p className="mt-4 text-sm text-muted" aria-live="polite">
        {rows.length}개
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[44rem] border-collapse bg-white text-left">
          <caption className="sr-only">라우팅 목록</caption>
          <thead className="border-b-2 border-machine text-sm">
            <tr>
              {heads.map((h, i) => (
                <th key={h} scope="col" className={`px-3 py-2 ${i >= 4 ? "text-right" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code} className={`border-b border-rule align-top ${r.active ? "" : "text-muted"}`}>
                <td className="px-3 py-2.5 font-mono text-sm whitespace-nowrap">
                  <Link
                    href={`/production/routings/${r.code}`}
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
                <td className="px-3 py-2.5 whitespace-nowrap">{itemTypeName(r.itemType)}</td>
                <td className="px-3 py-2.5 font-mono text-sm wrap-anywhere">{r.flow.join(" → ")}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.steps}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.setupMin}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.runSec}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
