"use client";

import Link from "next/link";
import { startTransition, useActionState, useState, type FormEvent, type ReactNode } from "react";
import type { UnitOption } from "@/db/items";
import { ITEM_FIELDS, type ItemErrors, type ItemField, type ItemValues } from "@/lib/item-fields";
import { ITEM_TYPE_DEFAULTS, ITEM_TYPES, PROC_TYPES, itemTypeName, type ItemType } from "@/lib/master-codes";
import type { ItemFormState } from "./actions";

// 품목 등록 · 수정 화면의 입력 칸. 검사는 서버가 하고(설계 ②), 화면은 거절된 칸과 까닭을 칸 옆에 보인다.
// 유형을 고르면 조달구분 · 검사 대상의 기본값이 붙는다(ADR 0003) — 그 뒤에 바꿀 수 있다.

type Props = {
  action: (state: ItemFormState, form: FormData) => Promise<ItemFormState>;
  units: UnitOption[];
  initial: ItemValues;
} & ({ mode: "create"; previewCodes: Record<ItemType, string> } | { mode: "edit"; code: string; itemType: string });

const LABEL: Partial<Record<ItemField, string>> = {
  itemType: "유형",
  procurement: "조달구분",
  name: "품명",
  spec: "규격",
  unit: "단위",
  inspectIn: "수입검사 대상",
  inspectOut: "출하검사 대상",
  leadTimeDays: "리드타임",
  safetyStock: "안전재고",
  minLot: "최소 발주 · 생산량",
  lotMultiple: "발주 · 생산 배수",
  active: "사용 여부",
};

