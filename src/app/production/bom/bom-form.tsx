"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { inputClass } from "@/components/form-parts";
import type { BomItemOption, BomSheet } from "@/db/boms";
import { BOM_MAX_LINES, BOM_NOTE_MAX, codeOf, type BomErrors, type BomLineErrors } from "@/lib/bom-input";
import { itemTypeName } from "@/lib/master-codes";
import { deleteBomAction, saveBomAction, type BomDeleteState, type BomFormState } from "./actions";

// BOM 의 머리와 자품목 줄(조각 「BOM」 성공 기준 2 ~ 7, ADR 0026). 저장하면 화면의 줄이 그 BOM 의 줄이 된다 — 줄을 빼려면 「지우기」 뒤 저장.
// 검사는 서버가 하고 화면은 틀린 칸과 까닭을 보인다(값은 화면이 쥐고 있어 그대로 남는다). 휴대폰 폭에서는 줄 표를 옆으로 민다.

type Line = {
  child: string;
  qty: string;
  lossRate: string;
  validFrom: string;
  validTo: string;
  note: string;
  /** 불러온 줄의 자품목 — 「사용 안 함」이어도 남는다(ADR 0026 의 10). */
  loaded?: { code: string; name: string; itemType: string; unit: string; active: boolean };
};

const blankLine = (today: string): Line => ({
  child: "",
  qty: "",
  lossRate: "",
  validFrom: today,
  validTo: "",
  note: "",
});

