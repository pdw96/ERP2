"use client";

import Form from "next/form";
import Link from "next/link";
import { startTransition, useActionState, useState, type FormEvent, type MouseEvent } from "react";
import type { PlanCustomer, PlanItem, SalesPlanCell, SalesPlanSheet } from "@/db/sales-plans";
import { cellKey, type SalesPlanCellInput, type SalesPlanConfirmInput } from "@/lib/sales-plan-input";
import { isEditableWeek, pageStarts, PAGE_WEEKS, weekLabel, weekRange } from "@/lib/weeks";
import {
  confirmSalesPlanAction,
  saveSalesPlanAction,
  unconfirmSalesPlanAction,
  type SalesPlanActionState,
} from "./actions";
import { milliOf, shownQty, typedQty } from "./plan-qty";

// 판매계획 표(메뉴 「판매계획」) — 줄은 고객 × 완제품, 칸은 13주. 고친 칸만 [저장]으로 보내고(전 = 불러온 값, 후 = 넣은 글자 그대로),
// 검사는 서버가 하며 화면은 틀린 칸 아래에 까닭을 보인다(값은 화면이 쥐고 있어 그대로 남는다). 지난 주 칸은 잠긴다(disabled).
// 저장한 칸은 미확정(노란 바탕)이다. 줄 앞 체크박스로 고른 줄의 고칠 수 있는 주의 칸을 [확정] · [확정 취소]하고(보내는 수량은 불러온 값),
// 확정 칸은 읽기 전용에 「확정」 표시다. 저장하지 않은 칸이 있으면 확정 · 확정 취소는 꺼진다 — 먼저 저장해야 한다.
// 품목 합계는 서버가 준 확정 칸만의 합 그대로다(넣는 대로 바뀌지 않는다). 쪽을 넘기거나 거르면 고친 칸이 사라지니 먼저 묻는다.
// 표는 화면 안에서 세로 · 가로로 밀고(머리는 위에, 체크박스 · 고객 · 품목은 왼쪽에 붙는다), 페이지는 옆으로 밀리지 않는다.

type Back = { from: string; customer: string; item: string };
type Row = { customer: PlanCustomer; item: PlanItem; cells: Record<string, SalesPlanCell>; added?: boolean };
type Kind = "save" | "confirm" | "unconfirm";
type Request =
  { kind: "save"; cells: SalesPlanCellInput[] } | { kind: "confirm" | "unconfirm"; cells: SalesPlanConfirmInput[] };
/** 마지막으로 부른 동작과 그 결과 — 거절이면 까닭을 보인다(서면 주소가 바뀌어 화면이 새로 열린다). */
type Outcome = { kind: Kind; result: SalesPlanActionState } | null;

