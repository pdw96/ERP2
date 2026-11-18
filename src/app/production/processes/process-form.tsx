"use client";

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
import { PROCESS_FIELDS, type ProcessErrors, type ProcessField, type ProcessValues } from "@/lib/process-fields";
import type { ProcessFormState } from "./actions";

// 공정 등록 · 수정 화면의 입력 칸. 검사는 서버가 하고, 화면은 거절된 칸과 까닭을 칸 옆에 보인다.

type Props = {
  action: (state: ProcessFormState, form: FormData) => Promise<ProcessFormState>;
  initial: ProcessValues;
} & (
  | { mode: "create" }
  | {
      mode: "edit";
      code: string;
      /** 화면을 연 때의 버전 — 그 사이 다른 사람이 고쳤으면 서버가 저장하지 않는다. */
      version: string;
    }
);

const LABEL: Record<ProcessField, string> = { code: "공정코드", name: "공정명", note: "비고", active: "사용 여부" };
const NOTE_MAX = 500;

export function ProcessForm(props: Props) {
  const [state, formAction, pending] = useActionState(props.action, null);
  const failed = state && !state.ok ? state : null;
  const errors: ProcessErrors = failed?.errors ?? {};
  // 거절되면 보낸 값으로 칸을 다시 채운다.
  const v: ProcessValues = failed?.values ?? props.initial;
  const attempt = failed ? JSON.stringify(failed) : "first";

  // 제출은 직접 넘긴다 — 폼 동작이 칸을 비우지 않게(거절된 입력을 다시 치지 않도록).
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(() => formAction(form));
  }

  const errorList = PROCESS_FIELDS.filter((f) => errors[f]).map((f) => [f, LABEL[f], errors[f]!] as const);

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
                label="공정코드"
                error={errors.code}
                hint="영문 대문자로 시작해 2 ~ 6자 · 등록한 뒤 바꾸지 못합니다"
              >
                <Input field="code" defaultValue={v.code} maxLength={6} placeholder="예: DA" invalid={!!errors.code} />
              </Field>
            </div>
          ) : (
            <div className="sm:max-w-48">
              <ReadOnly label="공정코드" value={props.code} />
            </div>
          )}
          <Field field="name" label="공정명" error={errors.name} hint="50자까지">
            <Input field="name" defaultValue={v.name} maxLength={50} invalid={!!errors.name} />
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
        {props.mode === "edit" && <ActiveSection what="공정" initial={v.active} error={errors.active} />}
      </div>
      <FormActions pending={pending} cancelHref="/production/processes" />
    </form>
  );
}
