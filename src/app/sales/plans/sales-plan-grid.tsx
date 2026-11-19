"use client";

import Form from "next/form";
import Link from "next/link";
import { startTransition, useActionState, useState, type FormEvent, type MouseEvent } from "react";
import type { PlanCustomer, PlanItem, SalesPlanSheet } from "@/db/sales-plans";
import { formatMilli, parseQty, ZERO, type Milli } from "@/lib/move-input";
import { cellKey, type SalesPlanCellInput } from "@/lib/sales-plan-input";
import { isEditableWeek, pageStarts, PAGE_WEEKS, weekLabel, weekRange } from "@/lib/weeks";
import { saveSalesPlanAction, type SalesPlanActionState } from "./actions";
import { milliOf, shownQty } from "./plan-qty";

// 판매계획 표(메뉴 「판매계획」) — 줄은 고객 × 완제품, 칸은 13주. 고친 칸만 [저장]으로 보내고(전 = 불러온 값, 후 = 넣은 글자 그대로),
// 검사는 서버가 하며 화면은 틀린 칸 아래에 까닭을 보인다(값은 화면이 쥐고 있어 그대로 남는다). 지난 주 칸은 잠긴다.
// 품목 합계는 전체 고객의 합(서버) + 화면에서 고친 칸의 차이 — 넣는 대로 바뀐다. 쪽을 넘기거나 거르면 고친 칸이 사라지니 먼저 묻는다.
// 휴대폰 폭에서는 표를 옆으로 밀고, 줄 머리(고객 · 품목)는 왼쪽에 붙어 있다.

type Back = { from: string; customer: string; item: string };
type Row = { customer: PlanCustomer; item: PlanItem; cells: Record<string, string>; added?: boolean };
/** 고친 칸 하나 — diff 는 품목 합계에 더할 차이(읽지 못하는 글자는 0). */
type Change = { input: SalesPlanCellInput; item: PlanItem; week: string; diff: Milli };

const LEAVE = "저장하지 않은 칸이 있습니다 — 넘기면 사라집니다";
const pairOf = (customer: string, item: string) => `${customer}|${item}`;
const byCode = <T extends { code: string }>(a: T, b: T) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0);
const domId = (key: string) => `plan-err-${key.replaceAll("|", "-")}`;

/** 넣은 글자의 수량 — 빈 칸 · 0 은 null(지움), 읽지 못하면 undefined(서버가 까닭을 돌려준다). */
function valueOf(text: string): Milli | null | undefined {
  const s = text.trim();
  if (s === "") return null;
  const parsed = parseQty(s);
  if (!parsed) return undefined;
  return parsed.qty === ZERO ? null : parsed.qty;
}

/** 주소 — 빈 값은 뺀다. from 이 없으면 이번 주부터. */
function planHref(from: string | undefined, back: Back): string {
  const query = new URLSearchParams();
  if (from) query.set("from", from);
  if (back.customer) query.set("customer", back.customer);
  if (back.item) query.set("item", back.item);
  const q = query.toString();
  return q ? `/sales/plans?${q}` : "/sales/plans";
}

/** 후보 목록 — 겹치는 코드는 앞의 것, 코드 차례. 거른 값이 어디에도 없으면 코드만으로 넣는다(고를 수 있게). */
function choices<T extends { code: string; name: string }>(lists: T[][], current: string) {
  const map = new Map<string, { code: string; name: string }>();
  for (const list of lists) for (const x of list) if (!map.has(x.code)) map.set(x.code, x);
  if (current && !map.has(current)) map.set(current, { code: current, name: "" });
  return [...map.values()].sort(byCode);
}

