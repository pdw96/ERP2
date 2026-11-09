"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import {
  ActiveSection,
  Check,
  Choice,
  ErrorSummary,
  Field,
  FormActions,
  Input,
  ReadOnly,
  Section,
  inputClass,
} from "@/components/form-parts";
import type { ItemClassOptions, UnitOption } from "@/db/items";
import type { RuleOption } from "@/db/number-rules";
import type { WarehouseChoice } from "@/lib/item-stock";
import {
  ITEM_CLASSES,
  ITEM_FIELDS,
  NOTE_MAX,
  type ItemErrors,
  type ItemField,
  type ItemValues,
} from "@/lib/item-fields";
import {
  ITEM_TYPE_DEFAULTS,
  ITEM_TYPES,
  PROC_TYPES,
  isMadeType,
  itemTypeName,
  type ItemType,
} from "@/lib/master-codes";
import type { ItemFormState } from "./actions";

// 품목 등록 · 수정 화면의 입력 칸. 검사는 서버가 하고(설계 ②), 화면은 거절된 칸과 까닭을 칸 옆에 보인다.
// 유형을 고르면 조달구분 · 검사 대상 · LOT 관리의 기본값이 붙는다(ADR 0003 · 0019) — 그 뒤에 바꿀 수 있다.
// LOT 번호 규칙은 반제품 · 완제품만 고른다(ADR 0016). 기본 창고는 불량창고를 고르지 못한다(ADR 0015).

type Props = {
  action: (state: ItemFormState, form: FormData) => Promise<ItemFormState>;
  units: UnitOption[];
  /** 분류 묶음마다 고를 수 있는 값 — 사용 중인 것과, 수정이면 그 품목의 지금 값. */
  classes: ItemClassOptions;
  /** LOT 번호 규칙 — 「사용 안 함」까지(고르는 목록은 사용 중인 것과 그 품목의 지금 값). 번호의 예는 오늘의 첫 번호. */
  rules: RuleOption[];
  /** 창고 — 「사용 안 함」 · 불량창고까지(고르는 목록은 사용 중이고 불량창고가 아닌 것과 그 품목의 지금 값). */
  warehouses: WarehouseChoice[];
  initial: ItemValues;
} & (
  | { mode: "create"; previewCodes: Record<ItemType, string> }
  | {
      mode: "edit";
      code: string;
      itemType: string;
      /** 화면을 연 때의 버전 — 그 사이 다른 사람이 고쳤으면 서버가 저장하지 않는다(PR J). */
      version: string;
    }
);

