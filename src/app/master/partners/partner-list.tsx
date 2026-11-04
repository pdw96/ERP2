import Form from "next/form";
import Link from "next/link";
import { SavedNotice as Notice } from "@/components/saved-notice";
import {
  bizNoOf,
  PARTNER_ROLES,
  roleNames,
  type Partner,
  type PartnerFilter,
  type PartnerFilterNotice,
  type SharedBizNo,
} from "@/db/partners";
import { KOREA } from "@/lib/master-codes";
import { BizNoWarning } from "./biz-no-warning";

// 거래처 목록 화면의 부품 — 찾기 · 거르기, 표, 저장 뒤의 알림.

export function PartnerSearch({ filter, notices }: { filter: PartnerFilter; notices: PartnerFilterNotice[] }) {
  const filtered = !!(filter.q || filter.role || filter.includeInactive);
  return (
    <Form
      key={JSON.stringify(filter)}
      action="/master/partners"
      replace
      role="search"
      aria-label="거래처 찾기"
      className="mt-6 grid gap-3 border-y border-rule bg-white px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-end md:grid-cols-[1fr_auto_auto_auto]"
    >
      <label className="grid gap-1 text-sm">
        <span className="font-semibold">코드 · 거래처명</span>
        <input
          type="search"
          name="q"
          defaultValue={filter.q}
          maxLength={50}
          placeholder="예: BP-0001, 누리"
          className="w-full min-w-0 rounded border border-rule px-3 py-2 text-base"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-semibold">구분</span>
        <select
          name="role"
          defaultValue={filter.role ?? ""}
          className="w-full min-w-0 rounded border border-rule px-3 py-2 text-base"
        >
          <option value="">전체</option>
          {PARTNER_ROLES.map((r) => (
            <option key={r.code} value={r.code}>
              {r.name}
            </option>
          ))}
        </select>
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
          <Link href="/master/partners" className="text-sm text-muted underline underline-offset-4 hover:text-ink">
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

export function SavedNotice({
  partner,
  shown,
  sharedBizNo = [],
}: {
  partner: Partner;
  shown: boolean;
  sharedBizNo?: SharedBizNo[];
}) {
  return (
    <Notice code={partner.code} name={partner.name} active={partner.active} shown={shown} listHref="/master/partners">
      {bizNoOf(partner) && (
        <BizNoWarning bizNo={bizNoOf(partner)!} korean={partner.country === KOREA} shared={sharedBizNo} />
      )}
    </Notice>
  );
}

export function PartnerList({
  rows,
  filter,
  savedCode,
  countries = {},
}: {
  rows: Partner[];
  filter: PartnerFilter;
  savedCode?: string;
  /** 국가 코드 → 이름. 없으면 코드만 보인다. */
  countries?: Record<string, string>;
}) {
  if (rows.length === 0) {
    return (
      <p className="mt-6 border border-dashed border-rule px-5 py-8 text-center text-muted">
        {filter.q || filter.role ? "찾는 거래처가 없습니다." : "등록된 거래처가 없습니다."}
      </p>
    );
  }
  return (
    <>
      <p className="mt-4 text-sm text-muted" aria-live="polite">
        {rows.length}개{filter.includeInactive ? " · 사용 안 함 포함" : ""}
      </p>
      <table className="mt-2 w-full border-collapse bg-white text-left">
        <caption className="sr-only">거래처 목록</caption>
        <thead className="border-b-2 border-machine text-sm">
          <tr>
            <th scope="col" className="px-3 py-2">
              코드
            </th>
            <th scope="col" className="px-3 py-2">
              거래처명
            </th>
            <th scope="col" className="px-3 py-2">
              구분
            </th>
            <th scope="col" className="px-3 py-2">
              국가
            </th>
            <th scope="col" className="hidden px-3 py-2 md:table-cell">
              사업자번호
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
                  href={`/master/partners/${p.code}`}
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
              <td className="px-3 py-2.5 text-sm">{roleNames(p)}</td>
              <td className="px-3 py-2.5 text-sm whitespace-nowrap">
                <span className="font-mono">{p.country}</span>
                {countries[p.country] && <span className="ml-1 hidden sm:inline">{countries[p.country]}</span>}
              </td>
              <td className="hidden px-3 py-2.5 font-mono text-sm tabular-nums wrap-anywhere md:table-cell">
                {bizNoOf(p) ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