const LEAVE = "저장하지 않은 칸이 있습니다 — 넘기면 사라집니다";
const VERB: Record<Kind, string> = { save: "저장", confirm: "확정", unconfirm: "확정 취소" };
const pairOf = (customer: string, item: string) => `${customer}|${item}`;
const byCode = <T extends { code: string }>(a: T, b: T) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0);
const domId = (key: string) => `plan-err-${key.replaceAll("|", "-")}`;

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
  const [outcome, dispatch, pending] = useActionState<Outcome, Request>(async (_prev, request) => {
    const result =
      request.kind === "save"
        ? await saveSalesPlanAction(request.cells, back)
        : request.kind === "confirm"
          ? await confirmSalesPlanAction(request.cells, back)
          : await unconfirmSalesPlanAction(request.cells, back);
    return { kind: request.kind, result };
  }, null);
  /** 고친 칸의 글자(열쇠 = cellKey) — 손대지 않은 칸은 없다. */
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [added, setAdded] = useState<Row[]>([]);
  /** 고른 줄(열쇠 = 고객|품목) — 불러온 줄만 고른다. */
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  /** 지금 보내고 있는 동작 — 그 단추에 「… 중」. */
  const [doing, setDoing] = useState<Kind>("save");
  const [pickCustomer, setPickCustomer] = useState("");
  const [pickItem, setPickItem] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [seen, setSeen] = useState(outcome);
  if (outcome !== seen) {
    setSeen(outcome);
    if (outcome?.result && !outcome.result.ok) {
      setErrors(outcome.result.errors);
      setFormError(outcome.result.formError ?? null);
    }
  }

  const { thisWeek, weeks } = sheet;
  const loadedRows: Row[] = sheet.rows;
  const rows: Row[] = [...loadedRows, ...added];
  const pairs = new Set(rows.map((r) => pairOf(r.customer.code, r.item.code)));

  // 고친 칸 — 고칠 수 있는 주의 확정되지 않은 칸에서 불러온 값과 수량이 다른 것(읽지 못하는 글자도 보내 서버의 까닭을 받는다).
  const changes: SalesPlanCellInput[] = [];
  for (const r of rows)
    for (const week of weeks) {
      const key = cellKey(r.customer.code, r.item.code, week);
      const text = edits[key];
      const loaded = r.cells[week];
      if (text === undefined || !isEditableWeek(week, thisWeek) || loaded?.confirmed) continue;
      const before = loaded === undefined ? null : milliOf(loaded.qty);
      if (typedQty(text, r.item.decimals) === before) continue;
      changes.push({ customer: r.customer.code, item: r.item.code, week, before: loaded?.qty ?? "", after: text });
    }
  const changed = new Set(changes.map((c) => cellKey(c.customer, c.item, c.week)));
  const unsaved = changes.length > 0;

  // 고른 줄의 칸 — 보이는 13주 가운데 고칠 수 있는 주만. 미확정 칸은 [확정]에, 확정 칸은 [확정 취소]에 간다(수량은 불러온 값).
  const chosen = loadedRows.filter((r) => selected.has(pairOf(r.customer.code, r.item.code)));
  const toConfirm: SalesPlanConfirmInput[] = [];
  const toUnconfirm: SalesPlanConfirmInput[] = [];
  for (const r of chosen)
    for (const week of weeks) {
      const loaded = r.cells[week];
      if (!loaded || !isEditableWeek(week, thisWeek)) continue;
      (loaded.confirmed ? toUnconfirm : toConfirm).push({
        customer: r.customer.code,
        item: r.item.code,
        week,
        qty: loaded.qty,
      });
    }
  const allChosen = loadedRows.length > 0 && chosen.length === loadedRows.length;
  const someChosen = chosen.length > 0 && !allChosen;

  // 품목 합계 — 서버가 준 확정 칸만의 합 그대로.
  const totalRows = sheet.totals;

  // 쪽 — 이번 주에서 13주씩, 앞 · 뒤 쪽이 있을 때만 링크.
  const starts = pageStarts(thisWeek);
  const at = starts.indexOf(weeks[0]);
  const prev = at > 0 ? starts[at - 1] : undefined;
  const next = at >= 0 && at < starts.length - 1 ? starts[at + 1] : undefined;
  const filtered = !!(back.customer || back.item);

  /** 고친 칸이 있으면 떠나기 전에 묻는다 — 「취소」면 머문다. */
  const guard = (event: MouseEvent | FormEvent) => {
    if (unsaved && !window.confirm(LEAVE)) event.preventDefault();
  };

  // 새 줄의 후보 — 「사용」 매출처 · 「사용」 완제품 가운데 화면에 없는 쌍. 고를 품목이 남지 않은 고객은 뺀다.
  // 거른 화면이면 거른 고객 · 품목만 — 거르기에 맞는 DB 의 줄은 모두 화면에 있으니 새 줄은 DB 에 칸이 없는 쌍뿐이고, 저장 뒤 같은 거르기로 돌아와도 보인다.
  const addItems = back.item ? options.items.filter((i) => i.code === back.item) : options.items;
  const addCustomers = back.customer ? options.customers.filter((c) => c.code === back.customer) : options.customers;
  const freeItems = (customer: string) => addItems.filter((i) => !pairs.has(pairOf(customer, i.code)));
  const newCustomers = addCustomers.filter((c) => freeItems(c.code).length > 0);
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
    const customer = addCustomers.find((c) => c.code === pickCustomer);
    const item = addItems.find((i) => i.code === pickItem);
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
  const toggleRow = (pair: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (!next.delete(pair)) next.add(pair);
      return next;
    });
  const toggleAll = () =>
    setSelected(allChosen ? new Set() : new Set(loadedRows.map((r) => pairOf(r.customer.code, r.item.code))));
  const send = (request: Request) => {
    if (!request.cells.length) return;
    setDoing(request.kind);
    startTransition(() => dispatch(request));
  };
  const canConfirm = !pending && !unsaved && toConfirm.length > 0;
  const canUnconfirm = !pending && !unsaved && toUnconfirm.length > 0;
  const busy = (kind: Kind) => (pending && doing === kind ? `${VERB[kind]} 중…` : VERB[kind]);

  const wrong = Object.keys(errors).length;
  const failed = VERB[outcome?.kind ?? "save"];
  // 거르기 후보 — DB 에 칸이 있는 모든 고객 · 품목(거르기와 상관없이) ∪ 새 줄 후보. 한쪽을 걸러도 다른 쪽 후보가 줄지 않는다.
  const filterCustomers = choices([sheet.planned.customers, options.customers], back.customer);
  const filterItems = choices([sheet.planned.items, options.items], back.item);
  const field = "w-full min-w-0 rounded border border-rule bg-white px-3 py-2 text-base";
  // 왼쪽에 붙는 두 칸 — 체크박스(2.5rem) · 고객 · 품목. 위에 붙는 머리는 아래 줄에 선을 그림자로 긋는다(붙은 칸에는 테두리가 따라오지 않는다).
  const pickCol = "sticky left-0 w-10 min-w-10 px-2";
  const nameCol = "sticky left-10 w-40 min-w-40 px-2 sm:w-60 sm:min-w-60";
  const headCell = "sticky top-0 bg-floor";
  const headLine = "shadow-[inset_0_-2px_0_var(--color-machine)]";
  const columns = weeks.length + 2;

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
          <p className="font-semibold">
            {failed}하지 않았습니다 — 칸이 하나라도 틀리면 아무것도 {failed}되지 않습니다.
          </p>
          {formError && <p className="mt-1 text-sm">{formError}</p>}
          {wrong > 0 && <p className="mt-1 text-sm">틀린 칸 {wrong}개 — 칸 아래의 까닭을 보고 고치세요.</p>}
        </div>
      )}

      <fieldset disabled={pending} className="mt-4 min-w-0">
        <legend className="sr-only">판매계획 칸</legend>
        <p className="text-sm text-muted">
          칸에 그 주의 수량을 넣고 [저장]을 누르세요. 빈 칸 · 0 은 그 칸을 지웁니다. 저장한 칸은 미확정(노란 칸)이라 MPS
          수요에 들지 않습니다 — 줄 앞을 골라 [확정]하세요. 「확정」 칸은 [확정 취소]한 뒤 고칩니다. 지난 주(회색)는
          고치지 못합니다.
        </p>
        <div
          className="relative mt-2 max-h-[60vh] overflow-auto border border-rule bg-white"
          tabIndex={0}
          role="region"
          aria-label="판매계획 표"
        >
          <table className="border-separate border-spacing-0 text-left text-sm">
            <caption className="sr-only">
              판매계획 — 줄은 고객 · 품목, 칸은 {weekLabel(weeks[0], thisWeek)}부터 {PAGE_WEEKS}주
            </caption>
            <thead>
              <tr>
                <th scope="col" className={`${pickCol} ${headCell} ${headLine} z-30 py-2`}>
                  <label className="flex flex-col items-center gap-0.5 text-xs font-normal">
                    <input
                      type="checkbox"
                      checked={allChosen}
                      ref={(el) => {
                        if (el) el.indeterminate = someChosen;
                      }}
                      onChange={toggleAll}
                      disabled={loadedRows.length === 0}
                      className="size-4"
                    />
                    전체
                  </label>
                </th>
                <th scope="col" className={`${nameCol} ${headCell} ${headLine} z-30 py-2`}>
                  고객 · 품목
                </th>
                {weeks.map((w) => {
                  const now = w === thisWeek;
                  return (
                    <th
                      key={w}
                      scope="col"
                      className={`${headCell} z-20 min-w-28 px-1.5 py-2 text-right align-bottom whitespace-nowrap ${
                        now ? "shadow-[inset_0_-4px_0_var(--color-safety)]" : headLine
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
                  <td colSpan={columns} className="px-5 py-6 text-muted">
                    <span className="sticky left-5">
                      {sheet.filtered
                        ? "거른 범위에 판매계획이 없습니다"
                        : "판매계획이 없습니다 — 아래 [줄 더하기]로 고객 · 품목을 고르세요"}
                    </span>
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const pair = pairOf(r.customer.code, r.item.code);
                const name = `${r.customer.code} ${r.item.code}`;
                const line = "border-b border-rule";
                return (
                  <tr key={pair} className="align-top">
                    <td className={`${pickCol} ${line} z-10 bg-white py-2 text-center`}>
                      <input
                        type="checkbox"
                        checked={!r.added && selected.has(pair)}
                        onChange={() => toggleRow(pair)}
                        disabled={r.added}
                        title={r.added ? "저장한 뒤 고를 수 있습니다" : undefined}
                        aria-label={`${name} 줄 고르기`}
                        className="size-4"
                      />
                    </td>
                    <th scope="row" className={`${nameCol} ${line} z-10 bg-white py-1.5 font-normal`}>
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
                      const text = edits[key] ?? (loaded === undefined ? "" : shownQty(loaded.qty));
                      const editable = isEditableWeek(w, thisWeek);
                      const fixed = loaded?.confirmed === true;
                      const open = loaded?.confirmed === false;
                      const error = errors[key];
                      return (
                        <td key={w} className={`relative p-1 ${line} ${w === thisWeek ? "bg-safety/10" : ""}`}>
                          <input
                            inputMode="decimal"
                            autoComplete="off"
                            value={text}
                            disabled={!editable}
                            readOnly={editable && fixed}
                            onChange={(e) => setCell(key, e.target.value)}
                            aria-label={`${name} ${weekLabel(w, thisWeek)} 수량`}
                            aria-invalid={error ? true : undefined}
                            aria-describedby={error ? domId(key) : undefined}
                            className={`w-full min-w-24 rounded-sm border px-1.5 py-1 text-right tabular-nums ${
                              error
                                ? "border-red-700 bg-white"
                                : !editable
                                  ? `border-transparent text-muted ${open ? "bg-yellow-100" : "bg-floor"}`
                                  : fixed
                                    ? "border-rule bg-white text-muted"
                                    : changed.has(key)
                                      ? "border-machine bg-safety/25 font-semibold"
                                      : open
                                        ? "border-rule bg-yellow-100"
                                        : "border-rule bg-white"
                            }`}
                          />
                          {fixed && (
                            <span className="pointer-events-none absolute top-0 left-1.5 rounded-sm bg-machine px-0.5 text-[0.625rem] leading-tight text-white">
                              확정
                            </span>
                          )}
                          {open && <span className="sr-only">미확정</span>}
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
            <tbody>
              <tr>
                <th
                  scope="colgroup"
                  colSpan={columns}
                  className="border-t-2 border-machine bg-floor px-2 py-2 text-left"
                >
                  <span className="sticky left-2 inline-block">
                    품목 합계(확정 — MPS 가 받는 수요)
                    {sheet.unconfirmed > 0 && (
                      <span className="block text-xs font-normal text-muted">
                        미확정 {sheet.unconfirmed.toLocaleString("ko-KR")}칸은 확정해야 합계에 듭니다
                      </span>
                    )}
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
                  <td colSpan={columns} className="px-5 py-4 text-muted">
                    <span className="sticky left-5">이 {PAGE_WEEKS}주에 확정한 판매계획이 없습니다</span>
                  </td>
                </tr>
              )}
              {totalRows.map((t) => (
                <tr key={t.item.code}>
                  <th
                    scope="row"
                    colSpan={2}
                    className="sticky left-0 z-10 border-b border-rule bg-white px-2 py-1.5 font-normal"
                  >
                    <span className="font-mono">{t.item.code}</span> {t.item.name}{" "}
                    <span className="text-muted">· {t.item.unit}</span>
                  </th>
                  {weeks.map((w) => {
                    const qty = t.cells[w];
                    return (
                      <td
                        key={w}
                        data-testid={`total-${t.item.code}-${w}`}
                        className={`border-b border-rule px-2.5 py-1.5 text-right font-semibold tabular-nums ${
                          w === thisWeek ? "bg-safety/10" : ""
                        }`}
                      >
                        {qty === undefined ? "" : shownQty(qty)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <button
            type="button"
            onClick={() => send({ kind: "save", cells: changes })}
            disabled={pending || !unsaved}
            className="rounded bg-machine px-6 py-2.5 font-semibold text-white hover:bg-machine-deep disabled:opacity-60"
          >
            {busy("save")}
          </button>
          <button
            type="button"
            onClick={() => send({ kind: "confirm", cells: toConfirm })}
            disabled={!canConfirm}
            className="rounded border border-machine bg-white px-5 py-2.5 font-semibold hover:bg-floor disabled:opacity-60"
          >
            {busy("confirm")}
          </button>
          <button
            type="button"
            onClick={() => send({ kind: "unconfirm", cells: toUnconfirm })}
            disabled={!canUnconfirm}
            className="rounded border border-machine bg-white px-5 py-2.5 font-semibold hover:bg-floor disabled:opacity-60"
          >
            {busy("unconfirm")}
          </button>
          <span data-testid="plan-selection" className="text-sm tabular-nums">
            선택 {chosen.length.toLocaleString("ko-KR")}줄 · 미확정 {toConfirm.length.toLocaleString("ko-KR")}칸
          </span>
          <span role="status" className="text-sm text-muted">
            {unsaved ? `고친 칸 ${changes.length.toLocaleString("ko-KR")}개` : "고친 칸이 없습니다"}
          </span>
          {unsaved && <span className="text-sm font-semibold text-red-700">먼저 저장하세요</span>}
        </div>

        <div className="mt-6 grid gap-3 border-y border-rule bg-white px-4 py-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
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
              {filtered
                ? "거른 고객 · 품목으로 더할 수 있는 줄이 없습니다 — 새 줄은 「사용」 매출처 × 「사용」 완제품 가운데 표에 없는 쌍입니다. 다른 쌍은 거르기를 풀고 더하세요."
                : "더할 수 있는 고객 × 품목이 없습니다 — 「사용」 매출처와 「사용」 완제품의 쌍이 모두 표에 있습니다."}
            </p>
          )}
          <p className="text-sm text-muted sm:col-span-full">더한 줄은 칸에 수량을 넣고 저장해야 남습니다.</p>
        </div>
      </fieldset>
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
