import Form from "next/form";
import Link from "next/link";
import { SavedNotice as Notice } from "@/components/saved-notice";
import type { Warehouse, WarehouseFilter, WarehouseFilterNotice } from "@/db/warehouses";

// 창고 목록 화면의 부품 — 찾기, 표, 저장 뒤의 알림.

export function WarehouseSearch({ filter, notices }: { filter: WarehouseFilter; notices: WarehouseFilterNotice[] }) {
  const filtered = !!(filter.q || filter.includeInactive);
  return (
    <Form
      key={JSON.stringify(filter)}
      action="/inventory/warehouses"
      replace
      role="search"
      aria-label="창고 찾기"
      className="mt-6 grid gap-3 border-y border-rule bg-white px-4 py-4 sm:grid-cols-[1fr_auto_auto] sm:items-end"
    >
      <label className="grid gap-1 text-sm">
        <span className="font-semibold">코드 · 창고명</span>
        <input
          type="search"
          name="q"
          defaultValue={filter.q}
          maxLength={50}
          placeholder="예: WH-01, 자재"
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
          <Link href="/inventory/warehouses" className="text-sm text-muted underline underline-offset-4 hover:text-ink">
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

export function SavedNotice({ warehouse, shown }: { warehouse: Warehouse; shown: boolean }) {
  return (
    <Notice
      code={warehouse.code}
      name={warehouse.name}
      active={warehouse.active}
      shown={shown}
      listHref="/inventory/warehouses"
    />
  );
}

export function WarehouseList({
  rows,
  filter,
  savedCode,
}: {
  rows: Warehouse[];
  filter: WarehouseFilter;
  savedCode?: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="mt-6 border border-dashed border-rule px-5 py-8 text-center text-muted">
        {filter.q ? "찾는 창고가 없습니다." : "등록된 창고가 없습니다."}
      </p>
    );
  }
  return (
    <>
      <p className="mt-4 text-sm text-muted" aria-live="polite">
        {rows.length}개{filter.includeInactive ? " · 사용 안 함 포함" : ""}
      </p>
      <table className="mt-2 w-full border-collapse bg-white text-left">
        <caption className="sr-only">창고 목록</caption>
        <thead className="border-b-2 border-machine text-sm">
          <tr>
            <th scope="col" className="w-28 px-3 py-2">
              코드
            </th>
            <th scope="col" className="px-3 py-2">
              창고명
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((w) => (
            <tr
              key={w.id}
              className={`border-b border-rule align-top ${w.code === savedCode ? "bg-safety/15" : ""} ${
                w.active ? "" : "text-muted"
              }`}
            >
              <td className="px-3 py-2.5 font-mono text-sm whitespace-nowrap">
                <Link
                  href={`/inventory/warehouses/${w.code}`}
                  className="font-semibold text-ink underline underline-offset-4 hover:text-machine"
                >
                  {w.code}
                </Link>
              </td>
              <td className="px-3 py-2.5 wrap-anywhere">
                <span className="font-semibold">{w.name}</span>
                {!w.active && (
                  <span className="ml-2 rounded border border-rule px-1.5 py-0.5 text-xs whitespace-nowrap">
                    사용 안 함
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
