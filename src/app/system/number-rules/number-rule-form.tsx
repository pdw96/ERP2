"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import {
  ActiveSection,
  Choice,
  ErrorSummary,
  Field,
  FormActions,
  Input,
  ReadOnly,
  Section,
  inputClass,
} from "@/components/form-parts";
import { ITEM_TYPES, MADE_ITEM_TYPES, itemTypeName } from "@/lib/master-codes";
import {
  DATE_FORMATS,
  NONE,
  NUMBER_RULE_FIELDS,
  SEPARATORS,
  SEQ_DIGITS_MAX,
  SEQ_DIGITS_MIN,
  formatLotNumber,
  type NumberRuleErrors,
  type NumberRuleField,
  type NumberRuleValues,
} from "@/lib/number-rule-fields";
import type { NumberRuleFormState } from "./actions";

// 번호 규칙 등록 · 수정 화면의 입력 칸. 검사는 서버가 하고, 화면은 거절된 칸과 까닭을 칸 옆에 보인다.
// 칸을 바꾸면 오늘 날짜의 번호가 바로 보인다 — 머리 · 날짜 꼴이 없으면 그 조각과 앞의 구분자가 빠진다(ADR 0016).

type Props = {
  action: (state: NumberRuleFormState, form: FormData) => Promise<NumberRuleFormState>;
  initial: NumberRuleValues;
  /** 번호의 예를 만드는 날 — 한국 시각의 오늘. */
  today: string;
} & (
  | { mode: "create" }
  | {
      mode: "edit";
      code: string;
      /** 화면을 연 때의 버전 — 그 사이 다른 사람이 고쳤으면 서버가 저장하지 않는다. */
      version: string;
      /** 지금 이 규칙을 기본으로 쓰는 유형 — 있으면 기본을 떼거나 「사용 안 함」으로 바꾸지 못한다. */
      defaultFor: string | null;
    }
);

const LABEL: Record<NumberRuleField, string> = {
  code: "코드",
  name: "이름",
  prefix: "머리",
  separator: "구분자",
  dateFormat: "날짜 꼴",
  seqDigits: "일련 자릿수",
  defaultFor: "기본으로 쓰는 유형",
  active: "사용 여부",
};

const DIGITS = Array.from({ length: SEQ_DIGITS_MAX - SEQ_DIGITS_MIN + 1 }, (_, i) => String(SEQ_DIGITS_MIN + i));
const asChoice = (v: string | undefined) => (v === undefined || v === "" ? NONE : v);

export function NumberRuleForm(props: Props) {
  const [state, formAction, pending] = useActionState(props.action, null);
  const failed = state && !state.ok ? state : null;
  const errors: NumberRuleErrors = failed?.errors ?? {};
  const v: NumberRuleValues = failed?.values ?? props.initial;
  const attempt = failed ? JSON.stringify(failed) : "first";

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(() => formAction(form));
  }

  const errorList = NUMBER_RULE_FIELDS.filter((f) => errors[f]).map((f) => [f, LABEL[f], errors[f]!] as const);

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="mt-6 max-w-3xl">
      <ErrorSummary errors={errorList} formError={failed?.formError} />
      {props.mode === "edit" && <input type="hidden" name="version" value={props.version} />}
      <Fields key={attempt} {...props} values={v} errors={errors} />
      <FormActions pending={pending} cancelHref="/system/number-rules" />
    </form>
  );
}