export function BomForm({
  sheet,
  childOptions,
  today,
}: {
  sheet: BomSheet;
  childOptions: BomItemOption[];
  today: string;
}) {
  const [state, formAction, pending] = useActionState<BomFormState, FormData>(saveBomAction, null);
  const [baseQty, setBaseQty] = useState(sheet.baseQty);
  const [lines, setLines] = useState<Line[]>(() =>
    sheet.lines.length
      ? sheet.lines.map((l) => ({
          child: `${l.childCode} ${l.childName}`,
          qty: l.qty,
          lossRate: l.lossRate,
          validFrom: l.validFrom,
          validTo: l.validTo,
          note: l.note,
          loaded: { code: l.childCode, name: l.childName, itemType: l.childType, unit: l.unit, active: l.active },
        }))
      : [blankLine(today)],
  );
  const [errors, setErrors] = useState<BomErrors>({ header: {}, lines: {} });
  const [formError, setFormError] = useState<string | null>(null);
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state && !state.ok) {
      setErrors(state.errors);
      setFormError(state.formError ?? null);
    }
  }

  const optionOf = (text: string) => childOptions.find((o) => o.code === codeOf(text));
  const setLine = (index: number, patch: Partial<Line>) => {
    setLines((ls) => ls.map((l, i) => (i === index ? { ...l, ...patch } : l)));
    setErrors((e) => {
      if (!e.lines[index]) return e;
      const next = { ...e.lines };
      delete next[index];
      return { ...e, lines: next };
    });
  };
  const addLine = () => setLines((ls) => (ls.length >= BOM_MAX_LINES ? ls : [...ls, blankLine(today)]));
  const removeLine = (index: number) => {
    setLines((ls) => ls.filter((_, i) => i !== index));
    setErrors((e) => ({ ...e, lines: {} }));
  };

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(() => formAction(form));
  }

  const headerErrors = errors.header;
  const lineErrorCount = Object.keys(errors.lines).length;
  const hasErrors = !!formError || lineErrorCount > 0 || Object.keys(headerErrors).length > 0;

  return (
    <>
      <form action={formAction} onSubmit={onSubmit} noValidate className="mt-6">
        <input type="hidden" name="parent" value={sheet.parent.code} />
        <input type="hidden" name="version" value={sheet.version ?? ""} />

        {hasErrors && (
          <div role="alert" className="mt-4 max-w-3xl border-l-4 border-red-700 bg-white px-5 py-4">
            <p className="font-semibold">저장하지 않았습니다 — 칸이 하나라도 틀리면 아무것도 저장되지 않습니다.</p>
            {formError && <p className="mt-1 text-sm">{formError}</p>}
            {headerErrors.parent && <p className="mt-1 text-sm">{headerErrors.parent}</p>}
            {lineErrorCount > 0 && (
              <p className="mt-1 text-sm">틀린 줄 {lineErrorCount}개 — 줄 아래의 까닭을 보고 고치세요.</p>
            )}
          </div>
        )}

        <div className="mt-4 max-w-sm">
          <label htmlFor="f-baseQty" className="block font-semibold">
            기준수량 <span className="text-sm font-normal text-muted">소요량은 이 수량당 양입니다</span>
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              id="f-baseQty"
              name="baseQty"
              value={baseQty}
              onChange={(ev) => {
                setBaseQty(ev.target.value);
                setErrors((e) => ({ ...e, header: { ...e.header, baseQty: undefined } }));
              }}
              inputMode="decimal"
              autoComplete="off"
              placeholder="예: 1000"
              aria-invalid={!!headerErrors.baseQty || undefined}
              aria-describedby={headerErrors.baseQty ? "f-baseQty-error" : undefined}
              className={`${inputClass(!!headerErrors.baseQty)} text-right`}
            />
            <span className="font-mono text-sm text-muted">{sheet.parent.unit}</span>
          </div>
          {headerErrors.baseQty && (
            <p id="f-baseQty-error" className="mt-1 text-sm font-semibold text-red-700">
              {headerErrors.baseQty}
            </p>
          )}
        </div>

        <section className="mt-6 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 border-t-2 border-machine pt-4">
          <div>
            <h2 className="text-lg font-semibold">자품목</h2>
            <p className="text-sm text-muted">
              원자재 · 반제품 · 부자재를 넣습니다. 소요량은 자품목 단위로, 기준수량당 양입니다. 로스율은 비우면 0 이고,
              필요량 = 소요량 × (1 + 로스율). 적용 종료일은 그날까지 쓰고, 비우면 계속입니다. 설계변경은 줄을 지우지
              말고 옛 줄에 종료일을, 새 줄에 시작일을 넣으세요. {BOM_MAX_LINES}줄까지.
            </p>
          </div>
          <datalist id="bom-children">
            {childOptions.map((o) => (
              <option key={o.code} value={`${o.code} ${o.name}`}>
                {itemTypeName(o.itemType)}
              </option>
            ))}
          </datalist>
          <div className="relative overflow-x-auto border border-rule bg-white">
            <table className="w-full min-w-[58rem] border-collapse text-left text-sm">
              <caption className="sr-only">자품목 줄</caption>
              <thead className="border-b-2 border-machine">
                <tr>
                  <th scope="col" className="w-10 px-2 py-2 text-right">
                    #
                  </th>
                  <th scope="col" className="min-w-48 px-2 py-2">
                    자품목
                  </th>
                  <th scope="col" className="w-44 px-2 py-2">
                    소요량
                  </th>
                  <th scope="col" className="w-16 px-2 py-2">
                    로스율(%)
                  </th>
                  <th scope="col" className="w-36 px-2 py-2">
                    적용 시작일
                  </th>
                  <th scope="col" className="w-36 px-2 py-2">
                    적용 종료일
                  </th>
                  <th scope="col" className="min-w-24 px-2 py-2">
                    비고
                  </th>
                  <th scope="col" className="w-14 px-2 py-2">
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
                    option={optionOf(line.child)}
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
              disabled={lines.length >= BOM_MAX_LINES}
              className="rounded border border-machine bg-white px-4 py-2 font-semibold hover:bg-floor disabled:opacity-60"
            >
              줄 더하기
            </button>
            <span className="ml-3 text-sm text-muted">{lines.length}줄</span>
          </div>
        </section>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-machine px-6 py-2.5 font-semibold text-white hover:bg-machine-deep disabled:opacity-60"
          >
            {pending ? "저장 중…" : "저장"}
          </button>
          <span className="text-sm text-muted">
            머리와 줄을 한 번에 저장합니다 — 화면의 줄이 이 BOM 의 줄이 됩니다.
          </span>
        </div>
      </form>
      {sheet.version && <DeleteBom code={sheet.parent.code} version={sheet.version} />}
    </>
  );
}

