"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { inputClass } from "@/components/form-parts";
import type { CountItemOption, CountSheet, CountSheetLine } from "@/db/stock-counts";
import { COUNT_MAX_LINES, stockStatusName, type CountErrors, type CountLineErrors } from "@/lib/count-input";
import { isMadeType } from "@/lib/master-codes";
import { formatMilli, parseQty, ZERO } from "@/lib/move-input";
import { cancelCountAction, type CountActionState, type CountFormState } from "./actions";

// 실사의 줄 표(성공 기준 7, 설계 「2026-11-09 — PR E 를 열기 전에 정한 것」) — 줄마다 장부 · 실물 · 차이가 함께 보인다(저자 판정).
// 장부에서 불려 온 줄은 실물 수량만 넣고, 장부에 없는 것을 찾았으면 「줄 더하기」로 품목 · LOT 를 넣는다(늘 가용). 실물 수량은 비워도 작성 중으로
// 저장되지만, 확정은 모든 줄이 차야 한다. 검사는 서버가 하고 화면은 틀린 줄과 까닭을 보인다. 휴대폰 폭에서는 표를 옆으로 민다.

type Line = {
  /** 장부에서 불려 온 줄이면 그 정보 — 품목 · LOT · 상태를 고치지 못한다. */
  book?: CountSheetLine;
  item: string;
  lot: string;
  counted: string;
};

const blankAdded = (): Line => ({ item: "", lot: "", counted: "" });
const codeOf = (text: string) => text.trim().split(/\s+/)[0] ?? "";

/** 실물 − 장부 — 둘 다 읽히면 「+5」 · 「−5」 · 「0」, 아니면 빈 글자. */
function diffOf(book: string, counted: string): { text: string; tone: string } {
  const b = parseQty(book || "0");
  const c = counted.trim() && !/^[+-]/.test(counted.trim()) ? parseQty(counted) : null;
  if (!b || !c) return { text: "", tone: "" };
  const d = c.qty - b.qty;
  if (d === ZERO) return { text: "0", tone: "text-muted" };
  return { text: d > ZERO ? `+${formatMilli(d)}` : formatMilli(d), tone: "font-semibold text-machine-deep" };
}

