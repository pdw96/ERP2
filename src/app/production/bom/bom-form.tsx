"use client";

import { startTransition, useActionState, useRef, useState, type FormEvent } from "react";
import { inputClass } from "@/components/form-parts";
import type { BomItemOption, BomSheet } from "@/db/boms";
import { BOM_MAX_LINES, BOM_NOTE_MAX, BOM_SUBS_MAX, codeOf, type BomErrors, type BomLineErrors } from "@/lib/bom-input";
import { itemTypeName } from "@/lib/master-codes";
import {
  deleteBomAction,
  openSubBomAction,
  saveBomTreeAction,
  type BomDeleteState,
  type BomFormState,
} from "./actions";

// BOM 의 머리와 자품목 줄(조각 「BOM」 성공 기준 2 ~ 7, ADR 0026)과 한 화면 다단계 등록(성공 기준 15, ADR 0028). 반제품 줄을 펼치면 그 반제품의 BOM 이
// 그 줄 아래에 열리고(반제품 아래 반제품도), 「저장」 한 번에 맨 위 BOM 과 펼친 BOM 들이 함께 선다. 저장하면 화면의 줄이 그 BOM 의 줄이 된다 — 줄을 빼려면
// 「지우기」 뒤 저장. 검사는 서버가 하고 화면은 틀린 칸과 까닭을 보인다(값은 화면이 쥐고 있어 그대로 남는다). 휴대폰 폭에서는 줄 표를 옆으로 민다.
// 칸 차례 · 펼친 모양은 설계 「2026-11-13 — PR C 를 열기 전에 정한 것」.

type Loaded = { code: string; name: string; itemType: string; unit: string; active: boolean };

type Line = {
  /** 화면 안의 열쇠 — 줄을 지워도 펼친 반제품이 다른 줄로 옮겨 붙지 않게. */
  uid: number;
  /** 저장된 줄 번호 — 원래 번호로 돌려보내 고친 이력에서 줄을 가른다(PR C). 새 줄은 없다. */
  lineNo?: number;
  child: string;
  qty: string;
  lossRate: string;
  validFrom: string;
  validTo: string;
  note: string;
  /** 불러온 줄의 자품목 — 「사용 안 함」이어도 남는다(ADR 0026 의 10). */
  loaded?: Loaded;
};

type Editor = { sheet: BomSheet; baseQty: string; lines: Line[]; errors: BomErrors; formError?: string };

/** 펼친 반제품 하나 — 처음 펼칠 때 서버에서 읽고, 접어도 값은 남아 함께 저장된다. */
type Sub = {
  /** 저장할 때의 차례(`boms.<k>.`) — 처음 펼친 차례로 붙고 바뀌지 않는다. */
  k: number;
  /** 펼친 자리 — 「BOM 품목코드:줄 열쇠」. 그 줄이 남아 있고 같은 반제품을 가리킬 때만 화면에 있고 저장된다. */
  at: string;
  open: boolean;
  editor?: Editor;
  usedBy: { code: string; name: string }[];
  loading?: boolean;
  message?: string;
};

let uidSeed = 0;
const nextUid = () => ++uidSeed;

const blankLine = (today: string): Line => ({
  uid: nextUid(),
  child: "",
  qty: "",
  lossRate: "",
  validFrom: today,
  validTo: "",
  note: "",
});

const editorOf = (sheet: BomSheet, today: string): Editor => ({
  sheet,
  baseQty: sheet.baseQty,
  lines: sheet.lines.length
    ? sheet.lines.map((l) => ({
        uid: nextUid(),
        lineNo: l.lineNo,
        child: `${l.childCode} ${l.childName}`,
        qty: l.qty,
        lossRate: l.lossRate,
        validFrom: l.validFrom,
        validTo: l.validTo,
        note: l.note,
        loaded: { code: l.childCode, name: l.childName, itemType: l.childType, unit: l.unit, active: l.active },
      }))
    : [blankLine(today)],
  errors: { header: {}, lines: {} },
});

const emptyErrors = (): BomErrors => ({ header: {}, lines: {} });
const errorCount = (e: Editor) =>
  (e.formError ? 1 : 0) + Object.keys(e.errors.header).length + Object.keys(e.errors.lines).length;

