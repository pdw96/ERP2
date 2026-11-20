"use client";

import Link from "next/link";
import { startTransition, useActionState, useState, type MouseEvent, type ReactNode } from "react";
import { CONFIRM_PATH } from "@/app/sales/plans/paths";
import { milliOf, shownQty } from "@/app/sales/plans/plan-qty";
import { errorId, FixedChip, PlanFailure, WeekHead } from "@/app/sales/plans/plan-table";
import type { MpsCell, MpsRow, MpsSheet } from "@/db/mps";
import { mpsCellKey, parseMpsQty, type MpsCellInput, type MpsConfirmInput } from "@/lib/mps-input";
import type { Milli } from "@/lib/move-input";
import { isEditableWeek, pageStarts, PAGE_WEEKS, weekLabel } from "@/lib/weeks";
import { confirmMpsAction, saveMpsAction, unconfirmMpsAction, type MpsActionState } from "./actions";
import { mpsHref, type MpsBack } from "./paths";

// MPS 의 표(메뉴 「MPS」) — 완제품마다 머리 줄(체크박스 · 품목 · 가용 · 안전 · 최소 · 배수)과 세 줄(수요 · MPS · 예상재고), 칸은 13주.
// - MPS 칸: 고칠 수 있는 주(이번 주부터)는 입력 칸이다. 고정이면 고정 수량과 「고정」, 아니면 지금 계산한 안을 흐린 글씨(placeholder)로 보이고
//   값은 비운다 — 숫자(0 포함)를 치고 [저장]하면 그 주가 고정되고, 고정 칸을 비우고 저장하면 고정이 풀린다. 지난 주는 글자다.
// - [저장]은 바뀐 칸만 보낸다(전 = 불러온 고정 수량, 고정 아니면 「」 · 후 = 넣은 글자 그대로). 같은 수량(「3,000」 · 「3000」)은 바뀐 칸이 아니다.
// - [확정] · [확정 취소]는 고른 품목의 보이는 13주 가운데 고칠 수 있는 주에 건다 — 확정은 고정이 아니고 안 > 0 인 주를 그 안으로,
//   확정 취소는 고정 주를 불러온 고정 수량으로 보낸다. 저장하지 않은 칸이 있으면 둘 다 꺼진다(화면의 안이 저장 뒤 달라질 수 있어서).
// - 검사는 서버가 하고, 거절의 까닭은 표 위(role=alert)와 그 칸 아래에 보인다. 쪽을 넘기면 고친 칸이 사라지니 먼저 묻는다.
// - 예상재고는 음수면 빨강(「부족」), 0 이상이고 안전재고 밑이면 주황이다.

const LEAVE = "저장하지 않은 칸이 있습니다 — 넘기면 사라집니다";
const ZERO = BigInt(0);

type Kind = "save" | "confirm" | "unconfirm";
type Request = { kind: "save"; cells: MpsCellInput[] } | { kind: "confirm" | "unconfirm"; cells: MpsConfirmInput[] };
/** 마지막으로 부른 동작과 그 결과 — 거절이면 까닭을 보인다(서면 주소가 바뀌어 화면이 새로 열린다). */
type Outcome = { kind: Kind; result: MpsActionState } | null;

const VERB: Record<Kind, string> = { save: "저장", confirm: "확정", unconfirm: "확정 취소" };
const WRONG: Record<Kind, (n: number) => string> = {
  save: (n) => `틀린 칸 ${n}개 — 칸 아래의 까닭을 보고 고치세요.`,
  confirm: (n) => `확정하지 못한 칸 ${n}개 — 칸 아래의 까닭을 보세요.`,
  unconfirm: (n) => `확정을 취소하지 못한 칸 ${n}개 — 칸 아래의 까닭을 보세요.`,
};

/** 불러온 고정 수량(정규 글자) — 고정이 아니면 null. */
const fixedQty = (cell: MpsCell | undefined): string | null => (cell?.fixed && cell.mps !== null ? cell.mps : null);

