import Form from "next/form";
import Link from "next/link";
import type { FormEvent, MouseEvent } from "react";
import type { PlanCustomer, PlanItem, SalesPlanSheet } from "@/db/sales-plans";
import { pageStarts, PAGE_WEEKS, weekLabel } from "@/lib/weeks";
import { planHref, type Back, type PlanPath } from "./paths";

// 판매계획 두 메뉴(「판매계획 등록」 · 「판매계획 확정」)가 같이 쓰는 표 위 — 거르기(고객 · 품목)와 주 넘기기(◀ ▶ · 이번 주).
// 링크 · 거르기는 그 메뉴의 주소(path)로 간다. 등록 화면은 저장하지 않은 칸이 있으면 떠나기 전에 묻는다(guard).

const byCode = <T extends { code: string }>(a: T, b: T) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0);

/** 후보 목록 — 겹치는 코드는 앞의 것, 코드 차례. 거른 값이 어디에도 없으면 코드만으로 넣는다(고를 수 있게). */
function choices<T extends { code: string; name: string }>(lists: T[][], current: string) {
  const map = new Map<string, { code: string; name: string }>();
  for (const list of lists) for (const x of list) if (!map.has(x.code)) map.set(x.code, x);
  if (current && !map.has(current)) map.set(current, { code: current, name: "" });
  return [...map.values()].sort(byCode);
}

export function PlanNav({
  path,
  sheet,
  options,
  back,
  guard,
}: {
  path: PlanPath;
  sheet: SalesPlanSheet;
  options: { customers: PlanCustomer[]; items: PlanItem[] };
  back: Back;
  /** 떠나기 전에 부른다 — 머물려면 event.preventDefault(). */
  guard?: (event: MouseEvent | FormEvent) => void;
}) {
  const { thisWeek, weeks } = sheet;
  // 쪽 — 이번 주에서 13주씩, 앞 · 뒤 쪽이 있을 때만 링크.
  const starts = pageStarts(thisWeek);
  const at = starts.indexOf(weeks[0]);
  const prev = at > 0 ? starts[at - 1] : undefined;
  const next = at >= 0 && at < starts.length - 1 ? starts[at + 1] : undefined;
  const filtered = !!(back.customer || back.item);
  // 거르기 후보 — DB 에 칸이 있는 모든 고객 · 품목(거르기와 상관없이) ∪ 새 줄 후보. 한쪽을 걸러도 다른 쪽 후보가 줄지 않는다.
  const filterCustomers = choices([sheet.planned.customers, options.customers], back.customer);
  const filterItems = choices([sheet.planned.items, options.items], back.item);
  const field = "w-full min-w-0 rounded border border-rule bg-white px-3 py-2 text-base";

  return (
    <>
      <Form
        key={JSON.stringify(back)}
        action={path}
        replace
        role="search"
        aria-label="판매계획 거르기"
        onSubmit={guard}
        className="mt-6 grid gap-3 border-y border-rule bg-white px-4 py-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      >
        <input type="hidden" name="from" value={back.from} />
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">고객</span>
          <select name="customer" defaultValue={back.customer} className={field}>
            <option value="">모든 고객</option>
            {filterCustomers.map((c) => (
              <option key={c.code} value={c.code}>
                {`${c.code} ${c.name}`.trim()}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">품목</span>
          <select name="item" defaultValue={back.item} className={field}>
            <option value="">모든 품목</option>
            {filterItems.map((i) => (
              <option key={i.code} value={i.code}>
                {`${i.code} ${i.name}`.trim()}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-3">
          <button type="submit" className="rounded border border-machine px-5 py-2 font-semibold hover:bg-floor">
            거르기
          </button>
          {filtered && (
            <Link
              href={planHref(path, back.from, { customer: "", item: "" })}
              onClick={guard}
              className="text-sm text-muted underline underline-offset-4 hover:text-ink"
            >
              처음대로
            </Link>
          )}
        </div>
      </Form>

      <nav aria-label="주 넘기기" className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {prev ? (
          <Link
            href={planHref(path, prev, back)}
            onClick={guard}
            className="font-semibold underline underline-offset-4"
          >
            ◀ 앞 {PAGE_WEEKS}주
          </Link>
        ) : (
          <span className="text-muted" aria-disabled="true">
            ◀ 앞 {PAGE_WEEKS}주
          </span>
        )}
        <span className="tabular-nums">
          {weekLabel(weeks[0], thisWeek)} ~ {weekLabel(weeks[weeks.length - 1], thisWeek)}
        </span>
        {next ? (
          <Link
            href={planHref(path, next, back)}
            onClick={guard}
            className="font-semibold underline underline-offset-4"
          >
            뒤 {PAGE_WEEKS}주 ▶
          </Link>
        ) : (
          <span className="text-muted" aria-disabled="true">
            뒤 {PAGE_WEEKS}주 ▶
          </span>
        )}
        <Link href={planHref(path, undefined, back)} onClick={guard} className="underline underline-offset-4">
          이번 주
        </Link>
      </nav>
    </>
  );
}
