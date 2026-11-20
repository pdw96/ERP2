"use client";

import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import type { PlanCustomer, PlanItem, SalesPlanSheet } from "@/db/sales-plans";
import { cellKey, type SalesPlanConfirmInput } from "@/lib/sales-plan-input";
import { isEditableWeek } from "@/lib/weeks";
import { confirmSalesPlanAction, unconfirmSalesPlanAction, type SalesPlanActionState } from "./actions";
import { PlanNav } from "./plan-nav";
import { shownQty } from "./plan-qty";
import { FixedChip, pairOf, PlanFailure, PlanTable } from "./plan-table";
import { CONFIRM_PATH, ENTRY_PATH, planHref, type Back } from "./paths";

// 판매계획 확정의 표(메뉴 「판매계획 확정」) — 줄은 고객 × 완제품, 칸은 13주의 글자(고치지 않는다). 줄 앞 체크박스로 고른 줄의
// 보이는 13주 가운데 고칠 수 있는 주의 칸을 [확정](미확정 칸) · [확정 취소](확정 칸)한다 — 보내는 수량은 불러온 값이라, 그사이
// 남이 고쳤으면 서버가 STALE 로 막는다. 거절의 까닭은 표 위(role=alert)와 그 칸 아래에 보인다. 수량은 「판매계획 등록」에서 고친다.

type Kind = "confirm" | "unconfirm";
type Request = { kind: Kind; cells: SalesPlanConfirmInput[] };
/** 마지막으로 부른 동작과 그 결과 — 거절이면 까닭을 보인다(서면 주소가 바뀌어 화면이 새로 열린다). */
type Outcome = { kind: Kind; result: SalesPlanActionState } | null;

const VERB: Record<Kind, string> = { confirm: "확정", unconfirm: "확정 취소" };