export function BomForm({
  sheet,
  childOptions,
  today,
}: {
  sheet: BomSheet;
  childOptions: BomItemOption[];
  today: string;
}) {
  const [state, formAction, pending] = useActionState<BomFormState, FormData>(saveBomTreeAction, null);
  const [root, setRoot] = useState<Editor>(() => editorOf(sheet, today));
  const [subs, setSubs] = useState<Record<string, Sub>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const kSeed = useRef(0);
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state && !state.ok) {
      setRoot((r) => ({ ...r, errors: state.errors }));
      setFormError(state.formError ?? null);
      setSubs((all) =>
        Object.fromEntries(
          Object.entries(all).map(([code, s]) => {
            const failed = state.subs[code];
            if (!s.editor) return [code, s];
            // 틀린 펼친 BOM 은 열어 까닭을 보인다.
            return [
              code,
              {
                ...s,
                open: failed ? true : s.open,
                editor: { ...s.editor, errors: failed?.errors ?? emptyErrors(), formError: failed?.formError },
              },
            ];
          }),
        ),
      );
    }
  }

  const optionOf = (text: string) => childOptions.find((o) => o.code === codeOf(text));

  /** 이 BOM(code)의 편집 상태를 고친다 — 맨 위면 root, 아니면 펼친 반제품. */
  const update = (code: string, change: (e: Editor) => Editor) => {
    if (code === sheet.parent.code) setRoot(change);
    else
      setSubs((all) =>
        all[code]?.editor ? { ...all, [code]: { ...all[code], editor: change(all[code].editor!) } } : all,
      );
  };

  async function expand(code: string, at: string) {
    const s = subs[code];
    if (s && s.at === at && (s.editor || s.loading)) {
      setSubs((all) => ({ ...all, [code]: { ...all[code], open: !all[code].open } }));
      return;
    }
    if (s?.editor) {
      // 다른 줄에서 펼쳤던 반제품 — 값을 그대로 이 줄 아래로 옮긴다.
      setSubs((all) => ({ ...all, [code]: { ...all[code], at, open: true } }));
      return;
    }
    if (Object.keys(subs).length >= BOM_SUBS_MAX) {
      setFormError(`반제품 BOM 은 한 번에 ${BOM_SUBS_MAX}개까지 펼칩니다 — 저장한 뒤 그 반제품의 BOM 을 따로 여세요`);
      return;
    }
    const k = kSeed.current++;
    setSubs((all) => ({ ...all, [code]: { k, at, open: true, usedBy: [], loading: true } }));
    const r = await openSubBomAction(code);
    setSubs((all) => ({
      ...all,
      [code]: r.ok
        ? { ...all[code], loading: false, editor: editorOf(r.sub.sheet, today), usedBy: r.sub.usedBy }
        : { ...all[code], loading: false, message: r.message },
    }));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(() => formAction(form));
  }

  const failedSubs = Object.entries(subs).filter(([, s]) => s.editor && errorCount(s.editor) > 0);
  const rootErrors = errorCount(root);
  const hasErrors = !!formError || rootErrors > 0 || failedSubs.length > 0;

  return (
    <>
      <form action={formAction} onSubmit={onSubmit} noValidate className="mt-6">
        {hasErrors && (
          <div role="alert" className="mt-4 max-w-3xl border-l-4 border-red-700 bg-white px-5 py-4">
            <p className="font-semibold">
              저장하지 않았습니다 — 칸이 하나라도 틀리면 펼친 BOM 까지 아무것도 저장되지 않습니다.
            </p>
            {formError && <p className="mt-1 text-sm">{formError}</p>}
            {root.formError && <p className="mt-1 text-sm">{root.formError}</p>}
            {root.errors.header.parent && <p className="mt-1 text-sm">{root.errors.header.parent}</p>}
            {Object.keys(root.errors.lines).length > 0 && (
              <p className="mt-1 text-sm">
                틀린 줄 {Object.keys(root.errors.lines).length}개 — 줄 아래의 까닭을 보고 고치세요.
              </p>
            )}
            {failedSubs.map(([code, s]) => (
              <p key={code} className="mt-1 text-sm">
                펼친 BOM <span className="font-mono">{code}</span> {s.editor!.sheet.parent.name} —{" "}
                {s.editor!.formError ?? "그 BOM 의 줄 아래 까닭을 보고 고치세요"}
              </p>
            ))}
          </div>
        )}

        <datalist id="bom-children">
          {childOptions.map((o) => (
            <option key={o.code} value={`${o.code} ${o.name}`}>
              {itemTypeName(o.itemType)}
            </option>
          ))}
        </datalist>

        <EditorView
          code={sheet.parent.code}
          prefix=""
          editor={root}
          depth={0}
          today={today}
          subs={subs}
          optionOf={optionOf}
          update={update}
          expand={expand}
        />

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-machine px-6 py-2.5 font-semibold text-white hover:bg-machine-deep disabled:opacity-60"
          >
            {pending ? "저장 중…" : "저장"}
          </button>
          <span className="text-sm text-muted">
            이 BOM 과 펼친 반제품 BOM 을 한 번에 저장합니다 — 바꾼 BOM 만 고치고 고친 이력을 남깁니다.
          </span>
        </div>
      </form>
      {sheet.version && <DeleteBom code={sheet.parent.code} version={sheet.version} />}
    </>
  );
}