function LineRow({
  index,
  line,
  option,
  errors,
  onChange,
  onRemove,
}: {
  index: number;
  line: Line;
  option?: BomItemOption;
  errors?: BomLineErrors;
  onChange: (patch: Partial<Line>) => void;
  onRemove: () => void;
}) {
  const name = (field: string) => `lines.${index}.${field}`;
  const n = index + 1;
  const e = errors ?? {};
  const cell = (invalid: boolean) => `${inputClass(invalid)} px-2 py-1.5`;
  const loaded = line.loaded && codeOf(line.child) === line.loaded.code ? line.loaded : undefined;
  const unit = option?.unit ?? loaded?.unit ?? "";
  const inactive = loaded && !loaded.active;
  const message = (field: keyof BomLineErrors) =>
    e[field] ? <p className="mt-1 text-xs font-semibold text-red-700">{e[field]}</p> : null;

  return (
    <>
      <tr className={`border-b border-rule align-top ${errors ? "bg-red-50" : ""}`}>
        <td className="px-2 py-2 text-right font-mono text-muted">{n}</td>
        <td className="px-2 py-2">
          <input
            name={name("child")}
            aria-label={`줄 ${n} 자품목`}
            list="bom-children"
            value={line.child}
            onChange={(ev) => onChange({ child: ev.target.value })}
            autoComplete="off"
            placeholder="코드 · 이름"
            aria-invalid={!!e.child || undefined}
            className={cell(!!e.child)}
          />
          {(option || loaded) && (
            <span className="mt-0.5 block text-xs text-muted">
              {itemTypeName((option ?? loaded)!.itemType)}
              {inactive && " · 사용 안 함"}
            </span>
          )}
          {message("child")}
        </td>
        <td className="px-2 py-2">
          <div className="flex items-center gap-1">
            <input
              name={name("qty")}
              aria-label={`줄 ${n} 소요량`}
              value={line.qty}
              onChange={(ev) => onChange({ qty: ev.target.value })}
              inputMode="decimal"
              autoComplete="off"
              aria-invalid={!!e.qty || undefined}
              className={`${cell(!!e.qty)} min-w-0 flex-1 text-right`}
            />
            <span className="w-8 shrink-0 font-mono text-xs text-muted">{unit}</span>
          </div>
          {message("qty")}
        </td>
        <td className="px-2 py-2">
          <input
            name={name("lossRate")}
            aria-label={`줄 ${n} 로스율`}
            value={line.lossRate}
            onChange={(ev) => onChange({ lossRate: ev.target.value })}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            aria-invalid={!!e.lossRate || undefined}
            className={`${cell(!!e.lossRate)} text-right`}
          />
          {message("lossRate")}
        </td>
        <td className="px-2 py-2">
          <input
            type="date"
            name={name("validFrom")}
            aria-label={`줄 ${n} 적용 시작일`}
            value={line.validFrom}
            onChange={(ev) => onChange({ validFrom: ev.target.value })}
            aria-invalid={!!e.validFrom || undefined}
            className={cell(!!e.validFrom)}
          />
          {message("validFrom")}
        </td>
        <td className="px-2 py-2">
          <input
            type="date"
            name={name("validTo")}
            aria-label={`줄 ${n} 적용 종료일`}
            value={line.validTo}
            onChange={(ev) => onChange({ validTo: ev.target.value })}
            aria-invalid={!!e.validTo || undefined}
            className={cell(!!e.validTo)}
          />
          {message("validTo")}
        </td>
        <td className="px-2 py-2">
          <input
            name={name("note")}
            aria-label={`줄 ${n} 비고`}
            value={line.note}
            onChange={(ev) => onChange({ note: ev.target.value })}
            maxLength={BOM_NOTE_MAX}
            autoComplete="off"
            aria-invalid={!!e.note || undefined}
            className={cell(!!e.note)}
          />
          {message("note")}
        </td>
        <td className="px-2 py-2">
          <button
            type="button"
            onClick={onRemove}
            aria-label={`줄 ${n} 지우기`}
            className="rounded px-2 py-1.5 text-muted underline underline-offset-4 hover:text-ink"
          >
            지우기
          </button>
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

/** 「BOM 지우기」(ADR 0026 의 12) — 한 번 더 묻는다. 설계변경은 지우지 말고 적용일자로 남기라고 알린다. */
function DeleteBom({ code, version }: { code: string; version: string }) {
  const [state, action, pending] = useActionState<BomDeleteState, FormData>(() => deleteBomAction(code, version), null);
  const [asking, setAsking] = useState(false);
  return (
    <section className="mt-10 max-w-3xl border-t border-rule pt-4">
      <h2 className="font-semibold">BOM 지우기</h2>
      <p className="text-sm text-muted">
        잘못 만든 BOM 을 지웁니다 — 머리와 줄이 함께 사라집니다. 구성이 바뀐 것이면 지우지 말고 적용일자로 남기세요.
      </p>
      {state?.formError && (
        <p role="alert" className="mt-3 border-l-4 border-red-700 bg-white px-4 py-3 text-sm font-semibold">
          지우지 않았습니다 — {state.formError}
        </p>
      )}
      {asking ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span>
            <span className="font-mono">{code}</span> 의 BOM 을 지울까요?
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => action(new FormData()))}
            className="rounded bg-red-700 px-5 py-2 font-semibold text-white hover:bg-red-800 disabled:opacity-60"
          >
            {pending ? "지우는 중…" : "BOM 지우기"}
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
          이 BOM 지우기
        </button>
      )}
    </section>
  );
}
