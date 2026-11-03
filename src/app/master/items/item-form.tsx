"use client";

import { startTransition, useActionState, useState, type FormEvent, type ReactNode } from "react";
import {
  ActiveSection,
  Check,
  ErrorSummary,
  Field,
  FormActions,
  Input,
  ReadOnly,
  Section,
  inputClass,
} from "@/components/form-parts";
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
  const errorList = ITEM_FIELDS.filter((f) => errors[f]).map((f) => [f, LABEL[f] ?? f, errors[f]!] as const);

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="mt-6 max-w-3xl">
      <ErrorSummary errors={errorList} formError={failed?.formError} />
      <Fields key={attempt} {...props} values={v} errors={errors} />
      <FormActions pending={pending} cancelHref="/master/items" />
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

      {props.mode === "edit" && <ActiveSection what="품목" initial={v.active} error={errors.active} />}
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