export function ItemForm(props: Props) {
  const [state, formAction, pending] = useActionState(props.action, null);
  const failed = state && !state.ok ? state : null;
  const errors: ItemErrors = failed?.errors ?? {};
  // 거절되면 보낸 값으로 칸을 다시 채운다.
  const v: ItemValues = failed?.values ?? props.initial;
  const attempt = failed ? JSON.stringify(failed) : "first";

  // 제출은 직접 넘긴다 — 폼 동작이 칸을 비우지 않게(거절된 입력을 다시 치지 않도록).
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(() => formAction(form));
  }

  // 화면의 칸 순서대로 알린다.
  const errorList = ITEM_FIELDS.filter((f) => errors[f]).map((f) => [f, errors[f]!] as const);

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="mt-6 max-w-3xl">
      {(errorList.length > 0 || failed?.formError) && (
        <div role="alert" className="mb-6 border-l-4 border-red-700 bg-white px-5 py-4">
          <p className="font-semibold">저장하지 않았습니다.</p>
          {failed?.formError && <p className="mt-1 text-sm">{failed.formError}</p>}
          {errorList.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-sm">
              {errorList.map(([field, message]) => (
                <li key={field}>
                  <a href={`#f-${field}`} className="underline underline-offset-2">
                    {LABEL[field] ?? field}
                  </a>{" "}
                  — {message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <Fields key={attempt} {...props} values={v} errors={errors} />
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-machine px-6 py-2.5 font-semibold text-white hover:bg-machine-deep disabled:opacity-60"
        >
          {pending ? "저장 중…" : "저장"}
        </button>
        <Link href="/master/items" className="px-3 py-2.5 text-muted underline underline-offset-4 hover:text-ink">
          취소
        </Link>
      </div>
    </form>
  );
}

function Fields(props: Props & { values: ItemValues; errors: ItemErrors }) {
  const { values: v, errors } = props;
  const [itemType, setItemType] = useState(v.itemType ?? "");
  const [procurement, setProcurement] = useState(v.procurement ?? "");
  const [inspectIn, setInspectIn] = useState(v.inspectIn === "on");
  const [inspectOut, setInspectOut] = useState(v.inspectOut === "on");
  const [unit, setUnit] = useState(v.unit ?? "");

  function pickType(type: ItemType) {
    setItemType(type);
    const d = ITEM_TYPE_DEFAULTS[type];
    setProcurement(d.procurement);
    setInspectIn(d.inspectIn);
    setInspectOut(d.inspectOut);
  }

  // 조달구분이 구매면 발주에, 생산이면 생산에 쓰인다(ADR 0003).
  const lot = procurement === "BUY" ? "발주" : procurement === "MAKE" ? "생산" : "발주 · 생산";
  const unitShown = unit || "단위";

  return (
    <div className="grid gap-8">
      <Section title="기본">
        {props.mode === "create" ? (
          <Field field="itemType" label="유형" error={errors.itemType} as="fieldset">
            <div className="flex flex-wrap gap-2">
              {ITEM_TYPES.map((t) => (
                <Choice
                  key={t.code}
                  name="itemType"
                  value={t.code}
                  checked={itemType === t.code}
                  onChange={() => pickType(t.code)}
                >
                  {t.name}
                </Choice>
              ))}
            </div>
            <p className="mt-2 text-sm text-muted">
              {itemType
                ? `코드는 저장할 때 붙습니다 — 지금 저장하면 ${props.previewCodes[itemType as ItemType]}`
                : "유형을 고르면 코드 · 조달구분 · 검사 대상이 붙습니다. 유형은 등록한 뒤 바꿀 수 없습니다."}
            </p>
          </Field>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:max-w-sm">
            <ReadOnly label="코드" value={props.code} />
            <ReadOnly label="유형" value={itemTypeName(props.itemType)} />
          </div>
        )}
        <Field field="name" label="품명" error={errors.name} hint="100자까지">
          <Input field="name" defaultValue={v.name} maxLength={100} invalid={!!errors.name} />
        </Field>
        <Field field="spec" label="규격" error={errors.spec} hint="비워도 됩니다 · 100자까지">
          <Input field="spec" defaultValue={v.spec} maxLength={100} invalid={!!errors.spec} />
        </Field>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field field="unit" label="단위" error={errors.unit}>
            <select
              id="f-unit"
              name="unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              aria-invalid={!!errors.unit || undefined}
              aria-describedby={errors.unit ? "e-unit" : undefined}
              className={inputClass(!!errors.unit)}
            >
              <option value="">고르세요</option>
              {props.units.map((u) => (
                <option key={u.code} value={u.code}>
                  {u.code} — {u.name}
                  {u.active ? "" : " (사용 안 함)"}
                </option>
              ))}
            </select>
          </Field>
          <Field field="procurement" label="조달구분" error={errors.procurement} as="fieldset">
            <div className="flex flex-wrap gap-2">
              {PROC_TYPES.map((t) => (
                <Choice
                  key={t.code}
                  name="procurement"
                  value={t.code}
                  checked={procurement === t.code}
                  onChange={() => setProcurement(t.code)}
                >
                  {t.name}
                </Choice>
              ))}
            </div>
          </Field>
        </div>
      </Section>

      <Section title="검사 대상">
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <Check name="inspectIn" checked={inspectIn} onChange={setInspectIn} error={errors.inspectIn}>
            수입검사 대상
          </Check>
          <Check name="inspectOut" checked={inspectOut} onChange={setInspectOut} error={errors.inspectOut}>
            출하검사 대상
          </Check>
        </div>
      </Section>

      <Section title="계획 정보" note="MRP 가 씁니다. 수량은 품목의 단위로, 소수 셋째 자리까지.">
        <div className="grid gap-6 sm:grid-cols-2">
          <Field field="leadTimeDays" label="리드타임" error={errors.leadTimeDays} hint="0 ~ 365">
            <Input
              field="leadTimeDays"
              defaultValue={v.leadTimeDays}
              inputMode="numeric"
              suffix="일"
              invalid={!!errors.leadTimeDays}
            />
          </Field>
          <Field field="safetyStock" label="안전재고" error={errors.safetyStock}>
            <Input
              field="safetyStock"
              defaultValue={v.safetyStock}
              inputMode="decimal"
              suffix={unitShown}
              invalid={!!errors.safetyStock}
            />
          </Field>
          <Field field="minLot" label={`최소 ${lot}량`} error={errors.minLot}>
            <Input
              field="minLot"
              defaultValue={v.minLot}
              inputMode="decimal"
              suffix={unitShown}
              invalid={!!errors.minLot}
            />
          </Field>
          <Field field="lotMultiple" label={`${lot} 배수`} error={errors.lotMultiple} hint="0 이면 배수 없음">
            <Input
              field="lotMultiple"
              defaultValue={v.lotMultiple}
              inputMode="decimal"
              suffix={unitShown}
              invalid={!!errors.lotMultiple}
            />
          </Field>
        </div>
      </Section>

      {props.mode === "edit" && (
        <Section
          title="사용 여부"
          note="「사용 안 함」인 품목은 목록의 기본 보기와 새 입력에서 빠집니다. 지우는 길은 없습니다."
        >
          <Field field="active" label="사용 여부" error={errors.active} as="fieldset" hideLabel>
            <div className="flex flex-wrap gap-2">
              <ActiveChoice value="Y" initial={v.active}>
                사용
              </ActiveChoice>
              <ActiveChoice value="N" initial={v.active}>
                사용 안 함
              </ActiveChoice>
            </div>
          </Field>
        </Section>
      )}
    </div>
  );
}

const inputClass = (invalid: boolean) =>
  `w-full min-w-0 rounded border bg-white px-3 py-2 ${invalid ? "border-red-700" : "border-rule"} focus-visible:outline-machine`;

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="grid gap-5 border-t-2 border-machine pt-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {note && <p className="text-sm text-muted">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({
  field,
  label,
  error,
  hint,
  as,
  hideLabel,
  children,
}: {
  field: ItemField;
  label: string;
  error?: string;
  hint?: string;
  as?: "fieldset";
  hideLabel?: boolean;
  children: ReactNode;
}) {
  const head = (
    <span className={`mb-1 flex items-baseline gap-2 ${hideLabel ? "sr-only" : ""}`}>
      <span className="font-semibold">{label}</span>
      {hint && <span className="text-sm text-muted">{hint}</span>}
    </span>
  );
  const message = error && (
    <p id={`e-${field}`} className="mt-1 text-sm font-semibold text-red-700">
      {error}
    </p>
  );
  if (as === "fieldset") {
    return (
      <fieldset id={`f-${field}`} aria-describedby={error ? `e-${field}` : undefined} tabIndex={-1}>
        <legend className="contents">{head}</legend>
        {children}
        {message}
      </fieldset>
    );
  }
  return (
    <div>
      <label htmlFor={`f-${field}`}>{head}</label>
      {children}
      {message}
    </div>
  );
}

function Input({
  field,
  defaultValue,
  invalid,
  suffix,
  ...rest
}: {
  field: ItemField;
  defaultValue?: string;
  invalid: boolean;
  suffix?: string;
  maxLength?: number;
  inputMode?: "numeric" | "decimal";
}) {
  const input = (
    <input
      id={`f-${field}`}
      name={field}
      defaultValue={defaultValue}
      aria-invalid={invalid || undefined}
      aria-describedby={invalid ? `e-${field}` : undefined}
      autoComplete="off"
      className={inputClass(invalid)}
      {...rest}
    />
  );
  if (!suffix) return input;
  return (
    <div className="flex items-center gap-2">
      {input}
      <span className="shrink-0 text-sm text-muted">{suffix}</span>
    </div>
  );
}

function Choice({
  name,
  value,
  checked,
  onChange,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
}) {
  return (
    <label
      className={`cursor-pointer rounded border px-4 py-2 has-focus-visible:outline-2 has-focus-visible:outline-machine ${
        checked ? "border-machine bg-machine font-semibold text-white" : "border-rule bg-white hover:border-machine"
      }`}
    >
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="sr-only" />
      {children}
    </label>
  );
}

function ActiveChoice({ value, initial, children }: { value: "Y" | "N"; initial?: string; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded border border-rule bg-white px-4 py-2 has-checked:border-machine has-checked:font-semibold">
      <input type="radio" name="active" value={value} defaultChecked={initial === value} className="accent-machine" />
      {children}
    </label>
  );
}

function Check({
  name,
  checked,
  onChange,
  error,
  children,
}: {
  name: ItemField;
  checked: boolean;
  onChange: (v: boolean) => void;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div id={`f-${name}`}>
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          name={name}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={!!error || undefined}
          className="size-5 accent-machine"
        />
        {children}
      </label>
      {error && <p className="mt-1 text-sm font-semibold text-red-700">{error}</p>}
    </div>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 font-semibold">{label}</p>
      <p className="rounded border border-dashed border-rule px-3 py-2 font-mono">{value}</p>
      <span className="sr-only">바꿀 수 없음</span>
    </div>
  );
}
