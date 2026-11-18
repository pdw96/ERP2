import Form from "next/form";
import Link from "next/link";
import { SavedNotice as Notice } from "@/components/saved-notice";
import type { ClsOption, DefectTypeFilter, DefectTypeFilterNotice, DefectTypeRow } from "@/db/defect-types";
import type { ProcessOption } from "@/db/processes";

// 불량 유형 목록 화면의 부품 — 찾기, 표, 저장 뒤의 알림.

const selectClass = "w-full min-w-0 rounded border border-rule px-3 py-2 text-base";

export function DefectTypeSearch({
  filter,
  notices,
  classes,
  processes,
}: {
  filter: DefectTypeFilter;
  notices: DefectTypeFilterNotice[];
  classes: ClsOption[];
  processes: ProcessOption[];
}) {
  const filtered = !!(filter.q || filter.cls || filter.process || filter.includeInactive);
  return (
    <Form
      key={JSON.stringify(filter)}
      action="/quality/defect-types"
      replace
      role="search"
      aria-label="불량 유형 찾기"
      className="mt-6 grid gap-3 border-y border-rule bg-white px-4 py-4 sm:grid-cols-2 sm:items-end lg:grid-cols-[1fr_auto_auto_auto]"
    >
      <label className="grid gap-1 text-sm">
        <span className="font-semibold">코드 · 불량유형명</span>
        <input
          type="search"
          name="q"
          defaultValue={filter.q}
          maxLength={50}
          placeholder="예: WIRE, 크랙"
          className="w-full min-w-0 rounded border border-rule px-3 py-2 text-base"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-semibold">대분류</span>
        <select name="cls" defaultValue={filter.cls} className={selectClass}>
          <option value="">모든 대분류</option>
          {classes.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
              {c.active ? "" : " (사용 안 함)"}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-semibold">발생 공정</span>
        <select name="process" defaultValue={filter.process} className={selectClass}>
          <option value="">모든 공정</option>
          {processes.map((p) => (
            <option key={p.code} value={p.code}>
              {p.code} {p.name}
              {p.active ? "" : " (사용 안 함)"}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted">그 공정에서 고를 수 있는 불량 — 공통 불량도 보입니다</span>
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
      <div className="flex items-center gap-3 sm:col-span-full">
        <button type="submit" className="rounded border border-machine px-5 py-2 font-semibold hover:bg-floor">
          찾기
        </button>
        {filtered && (
          <Link href="/quality/defect-types" className="text-sm text-muted underline underline-offset-4 hover:text-ink">
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

export function SavedNotice({ defectType, shown }: { defectType: DefectTypeRow; shown: boolean }) {
  return (
    <Notice
      code={defectType.code}
      name={defectType.name}
      active={defectType.active}
      shown={shown}
      listHref="/quality/defect-types"
    />
  );
}

export function DefectTypeList({
  rows,
  filter,
  savedCode,
}: {
  rows: DefectTypeRow[];
  filter: DefectTypeFilter;
  savedCode?: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="mt-6 border border-dashed border-rule px-5 py-8 text-center text-muted">
        {filter.q || filter.cls || filter.process ? "찾는 불량 유형이 없습니다." : "등록된 불량 유형이 없습니다."}
      </p>
    );
  }
  return (
    <>
      <p className="mt-4 text-sm text-muted" aria-live="polite">
        {rows.length}개{filter.includeInactive ? " · 사용 안 함 포함" : ""}
      </p>
      <table className="mt-2 w-full border-collapse bg-white text-left">
        <caption className="sr-only">불량 유형 목록</caption>
        <thead className="border-b-2 border-machine text-sm">
          <tr>
            <th scope="col" className="w-32 px-3 py-2">
              코드
            </th>
            <th scope="col" className="px-3 py-2">
              불량유형명
            </th>
            <th scope="col" className="px-3 py-2">
              대분류
            </th>
            <th scope="col" className="px-3 py-2">
              발생 공정
            </th>
            <th scope="col" className="px-3 py-2">
              사용 여부
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr
              key={d.id}
              className={`border-b border-rule align-top ${d.code === savedCode ? "bg-safety/15" : ""} ${
                d.active ? "" : "text-muted"
              }`}
            >
              <td className="px-3 py-2.5 font-mono text-sm whitespace-nowrap">
                <Link
                  href={`/quality/defect-types/${d.code}`}
                  className="font-semibold text-ink underline underline-offset-4 hover:text-machine"
                >
                  {d.code}
                </Link>
              </td>
              <td className="px-3 py-2.5 font-semibold wrap-anywhere">{d.name}</td>
              <td className="px-3 py-2.5 text-sm wrap-anywhere">{d.clsName}</td>
              <td className="px-3 py-2.5 font-mono text-sm wrap-anywhere">
                {d.processes.length
                  ? d.processes.map((p) => (p.active ? p.code : `${p.code}(사용 안 함)`)).join(" · ")
                  : "공통"}
              </td>
              <td className="px-3 py-2.5 text-sm whitespace-nowrap">{d.active ? "사용" : "사용 안 함"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