type EditorProps = {
  code: string;
  prefix: string;
  editor: Editor;
  depth: number;
  today: string;
  subs: Record<string, Sub>;
  optionOf: (text: string) => BomItemOption | undefined;
  update: (code: string, change: (e: Editor) => Editor) => void;
  expand: (code: string, at: string) => void;
};

/** BOM 하나의 기준수량과 자품목 줄 — 맨 위(depth 0)와 펼친 반제품(depth 1 ~)이 같은 꼴이다. */
function EditorView({ code, prefix, editor, depth, today, subs, optionOf, update, expand }: EditorProps) {
  const { sheet, baseQty, lines, errors } = editor;
  const field = (name: string) => `${prefix}${name}`;
  const setLine = (index: number, patch: Partial<Line>) =>
    update(code, (e) => {
      const next = { ...e.errors.lines };
      delete next[index];
      return {
        ...e,
        lines: e.lines.map((l, i) => (i === index ? { ...l, ...patch } : l)),
        errors: { ...e.errors, lines: next },
      };
    });
  const addLine = () =>
    update(code, (e) => (e.lines.length >= BOM_MAX_LINES ? e : { ...e, lines: [...e.lines, blankLine(today)] }));
  const removeLine = (index: number) =>
    update(code, (e) => ({ ...e, lines: e.lines.filter((_, i) => i !== index), errors: { ...e.errors, lines: {} } }));
  const id = (name: string) => `f-${prefix.replaceAll(".", "-")}${name}`;

  return (
    <>
      <input type="hidden" name={field("parent")} value={sheet.parent.code} />
      <input type="hidden" name={field("version")} value={sheet.version ?? ""} />
      <div className="mt-4 max-w-sm">
        <label htmlFor={id("baseQty")} className="block font-semibold">
          기준수량 <span className="text-sm font-normal text-muted">소요량은 이 수량당 양입니다</span>
        </label>
        <div className="mt-1 flex items-center gap-2">
          <input
            id={id("baseQty")}
            name={field("baseQty")}
            value={baseQty}
            onChange={(ev) => {
              const value = ev.target.value;
              update(code, (e) => ({
                ...e,
                baseQty: value,
                errors: { ...e.errors, header: { ...e.errors.header, baseQty: undefined } },
              }));
            }}
            inputMode="decimal"
            autoComplete="off"
            placeholder="예: 1000"
            aria-invalid={!!errors.header.baseQty || undefined}
            aria-describedby={errors.header.baseQty ? `${id("baseQty")}-error` : undefined}
            className={`${inputClass(!!errors.header.baseQty)} text-right`}
          />
          <span className="font-mono text-sm text-muted">{sheet.parent.unit}</span>
        </div>
        {errors.header.baseQty && (
          <p id={`${id("baseQty")}-error`} className="mt-1 text-sm font-semibold text-red-700">
            {errors.header.baseQty}
          </p>
        )}
      </div>

      <section
        className={`mt-6 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 pt-4 ${depth === 0 ? "border-t-2 border-machine" : ""}`}
      >
        {depth === 0 && (
          <div>
            <h2 className="text-lg font-semibold">자품목</h2>
            <p className="text-sm text-muted">
              원자재 · 반제품 · 부자재를 넣습니다. 소요량은 자품목 단위로, 기준수량당 양입니다. 로스율은 비우면 0 이고,
              필요량 = 소요량 × (1 + 로스율). 적용 종료일은 그날까지 쓰고, 비우면 계속입니다. 설계변경은 줄을 지우지
              말고 옛 줄에 종료일을, 새 줄에 시작일을 넣으세요. 반제품 줄의 「펼치기」로 그 반제품의 BOM 을 이 화면에서
              함께 넣습니다. {BOM_MAX_LINES}줄까지.
            </p>
          </div>
        )}
        <div
          className={
            depth === 0 ? "relative overflow-x-auto border border-rule bg-white" : "border border-rule bg-white"
          }
        >
          <table
            className={`w-full border-collapse text-left text-sm ${depth === 0 ? "min-w-[58rem]" : "min-w-[57rem]"}`}
          >
            <caption className="sr-only">{sheet.parent.name}의 자품목 줄</caption>
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
              {lines.map((line, index) => {
                const option = optionOf(line.child);
                const loaded = line.loaded && codeOf(line.child) === line.loaded.code ? line.loaded : undefined;
                const item = option ?? loaded;
                const at = `${code}:${line.uid}`;
                const childCode = codeOf(line.child);
                const sub = item?.itemType === "SF" ? subs[childCode] : undefined;
                const here = !!sub && sub.at === at;
                return (
                  <LineRows
                    key={line.uid}
                    prefix={prefix}
                    owner={depth > 0 ? code : undefined}
                    index={index}
                    line={line}
                    item={item}
                    inactive={!!loaded && !loaded.active}
                    errors={errors.lines[index]}
                    onChange={(patch) => setLine(index, patch)}
                    onRemove={() => removeLine(index)}
                    expandable={item?.itemType === "SF" && childCode !== code}
                    expanded={here && sub!.open}
                    elsewhere={!!sub && !here}
                    loading={here && !!sub!.loading}
                    onExpand={() => expand(childCode, at)}
                  >
                    {here && (
                      <SubView
                        code={childCode}
                        parentCode={code}
                        sub={sub!}
                        depth={depth + 1}
                        today={today}
                        subs={subs}
                        optionOf={optionOf}
                        update={update}
                        expand={expand}
                      />
                    )}
                  </LineRows>
                );
              })}
            </tbody>
          </table>
        </div>
        <div>
          <button
            type="button"
            onClick={addLine}
            aria-label={depth > 0 ? `${code} 줄 더하기` : undefined}
            disabled={lines.length >= BOM_MAX_LINES}
            className="rounded border border-machine bg-white px-4 py-2 font-semibold hover:bg-floor disabled:opacity-60"
          >
            줄 더하기
          </button>
          <span className="ml-3 text-sm text-muted">{lines.length}줄</span>
        </div>
      </section>
    </>
  );
}