/**
 * 넣은 글자의 수량 — 빈 칸은 null(고정 아님), 0 은 고정 수량 0, 서버가 거절할 글자는 undefined(불러온 값과 늘 달라 바뀐 칸이 되고,
 * 저장에 보내 서버의 까닭을 받는다). 서버와 같은 parseMpsQty 로 읽는다.
 */
function typedQty(text: string, decimals: number): Milli | null | undefined {
  const parsed = parseMpsQty(text, decimals);
  return parsed.ok ? parsed.qty : undefined;
}

export function MpsGrid({ sheet, back }: { sheet: MpsSheet; back: MpsBack }) {
  const [outcome, dispatch, pending] = useActionState<Outcome, Request>(async (_prev, request) => {
    const result =
      request.kind === "save"
        ? await saveMpsAction(request.cells, back)
        : request.kind === "confirm"
          ? await confirmMpsAction(request.cells, back)
          : await unconfirmMpsAction(request.cells, back);
    return { kind: request.kind, result };
  }, null);
  /** 고친 칸의 글자(열쇠 = mpsCellKey) — 손대지 않은 칸은 없다. */
  const [edits, setEdits] = useState<Record<string, string>>({});
  /** 고른 품목(열쇠 = 품목 코드). */
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  /** 지금 보내고 있는 동작 — 그 단추에 「… 중」. */
  const [doing, setDoing] = useState<Kind>("save");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [failedKind, setFailedKind] = useState<Kind>("save");
  const [seen, setSeen] = useState(outcome);
  if (outcome !== seen) {
    setSeen(outcome);
    if (outcome?.result && !outcome.result.ok) {
      setErrors(outcome.result.errors);
      setFormError(outcome.result.formError ?? null);
      setFailedKind(outcome.kind);
    }
  }

  const { thisWeek, weeks, rows } = sheet;

  // 바뀐 칸 — 고칠 수 있는 주에서 넣은 수량이 불러온 고정 수량(고정 아니면 null)과 다른 것.
  const changes: MpsCellInput[] = [];
  for (const r of rows)
    for (const week of weeks) {
      const key = mpsCellKey(r.item.code, week);
      const text = edits[key];
      if (text === undefined || !isEditableWeek(week, thisWeek)) continue;
      const loaded = fixedQty(r.cells[week]);
      if (typedQty(text, r.item.decimals) === (loaded === null ? null : milliOf(loaded))) continue;
      changes.push({ item: r.item.code, week, before: loaded ?? "", after: text });
    }
  const changed = new Set(changes.map((c) => mpsCellKey(c.item, c.week)));
  const unsaved = changes.length > 0;

  // 고른 품목의 칸 — 보이는 13주 가운데 고칠 수 있는 주만. 수량은 불러온 값(확정은 안, 확정 취소는 고정 수량).
  const chosen = rows.filter((r) => selected.has(r.item.code));
  const toConfirm: MpsConfirmInput[] = [];
  const toUnconfirm: MpsConfirmInput[] = [];
  for (const r of chosen)
    for (const week of weeks) {
      const cell: MpsCell | undefined = r.cells[week];
      if (!cell || cell.mps === null || !isEditableWeek(week, thisWeek)) continue;
      if (cell.fixed) toUnconfirm.push({ item: r.item.code, week, qty: cell.mps });
      else if (milliOf(cell.mps) > ZERO) toConfirm.push({ item: r.item.code, week, qty: cell.mps });
    }
  const allChosen = rows.length > 0 && chosen.length === rows.length;
  const someChosen = chosen.length > 0 && !allChosen;

  /** 고친 칸이 있으면 떠나기 전에 묻는다 — 「취소」면 머문다. */
  const guard = (event: MouseEvent) => {
    if (unsaved && !window.confirm(LEAVE)) event.preventDefault();
  };
  const setCell = (key: string, text: string) => {
    setEdits((e) => ({ ...e, [key]: text }));
    if (errors[key])
      setErrors((e) => {
        const rest = { ...e };
        delete rest[key];
        return rest;
      });
  };
  const toggleItem = (code: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (!next.delete(code)) next.add(code);
      return next;
    });
  const toggleAll = () => setSelected(allChosen ? new Set() : new Set(rows.map((r) => r.item.code)));
  const send = (request: Request) => {
    if (!request.cells.length) return;
    setDoing(request.kind);
    startTransition(() => dispatch(request));
  };
  const busy = (kind: Kind) => (pending && doing === kind ? `${VERB[kind]} 중…` : VERB[kind]);

  // 쪽 — 이번 주에서 13주씩, 앞 · 뒤 쪽이 있을 때만 링크.
  const starts = pageStarts(thisWeek);
  const at = starts.indexOf(weeks[0]);
  const prev = at > 0 ? starts[at - 1] : undefined;
  const next = at >= 0 && at < starts.length - 1 ? starts[at + 1] : undefined;

  const wrong = Object.keys(errors).length;
  const now = (w: string) => (w === thisWeek ? "bg-safety/10" : "");
  // 왼쪽에 붙는 칸 — 체크박스(2.5rem) · 품목/구분. 위에 붙는 머리는 아래 줄에 선을 그림자로 긋는다.
  const leadCol = "sticky left-0 w-10 min-w-10 px-2";
  const nameCol = "sticky left-10 w-40 min-w-40 px-2 sm:w-60 sm:min-w-60";
  const headLine = "shadow-[inset_0_-2px_0_var(--color-machine)]";
  const line = "border-b border-rule";
  const qtyCell = `${line} px-2.5 py-1.5 text-right tabular-nums whitespace-nowrap`;
  const buttonClass =
    "rounded border border-machine bg-white px-5 py-2.5 font-semibold hover:bg-floor disabled:cursor-not-allowed disabled:border-rule disabled:bg-floor disabled:text-muted disabled:hover:bg-floor disabled:opacity-50";

  const salesConfirmLink = (
    <Link href={CONFIRM_PATH} onClick={guard} className="font-semibold text-ink underline underline-offset-4">
      판매계획 확정
    </Link>
  );

  return (
    <>
      <nav aria-label="주 넘기기" className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {prev ? (
          <Link href={mpsHref(prev)} onClick={guard} className="font-semibold underline underline-offset-4">
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
          <Link href={mpsHref(next)} onClick={guard} className="font-semibold underline underline-offset-4">
            뒤 {PAGE_WEEKS}주 ▶
          </Link>
        ) : (
          <span className="text-muted" aria-disabled="true">
            뒤 {PAGE_WEEKS}주 ▶
          </span>
        )}
        <Link href={mpsHref(undefined)} onClick={guard} className="underline underline-offset-4">
          이번 주
        </Link>
      </nav>

      {(formError || wrong > 0) && (
        <PlanFailure
          verb={VERB[failedKind]}
          formError={formError}
          wrongLine={wrong > 0 ? WRONG[failedKind](wrong) : undefined}
        />
      )}

      <fieldset disabled={pending} className="mt-4 min-w-0">
        <legend className="sr-only">MPS 칸</legend>
        <p className="text-sm text-muted">
          MPS 칸에 그 주에 완성할 수량을 넣고 [저장]하면 그 주가 고정됩니다(0 도 고정 — 그 주는 만들지 않음). 고정 칸을
          비우고 저장하면 고정이 풀립니다. 품목을 고르고 [확정]하면 흐린 글씨의 안이 그대로 고정되고, [확정 취소]하면
          고정이 풀립니다. 지난 주는 고치지 못합니다.
        </p>
        <div
          className="relative mt-2 max-h-[60vh] overflow-auto border border-rule bg-white"
          tabIndex={0}
          role="region"
          aria-label="MPS 표"
        >
          <table className="border-separate border-spacing-0 text-left text-sm">
            <caption className="sr-only">
              MPS — 품목마다 수요 · MPS · 예상재고, 칸은 {weekLabel(weeks[0], thisWeek)}부터 {PAGE_WEEKS}주
            </caption>
            <thead>
              <tr>
                <th scope="col" className={`${leadCol} top-0 z-30 bg-floor py-2 ${headLine}`}>
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
                </th>
                <th scope="col" className={`${nameCol} top-0 z-30 bg-floor py-2 ${headLine}`}>
                  품목 · 구분
                </th>
                {weeks.map((w) => (
                  <WeekHead key={w} week={w} thisWeek={thisWeek} />
                ))}
              </tr>
            </thead>
            {rows.length === 0 && (
              <tbody>
                <tr>
                  <td colSpan={weeks.length + 2} className="px-5 py-6 text-muted">
                    <span className="sticky left-5">
                      확정한 판매계획이 없어 세울 MPS 가 없습니다 — 「{salesConfirmLink}」에서 확정하세요
                    </span>
                  </td>
                </tr>
              </tbody>
            )}
            {rows.map((r) => (
              <ItemRows
                key={r.item.code}
                row={r}
                weeks={weeks}
                picked={selected.has(r.item.code)}
                onPick={() => toggleItem(r.item.code)}
                classes={{ leadCol, nameCol, line, qtyCell, now }}
                mpsCell={(w) => {
                  const code = r.item.code;
                  const key = mpsCellKey(code, w);
                  const cell: MpsCell | undefined = r.cells[w];
                  const fixed = cell?.fixed === true;
                  const loaded = fixedQty(cell);
                  if (!isEditableWeek(w, thisWeek))
                    return (
                      <div
                        data-testid={`mps-${code}-${w}`}
                        className={`relative min-h-8 min-w-24 rounded-sm py-1 text-right text-muted tabular-nums ${fixed ? "bg-stone-100 pr-1.5 pl-9" : "px-1.5"}`}
                      >
                        {loaded !== null && shownQty(loaded)}
                        {fixed && <FixedChip label="고정" />}
                      </div>
                    );
                  const error = errors[key];
                  const text = edits[key] ?? (loaded === null ? "" : shownQty(loaded));
                  return (
                    <>
                      <input
                        inputMode="decimal"
                        autoComplete="off"
                        value={text}
                        placeholder={!fixed && cell && cell.mps !== null ? shownQty(cell.mps) : undefined}
                        onChange={(e) => setCell(key, e.target.value)}
                        aria-label={`${code} ${weekLabel(w, thisWeek)} MPS`}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? errorId(key) : undefined}
                        className={`w-full min-w-24 rounded-sm border py-1 text-right tabular-nums placeholder:text-muted/70 ${fixed ? "pr-1.5 pl-9" : "px-1.5"} ${
                          error
                            ? "border-red-700 bg-white"
                            : changed.has(key)
                              ? "border-machine bg-safety/25 font-semibold"
                              : fixed
                                ? "border-rule bg-white font-semibold"
                                : "border-rule bg-white"
                        }`}
                      />
                      {fixed && <FixedChip label="고정" />}
                      {error && (
                        <p id={errorId(key)} className="mt-0.5 max-w-28 text-xs font-semibold text-red-700">
                          {error}
                        </p>
                      )}
                    </>
                  );
                }}
              />
            ))}
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <button
            type="button"
            onClick={() => send({ kind: "save", cells: changes })}
            disabled={pending || !unsaved}
            className="rounded bg-machine px-6 py-2.5 font-semibold text-white hover:bg-machine-deep disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy("save")}
          </button>
          <span role="status" className="text-sm text-muted">
            {unsaved ? `고친 칸 ${changes.length.toLocaleString("ko-KR")}개` : "고친 칸이 없습니다"}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-rule pt-4">
          <span data-testid="mps-selection" className="text-sm tabular-nums">
            선택 {chosen.length.toLocaleString("ko-KR")}품목
          </span>
          <button
            type="button"
            onClick={() => send({ kind: "confirm", cells: toConfirm })}
            disabled={pending || unsaved || toConfirm.length === 0}
            className={buttonClass}
          >
            {busy("confirm")}
          </button>
          <button
            type="button"
            onClick={() => send({ kind: "unconfirm", cells: toUnconfirm })}
            disabled={pending || unsaved || toUnconfirm.length === 0}
            className={buttonClass}
          >
            {busy("unconfirm")}
          </button>
          {unsaved && <span className="text-sm font-semibold">저장한 뒤 확정하세요</span>}
        </div>
      </fieldset>
    </>
  );
}

