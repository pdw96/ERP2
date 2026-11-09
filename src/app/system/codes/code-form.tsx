"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import {
  ActiveSection,
  ErrorSummary,
  Field,
  FormActions,
  Input,
  ReadOnly,
  Section,
  inputClass,
} from "@/components/form-parts";
import { CODE_FIELDS, factorText, type CodeErrors, type CodeField, type CodeValues } from "@/lib/code-fields";
import type { CodeFormState } from "./actions";

// 공통코드 값 추가 · 수정 화면의 입력 칸. 검사는 서버가 하고(설계 ②), 화면은 거절된 칸과 까닭을 칸 옆에 보인다.
// 사용자 코드 묶음에서만 열린다 — 시스템 코드 묶음에는 이 화면이 없다.

/** 단위(UNIT) 묶음의 사양 칸 — 새 단위는 기준으로 고를 단위를, 수정은 바뀌지 않는 기준 · 배수를 받는다(ADR 0017). */
export type UnitSpecProps =
  { mode: "create"; bases: { code: string; name: string }[] } | { mode: "edit"; baseUnit: string; factor: number };

type Props = {
  action: (state: CodeFormState, form: FormData) => Promise<CodeFormState>;
  group: { code: string; name: string };
  initial: CodeValues;
  /** 단위 묶음이면 있다 — 다른 묶음에는 사양 칸이 없다. */
  unit?: UnitSpecProps;
} & (
  | { mode: "create" }
  | {
      mode: "edit";
      code: string;
      /** 화면을 연 때의 버전 — 그 사이 다른 사람이 고쳤으면 서버가 저장하지 않는다(PR J). */
      version: string;
      /** 프로그램이 기대는 값(국가 KR) — 「사용 안 함」으로 바꾸는 칸을 두지 않는다. 서버도 거절한다. */
      alwaysActive?: boolean;
    }
);

const LABEL: Record<CodeField, string> = {
  code: "코드",
  name: "이름",
  sortOrder: "정렬 순서",
  active: "사용 여부",
  baseUnit: "기준 단위",
  factor: "배수",
  decimals: "소수 자릿수",
};

export function CodeForm(props: Props) {
  const [state, formAction, pending] = useActionState(props.action, null);
  const failed = state && !state.ok ? state : null;
  const errors: CodeErrors = failed?.errors ?? {};
  // 거절되면 보낸 값으로 칸을 다시 채운다.
  const v: CodeValues = failed?.values ?? props.initial;
  const attempt = failed ? JSON.stringify(failed) : "first";

  // 제출은 직접 넘긴다 — 폼 동작이 칸을 비우지 않게(거절된 입력을 다시 치지 않도록).
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(() => formAction(form));
  }

  const errorList = CODE_FIELDS.filter((f) => errors[f]).map((f) => [f, LABEL[f], errors[f]!] as const);

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="mt-6 max-w-3xl">
      <ErrorSummary errors={errorList} formError={failed?.formError} />
      {props.mode === "edit" && <input type="hidden" name="version" value={props.version} />}
      <div key={attempt} className="grid gap-8">
        <Section title="값">
          <div className="grid gap-5 sm:grid-cols-2">
            <ReadOnly label="묶음" value={`${props.group.code} ${props.group.name}`} />
            {props.mode === "create" ? (
              <Field
                field="code"
                label="코드"
                error={errors.code}
                hint="영문 대문자 · 숫자 · 밑줄, 20자까지. 저장한 뒤 바뀌지 않습니다"
              >
                <Input
                  field="code"
                  defaultValue={v.code}
                  maxLength={20}
                  placeholder="예: BOX"
                  invalid={!!errors.code}
                />
              </Field>
            ) : (
              <ReadOnly label="코드" value={props.code} />
            )}
          </div>
          <div className="grid gap-5 sm:grid-cols-[2fr_1fr]">
            <Field field="name" label="이름" error={errors.name} hint="50자까지">
              <Input field="name" defaultValue={v.name} maxLength={50} invalid={!!errors.name} />
            </Field>
            <Field field="sortOrder" label="정렬 순서" error={errors.sortOrder} hint="0 ~ 999, 작은 것이 위">
              <Input
                field="sortOrder"
                defaultValue={v.sortOrder}
                maxLength={3}
                inputMode="numeric"
                invalid={!!errors.sortOrder}
              />
            </Field>
          </div>
        </Section>
        {props.unit && <UnitSpecSection unit={props.unit} values={v} errors={errors} />}
        {props.mode === "edit" && props.alwaysActive && (
          <Section
            title="사용 여부"
            note="프로그램이 기대는 값이라 늘 「사용」입니다 — 「사용 안 함」으로 바꿀 수 없습니다."
          >
            <input type="hidden" name="active" value="Y" />
          </Section>
        )}
        {props.mode === "edit" && !props.alwaysActive && (
          <ActiveSection
            what="값"
            initial={v.active}
            error={errors.active}
            note="「사용 안 함」인 값은 새 입력의 목록에서 빠지고, 이미 그 값을 쓴 곳에는 그대로 남습니다. 지우는 길은 없습니다."
          />
        )}
      </div>
      <FormActions pending={pending} cancelHref={`/system/codes/${props.group.code}`} />
    </form>
  );
}

