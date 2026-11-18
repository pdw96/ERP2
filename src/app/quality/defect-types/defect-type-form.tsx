"use client";

import Link from "next/link";
import { startTransition, useActionState, type FormEvent } from "react";
import {
  ActiveSection,
  ErrorSummary,
  Field,
  FormActions,
  Input,
  inputClass,
  ReadOnly,
  Section,
} from "@/components/form-parts";
import type { ClsOption } from "@/db/defect-types";
import type { ProcessOption } from "@/db/processes";
import {
  DEFECT_TYPE_FIELDS,
  type DefectTypeErrors,
  type DefectTypeField,
  type DefectTypeValues,
} from "@/lib/defect-type-fields";
import type { DefectTypeFormState } from "./actions";

// 불량 유형 등록 · 수정 화면의 입력 칸. 검사는 서버가 하고, 화면은 거절된 칸과 까닭을 칸 옆에 보인다.

type Props = {
  action: (state: DefectTypeFormState, form: FormData) => Promise<DefectTypeFormState>;
  initial: DefectTypeValues;
  /** 공통코드 「불량 대분류」의 값 전부 — 어느 것을 보일지는 화면이 정한다. */
  classes: ClsOption[];
  /** 공정 전부 — 어느 것을 보일지는 화면이 정한다. */
  processes: ProcessOption[];
} & (
  | { mode: "create" }
  | {
      mode: "edit";
      code: string;
      /** 화면을 연 때의 버전 — 그 사이 다른 사람이 고쳤으면 서버가 저장하지 않는다. */
      version: string;
    }
);

const LABEL: Record<DefectTypeField, string> = {
  code: "불량유형코드",
  name: "불량유형명",
  cls: "대분류",
  processes: "발생 공정",
  note: "비고",
  active: "사용 여부",
};
const NOTE_MAX = 500;

export function DefectTypeForm(props: Props) {
  const [state, formAction, pending] = useActionState(props.action, null);
  const failed = state && !state.ok ? state : null;
  const errors: DefectTypeErrors = failed?.errors ?? {};
  // 거절되면 보낸 값으로 칸을 다시 채운다(체크 상태 포함).
  const v: DefectTypeValues = failed?.values ?? props.initial;
  const attempt = failed ? JSON.stringify(failed) : "first";

  // 제출은 직접 넘긴다 — 폼 동작이 칸을 비우지 않게(거절된 입력을 다시 치지 않도록).
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(() => formAction(form));
  }

  const errorList = DEFECT_TYPE_FIELDS.filter((f) => errors[f]).map((f) => [f, LABEL[f], errors[f]!] as const);
  // 수정에서는 지금 붙은 대분류 · 공정이 「사용 안 함」이어도 보인다 — 그대로 두거나 뺄 수 있게.
  const keptCls = props.mode === "edit" ? props.initial.cls : undefined;
  const keptProcesses = props.mode === "edit" ? (props.initial.processes ?? []) : [];
  const classOptions = props.classes.filter((c) => c.active || c.code === keptCls);
  const processOptions = props.processes.filter((p) => p.active || keptProcesses.includes(p.code));
  const checked = new Set(v.processes ?? []);

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="mt-6 max-w-3xl">
      <ErrorSummary errors={errorList} formError={failed?.formError} />
      {props.mode === "edit" && <input type="hidden" name="version" value={props.version} />}
      <div key={attempt} className="grid gap-8">
        <Section title="기본">
          {props.mode === "create" ? (
            <div className="sm:max-w-64">
              <Field
                field="code"
                label="불량유형코드"
                error={errors.code}
                hint="영문 대문자로 시작해 대문자 · 숫자 · - 2 ~ 10자 · 등록한 뒤 바꾸지 못합니다"
              >
                <Input
                  field="code"
                  defaultValue={v.code}
                  maxLength={10}
                  placeholder="예: WIRE-BRK"
                  invalid={!!errors.code}
                />
              </Field>
            </div>
          ) : (
            <div className="sm:max-w-48">
              <ReadOnly label="불량유형코드" value={props.code} />
            </div>
          )}
          <Field field="name" label="불량유형명" error={errors.name} hint="50자까지">
            <Input field="name" defaultValue={v.name} maxLength={50} invalid={!!errors.name} />
          </Field>
          <div className="sm:max-w-96">
            <Field field="cls" label="대분류" error={errors.cls}>
              {classOptions.length === 0 && (
                <p className="mb-2 rounded border border-dashed border-rule px-3 py-2">
                  사용 중인 대분류가 없습니다 — 대분류는{" "}
                  <Link href="/system/codes/DEFECT_CLS" className="underline underline-offset-4">
                    「시스템 관리 › 공통코드」
                  </Link>
                  에서 등록하세요
                </p>
              )}
              <select
                id="f-cls"
                name="cls"
                defaultValue={v.cls ?? ""}
                aria-invalid={!!errors.cls || undefined}
                aria-describedby={errors.cls ? "e-cls" : undefined}
                className={inputClass(!!errors.cls)}
              >
                <option value="">대분류를 고르세요</option>
                {classOptions.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                    {c.active ? "" : " (사용 안 함)"}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field
            field="processes"
            label="발생 공정"
            error={errors.processes}
            hint="비우면 공통 불량 — 어느 공정에서나 고릅니다"
            as="fieldset"
          >
            {processOptions.length === 0 ? (
              <p className="rounded border border-dashed border-rule px-3 py-2">
                사용 중인 공정이 없습니다 — 비워 두면 공통 불량으로 등록됩니다. 공정은{" "}
                <Link href="/production/processes" className="underline underline-offset-4">
                  「공정 등록」
                </Link>
                에서 등록하세요
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {processOptions.map((p) => (
                  <label key={p.code} className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      name="processes"
                      value={p.code}
                      defaultChecked={checked.has(p.code)}
                      className="size-5 accent-machine"
                    />
                    {p.code} {p.name}
                    {p.active ? "" : " (사용 안 함)"}
                  </label>
                ))}
              </div>
            )}
          </Field>
          <Field field="note" label="비고" error={errors.note} hint={`비워도 됩니다 · ${NOTE_MAX}자까지`}>
            <textarea
              id="f-note"
              name="note"
              defaultValue={v.note}
              maxLength={NOTE_MAX}
              rows={3}
              aria-invalid={!!errors.note || undefined}
              aria-describedby={errors.note ? "e-note" : undefined}
              className={inputClass(!!errors.note)}
            />
          </Field>
        </Section>
        {props.mode === "edit" && <ActiveSection what="불량 유형" initial={v.active} error={errors.active} />}
      </div>
      <FormActions pending={pending} cancelHref="/quality/defect-types" />
    </form>
  );
}
