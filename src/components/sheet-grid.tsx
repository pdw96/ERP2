"use client";

import Link from "next/link";
import {
  startTransition,
  useActionState,
  useState,
  useTransition,
  type ClipboardEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  CODE_KEY,
  ROW_ERROR,
  SHEET_MAX_ROWS,
  blankRow,
  clearChangedErrors,
  headerLine,
  isBlankRow,
  isLoadedRow,
  rowChanged,
  takesPaste,
  pasteInto,
  type SheetColumn,
  type SheetErrors,
  type SheetLoad,
  type SheetResult,
  type SheetRow,
} from "@/lib/sheet";
import { eul, eun, iga } from "@/lib/josa";

// 시트형 등록 화면(성공 기준 11) — 칸 · 줄로 된 시트에 넣거나 엑셀에서 여러 줄을 붙여넣고 한 번에 저장한다.
// 검사는 서버가 한다. 저장하면 맞는 줄은 빠지고(저장 알림에 코드가 보인다), 틀린 줄은 넣은 글자 그대로 남아 칸이 빨갛게
// 보이고 줄 아래에 까닭이 보인다. 품목 · 거래처가 같은 부품을 쓰고, 칸은 src/lib/sheet-columns.ts 가 든다.
// PR J(성공 기준 15) — 찾기 · 거르기로 기존 데이터를 불러와 지금 시트 뒤에 붙인다. 코드가 있는 줄은 고침이고, 불러온 때와
// 달라진 줄만 서버에 보낸다. 바뀌지 않은 줄은 저장한 뒤에도 시트에 남는다.

type Props = {
  columns: SheetColumn[];
  /** 칸 이름과 다른 거절 자리의 이름 — 예: 거래처의 「구분(매입처 · 매출처)」. */
  errorLabels?: Record<string, string>;
  action: (state: SheetResult | null, form: FormData) => Promise<SheetResult>;
  /** 「품목」 · 「거래처」 */
  what: string;
  /** 목록 주소 — 저장한 코드의 수정 화면 링크도 그 아래다. */
  listHref: string;
  /** 기존 데이터 불러오기(PR J) — 서버의 입구와, 찾기 · 거르기 칸(이름은 목록 주소의 거르기 이름과 같다). */
  load?: { action: (form: FormData) => Promise<SheetLoad>; filters: ReactNode };
};

// 칸은 모두 화면이 쥔 값(controlled)이라 줄의 key 는 차례로 충분하다.
// original — 불러온 줄의 불러온 때 값. 이것과 달라진 줄만 저장한다.
type Line = { values: SheetRow; errors: SheetErrors; original?: SheetRow };

/** 칸 머리의 색 — 필수 입력 · 선택 입력 · 고칠 수 없는 칸(코드, 불러온 줄의 유형). */
const KIND_CLASS = { required: "bg-safety/40", optional: "bg-floor", fixed: "bg-rule text-muted" } as const;
const KIND_LABEL = { required: "필수 입력", optional: "선택 입력", fixed: "수정 불가" } as const;

const LOAD_FAILED = "불러오지 못했습니다 — 화면을 새로 고친 뒤 다시 불러오세요";

/** 처음 · 저장한 뒤 시트가 갖는 줄 수. 「줄 더하기」도 이만큼 더한다. */
const START_ROWS = 5;