/** 품목 하나의 줄 묶음 — 머리 줄(체크박스 · 품목 · 가용 · 안전 · 최소 · 배수)과 수요 · MPS · 예상재고. MPS 칸의 속은 부르는 쪽이 그린다. */
function ItemRows({
  row,
  weeks,
  picked,
  onPick,
  classes,
  mpsCell,
}: {
  row: MpsRow;
  weeks: string[];
  picked: boolean;
  onPick: () => void;
  classes: { leadCol: string; nameCol: string; line: string; qtyCell: string; now: (w: string) => string };
  mpsCell: (week: string) => ReactNode;
}) {
  const { leadCol, nameCol, line, qtyCell, now } = classes;
  const { item } = row;
  const safety = milliOf(row.safety);
  const lead = <td className={`${leadCol} ${line} z-10 bg-white`} />;
  const label = (text: string) => (
    <th scope="row" className={`${nameCol} ${line} z-10 bg-white py-1.5 font-normal text-muted`}>
      {text}
    </th>
  );

  return (
    <tbody>
      <tr>
        <td className={`${leadCol} ${line} z-10 border-t-2 border-t-machine bg-floor py-2 text-center`}>
          <input
            type="checkbox"
            checked={picked}
            onChange={onPick}
            aria-label={`${item.code} 고르기`}
            className="size-4"
          />
        </td>
        <th
          scope="rowgroup"
          data-testid={`item-${item.code}`}
          className={`${nameCol} ${line} z-10 border-t-2 border-t-machine bg-floor py-1.5 font-normal`}
        >
          <span className="block font-semibold wrap-anywhere">
            <span className="font-mono">{item.code}</span> {item.name} <span className="text-muted">({item.unit})</span>
            {!item.active && (
              <span className="ml-1 inline-block rounded-sm border border-muted px-1 text-xs font-normal whitespace-nowrap text-muted">
                사용 안 함
              </span>
            )}
          </span>
          <span className="block text-xs text-muted tabular-nums">
            가용 {shownQty(row.available)} · 안전 {shownQty(row.safety)} · 최소 {shownQty(row.minLot)} · 배수{" "}
            {shownQty(row.multiple)}
          </span>
        </th>
        <td colSpan={weeks.length} className={`${line} border-t-2 border-t-machine bg-floor`} />
      </tr>
      <tr>
        {lead}
        {label("수요")}
        {weeks.map((w) => {
          const demand = row.cells[w]?.demand ?? null;
          return (
            <td key={w} data-testid={`demand-${item.code}-${w}`} className={`${qtyCell} ${now(w)}`}>
              {demand !== null && shownQty(demand)}
            </td>
          );
        })}
      </tr>
      <tr className="align-top">
        {lead}
        {label("MPS")}
        {weeks.map((w) => (
          <td key={w} className={`relative p-1 ${line} ${now(w)}`}>
            {mpsCell(w)}
          </td>
        ))}
      </tr>
      <tr>
        {lead}
        {label("예상재고")}
        {weeks.map((w) => {
          const projected = row.cells[w]?.projected ?? null;
          const qty = projected === null ? null : milliOf(projected);
          const short = qty !== null && qty < ZERO;
          const low = qty !== null && !short && qty < safety;
          return (
            <td
              key={w}
              data-testid={`projected-${item.code}-${w}`}
              className={`${qtyCell} ${now(w)} ${short ? "font-semibold text-red-700" : low ? "text-orange-700" : ""}`}
            >
              {projected !== null && shownQty(projected)}
              {short && <span className="sr-only">부족</span>}
              {low && <span className="sr-only">안전재고 밑</span>}
            </td>
          );
        })}
      </tr>
    </tbody>
  );
}