const DECIMALS = ["0", "1", "2", "3"] as const;

/** 단위 사양 — 기준 단위 · 배수 · 소수 자릿수. 새 단위는 셋을 다 넣고, 수정은 소수 자릿수만 고친다. */
function UnitSpecSection({ unit, values, errors }: { unit: UnitSpecProps; values: CodeValues; errors: CodeErrors }) {
  const decimalsField = (
    <Field field="decimals" label="소수 자릿수" error={errors.decimals} hint="0 ~ 3 — 0 이면 정수만">
      <select
        id="f-decimals"
        name="decimals"
        defaultValue={values.decimals ?? "0"}
        aria-invalid={!!errors.decimals || undefined}
        aria-describedby={errors.decimals ? "e-decimals" : undefined}
        className={inputClass(!!errors.decimals)}
      >
        {DECIMALS.map((d) => (
          <option key={d} value={d}>
            {d === "0" ? "0 — 정수만" : `${d} — 소수 ${d}째 자리까지`}
          </option>
        ))}
      </select>
    </Field>
  );
  if (unit.mode === "edit") {
    return (
      <Section
        title="단위 사양"
        note="기준 단위 · 배수는 등록한 뒤 바뀌지 않습니다. 소수 자릿수는 수불 수량이 들어가는 자리입니다."
      >
        <div className="grid gap-5 sm:grid-cols-3">
          <ReadOnly label="기준 단위" value={unit.baseUnit} />
          <ReadOnly label="배수" value={factorText(unit.factor)} />
          {decimalsField}
        </div>
      </Section>
    );
  }
  return (
    <Section
      title="단위 사양"
      note="같은 기준의 단위끼리는 수불관리의 등록 화면에서 바꿔 넣습니다 — 예: 기준 G, 배수 1000 이면 1 KG = 1000 G. 기준 단위 · 배수는 저장한 뒤 바뀌지 않습니다."
    >
      <div className="grid gap-5 sm:grid-cols-3">
        <Field field="baseUnit" label="기준 단위" error={errors.baseUnit}>
          <select
            id="f-baseUnit"
            name="baseUnit"
            defaultValue={values.baseUnit ?? ""}
            aria-invalid={!!errors.baseUnit || undefined}
            aria-describedby={errors.baseUnit ? "e-baseUnit" : undefined}
            className={inputClass(!!errors.baseUnit)}
          >
            <option value="">같은 단위(이 단위)</option>
            {unit.bases.map((b) => (
              <option key={b.code} value={b.code}>
                {b.code} {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Field field="factor" label="배수" error={errors.factor} hint="기준 단위 몇 개인가 — 같은 단위면 비움">
          <Input
            field="factor"
            defaultValue={values.factor}
            maxLength={16}
            inputMode="decimal"
            placeholder="예: 1000"
            invalid={!!errors.factor}
          />
        </Field>
        {decimalsField}
      </div>
    </Section>
  );
}