/** 펼친 반제품의 BOM — 그 줄 아래 한 칸을 다 쓴다. 접어도 값은 남아 함께 저장된다(숨김). */
function SubView({
  code,
  parentCode,
  sub,
  depth,
  ...rest
}: Omit<EditorProps, "prefix" | "editor"> & { parentCode: string; sub: Sub }) {
  if (sub.loading) return <p className="px-3 py-2 text-sm text-muted">반제품의 BOM 을 여는 중입니다.</p>;
  if (sub.message || !sub.editor)
    return (
      <p role="alert" className="px-3 py-2 text-sm font-semibold text-red-700">
        <span className="font-mono">{code}</span> — {sub.message ?? "열지 못했습니다"}
      </p>
    );
  const e = sub.editor;
  const others = sub.usedBy.filter((u) => u.code !== parentCode);
  return (
    <div hidden={!sub.open} className="border-l-4 border-safety bg-floor px-3 pt-2 pb-4">
      <h3 className="font-semibold">
        <span aria-hidden>↳ </span>
        <span className="font-mono">{code}</span> {e.sheet.parent.name}의 {e.sheet.version ? "BOM" : "새 BOM"}
        <span className="ml-2 text-sm font-normal text-muted">단위 {e.sheet.parent.unit}</span>
      </h3>
      <p className="mt-1 text-sm">
        {others.length ? (
          <>
            이 반제품을 쓰는 다른 BOM —{" "}
            {others.map((u, i) => (
              <span key={u.code}>
                {i > 0 && " · "}
                <span className="font-mono">{u.code}</span> {u.name}
              </span>
            ))}
            . 여기서 고치면 그 BOM 에도 같이 바뀝니다.
          </>
        ) : (
          <span className="text-muted">이 반제품은 다른 BOM 에 들지 않습니다.</span>
        )}
      </p>
      {e.formError && (
        <p role="alert" className="mt-2 text-sm font-semibold text-red-700">
          {e.formError}
        </p>
      )}
      {e.errors.header.parent && <p className="mt-2 text-sm font-semibold text-red-700">{e.errors.header.parent}</p>}
      <EditorView code={code} prefix={`boms.${sub.k}.`} editor={e} depth={depth} {...rest} />
    </div>
  );
}

