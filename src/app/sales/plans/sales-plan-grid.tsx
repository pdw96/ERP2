"use client";

import Link from "next/link";
import { startTransition, useActionState, useState, type FormEvent, type MouseEvent } from "react";
import type { PlanCustomer, PlanItem, SalesPlanSheet } from "@/db/sales-plans";
import { cellKey, type SalesPlanCellInput } from "@/lib/sales-plan-input";
import { isEditableWeek, weekLabel } from "@/lib/weeks";
import { saveSalesPlanAction, type SalesPlanActionState } from "./actions";
import { PlanNav } from "./plan-nav";
import { milliOf, shownQty, typedQty } from "./plan-qty";
import { errorId, FixedChip, pairOf, PlanFailure, PlanTable, type PlanRow } from "./plan-table";
import { CONFIRM_PATH, ENTRY_PATH, planHref, type Back } from "./paths";

// 판매계획 등록의 표(메뉴 「판매계획 등록」) — 줄은 고객 × 완제품, 칸은 13주. 고친 칸만 [저장]으로 보내고(전 = 불러온 값, 후 = 넣은
// 글자 그대로), 검사는 서버가 하며 화면은 틀린 칸 아래에 까닭을 보인다(값은 화면이 쥐고 있어 그대로 남는다). 지난 주 칸은 잠긴다(disabled).
// 저장한 칸은 미확정(노란 바탕)이고, 확정 칸은 읽기 전용에 「확정」 표시다 — 확정 · 확정 취소는 메뉴 「판매계획 확정」이 한다.
// 품목 합계는 서버가 준 확정 칸만의 합 그대로다(넣는 대로 바뀌지 않는다). 쪽을 넘기거나 거르거나 다른 메뉴로 가면 고친 칸이
// 사라지니 먼저 묻는다.

const LEAVE = "저장하지 않은 칸이 있습니다 — 넘기면 사라집니다";