export function CountForm({
  sheet,
  items,
  state,
  formAction,
  pending,
}: {
  sheet: CountSheet;
  items: CountItemOption[];
  state: CountFormState;
  formAction: (form: FormData) => void;
  pending: boolean;
}) {
  const [lines, setLines] = useState<Line[]>(() =>
    sheet.lines.map((l) =>
      l.added
        ? { item: `${l.itemCode} ${l.itemName}`, lot: l.lot, counted: l.counted }
        : { book: l, item: l.itemCode, lot: l.lot, counted: l.counted },
    ),
  );
  const [errors, setErrors] = useState<CountErrors>({ lines: {} });
  const [formError, setFormError] = useState<string | null>(null);
  // 서버가 거절하면 까닭을 받아 줄 옆에 보인다 — 값은 화면이 쥐고 있어 그대로 남는다(받은 결과가 바뀔 때 한 번).
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state && !state.ok) {
      setErrors(state.errors);
      setFormError(state.formError ?? null);
    }
  }

  const itemOf = (text: string) => items.find((i) => i.code === codeOf(text));
  const setLine = (index: number, patch: Partial<Line>) => {
    setLines((ls) => ls.map((l, i) => (i === index ? { ...l, ...patch } : l)));
    setErrors((e) => {
      if (!e.lines[index]) return e;
      const next = { ...e.lines };
      delete next[index];
      return { lines: next };
    });
  };
  const addLine = () => setLines((ls) => (ls.length >= COUNT_MAX_LINES ? ls : [...ls, blankAdded()]));
  const removeLine = (index: number) => {
    setLines((ls) => ls.filter((_, i) => i !== index));
    setErrors({ lines: {} });
  };

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (submitter?.name === "intent") form.set("intent", submitter.value);
    startTransition(() => formAction(form));
  }

  const lineErrorCount = Object.keys(errors.lines).length;
  const blanks = lines.filter((l) => (l.book || l.item.trim()) && !l.counted.trim()).length;

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="mt-6">
      <input type="hidden" name="code" value={sheet.code ?? ""} />
      <input type="hidden" name="warehouse" value={sheet.warehouse.code} />
      <input type="hidden" name="baseline" value={String(sheet.baseline)} />
      <input type="hidden" name="version" value={sheet.version ?? ""} />

      <div className="max-w-3xl border-l-4 border-machine bg-white px-5 py-3">
        {sheet.code ? (
          <p>
            <span className="font-mono font-semibold">{sheet.code}</span> · {sheet.warehouse.code}{" "}
            {sheet.warehouse.name} · 작성 중 <span className="text-sm text-muted">(처음 저장 {sheet.countDate})</span>
          </p>
        ) : (
          <p>
            새 실사 · {sheet.warehouse.code} {sheet.warehouse.name}{" "}
            <span className="text-sm text-muted">
              — 장부 {sheet.lines.length}줄을 불러왔습니다. 저장하면 번호가 붙습니다.
            </span>
          </p>
        )}
        {sheet.warehouse.isDefect && (
          <p className="mt-1 text-sm text-muted">
            불량창고입니다 — 이 창고의 재고는 모두 불량이며, 실사 차이는 불량 재고를 맞춥니다.
          </p>
        )}
      </div>

      {(formError || lineErrorCount > 0) && (
        <div role="alert" className="mt-4 max-w-3xl border-l-4 border-red-700 bg-white px-5 py-4">
          <p className="font-semibold">저장하지 않았습니다 — 줄이 하나라도 틀리면 아무 줄도 저장되지 않습니다.</p>
          {formError && <p className="mt-1 text-sm">{formError}</p>}
          {lineErrorCount > 0 && (
            <p className="mt-1 text-sm">틀린 줄 {lineErrorCount}개 — 줄 아래의 까닭을 보고 고치세요.</p>
          )}
        </div>
      )}

      <section className="mt-6 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 border-t-2 border-machine pt-4">
        <div>
          <h2 className="text-lg font-semibold">줄</h2>
          <p className="text-sm text-muted">
            실물 수량은 품목 단위로 넣습니다 — 없으면 0. 차이는 실물 − 장부입니다. 장부에 없는 것을 찾았으면 「줄
            더하기」로 넣습니다(상태는 가용). 장부는 지금의 장부이고, 확정은 확정하는 순간의 장부와 견줍니다.{" "}
            {COUNT_MAX_LINES}줄까지.
          </p>
        </div>
        <datalist id="count-items">
          {items.map((i) => (
            <option key={i.code} value={`${i.code} ${i.name}`} />
          ))}
        </datalist>
        <div className="relative overflow-x-auto border border-rule bg-white">
          <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
            <caption className="sr-only">실사 줄</caption>
            <thead className="border-b-2 border-machine">
              <tr>
                <th scope="col" className="w-10 px-2 py-2 text-right">
                  #
                </th>
                <th scope="col" className="min-w-56 px-2 py-2">
                  품목
                </th>
                <th scope="col" className="min-w-40 px-2 py-2">
                  LOT번호
                </th>
                <th scope="col" className="w-20 px-2 py-2">
                  상태
                </th>
                <th scope="col" className="w-28 px-2 py-2 text-right">
                  장부
                </th>
                <th scope="col" className="w-36 px-2 py-2">
                  실물 수량
                </th>
                <th scope="col" className="w-24 px-2 py-2 text-right">
                  차이
                </th>
                <th scope="col" className="w-16 px-2 py-2">
                  <span className="sr-only">줄 지우기</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <LineRow
                  key={index}
                  index={index}
                  line={line}
                  item={line.book ? undefined : itemOf(line.item)}
                  errors={errors.lines[index]}
                  onChange={(patch) => setLine(index, patch)}
                  onRemove={() => removeLine(index)}
                />
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <button
            type="button"
            onClick={addLine}
            disabled={lines.length >= COUNT_MAX_LINES}
            className="rounded border border-machine bg-white px-4 py-2 font-semibold hover:bg-floor disabled:opacity-60"
          >
            줄 더하기
          </button>
          <span className="ml-3 text-sm text-muted">
            {lines.length}줄{blanks > 0 && ` · 실물 수량을 비운 줄 ${blanks}개 — 확정하려면 다 넣으세요`}
          </span>
        </div>
      </section>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          name="intent"
          value="save"
          disabled={pending}
          className="rounded border border-machine bg-white px-6 py-2.5 font-semibold hover:bg-floor disabled:opacity-60"
        >
          {pending ? "저장 중…" : "작성 중으로 저장"}
        </button>
        <button
          type="submit"
          name="intent"
          value="confirm"
          disabled={pending}
          className="rounded bg-machine px-6 py-2.5 font-semibold text-white hover:bg-machine-deep disabled:opacity-60"
        >
          확정…
        </button>
        <span className="text-sm text-muted">「확정…」은 저장한 뒤 차이와 경고를 먼저 보입니다.</span>
      </div>
      {sheet.code && <CancelCount code={sheet.code} />}
    </form>
  );
}