function LineRows({
  prefix,
  owner,
  index,
  line,
  item,
  inactive,
  errors,
  onChange,
  onRemove,
  expandable,
  expanded,
  elsewhere,
  loading,
  onExpand,
  children,
}: {
  prefix: string;
  /** 펼친 반제품 BOM 이면 그 품목코드 — 맨 위 BOM 은 없다. */
  owner?: string;
  index: number;
  line: Line;
  item?: Loaded | BomItemOption;
  inactive: boolean;
  errors?: BomLineErrors;
  onChange: (patch: Partial<Line>) => void;
  onRemove: () => void;
  expandable: boolean;
  expanded: boolean;
  elsewhere: boolean;
  loading: boolean;
  onExpand: () => void;
  children?: React.ReactNode;
}) {
  const name = (field: string) => `${prefix}lines.${index}.${field}`;
  const n = index + 1;
  const e = errors ?? {};
  const cell = (invalid: boolean) => `${inputClass(invalid)} px-2 py-1.5`;
  const unit = item?.unit ?? "";
  const message = (field: keyof BomLineErrors) =>
    e[field] ? <p className="mt-1 text-xs font-semibold text-red-700">{e[field]}</p> : null;
  // 펼친 BOM 의 칸은 그 반제품의 품목코드를 앞에 붙인다 — 같은 화면에 「줄 2」가 여럿이다.
  const label = owner ? `${owner} 줄 ${n}` : `줄 ${n}`;

  return (
    <>
      <tr className={`border-b border-rule align-top ${errors ? "bg-red-50" : ""}`}>
        <td className="px-2 py-2 text-right font-mono text-muted">
          {n}
          {line.lineNo !== undefined && <input type="hidden" name={name("lineNo")} value={line.lineNo} />}
        </td>
        <td className="px-2 py-2">
          <input
            name={name("child")}
            aria-label={`${label} 자품목`}
            list="bom-children"
            value={line.child}
            onChange={(ev) => onChange({ child: ev.target.value })}
            autoComplete="off"
            placeholder="코드 · 이름"
            aria-invalid={!!e.child || undefined}
            className={cell(!!e.child)}
          />
          {item && (
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
              <span>
                {itemTypeName(item.itemType)}
                {inactive && " · 사용 안 함"}
              </span>
              {expandable &&
                (elsewhere ? (
                  <button type="button" onClick={onExpand} className="underline underline-offset-4 hover:text-ink">
                    다른 줄에서 펼침 — 여기로
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onExpand}
                    aria-expanded={expanded}
                    aria-label={`${item.code} BOM ${loading ? "여는 중" : expanded ? "접기" : "펼치기"}`}
                    className="font-semibold text-machine underline underline-offset-4 hover:text-ink"
                  >
                    {loading ? "여는 중…" : expanded ? "접기" : "펼치기"}
                  </button>
                ))}
            </span>
          )}
          {message("child")}
        </td>
        <td className="px-2 py-2">
          <div className="flex items-center gap-1">
            <input
              name={name("qty")}
              aria-label={`${label} 소요량`}
              value={line.qty}
              onChange={(ev) => onChange({ qty: ev.target.value })}
              inputMode="decimal"
              autoComplete="off"
              aria-invalid={!!e.qty || undefined}
              className={`${cell(!!e.qty)} min-w-24 flex-1 text-right`}
            />
            <span className="w-8 shrink-0 font-mono text-xs text-muted">{unit}</span>
          </div>
          {message("qty")}
        </td>
        <td className="px-2 py-2">
          <input
            name={name("lossRate")}
            aria-label={`${label} 로스율`}
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
            aria-label={`${label} 적용 시작일`}
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
            aria-label={`${label} 적용 종료일`}
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
            aria-label={`${label} 비고`}
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
            aria-label={`${label} 지우기`}
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
      {children && (
        <tr className="border-b border-rule">
          <td />
          <td colSpan={7} className="px-2 pb-3">
            {children}
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
        잘못 만든 BOM 을 지웁니다 — 머리와 줄이 함께 사라지고, 지운 것은 고친 이력에 남습니다. 구성이 바뀐 것이면 지우지
        말고 적용일자로 남기세요.
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
