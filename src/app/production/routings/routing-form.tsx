"use client";

import Link from "next/link";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { inputClass } from "@/components/form-parts";
import type { ProcessChoice, RoutingSheet } from "@/db/routings";
import { itemTypeName } from "@/lib/master-codes";
import {
  ROUTING_MAX_STEPS,
  ROUTING_NOTE_MAX,
  seqOf,
  type RoutingErrors,
  type RoutingStepErrors,
  type RoutingStepField,
} from "@/lib/routing-input";
import { deleteRoutingAction, saveRoutingAction, type RoutingDeleteState, type RoutingFormState } from "./actions";

// 한 품목의 라우팅(메뉴 「라우팅」) — 공정 줄(순번 · 공정 · 작업장 · 준비시간 · 개당 작업시간 · 비고)과 BOM 자재마다의 투입 공정. 순번은 화면 차례대로
// 10 · 20 … 으로 보이고 저장할 때 서버가 다시 매긴다. 줄을 옮기거나 지워도 자재는 그 공정 줄(화면 열쇠)을 따라가고, 지운 줄의 자재는 첫 공정에서 든다.
// 줄의 공정을 바꾸면 작업장을 비운다 — 작업장 후보는 그 공정의 것만. 검사는 서버가 하고 화면은 틀린 칸과 까닭을 보인다(값은 화면이 쥐고 있어 그대로 남는다).
// 휴대폰 폭에서는 표를 옆으로 민다.

/** 불러온 줄의 공정 · 작업장 — 「사용 안 함」이어도 그 줄에만 후보로 남는다. */
type Loaded = {
  processCode: string;
  processName: string;
  processActive: boolean;
  workCenterCode: string;
  workCenterName: string;
  workCenterActive: boolean;
};

type Step = {
  /** 화면 안의 열쇠 — 줄을 옮기거나 지워도 자재의 투입 공정이 다른 줄로 옮겨 붙지 않게. */
  uid: number;
  /** 화면을 연 때의 순번 — 고친 이력에서 「공정 고침」을 가른다. 새 줄은 없다. */
  origSeq?: number;
  process: string;
  workCenter: string;
  setupMin: string;
  runSec: string;
  note: string;
  loaded?: Loaded;
};

type Choice = { code: string; label: string };

let uidSeed = 0;
const nextUid = () => ++uidSeed;

const blankStep = (): Step => ({ uid: nextUid(), process: "", workCenter: "", setupMin: "", runSec: "", note: "" });

const emptyErrors = (): RoutingErrors => ({ steps: {}, materials: {} });
const INACTIVE = " (사용 안 함)";

/** 불러온 줄 · 자재의 붙은 줄 — 붙은 순번을 그 줄의 열쇠로. 새 라우팅은 빈 줄 하나로 연다. */
function initialOf(sheet: RoutingSheet): { steps: Step[]; attach: (number | null)[] } {
  if (!sheet.steps.length) return { steps: [blankStep()], attach: sheet.materials.map(() => null) };
  const steps = sheet.steps.map((s): Step => ({
    uid: nextUid(),
    origSeq: s.seq,
    process: s.processCode,
    workCenter: s.workCenterCode,
    setupMin: String(s.setupMin),
    runSec: s.runSec,
    note: s.note,
    loaded: {
      processCode: s.processCode,
      processName: s.processName,
      processActive: s.processActive,
      workCenterCode: s.workCenterCode,
      workCenterName: s.workCenterName,
      workCenterActive: s.workCenterActive,
    },
  }));
  const uidOfSeq = new Map(sheet.steps.map((s, i) => [s.seq, steps[i].uid] as const));
  return { steps, attach: sheet.materials.map((m) => (m.seq === null ? null : (uidOfSeq.get(m.seq) ?? null))) };
}

