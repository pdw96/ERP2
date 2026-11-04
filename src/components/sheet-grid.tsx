"use client";

import Link from "next/link";
import { startTransition, useActionState, useState, type ClipboardEvent, type FormEvent } from "react";
import {
  ROW_ERROR,
  SHEET_MAX_ROWS,
  blankRow,
  headerLine,
  isBlankRow,
  takesPaste,
  pasteInto,
  type SheetColumn,
  type SheetErrors,
  type SheetResult,
  type SheetRow,
} from "@/lib/sheet";

// 시트형 등록 화면(성공 기준 11) — 칸 · 줄로 된 시트에 넣거나 엑셀에서 여러 줄을 붙여넣고 한 번에 저장한다.
// 검사는 서버가 한다. 저장하면 맞는 줄은 빠지고(저장 알림에 코드가 보인다), 틀린 줄은 넣은 글자 그대로 남아 칸이 빨갛게
// 보이고 줄 아래에 까닭이 보인다. 품목 · 거래처가 같은 부품을 쓰고, 칸은 src/lib/sheet-columns.ts 가 든다.

type Props = {
  columns: SheetColumn[];
  /** 칸 이름과 다른 거절 자리의 이름 — 예: 거래처의 「구분(매입처 · 매출처)」. */
  errorLabels?: Record<string, string>;
  action: (state: SheetResult | null, form: FormData) => Promise<SheetResult>;
  /** 「품목」 · 「거래처」 */
  what: string;
  /** 목록 주소 — 저장한 코드의 수정 화면 링크도 그 아래다. */
  listHref: string;
};

// 칸은 모두 화면이 쥔 값(controlled)이라 줄의 key 는 차례로 충분하다.
type Line = { values: SheetRow; errors: SheetErrors };

/** 처음 · 저장한 뒤 시트가 갖는 줄 수. 「줄 더하기」도 이만큼 더한다. */
const START_ROWS = 5;