export function SalesPlanGrid({
  sheet,
  options,
  back,
}: {
  sheet: SalesPlanSheet;
  options: { customers: PlanCustomer[]; items: PlanItem[] };
  back: Back;
}) {
  const [result, dispatch, pending] = useActionState<SalesPlanActionState, SalesPlanCellInput[]>(
    async (_prev, cells) => saveSalesPlanAction(cells, back),
    null,
  );
  /** 고친 칸의 글자(열쇠 = cellKey) — 손대지 않은 칸은 없다. */
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [added, setAdded] = useState<PlanRow[]>([]);
  const [pickCustomer, setPickCustomer] = useState("");
  const [pickItem, setPickItem] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [seen, setSeen] = useState(result);
  if (result !== seen) {
    setSeen(result);
    if (result && !result.ok) {
      setErrors(result.errors);
      setFormError(result.formError ?? null);
    }
  }

  const { thisWeek, weeks } = sheet;
  const rows: PlanRow[] = [...sheet.rows, ...added];
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

  /** 고친 칸이 있으면 떠나기 전에 묻는다 — 「취소」면 머문다. */
  const guard = (event: MouseEvent | FormEvent) => {
    if (unsaved && !window.confirm(LEAVE)) event.preventDefault();
  };

  // 새 줄의 후보 — 「사용」 매출처 · 「사용」 완제품 가운데 화면에 없는 쌍. 고를 품목이 남지 않은 고객은 뺀다.
  // 거른 화면이면 거른 고객 · 품목만 — 거르기에 맞는 DB 의 줄은 모두 화면에 있으니 새 줄은 DB 에 칸이 없는 쌍뿐이고, 저장 뒤 같은 거르기로 돌아와도 보인다.
  const filtered = !!(back.customer || back.item);
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
  const removeRow = (row: PlanRow) => {
    const prefix = `${pairOf(row.customer.code, row.item.code)}|`;
    const drop = (rec: Record<string, string>) =>
      Object.fromEntries(Object.entries(rec).filter(([k]) => !k.startsWith(prefix)));
    setAdded((a) => a.filter((r) => r !== row));
    setEdits(drop);
    setErrors(drop);
  };
  const save = () => {
    if (changes.length) startTransition(() => dispatch(changes));
  };

  const wrong = Object.keys(errors).length;
  const field = "w-full min-w-0 rounded border border-rule bg-white px-3 py-2 text-base";
  const nameOf = (r: PlanRow) => `${r.customer.code} ${r.item.code}`;

  return (
    <>
      <PlanNav path={ENTRY_PATH} sheet={sheet} options={options} back={back} guard={guard} />

      {(formError || wrong > 0) && (
        <PlanFailure
          verb="저장"
          formError={formError}
          wrongLine={wrong > 0 ? `틀린 칸 ${wrong}개 — 칸 아래의 까닭을 보고 고치세요.` : undefined}
        />
      )}

      <fieldset disabled={pending} className="mt-4 min-w-0">
        <legend className="sr-only">판매계획 칸</legend>
        <p className="text-sm text-muted">
          칸에 그 주의 수량을 넣고 [저장]을 누르세요. 빈 칸 · 0 은 그 칸을 지웁니다. 저장한 칸은 미확정(노란 칸)이라 MPS
          수요에 들지 않습니다 — 확정 · 확정 취소는{" "}
          <Link
            href={planHref(CONFIRM_PATH, back.from, back)}
            onClick={guard}
            className="font-semibold text-ink underline underline-offset-4"
          >
            판매계획 확정
          </Link>
          에서 합니다. 「확정」 칸은 그곳에서 확정 취소한 뒤 고칩니다. 지난 주(회색)는 고치지 못합니다.
        </p>
        <PlanTable
          sheet={sheet}
          rows={rows}
          empty="판매계획이 없습니다 — 아래 [줄 더하기]로 고객 · 품목을 고르세요"
          rowExtra={(r) =>
            r.added && (
              <span className="mt-0.5 flex items-center gap-2">
                <span className="rounded-sm bg-safety px-1 text-xs font-semibold text-ink">새 줄</span>
                <button
                  type="button"
                  onClick={() => removeRow(r)}
                  aria-label={`${nameOf(r)} 줄 지우기`}
                  className="text-xs text-muted underline underline-offset-2 hover:text-ink"
                >
                  지우기
                </button>
              </span>
            )
          }
          cell={(r, w) => {
            const key = cellKey(r.customer.code, r.item.code, w);
            const loaded = r.cells[w];
            const text = edits[key] ?? (loaded === undefined ? "" : shownQty(loaded.qty));
            const editable = isEditableWeek(w, thisWeek);
            const fixed = loaded?.confirmed === true;
            const open = loaded?.confirmed === false;
            const error = errors[key];
            return (
              <>
                <input
                  inputMode="decimal"
                  autoComplete="off"
                  value={text}
                  disabled={!editable}
                  readOnly={editable && fixed}
                  onChange={(e) => setCell(key, e.target.value)}
                  aria-label={`${nameOf(r)} ${weekLabel(w, thisWeek)} 수량`}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errorId(key) : undefined}
                  className={`w-full min-w-24 rounded-sm border py-1 text-right tabular-nums ${fixed ? "pr-1.5 pl-9" : "px-1.5"} ${
                    error
                      ? "border-red-700 bg-white"
                      : !editable
                        ? `border-transparent text-muted ${open ? "bg-yellow-100" : "bg-floor"}`
                        : fixed
                          ? "border-rule bg-stone-100 text-muted"
                          : changed.has(key)
                            ? "border-machine bg-safety/25 font-semibold"
                            : open
                              ? "border-rule bg-yellow-100"
                              : "border-rule bg-white"
                  }`}
                />
                {fixed && <FixedChip />}
                {open && <span className="sr-only">미확정</span>}
                {error && (
                  <p id={errorId(key)} className="mt-0.5 max-w-28 text-xs font-semibold text-red-700">
                    {error}
                  </p>
                )}
              </>
            );
          }}
        />

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <button
            type="button"
            onClick={save}
            disabled={pending || !unsaved}
            className="rounded bg-machine px-6 py-2.5 font-semibold text-white hover:bg-machine-deep disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "저장 중…" : "저장"}
          </button>
          <span role="status" className="text-sm text-muted">
            {unsaved ? `고친 칸 ${changes.length.toLocaleString("ko-KR")}개` : "고친 칸이 없습니다"}
          </span>
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
            className="rounded border border-machine bg-white px-4 py-2 font-semibold hover:bg-floor disabled:cursor-not-allowed disabled:opacity-50"
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