function LineRow({
  index,
  line,
  item,
  errors,
  onChange,
  onRemove,
}: {
  index: number;
  line: Line;
  item?: CountItemOption;
  errors?: CountLineErrors;
  onChange: (patch: Partial<Line>) => void;
  onRemove: () => void;
}) {
  const name = (field: string) => `lines.${index}.${field}`;
  const n = index + 1;
  const e = errors ?? {};
  const cell = (invalid: boolean) => `${inputClass(invalid)} px-2 py-1.5`;
  const book = line.book;
  const unit = book?.unit ?? item?.unit ?? "";
  const diff = diffOf(book?.book ?? "0", line.counted);
  const message = (field: keyof CountLineErrors) =>
    e[field] ? <p className="mt-1 text-xs font-semibold text-red-700">{e[field]}</p> : null;

  return (
    <>
      <tr className={`border-b border-rule align-top ${errors ? "bg-red-50" : book ? "" : "bg-floor/50"}`}>
        <td className="px-2 py-2 text-right font-mono text-muted">{n}</td>
        <td className="px-2 py-2">
          <input type="hidden" name={name("added")} value={book ? "" : "1"} />
          {book ? (
            <>
              <input type="hidden" name={name("item")} value={book.itemCode} />
              <span className="font-mono">{book.itemCode}</span> {book.itemName}
            </>
          ) : (
            <>
              <input
                name={name("item")}
                aria-label={`줄 ${n} 품목`}
                list="count-items"
                value={line.item}
                onChange={(ev) => onChange({ item: ev.target.value, lot: "" })}
                autoComplete="off"
                placeholder="장부에 없는 품목 — 코드 · 이름"
                aria-invalid={!!e.item || undefined}
                className={cell(!!e.item)}
              />
              <span className="mt-0.5 block text-xs text-muted">더한 줄</span>
            </>
          )}
          {message("item")}
        </td>
        <td className="px-2 py-2">
          {book ? (
            <>
              <input type="hidden" name={name("lot")} value={book.lot} />
              <span className="font-mono">{book.lot || "—"}</span>
            </>
          ) : item && !item.lotManaged ? (
            <span className="text-muted">LOT 관리 안 함</span>
          ) : (
            <input
              name={name("lot")}
              aria-label={`줄 ${n} LOT번호`}
              value={line.lot}
              onChange={(ev) => onChange({ lot: ev.target.value })}
              maxLength={30}
              autoComplete="off"
              placeholder={item && isMadeType(item.itemType) ? "비우면 번호 규칙으로" : "LOT번호"}
              aria-invalid={!!e.lot || undefined}
              className={cell(!!e.lot)}
            />
          )}
          {message("lot")}
        </td>
        <td className="px-2 py-2 whitespace-nowrap">
          <input type="hidden" name={name("status")} value={book?.status ?? "AVAILABLE"} />
          {stockStatusName(book?.status ?? "AVAILABLE")}
        </td>
        <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums">
          {book?.book ?? "0"} <span className="text-xs text-muted">{unit}</span>
        </td>
        <td className="px-2 py-2">
          <input
            name={name("counted")}
            aria-label={`줄 ${n} 실물 수량`}
            value={line.counted}
            onChange={(ev) => onChange({ counted: ev.target.value })}
            inputMode="decimal"
            autoComplete="off"
            placeholder="세어 넣기"
            aria-invalid={!!e.counted || undefined}
            className={`${cell(!!e.counted)} text-right`}
          />
          {message("counted")}
        </td>
        <td className={`px-2 py-2 text-right whitespace-nowrap tabular-nums ${diff.tone}`}>{diff.text}</td>
        <td className="px-2 py-2">
          {!book && (
            <button
              type="button"
              onClick={onRemove}
              aria-label={`줄 ${n} 지우기`}
              className="rounded px-2 py-1.5 text-muted underline underline-offset-4 hover:text-ink"
            >
              지우기
            </button>
          )}
        </td>
      </tr>
      {e.row && (
        <tr className="border-b border-rule bg-red-50">
          <td />
          <td colSpan={7} className="px-2 pb-2 text-sm font-semibold text-red-700" role="status">
            줄 {n} — {e.row}
          </td>
        </tr>
      )}
    </>
  );
}

/** 작성 중 실사의 「실사 취소」(저자 판정) — 한 번 더 묻는다. 취소한 실사는 목록에 「취소」로 남고, 그 창고에 새 실사를 열 수 있다. */
function CancelCount({ code }: { code: string }) {
  const [state, action, pending] = useActionState<CountActionState, FormData>(() => cancelCountAction(code), null);
  const [asking, setAsking] = useState(false);
  return (
    <section className="mt-10 max-w-3xl border-t border-rule pt-4">
      <h2 className="font-semibold">실사 취소</h2>
      <p className="text-sm text-muted">
        이 실사를 그만두려면 취소합니다 — 재고는 바뀌지 않고, 목록에 「취소」로 남습니다. 그 뒤 이 창고에 새 실사를 열
        수 있습니다.
      </p>
      {state?.formError && (
        <p role="alert" className="mt-3 border-l-4 border-red-700 bg-white px-4 py-3 text-sm font-semibold">
          취소하지 않았습니다 — {state.formError}
        </p>
      )}
      {asking ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span>
            <span className="font-mono">{code}</span> 를 취소할까요?
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => action(new FormData()))}
            className="rounded bg-red-700 px-5 py-2 font-semibold text-white hover:bg-red-800 disabled:opacity-60"
          >
            {pending ? "취소 중…" : "실사 취소"}
          </button>
          <button
            type="button"
            onClick={() => setAsking(false)}
            className="px-3 py-2 text-muted underline underline-offset-4"
          >
            그만두기
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAsking(true)}
          className="mt-3 rounded border border-red-700 bg-white px-5 py-2 font-semibold text-red-700 hover:bg-red-50"
        >
          이 실사 취소
        </button>
      )}
    </section>
  );
}
