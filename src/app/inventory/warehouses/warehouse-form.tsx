"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import {
  ActiveSection,
  Check,
  ErrorSummary,
  Field,
  FormActions,
  Input,
  ReadOnly,
  Section,
} from "@/components/form-parts";
import {
  WAREHOUSE_FIELDS,
  type WarehouseErrors,
  type WarehouseField,
  type WarehouseValues,
} from "@/lib/warehouse-fields";
import type { WarehouseFormState } from "./actions";

// 창고 등록 · 수정 화면의 입력 칸. 검사는 서버가 하고(설계 ②), 화면은 거절된 칸과 까닭을 칸 옆에 보인다.

type Props = {
  action: (state: WarehouseFormState, form: FormData) => Promise<WarehouseFormState>;
  initial: WarehouseValues;
} & (
  | { mode: "create"; previewCode: string }
  | {
      mode: "edit";
      code: string;
      /** 화면을 연 때의 버전 — 그 사이 다른 사람이 고쳤으면 서버가 저장하지 않는다(PR J). */
      version: string;
    }
);

const LABEL: Record<WarehouseField, string> = { name: "창고명", isDefect: "불량창고", active: "사용 여부" };

export function WarehouseForm(props: Props) {
  const [state, formAction, pending] = useActionState(props.action, null);
  const failed = state && !state.ok ? state : null;
  const errors: WarehouseErrors = failed?.errors ?? {};
  // 거절되면 보낸 값으로 칸을 다시 채운다.
  const v: WarehouseValues = failed?.values ?? props.initial;
  const attempt = failed ? JSON.stringify(failed) : "first";

  // 제출은 직접 넘긴다 — 폼 동작이 칸을 비우지 않게(거절된 입력을 다시 치지 않도록).
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(() => formAction(form));
  }

  const errorList = WAREHOUSE_FIELDS.filter((f) => errors[f]).map((f) => [f, LABEL[f], errors[f]!] as const);

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="mt-6 max-w-3xl">
      <ErrorSummary errors={errorList} formError={failed?.formError} />
      {props.mode === "edit" && <input type="hidden" name="version" value={props.version} />}
      <div key={attempt} className="grid gap-8">
        <Section title="기본">
          {props.mode === "create" ? (
            <p className="text-sm text-muted">
              코드는 저장할 때 붙습니다 — 지금 저장하면 <span className="font-mono">{props.previewCode}</span>
            </p>
          ) : (
            <div className="sm:max-w-48">
              <ReadOnly label="코드" value={props.code} />
            </div>
          )}
          <Field field="name" label="창고명" error={errors.name} hint="50자까지">
            <Input field="name" defaultValue={v.name} maxLength={50} invalid={!!errors.name} />
          </Field>
        </Section>
        <DefectSection initial={v.isDefect === "on"} error={errors.isDefect} />
        {props.mode === "edit" && <ActiveSection what="창고" initial={v.active} error={errors.active} />}
      </div>
      <FormActions pending={pending} cancelHref="/inventory/warehouses" />
    </form>
  );
}

/** 불량창고 표시(조각 「재고 수불」 PR B, ADR 0015) — 그 창고의 재고는 불량이라 가용에 들지 않는다. */
function DefectSection({ initial, error }: { initial: boolean; error?: string }) {
  return (
    <Section
      title="불량창고"
      note="불량창고의 재고는 불량이라 가용재고에 들지 않고, 수불관리에서 내보내지 못합니다. 품목의 기본 창고로 고르지 못합니다."
    >
      <Check name="isDefect" defaultChecked={initial} error={error}>
        불량창고
      </Check>
    </Section>
  );
}