const LABEL: Partial<Record<ItemField, string>> = {
  itemType: "유형",
  procurement: "조달구분",
  name: "품명",
  spec: "규격",
  unit: "단위",
  inspectIn: "수입검사 대상",
  inspectOut: "출하검사 대상",
  lotManaged: "LOT 관리",
  lotRuleCode: "LOT 번호 규칙",
  defaultInWarehouse: "기본 입고 창고",
  defaultOutWarehouse: "기본 출고 창고",
  leadTimeDays: "리드타임",
  safetyStock: "안전재고",
  minLot: "최소 발주 · 생산량",
  lotMultiple: "발주 · 생산 배수",
  cls1: "대분류",
  cls2: "중분류",
  cls3: "소분류",
  note: "비고",
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
      {props.mode === "edit" && <input type="hidden" name="version" value={props.version} />}
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
  const [lotManaged, setLotManaged] = useState(v.lotManaged === "on");
  const [lotRule, setLotRule] = useState(v.lotRuleCode ?? "");

  function pickType(type: ItemType) {
    setItemType(type);
    const d = ITEM_TYPE_DEFAULTS[type];
    setProcurement(d.procurement);
    setInspectIn(d.inspectIn);
    setInspectOut(d.inspectOut);
    setLotManaged(d.lotManaged);
    if (!isMadeType(type)) setLotRule("");
  }

  // 수정이면 그 품목의 유형, 등록이면 고른 유형.
  const type = props.mode === "edit" ? props.itemType : itemType;
  const initialRule = props.initial.lotRuleCode ?? "";
  const rules = props.rules.filter((r) => r.active || (props.mode === "edit" && r.code === initialRule));
  const typeDefault = props.rules.find((r) => r.defaultFor === type);

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

      <Section
        title="재고"
        note="수불관리의 등록 화면(기타입고 · 기타출고 · 재고이동 · 재고조정)이 씁니다. 기본 창고는 품목을 고르면 창고 칸에 미리 채워지고, 그 화면에서 바꿀 수 있습니다."
      >
        <div>
          <Check name="lotManaged" checked={lotManaged} onChange={setLotManaged} error={errors.lotManaged}>
            LOT 관리
          </Check>
          <p className="mt-1 text-sm text-muted">
            켜면 수불마다 LOT 를 남깁니다. 원자재 · 반제품 · 완제품은 켬, 부자재 · 소모품은 끔이 기본입니다.
          </p>
        </div>
        {isMadeType(type) ? (
          <Field
            field="lotRuleCode"
            label="LOT 번호 규칙"
            error={errors.lotRuleCode}
            hint="입고에서 LOT 를 비우면 이 규칙으로 붙습니다"
          >
            <select
              id="f-lotRuleCode"
              name="lotRuleCode"
              value={lotRule}
              onChange={(e) => setLotRule(e.target.value)}
              aria-invalid={!!errors.lotRuleCode || undefined}
              aria-describedby={errors.lotRuleCode ? "e-lotRuleCode" : undefined}
              className={inputClass(!!errors.lotRuleCode)}
            >
              <option value="">
                {typeDefault ? `유형의 기본 — ${typeDefault.code} (${typeDefault.example})` : "유형의 기본"}
              </option>
              {rules.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.code} — {r.name} ({r.example}){r.active ? "" : " (사용 안 함)"}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <div>
            <input type="hidden" name="lotRuleCode" value="" />
            <p className="text-sm text-muted" id="f-lotRuleCode">
              {type
                ? "사 오는 품목은 LOT 번호 규칙이 없습니다 — 입고할 때 거래처 LOT 를 넣습니다."
                : "LOT 번호 규칙은 반제품 · 완제품을 고르면 보입니다."}
            </p>
            {errors.lotRuleCode && (
              <p id="e-lotRuleCode" className="mt-1 text-sm font-semibold text-red-700">
                {errors.lotRuleCode}
              </p>
            )}
          </div>
        )}
        <div className="grid gap-6 sm:grid-cols-2">
          {(
            [
              ["defaultInWarehouse", "기본 입고 창고"],
              ["defaultOutWarehouse", "기본 출고 창고"],
            ] as const
          ).map(([field, label]) => {
            const now = props.initial[field] ?? "";
            const options = props.warehouses.filter(
              (w) => (w.active && !w.isDefect) || (props.mode === "edit" && w.code === now),
            );
            return (
              <Field key={field} field={field} label={label} error={errors[field]}>
                <select
                  id={`f-${field}`}
                  name={field}
                  defaultValue={v[field] ?? ""}
                  aria-invalid={!!errors[field] || undefined}
                  aria-describedby={errors[field] ? `e-${field}` : undefined}
                  className={inputClass(!!errors[field])}
                >
                  <option value="">없음</option>
                  {options.map((w) => (
                    <option key={w.code} value={w.code}>
                      {w.code} — {w.name}
                      {w.active ? "" : " (사용 안 함)"}
                    </option>
                  ))}
                </select>
              </Field>
            );
          })}
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

      <Section title="분류 · 비고" note="모두 비워도 됩니다. 분류의 값은 「시스템 관리 › 공통코드」에서 늘립니다.">
        <div className="grid gap-6 sm:grid-cols-3">
          {ITEM_CLASSES.map(({ field, label }) => (
            <Field key={field} field={field} label={label} error={errors[field]}>
              <select
                id={`f-${field}`}
                name={field}
                defaultValue={v[field] ?? ""}
                aria-invalid={!!errors[field] || undefined}
                aria-describedby={errors[field] ? `e-${field}` : undefined}
                className={inputClass(!!errors[field])}
              >
                <option value="">없음</option>
                {props.classes[field].map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                    {c.active ? "" : " (사용 안 함)"}
                  </option>
                ))}
              </select>
            </Field>
          ))}
        </div>
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

      {props.mode === "edit" && <ActiveSection what="품목" initial={v.active} error={errors.active} />}
    </div>
  );
}