export function SalesPlanGrid({
  sheet,
  options,
  back,
}: {
  sheet: SalesPlanSheet;
  options: { customers: PlanCustomer[]; items: PlanItem[] };
  back: Back;
}) {
  const [state, dispatch, pending] = useActionState<SalesPlanActionState, SalesPlanCellInput[]>(
    (_prev, cells) => saveSalesPlanAction(cells, back),
    null,
  );
  /** 고친 칸의 글자(열쇠 = cellKey) — 손대지 않은 칸은 없다. */
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [added, setAdded] = useState<Row[]>([]);
  const [pickCustomer, setPickCustomer] = useState("");
  const [pickItem, setPickItem] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state && !state.ok) {
      setErrors(state.errors);
      setFormError(state.formError ?? null);
    }
  }

  const { thisWeek, weeks } = sheet;
  const rows: Row[] = [...sheet.rows, ...added];
  const pairs = new Set(rows.map((r) => pairOf(r.customer.code, r.item.code)));

  // 고친 칸 — 고칠 수 있는 주에서 불러온 값과 수량이 다른 것(읽지 못하는 글자도 보내 서버의 까닭을 받는다).
  const changes: Change[] = [];
  for (const r of rows)
    for (const week of weeks) {
      const key = cellKey(r.customer.code, r.item.code, week);
      const text = edits[key];
      if (text === undefined || !isEditableWeek(week, thisWeek)) continue;
      const loaded = r.cells[week];
      const before = loaded === undefined ? null : milliOf(loaded);
      const after = valueOf(text);
      if (after === before) continue;
      changes.push({
        input: { customer: r.customer.code, item: r.item.code, week, before: loaded ?? "", after: text },
        item: r.item,
        week,
        diff: after === undefined ? ZERO : (after ?? ZERO) - (before ?? ZERO),
      });
    }
  const changed = new Set(changes.map((c) => cellKey(c.input.customer, c.input.item, c.week)));

  // 품목 합계 — 서버의 합 + 고친 칸의 차이. 합계에 없던 품목(새 줄)은 차이가 있을 때만 줄이 생긴다.
  const totals = new Map<string, { item: PlanItem; cells: Map<string, Milli>; moved: Set<string> }>();
  for (const t of sheet.totals)
    totals.set(t.item.code, {
      item: t.item,
      cells: new Map(Object.entries(t.cells).map(([w, q]) => [w, milliOf(q)] as const)),
      moved: new Set(),
    });
  for (const c of changes) {
    if (c.diff === ZERO) continue;
    const t = totals.get(c.item.code) ?? { item: c.item, cells: new Map(), moved: new Set() };
    t.cells.set(c.week, (t.cells.get(c.week) ?? ZERO) + c.diff);
    t.moved.add(c.week);
    totals.set(c.item.code, t);
  }
  const totalRows = [...totals.values()].sort((a, b) => byCode(a.item, b.item));

  // 쪽 — 이번 주에서 13주씩, 앞 · 뒤 쪽이 있을 때만 링크.
  const starts = pageStarts(thisWeek);
  const at = starts.indexOf(weeks[0]);
  const prev = at > 0 ? starts[at - 1] : undefined;
  const next = at >= 0 && at < starts.length - 1 ? starts[at + 1] : undefined;
  const filtered = !!(back.customer || back.item);

  /** 고친 칸이 있으면 떠나기 전에 묻는다 — 「취소」면 머문다. */
  const guard = (event: MouseEvent | FormEvent) => {
    if (changes.length > 0 && !window.confirm(LEAVE)) event.preventDefault();
  };

  // 새 줄의 후보 — 「사용」 매출처 · 「사용」 완제품 가운데 화면에 없는 쌍. 고를 품목이 남지 않은 고객은 뺀다.
  const freeItems = (customer: string) => options.items.filter((i) => !pairs.has(pairOf(customer, i.code)));
  const newCustomers = options.customers.filter((c) => freeItems(c.code).length > 0);
  const newItems = newCustomers.some((c) => c.code === pickCustomer) ? freeItems(pickCustomer) : [];
  const canAdd = !!pickCustomer && newItems.some((i) => i.code === pickItem);

  const setCell = (key: string, text: string) => {
    setEdits((e) => ({ ...e, [key]: text }));
    if (errors[key])
      setErrors((e) => {
        const rest = { ...e };
        delete rest[key];
        return rest;
      });
  };
  const addRow = () => {
    const customer = options.customers.find((c) => c.code === pickCustomer);
    const item = options.items.find((i) => i.code === pickItem);
    if (!customer || !item || !canAdd) return;
    setAdded((a) => [...a, { customer, item, cells: {}, added: true }]);
    setPickCustomer("");
    setPickItem("");
  };
  const removeRow = (row: Row) => {
    const prefix = `${pairOf(row.customer.code, row.item.code)}|`;
    const drop = (rec: Record<string, string>) =>
      Object.fromEntries(Object.entries(rec).filter(([k]) => !k.startsWith(prefix)));
    setAdded((a) => a.filter((r) => r !== row));
    setEdits(drop);
    setErrors(drop);
  };
  const save = () => {
    if (!changes.length) return;
    startTransition(() => dispatch(changes.map((c) => c.input)));
  };

  const wrong = Object.keys(errors).length;
  const filterCustomers = choices([sheet.rows.map((r) => r.customer), options.customers], back.customer);
  const filterItems = choices([sheet.rows.map((r) => r.item), options.items], back.item);
  const field = "w-full min-w-0 rounded border border-rule bg-white px-3 py-2 text-base";

  return (
    <>
      <Form
        key={JSON.stringify(back)}
        action="/sales/plans"
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
              href={planHref(back.from, { from: back.from, customer: "", item: "" })}
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
          <Link href={planHref(prev, back)} onClick={guard} className="font-semibold underline underline-offset-4">
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
          <Link href={planHref(next, back)} onClick={guard} className="font-semibold underline underline-offset-4">
            뒤 {PAGE_WEEKS}주 ▶
          </Link>
        ) : (
          <span className="text-muted" aria-disabled="true">
            뒤 {PAGE_WEEKS}주 ▶
          </span>
        )}
        <Link href={planHref(undefined, back)} onClick={guard} className="underline underline-offset-4">
          이번 주
        </Link>
      </nav>

      {(formError || wrong > 0) && (
        <div role="alert" className="mt-4 max-w-3xl border-l-4 border-red-700 bg-white px-5 py-4">
          <p className="font-semibold">저장하지 않았습니다 — 칸이 하나라도 틀리면 아무것도 저장되지 않습니다.</p>
          {formError && <p className="mt-1 text-sm">{formError}</p>}
          {wrong > 0 && <p className="mt-1 text-sm">틀린 칸 {wrong}개 — 칸 아래의 까닭을 보고 고치세요.</p>}
        </div>
      )}

      <fieldset disabled={pending} className="mt-4 min-w-0">
        <legend className="sr-only">판매계획 칸</legend>
        <p className="text-sm text-muted">
          칸에 그 주의 수량을 넣고 [저장]을 누르세요. 빈 칸 · 0 은 그 칸을 지웁니다. 지난 주(회색)는 고치지 못합니다.
        </p>
        <div
          className="relative mt-2 overflow-x-auto border border-rule bg-white"
          tabIndex={0}
          role="region"
          aria-label="판매계획 표"
        >
          <table className="border-collapse text-left text-sm">
            <caption className="sr-only">
              판매계획 — 줄은 고객 · 품목, 칸은 {weekLabel(weeks[0], thisWeek)}부터 {PAGE_WEEKS}주
            </caption>
            <thead className="border-b-2 border-machine bg-floor">
              <tr>
                <th scope="col" className="sticky left-0 z-10 w-40 min-w-40 bg-floor px-2 py-2 sm:w-60 sm:min-w-60">
                  고객 · 품목
                </th>
                {weeks.map((w) => {
                  const now = w === thisWeek;
                  return (
                    <th
                      key={w}
                      scope="col"
                      className={`min-w-28 px-1.5 py-2 text-right align-bottom whitespace-nowrap ${
                        now ? "bg-safety/25" : ""
                      } ${w < thisWeek ? "text-muted" : ""}`}
                    >
                      {now && (
                        <span className="mb-0.5 inline-block rounded-sm bg-safety px-1 text-xs font-semibold text-ink">
                          이번 주
                        </span>
                      )}
                      <span className="block font-semibold">{weekLabel(w, thisWeek)}</span>
                      <span className="block text-xs font-normal text-muted tabular-nums">{weekRange(w)}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={weeks.length + 1} className="px-5 py-6 text-muted">
                    <span className="sticky left-5">
                      {sheet.filtered
                        ? "거른 범위에 판매계획이 없습니다"
                        : "판매계획이 없습니다 — 아래 [줄 더하기]로 고객 · 품목을 고르세요"}
                    </span>
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const name = `${r.customer.code} ${r.item.code}`;
                return (
                  <tr key={pairOf(r.customer.code, r.item.code)} className="border-b border-rule align-top">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 w-40 min-w-40 bg-white px-2 py-1.5 font-normal sm:w-60 sm:min-w-60"
                    >
                      <span className="block wrap-anywhere">
                        {r.customer.name}
                        <span className="font-mono text-xs text-muted">({r.customer.code})</span>
                        {!r.customer.isCustomer && <Badge>매출처 아님</Badge>}
                        {!r.customer.active && <Badge>사용 안 함</Badge>}
                      </span>
                      <span className="block wrap-anywhere">
                        <span className="font-mono">{r.item.code}</span> {r.item.name}{" "}
                        <span className="text-muted">· {r.item.unit}</span>
                        {!r.item.active && <Badge>사용 안 함</Badge>}
                      </span>
                      {r.added && (
                        <span className="mt-0.5 flex items-center gap-2">
                          <span className="rounded-sm bg-safety px-1 text-xs font-semibold text-ink">새 줄</span>
                          <button
                            type="button"
                            onClick={() => removeRow(r)}
                            aria-label={`${name} 줄 지우기`}
                            className="text-xs text-muted underline underline-offset-2 hover:text-ink"
                          >
                            지우기
                          </button>
                        </span>
                      )}
                    </th>
                    {weeks.map((w) => {
                      const key = cellKey(r.customer.code, r.item.code, w);
                      const loaded = r.cells[w];
                      const text = edits[key] ?? (loaded === undefined ? "" : shownQty(loaded));
                      const editable = isEditableWeek(w, thisWeek);
                      const error = errors[key];
                      return (
                        <td key={w} className={`p-1 ${w === thisWeek ? "bg-safety/10" : ""}`}>
                          <input
                            inputMode="decimal"
                            autoComplete="off"
                            value={text}
                            disabled={!editable}
                            onChange={(e) => setCell(key, e.target.value)}
                            aria-label={`${name} ${weekLabel(w, thisWeek)} 수량`}
                            aria-invalid={error ? true : undefined}
                            aria-describedby={error ? domId(key) : undefined}
                            className={`w-full min-w-24 rounded-sm border px-1.5 py-1 text-right tabular-nums ${
                              !editable
                                ? "border-transparent bg-floor text-muted"
                                : error
                                  ? "border-red-700 bg-white"
                                  : changed.has(key)
                                    ? "border-machine bg-safety/25 font-semibold"
                                    : "border-rule bg-white"
                            }`}
                          />
                          {error && (
                            <p id={domId(key)} className="mt-0.5 max-w-28 text-xs font-semibold text-red-700">
                              {error}
                            </p>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            <tbody className="border-t-2 border-machine">
              <tr>
                <th scope="colgroup" colSpan={weeks.length + 1} className="bg-floor px-2 py-2 text-left">
                  <span className="sticky left-2 inline-block">
                    품목 합계(전체 고객 — MPS 가 받는 수요)
                    {sheet.filtered && (
                      <span className="block text-xs font-normal text-muted">
                        거른 줄만 보이지만 합계는 전체 고객입니다
                      </span>
                    )}
                  </span>
                </th>
              </tr>
              {totalRows.length === 0 && (
                <tr>
                  <td colSpan={weeks.length + 1} className="px-5 py-4 text-muted">
                    <span className="sticky left-5">이 {PAGE_WEEKS}주에 판매계획이 없습니다</span>
                  </td>
                </tr>
              )}
              {totalRows.map((t) => (
                <tr key={t.item.code} className="border-b border-rule">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 w-40 min-w-40 bg-white px-2 py-1.5 font-normal sm:w-60 sm:min-w-60"
                  >
                    <span className="font-mono">{t.item.code}</span> {t.item.name}{" "}
                    <span className="text-muted">· {t.item.unit}</span>
                  </th>
                  {weeks.map((w) => {
                    const qty = t.cells.get(w) ?? ZERO;
                    return (
                      <td
                        key={w}
                        data-testid={`total-${t.item.code}-${w}`}
                        className={`px-2.5 py-1.5 text-right font-semibold tabular-nums ${
                          t.moved.has(w) ? "bg-safety/25" : w === thisWeek ? "bg-safety/10" : ""
                        }`}
                      >
                        {qty === ZERO ? "" : formatMilli(qty)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid gap-3 border-y border-rule bg-white px-4 py-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <p className="text-sm font-semibold sm:col-span-full">줄 더하기 — 「사용」 매출처 × 「사용」 완제품</p>
          <label className="grid gap-1 text-sm">
            <span>고객</span>
            <select
              value={pickCustomer}
              onChange={(e) => {
                setPickCustomer(e.target.value);
                setPickItem("");
              }}
              aria-label="새 줄 고객"
              className={field}
            >
              <option value="">고객을 고르세요</option>
              {newCustomers.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span>품목</span>
            <select
              value={pickItem}
              onChange={(e) => setPickItem(e.target.value)}
              aria-label="새 줄 품목"
              className={field}
            >
              <option value="">{pickCustomer ? "품목을 고르세요" : "고객을 먼저 고르세요"}</option>
              {newItems.map((i) => (
                <option key={i.code} value={i.code}>
                  {i.code} {i.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={addRow}
            disabled={!canAdd}
            className="rounded border border-machine bg-white px-4 py-2 font-semibold hover:bg-floor disabled:opacity-60"
          >
            줄 더하기
          </button>
          {newCustomers.length === 0 && (
            <p className="text-sm text-muted sm:col-span-full">
              더할 수 있는 고객 × 품목이 없습니다 — 「사용」 매출처와 「사용」 완제품의 쌍이 모두 표에 있습니다.
            </p>
          )}
          <p className="text-sm text-muted sm:col-span-full">더한 줄은 칸에 수량을 넣고 저장해야 남습니다.</p>
        </div>
      </fieldset>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending || changes.length === 0}
          className="rounded bg-machine px-6 py-2.5 font-semibold text-white hover:bg-machine-deep disabled:opacity-60"
        >
          {pending ? "저장 중…" : "저장"}
        </button>
        <span role="status" className="text-sm text-muted">
          {changes.length > 0 ? `고친 칸 ${changes.length.toLocaleString("ko-KR")}개` : "고친 칸이 없습니다"}
        </span>
      </div>
    </>
  );
}

function Badge({ children }: { children: string }) {
  return (
    <span className="ml-1 inline-block rounded-sm border border-muted px-1 text-xs whitespace-nowrap text-muted">
      {children}
    </span>
  );
}