function Fields(props: Props & { values: NumberRuleValues; errors: NumberRuleErrors }) {
  const { values: v, errors } = props;
  const [prefix, setPrefix] = useState(v.prefix ?? "");
  const [separator, setSeparator] = useState(asChoice(v.separator));
  const [dateFormat, setDateFormat] = useState(asChoice(v.dateFormat));
  const [seqDigits, setSeqDigits] = useState(v.seqDigits ?? "3");
  const [defaultFor, setDefaultFor] = useState(asChoice(v.defaultFor));

  const shape = {
    prefix: prefix.trim(),
    separator: separator === NONE ? "" : separator,
    dateFormat: dateFormat === NONE ? "" : dateFormat,
    seqDigits: Number(seqDigits) || SEQ_DIGITS_MIN,
  };
  const valid = /^[A-Z0-9]{0,6}$/.test(shape.prefix);
  const lockedDefault = props.mode === "edit" ? props.defaultFor : null;

  return (
    <div className="grid gap-8">
      <Section title="기본">
        {props.mode === "create" ? (
          <Field
            field="code"
            label="코드"
            error={errors.code}
            hint="영문 대문자로 시작 · 대문자 · 숫자 · 밑줄 20자까지"
          >
            <Input
              field="code"
              defaultValue={v.code}
              maxLength={20}
              placeholder="예: LOT_FG2"
              invalid={!!errors.code}
            />
          </Field>
        ) : (
          <div className="sm:max-w-48">
            <ReadOnly label="코드" value={props.code} />
          </div>
        )}
        <Field field="name" label="이름" error={errors.name} hint="50자까지">
          <Input field="name" defaultValue={v.name} maxLength={50} invalid={!!errors.name} />
        </Field>
      </Section>

      <Section title="번호의 꼴" note="번호는 머리 → 날짜 → 일련의 차례이고, 있는 조각 사이에 구분자가 들어갑니다.">
        <div
          role="status"
          aria-live="polite"
          className="rounded border border-rule bg-floor px-4 py-3 font-mono text-lg wrap-anywhere"
        >
          <span className="mr-3 font-sans text-sm text-muted">오늘 첫 번호</span>
          {valid ? formatLotNumber(shape, props.today, 1) : "머리를 고치면 보입니다"}
        </div>
        <Field field="prefix" label="머리" error={errors.prefix} hint="영문 대문자 · 숫자 6자까지 · 비우면 머리 없음">
          <input
            id="f-prefix"
            name="prefix"
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            maxLength={6}
            autoComplete="off"
            aria-invalid={!!errors.prefix || undefined}
            aria-describedby={errors.prefix ? "e-prefix" : undefined}
            className={`${inputClass(!!errors.prefix)} sm:max-w-48`}
          />
        </Field>
        <Field field="separator" label="구분자" error={errors.separator} as="fieldset">
          <div className="flex flex-wrap gap-2">
            {SEPARATORS.map((s) => (
              <Choice
                key={s.label}
                name="separator"
                value={asChoice(s.value)}
                checked={separator === asChoice(s.value)}
                onChange={() => setSeparator(asChoice(s.value))}
              >
                {s.label}
              </Choice>
            ))}
          </div>
        </Field>
        <Field field="dateFormat" label="날짜 꼴" error={errors.dateFormat} hint="날짜는 수불 일자" as="fieldset">
          <div className="flex flex-wrap gap-2">
            {DATE_FORMATS.map((d) => (
              <Choice
                key={d.label}
                name="dateFormat"
                value={asChoice(d.value)}
                checked={dateFormat === asChoice(d.value)}
                onChange={() => setDateFormat(asChoice(d.value))}
              >
                {d.label}
              </Choice>
            ))}
          </div>
          <p className="mt-2 text-sm text-muted">
            일련은 {DATE_FORMATS.find((d) => asChoice(d.value) === dateFormat)?.resets ?? "날짜 꼴마다"} 1 부터 다시
            셉니다.
          </p>
        </Field>
        <Field field="seqDigits" label="일련 자릿수" error={errors.seqDigits} hint="넘으면 자리가 늡니다">
          <select
            id="f-seqDigits"
            name="seqDigits"
            value={seqDigits}
            onChange={(e) => setSeqDigits(e.target.value)}
            aria-invalid={!!errors.seqDigits || undefined}
            aria-describedby={errors.seqDigits ? "e-seqDigits" : undefined}
            className={`${inputClass(!!errors.seqDigits)} sm:max-w-48`}
          >
            {DIGITS.map((d) => (
              <option key={d} value={d}>
                {d}자리
              </option>
            ))}
          </select>
        </Field>
      </Section>

      <Section
        title="기본으로 쓰는 유형"
        note="반제품 · 완제품마다 기본 규칙이 하나입니다. 고르면 그 유형의 기본이 이 규칙으로 옮겨 옵니다."
      >
        {lockedDefault ? (
          <>
            <input type="hidden" name="defaultFor" value={lockedDefault} />
            <p className={errors.defaultFor ? "font-semibold text-red-700" : ""} id="f-defaultFor">
              {itemTypeName(lockedDefault)}의 기본 규칙입니다 — 다른 규칙을 {itemTypeName(lockedDefault)}의 기본으로
              고르면 바뀝니다. 기본 규칙은 「사용 안 함」으로 바꾸지 못합니다.
            </p>
          </>
        ) : (
          <Field field="defaultFor" label="기본으로 쓰는 유형" error={errors.defaultFor} as="fieldset" hideLabel>
            <div className="flex flex-wrap gap-2">
              {[NONE, ...MADE_ITEM_TYPES].map((t) => (
                <Choice
                  key={t}
                  name="defaultFor"
                  value={t}
                  checked={defaultFor === t}
                  onChange={() => setDefaultFor(t)}
                >
                  {t === NONE ? "없음" : (ITEM_TYPES.find((x) => x.code === t)?.name ?? t)}
                </Choice>
              ))}
            </div>
          </Field>
        )}
      </Section>

      {props.mode === "edit" && (
        <ActiveSection
          what="규칙"
          initial={v.active}
          error={errors.active}
          note="「사용 안 함」인 규칙은 품목에서 새로 고를 수 없습니다. 이미 고른 품목은 이 규칙으로 계속 번호를 받습니다. 지우는 길은 없습니다."
        />
      )}
    </div>
  );
}