export function SheetGrid({ columns, errorLabels = {}, action, what, listHref, load }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  const [loading, startLoad] = useTransition();
  const [loadNotice, setLoadNotice] = useState("");
  const line = (values: SheetRow, errors: SheetErrors = {}, original?: SheetRow): Line =>
    original ? { values, errors, original } : { values, errors };
  const changed = (l: Line) => !l.original || rowChanged(columns, l.original, l.values);
  const blanks = (n: number) => Array.from({ length: n }, () => line(blankRow(columns)));
  const [lines, setLines] = useState<Line[]>(() => blanks(START_ROWS));
  const [pasteNotice, setPasteNotice] = useState("");
  const [copyNotice, setCopyNotice] = useState("");

  // 서버의 결과가 오면 시트를 틀린 줄과, 보내지 않은 줄(바뀌지 않은 불러온 줄)로 바꾼다. 아무것도 저장하지 못했으면(formError)
  // 시트를 그대로 둔다. 저장하는 동안 시트는 잠겨 있어 lines 는 보낸 때 그대로다.
  const [applied, setApplied] = useState<SheetResult | null>(null);
  if (state !== applied) {
    setApplied(state);
    if (state && !state.formError) {
      const originals = new Map(lines.flatMap((l) => (l.original ? [[l.values[CODE_KEY], l.original] as const] : [])));
      const rejected = state.rejected.map((r) => line(r.row, r.errors, originals.get(r.row[CODE_KEY] ?? "")));
      const unsent = lines.filter((l) => !changed(l));
      const kept = [...rejected, ...unsent];
      setLines([...kept, ...blanks(Math.max(0, START_ROWS - kept.length))]);
      setPasteNotice("");
      setLoadNotice("");
    }
  }

  const fixedLabels = columns
    .filter((c) => c.fixed)
    .map((c) => c.label)
    .join(" · ");
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
        const values = { ...l.values, [column.key]: value };
        return { ...l, values, errors: clearChangedErrors(columns, l.values, values, l.errors) };
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
        // 붙여넣기로 값이 바뀐 칸의 표시만 지운다 — 칸 고치기와 같은 규칙.
        return { ...old, values, errors: clearChangedErrors(columns, old.values, values, old.errors) };
      }),
    );
    setPasteNotice(
      [
        r.skippedHeader && "첫 줄은 머리글이라 건너뛰었습니다.",
        r.droppedRows > 0 &&
          `한 번에 ${SHEET_MAX_ROWS}줄까지 받습니다 — 남은 ${r.droppedRows}줄은 저장한 뒤 나눠 붙여넣으세요.`,
        r.droppedColumns && `시트의 칸(${columns.length}칸)보다 많은 칸은 버렸습니다 — 칸 순서를 보세요.`,
        r.skippedFixed && `불러온 줄의 ${eun(fixedLabels)} 고칠 수 없어 그대로 두었습니다.`,
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
    setLoadNotice("");
  }

  // 불러오기 — 찾은 줄을 지금 시트의 넣은 줄 뒤에 붙인다(빈 줄은 걷는다). 이미 시트에 있는 코드는 다시 붙이지 않는다.
  // 시트는 100줄까지라 남은 자리만큼만 붙이고, 못 붙인 수를 알린다.
  function onLoad(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!load) return;
    const form = new FormData(event.currentTarget);
    // 불러오는 동안 시트는 잠겨 있어 lines 는 누른 때 그대로다.
    const kept = lines.filter((l) => !isBlankRow(l.values));
    startLoad(async () => {
      // 서버에 닿지 못하면(네트워크 · 새 배포 앞에 연 화면) 말없이 끝나지 않게 알린다.
      let r: SheetLoad;
      try {
        r = await load.action(form);
      } catch {
        setLoadNotice(LOAD_FAILED);
        return;
      }
      if (r.formError) {
        setLoadNotice(r.formError);
        return;
      }
      const onSheet = new Set(kept.flatMap((l) => (isLoadedRow(l.values) ? [l.values[CODE_KEY]] : [])));
      const fresh = r.rows.filter((row) => !onSheet.has(row[CODE_KEY]));
      const added = fresh.slice(0, Math.max(0, SHEET_MAX_ROWS - kept.length));
      const already = r.rows.length - fresh.length;
      const left = r.total - already - added.length;
      setLoadNotice(
        [
          ...r.notices.map((n) => `${n}.`),
          r.total === 0 ? `찾은 ${iga(what)} 없습니다.` : `찾은 ${r.total}건 가운데 ${added.length}건을 불러왔습니다.`,
          already > 0 && `${already}건은 이미 시트에 있습니다.`,
          left > 0 &&
            `시트는 ${SHEET_MAX_ROWS}줄까지라 ${left}건은 불러오지 않았습니다 — 찾기를 좁히거나, 저장한 뒤 다시 불러오세요.`,
        ]
          .filter(Boolean)
          .join(" "),
      );
      const next = [...kept, ...added.map((row) => line(row, {}, row))];
      setLines([...next, ...blanks(Math.max(0, START_ROWS - next.length))]);
    });
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
    // 불러온 줄은 달라진 것만 보낸다 — 바뀐 줄만 저장한다(성공 기준 15).
    form.set("rows", JSON.stringify(lines.filter(changed).map((l) => l.values)));
    startTransition(() => formAction(form));
  }

  const newRows = lines.filter((l) => !l.original && !isBlankRow(l.values)).length;
  const loadedRows = lines.filter((l) => l.original).length;
  const editedRows = lines.filter((l) => l.original && changed(l)).length;
  const locked = pending || loading;
  const rejected = lines.flatMap((l, i) =>
    errorsOf(l.errors).map(([key, label, message]) => ({ i, key, label, message })),
  );

  return (
    <div className="mt-6">
      {/* 칸마다 받는 값은 칸 머리에 마우스를 올리면 보인다. 머리의 색이 필수 · 선택 · 고칠 수 없는 칸을 가른다(저자 판정 2026-11-05). */}
      <div className="border-y border-rule bg-white px-4 py-3">
        <p className="text-sm text-muted">
          엑셀에서 시트와 같은 칸 순서로 여러 줄을 복사해, 시트의 첫 칸을 누른 뒤 붙여넣으세요. 첫 줄이 머리글이면
          건너뜁니다. 한 번에 {SHEET_MAX_ROWS}줄까지 받습니다. 칸에 넣는 값은 칸 이름에 마우스를 올리면 보입니다.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <ul aria-label="칸의 색" className="flex flex-wrap gap-2 text-sm">
            {(["required", "optional", "fixed"] as const).map((k) => (
              <li key={k} className={`rounded-sm border border-rule px-2 py-0.5 ${KIND_CLASS[k]}`}>
                {KIND_LABEL[k]}
              </li>
            ))}
          </ul>
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
      </div>

      {load && (
        <form onSubmit={onLoad} className="mt-4 border-y border-rule bg-white px-4 py-3">
          <fieldset disabled={locked} className="min-w-0">
            <legend className="font-semibold">기존 {what} 불러와 고치기</legend>
            <p className="mt-1 text-sm text-muted">
              찾은 {eul(what)} 코드 순으로 앞 {SHEET_MAX_ROWS}건까지 지금 시트 뒤에 붙입니다. 코드가 있는 줄은 고침,
              없는 줄은 새 등록이고, 달라진 줄만 저장됩니다.
              {fixedLabels && ` 불러온 줄의 ${eun(fixedLabels)} 고칠 수 없습니다.`}
            </p>
            <div className="mt-2 flex flex-wrap items-end gap-3">
              {load.filters}
              <button
                type="submit"
                className="rounded border border-machine px-4 py-2 text-sm font-semibold hover:bg-floor"
              >
                {loading ? "불러오는 중…" : "불러오기"}
              </button>
            </div>
          </fieldset>
          <p role="status" className="mt-2 min-h-5 text-sm font-semibold text-machine-deep">
            {loadNotice}
          </p>
        </form>
      )}

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
        <fieldset disabled={locked} className="min-w-0 disabled:opacity-70">
          {/* relative — 화면 읽기 전용 글(sr-only)이 상자 밖으로 나가 휴대폰 폭에서 화면이 옆으로 밀리지 않게. */}
          <div className="relative mt-1 overflow-x-auto border border-rule bg-white">
            <table className="border-collapse text-left text-sm">
              <caption className="sr-only">{what} 시트</caption>
              <thead className="border-b-2 border-machine bg-floor">
                <tr>
                  <th scope="col" className="sticky left-0 bg-floor px-2 py-2 text-right">
                    <span className="sr-only">줄</span>
                  </th>
                  <th
                    scope="col"
                    title="코드는 서버가 붙입니다 — 고칠 수 없습니다"
                    className={`px-2 py-2 font-semibold whitespace-nowrap ${KIND_CLASS.fixed}`}
                  >
                    코드<span className="sr-only"> ({KIND_LABEL.fixed})</span>
                  </th>
                  {columns.map((c) => {
                    const kind = c.required ? "required" : "optional";
                    return (
                      <th
                        key={c.key}
                        scope="col"
                        title={c.rule}
                        className={`px-1 py-2 font-semibold whitespace-nowrap ${KIND_CLASS[kind]}`}
                      >
                        {c.label}
                        <span className="sr-only"> ({KIND_LABEL[kind]})</span>
                      </th>
                    );
                  })}
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
                      <td className="px-2 text-xs whitespace-nowrap" data-testid={`code-${i}`}>
                        {l.original ? (
                          <>
                            <span className="font-mono font-semibold">{l.values[CODE_KEY]}</span>
                            {changed(l) && (
                              <span className="ml-1 rounded-sm bg-safety px-1 font-semibold text-ink">고침</span>
                            )}
                          </>
                        ) : (
                          !isBlankRow(l.values) && <span className="text-muted">새 줄</span>
                        )}
                      </td>
                      {columns.map((c, col) => {
                        const invalid = !!(l.errors[c.errorKey ?? c.key] || l.errors[ROW_ERROR]);
                        const fixed = !!(c.fixed && l.original);
                        return (
                          <td key={c.key} className="p-0.5">
                            <input
                              id={`c-${i}-${c.key}`}
                              value={l.values[c.key] ?? ""}
                              onChange={(e) => edit(i, c, e.target.value)}
                              onPaste={(e) => paste(e, i, col)}
                              readOnly={fixed}
                              title={fixed ? `불러온 줄의 ${eun(c.label)} 고칠 수 없습니다` : undefined}
                              aria-label={`${i + 1}줄 ${c.label}`}
                              aria-invalid={invalid || undefined}
                              aria-describedby={describedBy}
                              autoComplete="off"
                              style={{ width: `${(c.width ?? 8) + 1}em` }}
                              className={`rounded-sm border px-1.5 py-1 ${
                                invalid
                                  ? "border-red-700 bg-white"
                                  : fixed
                                    ? `border-transparent ${KIND_CLASS.fixed}`
                                    : "border-transparent hover:border-rule"
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
                        <td colSpan={columns.length + 2} className="px-2 pb-2">
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
              새 줄 {newRows}
              {loadedRows > 0 && ` · 불러온 줄 ${loadedRows}(고친 줄 ${editedRows})`} · 시트 {lines.length} /{" "}
              {SHEET_MAX_ROWS}줄
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
  const updated = state.saved.filter((s) => s.updated).length;
  const created = state.saved.length - updated;
  return (
    <div role="status" className="mt-4 border-l-4 border-safety bg-white px-5 py-3 wrap-anywhere">
      <p className="font-semibold">
        {what}{" "}
        {[created > 0 && `${created}줄을 등록`, updated > 0 && `${updated}줄을 고쳐`].filter(Boolean).join("하고 ")}
        {updated > 0 ? " 저장했습니다." : "했습니다."}
      </p>
      <ul className="mt-1 grid gap-0.5 text-sm">
        {state.saved.map((s) => (
          <li key={s.code}>
            <Link href={`${listHref}/${s.code}`} className="font-mono font-semibold underline underline-offset-4">
              {s.code}
            </Link>{" "}
            {s.name}
            {s.updated && <span className="text-muted"> (고침)</span>}
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
