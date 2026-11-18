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
import type { ProcessOption } from "@/db/work-centers";
import {
  WORK_CENTER_FIELDS,
  type WorkCenterErrors,
  type WorkCenterField,
  type WorkCenterValues,
} from "@/lib/work-center-fields";
import type { WorkCenterFormState } from "./actions";

// 작업장 등록 · 수정 화면의 입력 칸. 검사는 서버가 하고, 화면은 거절된 칸과 까닭을 칸 옆에 보인다.

type Props = {
  action: (state: WorkCenterFormState, form: FormData) => Promise<WorkCenterFormState>;
  initial: WorkCenterValues;
} & (
  | { mode: "create"; processes: ProcessOption[] }
  | {
      mode: "edit";
      code: string;
      /** 등록한 뒤 바꾸지 못한다 — 보이기만 한다. */
      process: { code: string; name: string };
      /** 화면을 연 때의 버전 — 그 사이 다른 사람이 고쳤으면 서버가 저장하지 않는다. */
      version: string;
    }
);

const LABEL: Record<WorkCenterField, string> = {
  code: "작업장코드",
  name: "작업장명",
  process: "공정",
  note: "비고",
  active: "사용 여부",
};
const NOTE_MAX = 500;

export function WorkCenterForm(props: Props) {
  const [state, formAction, pending] = useActionState(props.action, null);
  const failed = state && !state.ok ? state : null;
  const errors: WorkCenterErrors = failed?.errors ?? {};
  // 거절되면 보낸 값으로 칸을 다시 채운다.
  const v: WorkCenterValues = failed?.values ?? props.initial;
  const attempt = failed ? JSON.stringify(failed) : "first";

  // 제출은 직접 넘긴다 — 폼 동작이 칸을 비우지 않게(거절된 입력을 다시 치지 않도록).
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(() => formAction(form));
  }

  const errorList = WORK_CENTER_FIELDS.filter((f) => errors[f]).map((f) => [f, LABEL[f], errors[f]!] as const);
  const usable = props.mode === "create" ? props.processes.filter((p) => p.active) : [];

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
                label="작업장코드"
                error={errors.code}
                hint="영문 대문자로 시작해 대문자 · 숫자 · - 2 ~ 10자 · 등록한 뒤 바꾸지 못합니다"
              >
                <Input
                  field="code"
                  defaultValue={v.code}
                  maxLength={10}
                  placeholder="예: DA-1"
                  invalid={!!errors.code}
                />
              </Field>
            </div>
          ) : (
            <div className="sm:max-w-48">
              <ReadOnly label="작업장코드" value={props.code} />
            </div>
          )}
          <Field field="name" label="작업장명" error={errors.name} hint="50자까지">
            <Input field="name" defaultValue={v.name} maxLength={50} invalid={!!errors.name} />
          </Field>
          {props.mode === "create" ? (
            usable.length === 0 ? (
              <div>
                <p className="mb-1 font-semibold">공정</p>
                <p className="rounded border border-dashed border-rule px-3 py-2">
                  사용 중인 공정이 없습니다 — 먼저{" "}
                  <Link href="/production/processes" className="underline underline-offset-4">
                    「공정 등록」
                  </Link>
                  에서 공정을 등록하세요
                </p>
                {errors.process && <p className="mt-1 text-sm font-semibold text-red-700">{errors.process}</p>}
              </div>
            ) : (
              <div className="sm:max-w-96">
                <Field field="process" label="공정" error={errors.process} hint="등록한 뒤 바꾸지 못합니다">
                  <select
                    id="f-process"
                    name="process"
                    defaultValue={v.process ?? ""}
                    aria-invalid={!!errors.process || undefined}
                    aria-describedby={errors.process ? "e-process" : undefined}
                    className={inputClass(!!errors.process)}
                  >
                    <option value="">공정을 고르세요</option>
                    {usable.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.code} {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            )
          ) : (
            <div className="sm:max-w-96">
              <ReadOnly label="공정" value={`${props.process.code} ${props.process.name}`} />
            </div>
          )}
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
        {props.mode === "edit" && <ActiveSection what="작업장" initial={v.active} error={errors.active} />}
      </div>
      <FormActions pending={pending} cancelHref="/production/work-centers" />
    </form>
  );
}
