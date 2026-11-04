import Form from "next/form";
import Link from "next/link";
import type { FilterNotice, Item, ItemClassOptions, ItemFilter } from "@/db/items";
import { ITEM_CLASSES } from "@/lib/item-fields";
import { SavedNotice as Notice } from "@/components/saved-notice";
import { ITEM_TYPES, PROC_TYPES, itemTypeName, procTypeName } from "@/lib/master-codes";

// 품목 목록 화면의 부품 — 찾기 · 거르기, 표, 저장 뒤의 알림.

const qty = (n: number) => n.toLocaleString("ko-KR", { maximumFractionDigits: 3 });

const NO_CLASSES: ItemClassOptions = { cls1: [], cls2: [], cls3: [] };

/** 찾기 · 거르기가 하나라도 걸렸는지 — 「사용 안 함 포함」은 빼고. */
const narrowed = (f: ItemFilter) => !!(f.q || f.itemType || f.procurement || f.cls1 || f.cls2 || f.cls3);

/** 품목의 분류를 「대 · 중 · 소」 이름으로. 이름을 모르는 값은 코드 그대로. */
function classNames(item: Item, classes: ItemClassOptions) {
  return ITEM_CLASSES.flatMap(({ field }) => {
    const code = item[field];
    return code ? [classes[field].find((c) => c.code === code)?.name ?? code] : [];
  }).join(" · ");
}

export function ItemSearch({
  filter,
  notices,
  classes = NO_CLASSES,
}: {
  filter: ItemFilter;
  notices: FilterNotice[];
  classes?: ItemClassOptions;
}) {
  const filtered = narrowed(filter) || filter.includeInactive;
  return (
    <Form
      key={JSON.stringify(filter)}
      action="/master/items"
      replace
      role="search"
      aria-label="품목 찾기"
      className="mt-6 grid gap-3 border-y border-rule bg-white px-4 py-4 sm:grid-cols-3 sm:items-end lg:grid-cols-[1.6fr_repeat(5,minmax(0,1fr))]"
    >
      <label className="grid gap-1 text-sm sm:col-span-3 lg:col-span-1">
        <span className="font-semibold">코드 · 품명</span>
        <input
          type="search"
          name="q"
          defaultValue={filter.q}
          maxLength={50}
          placeholder="예: RM-0001, 웨이퍼"
          className="w-full min-w-0 rounded border border-rule px-3 py-2 text-base"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-semibold">유형</span>
        <select
          name="type"
          defaultValue={filter.itemType ?? ""}
          className="w-full min-w-0 rounded border border-rule px-3 py-2 text-base"
        >
          <option value="">전체</option>
          {ITEM_TYPES.map((t) => (
            <option key={t.code} value={t.code}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-semibold">조달구분</span>
        <select
          name="proc"
          defaultValue={filter.procurement ?? ""}
          className="w-full min-w-0 rounded border border-rule px-3 py-2 text-base"
        >
          <option value="">전체</option>
          {PROC_TYPES.map((t) => (
            <option key={t.code} value={t.code}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      {ITEM_CLASSES.map(({ field, label }) => (
        <label key={field} className="grid gap-1 text-sm">
          <span className="font-semibold">{label}</span>
          <select
            name={field}
            defaultValue={filter[field] ?? ""}
            className="w-full min-w-0 rounded border border-rule px-3 py-2 text-base"
          >
            <option value="">전체</option>
            {classes[field].map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
                {c.active ? "" : " (사용 안 함)"}
              </option>
            ))}
          </select>
        </label>
      ))}
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
      <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-5">
        <button type="submit" className="rounded border border-machine px-5 py-2 font-semibold hover:bg-floor">
          찾기
        </button>
        {filtered && (
          <Link href="/master/items" className="text-sm text-muted underline underline-offset-4 hover:text-ink">
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

export function SavedNotice({ item, shown }: { item: Item; shown: boolean }) {
  return <Notice code={item.code} name={item.name} active={item.active} shown={shown} listHref="/master/items" />;
}

export function ItemList({
  rows,
  filter,
  savedCode,
  classes = NO_CLASSES,
}: {
  rows: Item[];
  filter: ItemFilter;
  savedCode?: string;
  classes?: ItemClassOptions;
}) {
  if (rows.length === 0) {
    return (
      <p className="mt-6 border border-dashed border-rule px-5 py-8 text-center text-muted">
        {narrowed(filter) ? "찾는 품목이 없습니다." : "등록된 품목이 없습니다."}
      </p>
    );
  }
  return (
    <>
      <p className="mt-4 text-sm text-muted" aria-live="polite">
        {rows.length}개{filter.includeInactive ? " · 사용 안 함 포함" : ""}
      </p>
      <table className="mt-2 w-full border-collapse bg-white text-left">
        <caption className="sr-only">품목 목록</caption>
        <thead className="border-b-2 border-machine text-sm">
          <tr>
            <th scope="col" className="px-3 py-2">
              코드
            </th>
            <th scope="col" className="px-3 py-2">
              품명 · 규격
            </th>
            <th scope="col" className="px-3 py-2">
              유형
            </th>
            <th scope="col" className="hidden px-3 py-2 md:table-cell">
              조달구분
            </th>
            <th scope="col" className="hidden px-3 py-2 lg:table-cell">
              분류
            </th>
            <th scope="col" className="px-3 py-2">
              단위
            </th>
            <th scope="col" className="hidden px-3 py-2 lg:table-cell">
              검사
            </th>
            <th scope="col" className="hidden px-3 py-2 text-right lg:table-cell">
              리드타임
            </th>
            <th scope="col" className="hidden px-3 py-2 text-right lg:table-cell">
              안전재고
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr
              key={item.id}
              className={`border-b border-rule align-top ${item.code === savedCode ? "bg-safety/15" : ""} ${
                item.active ? "" : "text-muted"
              }`}
            >
              <td className="px-3 py-2.5 font-mono text-sm whitespace-nowrap">
                <Link
                  href={`/master/items/${item.code}`}
                  className="font-semibold text-ink underline underline-offset-4 hover:text-machine"
                >
                  {item.code}
                </Link>
              </td>
              <td className="px-3 py-2.5 wrap-anywhere">
                <span className="font-semibold">{item.name}</span>
                {!item.active && (
                  <span className="ml-2 rounded border border-rule px-1.5 py-0.5 text-xs whitespace-nowrap">
                    사용 안 함
                  </span>
                )}
                {item.spec && <span className="block text-sm text-muted">{item.spec}</span>}
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap">{itemTypeName(item.itemType)}</td>
              <td className="hidden px-3 py-2.5 whitespace-nowrap md:table-cell">{procTypeName(item.procurement)}</td>
              <td className="hidden px-3 py-2.5 text-sm lg:table-cell">{classNames(item, classes) || "—"}</td>
              <td className="px-3 py-2.5 font-mono text-sm">{item.unit}</td>
              <td className="hidden px-3 py-2.5 text-sm whitespace-nowrap lg:table-cell">
                {[item.inspectIn && "수입", item.inspectOut && "출하"].filter(Boolean).join(" · ") || "—"}
              </td>
              <td className="hidden px-3 py-2.5 text-right whitespace-nowrap tabular-nums lg:table-cell">
                {item.leadTimeDays}일
              </td>
              <td className="hidden px-3 py-2.5 text-right whitespace-nowrap tabular-nums lg:table-cell">
                {qty(item.safetyStock)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
