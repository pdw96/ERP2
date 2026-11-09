import Link from "next/link";
import type { ReactNode } from "react";
import { queryString, type SortDir } from "@/lib/stock-query";

// 칸 머리로 세우기 · 쪽 넘김 — 수불 이력 · 수불부(조각 「재고 수불」 설계 「2026-11-09 — PR D 를 열기 전에 정한 것」).
// 엑셀처럼 칸 머리를 누르면 그 칸으로 세우고, 같은 머리를 다시 누르면 거꾸로다. 고른 칸 · 차례 · 쪽은 주소에 남는다 —
// 쪽을 넘기거나 거르기를 바꿔도, 주소를 남에게 보내도 그대로다. 칸을 바꾸면 1쪽으로 돌아간다.

export type Filters = Record<string, string | undefined>;

export function SortTh<K extends string>({
  label,
  sortKey,
  sort,
  dir,
  path,
  filters,
  numeric,
  className = "",
}: {
  label: ReactNode;
  sortKey: K;
  sort: K;
  dir: SortDir;
  path: string;
  filters: Filters;
  numeric?: boolean;
  className?: string;
}) {
  const active = sort === sortKey;
  const next: SortDir = active && dir === "asc" ? "desc" : "asc";
  const href = `${path}${queryString({ ...filters, sort: sortKey, dir: next === "asc" ? undefined : next })}`;
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
      className={`px-3 py-2 whitespace-nowrap ${numeric ? "text-right" : ""} ${className}`}
    >
      <Link
        href={href}
        replace
        scroll={false}
        className={`inline-flex items-center gap-1 underline-offset-4 hover:text-machine hover:underline ${
          active ? "text-ink" : ""
        }`}
      >
        {label}
        <span aria-hidden className={`w-3 text-xs ${active ? "text-machine" : "text-transparent"}`}>
          {active && dir === "desc" ? "▼" : "▲"}
        </span>
        <span className="sr-only">{active ? (dir === "asc" ? " — 오름차순" : " — 내림차순") : " — 눌러 세우기"}</span>
      </Link>
    </th>
  );
}

/** 「모두 N줄 · 1 / 3쪽」과 이전 · 다음 · 쪽 번호. 쪽이 하나면 쪽 번호를 두지 않는다. */
export function Pager({
  total,
  page,
  pages,
  path,
  params,
  unit = "줄",
}: {
  total: number;
  page: number;
  pages: number;
  path: string;
  /** 거르기 · 정렬 — 쪽을 넘겨도 그대로 둔다. */
  params: Filters;
  unit?: string;
}) {
  const href = (p: number) => `${path}${queryString({ ...params, page: p === 1 ? undefined : p })}`;
  const near = Array.from({ length: pages }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === pages || Math.abs(p - page) <= 2,
  );
  return (
    <nav aria-label="쪽" className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <span className="text-muted" aria-live="polite">
        모두 {total.toLocaleString("ko-KR")}
        {unit}
        {pages > 1 && ` · ${page} / ${pages}쪽`}
      </span>
      {pages > 1 && (
        <span className="flex flex-wrap items-center gap-1">
          {page > 1 ? (
            <PageLink href={href(page - 1)}>이전</PageLink>
          ) : (
            <span className="px-2 py-1 text-muted">이전</span>
          )}
          {near.map((p, i) => (
            <span key={p} className="flex items-center gap-1">
              {i > 0 && near[i - 1] !== p - 1 && <span className="text-muted">…</span>}
              {p === page ? (
                <span aria-current="page" className="rounded bg-machine px-2 py-1 font-semibold text-white">
                  {p}
                </span>
              ) : (
                <PageLink href={href(p)}>{p}</PageLink>
              )}
            </span>
          ))}
          {page < pages ? (
            <PageLink href={href(page + 1)}>다음</PageLink>
          ) : (
            <span className="px-2 py-1 text-muted">다음</span>
          )}
        </span>
      )}
    </nav>
  );
}

function PageLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} replace className="rounded border border-rule px-2 py-1 hover:bg-floor">
      {children}
    </Link>
  );
}

/** 거르기 폼의 기간 칸 둘. */
export function PeriodFields({ from, to }: { from: string; to: string }) {
  return (
    <fieldset className="grid grid-cols-[1fr_auto_1fr] items-end gap-2 sm:col-span-2">
      <legend className="mb-1 text-sm font-semibold">기간</legend>
      <label className="grid gap-1 text-sm">
        <span className="sr-only">시작일</span>
        <input
          type="date"
          name="from"
          defaultValue={from}
          required
          className="w-full min-w-0 rounded border border-rule px-2 py-2 text-base"
        />
      </label>
      <span className="pb-2 text-muted">~</span>
      <label className="grid gap-1 text-sm">
        <span className="sr-only">끝일</span>
        <input
          type="date"
          name="to"
          defaultValue={to}
          required
          className="w-full min-w-0 rounded border border-rule px-2 py-2 text-base"
        />
      </label>
    </fieldset>
  );
}

export type Option = { code: string; name: string; active: boolean };

export function CodeSelect({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string | undefined;
  options: readonly Option[];
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-semibold">{label}</span>
      <select
        name={name}
        defaultValue={value ?? ""}
        className="w-full min-w-0 rounded border border-rule px-3 py-2 text-base"
      >
        <option value="">전체</option>
        {options.map((o) => (
          <option key={o.code} value={o.code}>
            {o.code} {o.name}
            {o.active ? "" : " (사용 안 함)"}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Notices({ notices }: { notices: readonly { field: string; message: string }[] }) {
  if (notices.length === 0) return null;
  return (
    <ul role="status" className="text-sm font-semibold text-red-700 sm:col-span-full">
      {notices.map((n) => (
        <li key={n.field}>{n.message}</li>
      ))}
    </ul>
  );
}