export function SalesPlanConfirmGrid({
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
      request.kind === "confirm"
        ? await confirmSalesPlanAction(request.cells, back)
        : await unconfirmSalesPlanAction(request.cells, back);
    return { kind: request.kind, result };
  }, null);
  /** 고른 줄(열쇠 = 고객|품목). */
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  /** 지금 보내고 있는 동작 — 그 단추에 「… 중」. */
  const [doing, setDoing] = useState<Kind>("confirm");
  const failure = outcome?.result && !outcome.result.ok ? outcome.result : null;
  const errors = failure?.errors ?? {};

  const { thisWeek, weeks } = sheet;
  const rows = sheet.rows;

  // 고른 줄의 칸 — 보이는 13주 가운데 고칠 수 있는 주만. 미확정 칸은 [확정]에, 확정 칸은 [확정 취소]에 간다(수량은 불러온 값).
  const chosen = rows.filter((r) => selected.has(pairOf(r.customer.code, r.item.code)));
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
  const allChosen = rows.length > 0 && chosen.length === rows.length;
  const someChosen = chosen.length > 0 && !allChosen;

  const toggleRow = (pair: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (!next.delete(pair)) next.add(pair);
      return next;
    });
  const toggleAll = () =>
    setSelected(allChosen ? new Set() : new Set(rows.map((r) => pairOf(r.customer.code, r.item.code))));
  const send = (request: Request) => {
    if (!request.cells.length) return;
    setDoing(request.kind);
    startTransition(() => dispatch(request));
  };
  const busy = (kind: Kind) => (pending && doing === kind ? `${VERB[kind]} 중…` : VERB[kind]);

  const wrong = Object.keys(errors).length;
  const failedKind = outcome?.kind ?? "confirm";
  const wrongLine =
    failedKind === "confirm"
      ? `확정하지 못한 칸 ${wrong}개 — 칸 아래의 까닭을 보세요.`
      : `확정을 취소하지 못한 칸 ${wrong}개 — 칸 아래의 까닭을 보세요.`;
  const buttonClass =
    "rounded border border-machine bg-white px-5 py-2.5 font-semibold hover:bg-floor disabled:cursor-not-allowed disabled:border-rule disabled:bg-floor disabled:text-muted disabled:hover:bg-floor disabled:opacity-50";

  return (
    <>
      <PlanNav path={CONFIRM_PATH} sheet={sheet} options={options} back={back} />

      {failure && (failure.formError || wrong > 0) && (
        <PlanFailure
          verb={VERB[failedKind]}
          formError={failure.formError ?? null}
          wrongLine={wrong > 0 ? wrongLine : undefined}
        />
      )}

      <fieldset disabled={pending} className="mt-4 min-w-0">
        <legend className="sr-only">판매계획 확정할 줄</legend>
        <p className="text-sm text-muted">
          줄 앞을 고르고 [확정] · [확정 취소]를 누르세요. 보이는 {weeks.length}주 가운데 이번 주부터의 칸만 바뀝니다 —
          노란 칸(미확정)은 확정되고, 「확정」 칸은 확정이 풀립니다. 수량은{" "}
          <Link
            href={planHref(ENTRY_PATH, back.from, back)}
            className="font-semibold text-ink underline underline-offset-4"
          >
            판매계획 등록
          </Link>
          에서 고칩니다.
        </p>
        <PlanTable
          sheet={sheet}
          rows={rows}
          empty="판매계획이 없습니다 — 「판매계획 등록」에서 넣으세요"
          lead={{
            head: (
              <label className="flex flex-col items-center gap-0.5 text-xs font-normal">
                <input
                  type="checkbox"
                  checked={allChosen}
                  ref={(el) => {
                    if (el) el.indeterminate = someChosen;
                  }}
                  onChange={toggleAll}
                  disabled={rows.length === 0}
                  className="size-4"
                />
                전체
              </label>
            ),
            cell: (r) => {
              const pair = pairOf(r.customer.code, r.item.code);
              return (
                <input
                  type="checkbox"
                  checked={selected.has(pair)}
                  onChange={() => toggleRow(pair)}
                  aria-label={`${r.customer.code} ${r.item.code} 줄 고르기`}
                  className="size-4"
                />
              );
            },
          }}
          cell={(r, w) => {
            const key = cellKey(r.customer.code, r.item.code, w);
            const loaded = r.cells[w];
            const fixed = loaded?.confirmed === true;
            const open = loaded?.confirmed === false;
            const error = errors[key];
            return (
              <>
                <div
                  data-testid={`plan-${r.customer.code}-${r.item.code}-${w}`}
                  className={`relative min-h-8 min-w-24 rounded-sm border py-1 text-right tabular-nums ${fixed ? "pr-1.5 pl-9" : "px-1.5"} ${
                    error
                      ? "border-red-700 bg-white"
                      : fixed
                        ? "border-transparent bg-stone-100 text-muted"
                        : open
                          ? "border-transparent bg-yellow-100"
                          : "border-transparent"
                  } ${isEditableWeek(w, thisWeek) ? "" : "opacity-60"}`}
                >
                  {loaded && shownQty(loaded.qty)}
                  {fixed && <FixedChip />}
                  {open && <span className="sr-only">미확정</span>}
                </div>
                {error && <p className="mt-0.5 max-w-28 text-xs font-semibold text-red-700">{error}</p>}
              </>
            );
          }}
        />

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <button
            type="button"
            onClick={() => send({ kind: "confirm", cells: toConfirm })}
            disabled={pending || toConfirm.length === 0}
            className={buttonClass}
          >
            {busy("confirm")}
          </button>
          <button
            type="button"
            onClick={() => send({ kind: "unconfirm", cells: toUnconfirm })}
            disabled={pending || toUnconfirm.length === 0}
            className={buttonClass}
          >
            {busy("unconfirm")}
          </button>
          <span data-testid="plan-selection" className="text-sm tabular-nums">
            선택 {chosen.length.toLocaleString("ko-KR")}줄 · 미확정 {toConfirm.length.toLocaleString("ko-KR")}칸
          </span>
        </div>
      </fieldset>
    </>
  );
}