export function SheetGrid({ columns, errorLabels = {}, action, what, listHref }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  const line = (values: SheetRow, errors: SheetErrors = {}): Line => ({ values, errors });
  const blanks = (n: number) => Array.from({ length: n }, () => line(blankRow(columns)));
  const [lines, setLines] = useState<Line[]>(() => blanks(START_ROWS));
  const [pasteNotice, setPasteNotice] = useState("");
  const [copyNotice, setCopyNotice] = useState("");

  // 서버의 결과가 오면 시트를 틀린 줄로 바꾼다. 아무것도 저장하지 못했으면(formError) 시트를 그대로 둔다.
  const [applied, setApplied] = useState<SheetResult | null>(null);
  if (state !== applied) {
    setApplied(state);
    if (state && !state.formError) {
      const kept = state.rejected.map((r) => line(r.row, r.errors));
      setLines([...kept, ...blanks(Math.max(0, START_ROWS - kept.length))]);
      setPasteNotice("");
    }
  }

  const labelOf = (key: string) =>
    key === ROW_ERROR ? "줄" : (errorLabels[key] ?? columns.find((c) => c.key === key)?.label ?? key);
  // 거절 자리마다 첫 칸 — 맨 위 목록의 링크가 그 칸으로 간다.
  const firstColumnOf = (key: string) => columns.find((c) => (c.errorKey ?? c.key) === key)?.key ?? columns[0].key;
  // 한 줄의 거절을 칸 순서대로(줄 전체의 거절이 맨 앞).
  const errorsOf = (errors: SheetErrors) => {
    const keys = [ROW_ERROR, ...new Set(columns.map((c) => c.errorKey ?? c.key))];
    return keys.filter((k) => errors[k]).map((k) => [k, labelOf(k), errors[k]] as const);
  };

  function edit(index: number, column: SheetColumn, value: string) {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== index) return l;
        // 고친 칸의 빨간 표시는 지운다 — 다시 저장하면 서버가 다시 본다.
        const errors = { ...l.errors };
        delete errors[column.errorKey ?? column.key];
        delete errors[ROW_ERROR];
        return { ...l, values: { ...l.values, [column.key]: value }, errors };
      }),
    );
  }

  function paste(event: ClipboardEvent<HTMLInputElement>, index: number, col: number) {
    const text = event.clipboardData.getData("text/plain");
    if (!takesPaste(text)) return; // 한 칸짜리 글은 브라우저가 그대로 붙인다.
    event.preventDefault();
    const r = pasteInto(
      lines.map((l) => l.values),
      columns,
      index,
      col,
      text,
    );
    setLines((prev) =>
      r.rows.map((values, i) => {
        const old = prev[i];
        if (!old) return line(values);
        // 붙여넣은 줄은 거절 표시를 지운다.
        return i >= index && i < index + r.pastedRows ? { ...old, values, errors: {} } : old;
      }),
    );
    setPasteNotice(
      [
        r.skippedHeader && "첫 줄은 머리글이라 건너뛰었습니다.",
        r.droppedRows > 0 &&
          `한 번에 ${SHEET_MAX_ROWS}줄까지 받습니다 — 남은 ${r.droppedRows}줄은 저장한 뒤 나눠 붙여넣으세요.`,
        r.droppedColumns && `시트의 칸(${columns.length}칸)보다 많은 칸은 버렸습니다 — 칸 순서를 보세요.`,
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  function addRows() {
    setLines((prev) => [...prev, ...blanks(Math.min(START_ROWS, SHEET_MAX_ROWS - prev.length))]);
  }

  function removeRow(index: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : blanks(1)));
  }

  function clearAll() {
    setLines(blanks(START_ROWS));
    setPasteNotice("");
  }

  async function copyHeader() {
    try {
      await navigator.clipboard.writeText(headerLine(columns));
      setCopyNotice("머리글 줄을 복사했습니다 — 엑셀의 첫 줄에 붙여넣으세요.");
    } catch {
      setCopyNotice("복사하지 못했습니다 — 위의 칸 순서대로 머리글을 넣으세요.");
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData();
    form.set("rows", JSON.stringify(lines.map((l) => l.values)));
    startTransition(() => formAction(form));
  }

  const filled = lines.filter((l) => !isBlankRow(l.values)).length;
  const rejected = lines.flatMap((l, i) =>
    errorsOf(l.errors).map(([key, label, message]) => ({ i, key, label, message })),
  );

  return (
    <div className="mt-6">
      <details open className="border-y border-rule bg-white px-4 py-3">
        <summary className="cursor-pointer font-semibold">칸 순서와 넣는 값</summary>
        <p className="mt-2 text-sm text-muted">
          엑셀에서 이 순서대로 칸을 두고 여러 줄을 복사해, 시트의 첫 칸을 누른 뒤 붙여넣으세요. 고른 칸부터 오른쪽 ·
          아래로 채워지고, 첫 줄이 머리글이면 건너뜁니다. 한 번에 {SHEET_MAX_ROWS}줄까지 받습니다.
        </p>
        <ol className="mt-2 grid list-decimal gap-1 pl-6 text-sm">
          {columns.map((c) => (
            <li key={c.key}>
              <span className="font-semibold">{c.label}</span> — {c.rule}
            </li>
          ))}
        </ol>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={copyHeader}
            className="rounded border border-machine px-4 py-2 text-sm font-semibold hover:bg-floor"
          >
            머리글 줄 복사
          </button>
          <span role="status" className="text-sm text-muted">
            {copyNotice}
          </span>
        </div>
      </details>

      {state && <Outcome state={state} what={what} listHref={listHref} />}
      {state && !state.formError && rejected.length > 0 && (
        <div role="alert" className="mt-4 border-l-4 border-red-700 bg-white px-5 py-4">
          <p className="font-semibold">
            {state.rejected.length}줄은 저장하지 않았습니다 — 빨간 칸을 고쳐 다시 저장하세요.
          </p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {rejected.map(({ i, key, label, message }) => (
              <li key={`${i}-${key}`}>
                <a href={`#c-${i}-${firstColumnOf(key)}`} className="underline underline-offset-2">
                  {i + 1}줄 · {label}
                </a>{" "}
                — {message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <form onSubmit={onSubmit} noValidate className="mt-4">
        <p role="status" className="min-h-5 text-sm font-semibold text-machine-deep">
          {pasteNotice}
        </p>
        {/* 저장하는 동안에는 시트를 잠근다 — 결과가 그 사이 고친 것을 덮지 않게(리뷰 1회차). */}
        <fieldset disabled={pending} className="min-w-0 disabled:opacity-70">
          {/* relative — 화면 읽기 전용 글(sr-only)이 상자 밖으로 나가 휴대폰 폭에서 화면이 옆으로 밀리지 않게. */}
          <div className="relative mt-1 overflow-x-auto border border-rule bg-white">
            <table className="border-collapse text-left text-sm">
              <caption className="sr-only">{what} 시트</caption>
              <thead className="border-b-2 border-machine bg-floor">
                <tr>
                  <th scope="col" className="sticky left-0 bg-floor px-2 py-2 text-right">
                    <span className="sr-only">줄</span>
                  </th>
                  {columns.map((c) => (
                    <th key={c.key} scope="col" className="px-1 py-2 font-semibold whitespace-nowrap">
                      {c.label}
                    </th>
                  ))}
                  <th scope="col">
                    <span className="sr-only">지우기</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const errs = errorsOf(l.errors);
                  const describedBy = errs.length ? `r-${i}-errors` : undefined;
                  return [
                    <tr key={i} className={errs.length ? "bg-red-50" : "border-b border-rule"}>
                      <th scope="row" className="sticky left-0 bg-inherit px-2 text-right font-mono text-xs text-muted">
                        {i + 1}
                      </th>
                      {columns.map((c, col) => {
                        const invalid = !!(l.errors[c.errorKey ?? c.key] || l.errors[ROW_ERROR]);
                        return (
                          <td key={c.key} className="p-0.5">
                            <input
                              id={`c-${i}-${c.key}`}
                              value={l.values[c.key] ?? ""}
                              onChange={(e) => edit(i, c, e.target.value)}
                              onPaste={(e) => paste(e, i, col)}
                              aria-label={`${i + 1}줄 ${c.label}`}
                              aria-invalid={invalid || undefined}
                              aria-describedby={describedBy}
                              autoComplete="off"
                              style={{ width: `${(c.width ?? 8) + 1}em` }}
                              className={`rounded-sm border px-1.5 py-1 ${
                                invalid ? "border-red-700 bg-white" : "border-transparent hover:border-rule"
                              } focus-visible:outline-machine`}
                            />
                          </td>
                        );
                      })}
                      <td className="px-1">
                        <button
                          type="button"
                          onClick={() => removeRow(i)}
                          aria-label={`${i + 1}줄 지우기`}
                          className="rounded px-2 py-1 text-muted hover:bg-floor hover:text-ink"
                        >
                          ×
                        </button>
                      </td>
                    </tr>,
                    errs.length > 0 && (
                      <tr key={`${i}-errors`} className="border-b border-rule bg-red-50">
                        <td />
                        <td colSpan={columns.length + 1} className="px-2 pb-2">
                          <ul id={describedBy} className="text-xs font-semibold text-red-700">
                            {errs.map(([key, label, message]) => (
                              <li key={key}>
                                {label} — {message}
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={addRows}
              disabled={lines.length >= SHEET_MAX_ROWS}
              className="rounded border border-rule bg-white px-4 py-2 text-sm hover:border-machine disabled:opacity-60"
            >
              줄 더하기
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="px-2 py-2 text-sm text-muted underline underline-offset-4 hover:text-ink"
            >
              모두 비우기
            </button>
            <span className="text-sm text-muted">
              넣은 줄 {filled} · 시트 {lines.length} / {SHEET_MAX_ROWS}줄
            </span>
          </div>
        </fieldset>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-machine px-6 py-2.5 font-semibold text-white hover:bg-machine-deep disabled:opacity-60"
          >
            {pending ? "저장 중…" : "저장"}
          </button>
          <Link href={listHref} className="px-3 py-2.5 text-muted underline underline-offset-4 hover:text-ink">
            목록으로
          </Link>
        </div>
      </form>
    </div>
  );
}

/** 저장의 결과 — 저장한 줄(코드 · 이름, 수정 화면 링크)과 같은 사업자번호 경고, 또는 아무것도 저장하지 못한 까닭. */
function Outcome({ state, what, listHref }: { state: SheetResult; what: string; listHref: string }) {
  if (state.formError)
    return (
      <div role="alert" className="mt-4 border-l-4 border-red-700 bg-white px-5 py-4">
        <p className="font-semibold">저장하지 않았습니다.</p>
        <p className="mt-1 text-sm">{state.formError}</p>
      </div>
    );
  if (state.saved.length === 0 && state.rejected.length === 0)
    return (
      <p role="status" className="mt-4 border-l-4 border-rule bg-white px-5 py-3">
        넣은 줄이 없습니다 — 시트에 넣거나 붙여넣은 뒤 저장하세요.
      </p>
    );
  if (state.saved.length === 0) return null;
  return (
    <div role="status" className="mt-4 border-l-4 border-safety bg-white px-5 py-3 wrap-anywhere">
      <p className="font-semibold">
        {what} {state.saved.length}줄을 저장했습니다.
      </p>
      <ul className="mt-1 grid gap-0.5 text-sm">
        {state.saved.map((s) => (
          <li key={s.code}>
            <Link href={`${listHref}/${s.code}`} className="font-mono font-semibold underline underline-offset-4">
              {s.code}
            </Link>{" "}
            {s.name}
            {s.sharedBizNo && (
              <span className="block pl-4 text-muted">
                같은 사업자번호를 쓰는 거래처가 있습니다 —{" "}
                {s.sharedBizNo.map((o, k) => (
                  <span key={o.code}>
                    {k > 0 && ", "}
                    <Link href={`${listHref}/${o.code}`} className="font-mono underline underline-offset-4">
                      {o.code}
                    </Link>{" "}
                    {o.name}
                    {o.active ? "" : "(사용 안 함)"}
                  </span>
                ))}
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm">
        <Link href={listHref} className="underline underline-offset-4">
          {what} 목록에서 보기
        </Link>
      </p>
    </div>
  );
}