export function RoutingForm({ sheet, processes }: { sheet: RoutingSheet; processes: ProcessChoice[] }) {
  const [state, formAction, pending] = useActionState<RoutingFormState, FormData>(saveRoutingAction, null);
  const [initial] = useState(() => initialOf(sheet));
  const [steps, setSteps] = useState<Step[]>(initial.steps);
  /** 자재마다(sheet.materials 차례) 붙인 줄의 열쇠 — null 이면 붙이지 않음(첫 공정). */
  const [attach, setAttach] = useState<(number | null)[]>(initial.attach);
  const [errors, setErrors] = useState<RoutingErrors>(emptyErrors);
  const [formError, setFormError] = useState<string | null>(null);
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state && !state.ok) {
      setErrors(state.errors);
      setFormError(state.formError ?? null);
    }
  }

  const processOptions = (s: Step): Choice[] => {
    const list = processes.map((p) => ({ code: p.code, label: `${p.code} ${p.name}` }));
    const l = s.loaded;
    if (l && !list.some((p) => p.code === l.processCode))
      list.push({
        code: l.processCode,
        label: `${l.processCode} ${l.processName}${l.processActive ? "" : INACTIVE}`,
      });
    return list;
  };
  const centerOptions = (s: Step): Choice[] => {
    const list = (processes.find((p) => p.code === s.process)?.workCenters ?? []).map((w) => ({
      code: w.code,
      label: `${w.code} ${w.name}`,
    }));
    const l = s.loaded;
    if (l && s.process === l.processCode && !list.some((w) => w.code === l.workCenterCode))
      list.push({
        code: l.workCenterCode,
        label: `${l.workCenterCode} ${l.workCenterName}${l.workCenterActive ? "" : INACTIVE}`,
      });
    return list;
  };
  /** 자재의 투입 공정 후보에 보이는 줄 이름 — 「20 MD 몰딩」. */
  const stepLabel = (s: Step, index: number) => {
    const name = processOptions(s)
      .find((p) => p.code === s.process)
      ?.label.replace(INACTIVE, "");
    return `${seqOf(index)} ${name ?? "공정을 고르지 않은 줄"}`;
  };

  const posOf = (uid: number | null) => (uid === null ? -1 : steps.findIndex((s) => s.uid === uid));

  const setStep = (index: number, patch: Partial<Step>, cleared: RoutingStepField[]) => {
    setSteps((all) => all.map((s, i) => (i === index ? { ...s, ...patch } : s)));
    setErrors((e) => {
      const row = e.steps[index];
      if (!row) return e;
      const next: RoutingStepErrors = { ...row };
      for (const f of cleared) delete next[f];
      const rows = { ...e.steps };
      if (Object.keys(next).length) rows[index] = next;
      else delete rows[index];
      return { ...e, steps: rows };
    });
  };
  // 줄의 차례가 바뀌면 줄의 까닭은 비운다 — 보낸 차례에 붙은 까닭이라 다른 줄에 붙게 된다.
  const move = (index: number, by: -1 | 1) => {
    setSteps((all) => {
      const to = index + by;
      if (to < 0 || to >= all.length) return all;
      const next = [...all];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
    setErrors((e) => ({ ...e, steps: {} }));
  };
  const remove = (index: number) => {
    const gone = steps[index]?.uid;
    setSteps((all) => all.filter((_, i) => i !== index));
    setAttach((a) => a.map((uid) => (uid === gone ? null : uid)));
    setErrors((e) => ({ ...e, steps: {} }));
  };
  const add = () => setSteps((all) => (all.length >= ROUTING_MAX_STEPS ? all : [...all, blankStep()]));
  /** 투입 공정 후보의 값은 줄의 차례다 — 열쇠(uid)는 서버와 브라우저가 따로 매겨 달라, 그린 값이 어긋난다. 고르면 그 줄의 열쇠로 쥔다. */
  const choose = (j: number, value: string) => {
    const uid = value === "" ? null : (steps[Number(value)]?.uid ?? null);
    setAttach((a) => a.map((was, i) => (i === j ? uid : was)));
    setErrors((e) => {
      if (!(j in e.materials)) return e;
      const materials = { ...e.materials };
      delete materials[j];
      return { ...e, materials };
    });
  };

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(() => formAction(form));
  }

  const wrong =
    Object.values(errors.steps).reduce((n, row) => n + Object.keys(row).length, 0) +
    Object.keys(errors.materials).length;
  const hasErrors = !!formError || !!errors.item || wrong > 0;
  const unattached = sheet.materials.filter((_, j) => posOf(attach[j]) < 0).length;
  const firstProcess = steps[0]?.process || "—";

  return (
    <>
      <form action={formAction} onSubmit={onSubmit} noValidate className="mt-6">
        <input type="hidden" name="item" value={sheet.item.code} />
        <input type="hidden" name="version" value={sheet.version ?? ""} />
        {hasErrors && (
          <div role="alert" className="mt-4 max-w-3xl border-l-4 border-red-700 bg-white px-5 py-4">
            <p className="font-semibold">저장하지 않았습니다 — 칸이 하나라도 틀리면 아무것도 저장되지 않습니다.</p>
            {formError && <p className="mt-1 text-sm">{formError}</p>}
            {errors.item && <p className="mt-1 text-sm">{errors.item}</p>}
            {wrong > 0 && <p className="mt-1 text-sm">틀린 칸 {wrong}개 — 칸 아래의 까닭을 보고 고치세요.</p>}
          </div>
        )}

        <section className="mt-6 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 border-t-2 border-machine pt-4">
          <div>
            <h2 className="text-lg font-semibold">공정 줄</h2>
            <p className="text-sm text-muted">
              만드는 차례대로 넣습니다. 순번은 줄 차례대로 10 · 20 · 30 … 이 저장할 때 다시 매겨집니다. 준비시간은
              작업지시마다 한 번 드는 분(0 ~ 1,440), 개당 시간은 한 개를 만드는 초(0 ~ 3,600, 소수 셋째 자리까지)입니다.
              작업장은 그 줄 공정의 것만 고릅니다. {ROUTING_MAX_STEPS}줄까지.
            </p>
          </div>
          <div className="relative overflow-x-auto border border-rule bg-white">
            <table className="w-full min-w-[64rem] border-collapse text-left text-sm">
              <caption className="sr-only">{sheet.item.name}의 공정 줄</caption>
              <thead className="border-b-2 border-machine">
                <tr>
                  <th scope="col" className="w-14 px-2 py-2 text-right">
                    순번
                  </th>
                  <th scope="col" className="w-44 px-2 py-2">
                    공정
                  </th>
                  <th scope="col" className="w-48 px-2 py-2">
                    작업장
                  </th>
                  <th scope="col" className="w-24 px-2 py-2">
                    준비시간(분)
                  </th>
                  <th scope="col" className="w-28 px-2 py-2">
                    개당 시간(초)
                  </th>
                  <th scope="col" className="min-w-40 px-2 py-2">
                    투입 자재
                  </th>
                  <th scope="col" className="min-w-32 px-2 py-2">
                    비고
                  </th>
                  <th scope="col" className="w-44 px-2 py-2" aria-label="줄 옮기기 · 지우기" />
                </tr>
              </thead>
              <tbody>
                {steps.map((s, index) => (
                  <StepRow
                    key={s.uid}
                    index={index}
                    last={index === steps.length - 1}
                    step={s}
                    processOptions={processOptions(s)}
                    centerOptions={centerOptions(s)}
                    materials={sheet.materials.filter((_, j) => attach[j] === s.uid)}
                    errors={errors.steps[index]}
                    onChange={(patch, cleared) => setStep(index, patch, cleared)}
                    onMove={(by) => move(index, by)}
                    onRemove={() => remove(index)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <button
              type="button"
              onClick={add}
              disabled={steps.length >= ROUTING_MAX_STEPS}
              className="rounded border border-machine bg-white px-4 py-2 font-semibold hover:bg-floor disabled:opacity-60"
            >
              공정 줄 더하기
            </button>
            <span className="ml-3 text-sm text-muted">{steps.length}줄</span>
          </div>
        </section>

        <section className="mt-8 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 border-t-2 border-machine pt-4">
          <div>
            <h2 className="text-lg font-semibold">투입 자재</h2>
            <p className="text-sm text-muted">
              이 품목 BOM 의 자품목마다 출고할 공정을 고릅니다. 고르지 않은 자재는 첫 공정에서 듭니다.
            </p>
          </div>
          {sheet.materials.length === 0 ? (
            <p className="border border-dashed border-rule px-5 py-6 text-center text-sm text-muted">
              {sheet.hasBom ? (
                "이 품목의 BOM 에 자품목이 없어 붙일 자재가 없습니다"
              ) : (
                <>
                  이 품목의 BOM 이 없어 붙일 자재가 없습니다 —{" "}
                  <Link href={`/production/bom/${sheet.item.code}`} className="underline underline-offset-4">
                    BOM 등록
                  </Link>
                  에서 먼저 넣으세요
                </>
              )}
            </p>
          ) : (
            <>
              {unattached > 0 && (
                <p className="text-sm">
                  붙이지 않은 자재 {unattached}개 — 첫 공정({firstProcess})에서 듭니다
                </p>
              )}
              <div className="relative overflow-x-auto border border-rule bg-white">
                <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
                  <caption className="sr-only">{sheet.item.name}의 투입 자재</caption>
                  <thead className="border-b-2 border-machine">
                    <tr>
                      <th scope="col" className="min-w-48 px-2 py-2">
                        자재
                      </th>
                      <th scope="col" className="w-20 px-2 py-2">
                        유형
                      </th>
                      <th scope="col" className="w-16 px-2 py-2">
                        단위
                      </th>
                      <th scope="col" className="w-64 px-2 py-2">
                        투입 공정
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sheet.materials.map((m, j) => {
                      const at = posOf(attach[j]);
                      const error = errors.materials[j];
                      return (
                        <tr key={m.code} className={`border-b border-rule align-top ${error ? "bg-red-50" : ""}`}>
                          <td className="px-2 py-2">
                            <input type="hidden" name={`materials.${j}.item`} value={m.code} />
                            <input type="hidden" name={`materials.${j}.step`} value={at >= 0 ? String(at) : ""} />
                            <span className="font-mono">{m.code}</span> {m.name}
                            {(!m.inBom || !m.active) && (
                              <span className="mt-0.5 block text-xs text-muted">
                                {[!m.inBom && "BOM 에 없음", !m.active && "사용 안 함"].filter(Boolean).join(" · ")}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-2">{itemTypeName(m.itemType)}</td>
                          <td className="px-2 py-2 font-mono">{m.unit}</td>
                          <td className="px-2 py-2">
                            <select
                              aria-label={`${m.code} 투입 공정`}
                              value={at >= 0 ? String(at) : ""}
                              onChange={(ev) => choose(j, ev.target.value)}
                              aria-invalid={!!error || undefined}
                              className={`${inputClass(!!error)} px-2 py-1.5`}
                            >
                              <option value="">첫 공정에서 듦</option>
                              {steps.map((s, i) => (
                                <option key={s.uid} value={String(i)}>
                                  {stepLabel(s, i)}
                                </option>
                              ))}
                            </select>
                            {error && <p className="mt-1 text-xs font-semibold text-red-700">{error}</p>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
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
            공정 줄과 투입 자재를 한 번에 저장합니다 — 바뀐 것만 고친 이력에 남깁니다.
          </span>
        </div>
      </form>
      {sheet.version && <DeleteRouting code={sheet.item.code} version={sheet.version} />}
    </>
  );
}

function StepRow({
  index,
  last,
  step,
  processOptions,
  centerOptions,
  materials,
  errors,
  onChange,
  onMove,
  onRemove,
}: {
  index: number;
  last: boolean;
  step: Step;
  processOptions: Choice[];
  centerOptions: Choice[];
  materials: RoutingSheet["materials"];
  errors?: RoutingStepErrors;
  onChange: (patch: Partial<Step>, cleared: RoutingStepField[]) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const seq = seqOf(index);
  const name = (field: string) => `steps.${index}.${field}`;
  const e = errors ?? {};
  const cell = (invalid: boolean) => `${inputClass(invalid)} px-2 py-1.5`;
  const message = (field: keyof RoutingStepErrors) =>
    e[field] ? <p className="mt-1 text-xs font-semibold text-red-700">{e[field]}</p> : null;
  const button = "rounded px-1.5 py-1 text-muted underline underline-offset-4 hover:text-ink disabled:opacity-40";

  return (
    <>
      <tr className={`border-b border-rule align-top ${errors ? "bg-red-50" : ""}`}>
        <td className="px-2 py-2 text-right font-mono text-muted">
          {seq}
          {step.origSeq !== undefined && <input type="hidden" name={name("origSeq")} value={step.origSeq} />}
        </td>
        <td className="px-2 py-2">
          <select
            name={name("process")}
            aria-label={`${seq} 줄 공정`}
            value={step.process}
            onChange={(ev) => onChange({ process: ev.target.value, workCenter: "" }, ["process", "workCenter"])}
            aria-invalid={!!e.process || undefined}
            className={cell(!!e.process)}
          >
            <option value="">공정을 고르세요</option>
            {processOptions.map((p) => (
              <option key={p.code} value={p.code}>
                {p.label}
              </option>
            ))}
          </select>
          {message("process")}
        </td>
        <td className="px-2 py-2">
          <select
            name={name("workCenter")}
            aria-label={`${seq} 줄 작업장`}
            value={step.workCenter}
            onChange={(ev) => onChange({ workCenter: ev.target.value }, ["workCenter"])}
            aria-invalid={!!e.workCenter || undefined}
            className={cell(!!e.workCenter)}
          >
            <option value="">{step.process ? "작업장을 고르세요" : "공정을 먼저 고르세요"}</option>
            {centerOptions.map((w) => (
              <option key={w.code} value={w.code}>
                {w.label}
              </option>
            ))}
          </select>
          {message("workCenter")}
        </td>
        <td className="px-2 py-2">
          <input
            name={name("setupMin")}
            aria-label={`${seq} 줄 준비시간`}
            value={step.setupMin}
            onChange={(ev) => onChange({ setupMin: ev.target.value }, ["setupMin"])}
            inputMode="numeric"
            autoComplete="off"
            aria-invalid={!!e.setupMin || undefined}
            className={`${cell(!!e.setupMin)} text-right`}
          />
          {message("setupMin")}
        </td>
        <td className="px-2 py-2">
          <input
            name={name("runSec")}
            aria-label={`${seq} 줄 개당 시간`}
            value={step.runSec}
            onChange={(ev) => onChange({ runSec: ev.target.value }, ["runSec"])}
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={!!e.runSec || undefined}
            className={`${cell(!!e.runSec)} text-right`}
          />
          {message("runSec")}
        </td>
        <td className="px-2 py-2">
          {materials.length > 0 && (
            <ul className="grid gap-0.5 text-xs">
              {materials.map((m) => (
                <li key={m.code}>
                  <span className="font-mono">{m.code}</span> {m.name}
                </li>
              ))}
            </ul>
          )}
        </td>
        <td className="px-2 py-2">
          <input
            name={name("note")}
            aria-label={`${seq} 줄 비고`}
            value={step.note}
            onChange={(ev) => onChange({ note: ev.target.value }, ["note"])}
            maxLength={ROUTING_NOTE_MAX}
            autoComplete="off"
            aria-invalid={!!e.note || undefined}
            className={cell(!!e.note)}
          />
          {message("note")}
        </td>
        <td className="px-2 py-2 whitespace-nowrap">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label={`${seq} 줄 위로`}
            className={button}
          >
            위로
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={last}
            aria-label={`${seq} 줄 아래로`}
            className={button}
          >
            아래로
          </button>
          <button type="button" onClick={onRemove} aria-label={`${seq} 줄 지우기`} className={button}>
            지우기
          </button>
        </td>
      </tr>
      {e.row && (
        <tr className="border-b border-rule bg-red-50">
          <td />
          <td colSpan={7} className="px-2 pb-2 text-sm font-semibold text-red-700" role="status">
            {seq} 줄 — {e.row}
          </td>
        </tr>
      )}
    </>
  );
}

/** 「라우팅 지우기」 — 한 번 더 묻는다. 지운 것은 고친 이력에 남는다. */
function DeleteRouting({ code, version }: { code: string; version: string }) {
  const [state, action, pending] = useActionState<RoutingDeleteState, FormData>(
    () => deleteRoutingAction(code, version),
    null,
  );
  return (
    <section className="mt-10 max-w-3xl border-t border-rule pt-4">
      <h2 className="font-semibold">라우팅 지우기</h2>
      <p className="text-sm text-muted">
        잘못 만든 라우팅을 지웁니다 — 공정 줄과 투입 자재가 함께 사라지고, 지운 것은 고친 이력에 남습니다.
      </p>
      {state?.formError && (
        <p role="alert" className="mt-3 border-l-4 border-red-700 bg-white px-4 py-3 text-sm font-semibold">
          지우지 않았습니다 — {state.formError}
        </p>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (window.confirm("이 라우팅을 지울까요? 고친 이력은 남습니다"))
            startTransition(() => action(new FormData()));
        }}
        className="mt-3 rounded border border-red-700 bg-white px-5 py-2 font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
      >
        {pending ? "지우는 중…" : "라우팅 지우기"}
      </button>
    </section>
  );
}
