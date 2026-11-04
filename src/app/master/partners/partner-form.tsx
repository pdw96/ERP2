"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import {
  ActiveSection,
  Check,
  ErrorSummary,
  Field,
  FormActions,
  Input,
  inputClass,
  ReadOnly,
  Section,
} from "@/components/form-parts";
import {
  FOREIGN_BIZ_NO_MAX,
  PARTNER_ERROR_KEYS,
  type PartnerErrorKey,
  type PartnerErrors,
  type PartnerValues,
} from "@/lib/partner-fields";
import { KOREA } from "@/lib/master-codes";
import type { CountryOption, SharedBizNo } from "@/db/partners";
import type { PartnerFormState } from "./actions";
import { BizNoWarning } from "./biz-no-warning";

// 거래처 등록 · 수정 화면의 입력 칸. 검사는 서버가 하고(설계 ②), 화면은 거절된 칸과 까닭을 칸 옆에 보인다.
// 한 거래처가 매입처 · 매출처 둘 다일 수 있다 — 하나 이상 골라야 저장된다(ADR 0003).
// 국가가 한국이면 사업자등록번호 칸을, 아니면 해외 사업자번호 칸을 보인다 — 보이는 칸 하나만 보낸다(ADR 0011).

type Props = {
  action: (state: PartnerFormState, form: FormData) => Promise<PartnerFormState>;
  initial: PartnerValues;
  /** 고를 수 있는 국가 — 사용 중인 것과, 수정이면 그 거래처의 지금 국가. */
  countries: CountryOption[];
} & (
  | { mode: "create"; previewCode: string }
  | {
      mode: "edit";
      code: string;
      /** 지금 저장된 번호를 같이 쓰는 다른 거래처 — 경고만 한다. */
      sharedBizNo?: SharedBizNo[];
    }
);

const LABEL: Record<PartnerErrorKey, string> = {
  name: "거래처명",
  role: "구분",
  country: "국가",
  bizNo: "사업자등록번호",
  foreignBizNo: "해외 사업자번호",
  active: "사용 여부",
};

export function PartnerForm(props: Props) {
  const [state, formAction, pending] = useActionState(props.action, null);
  const failed = state && !state.ok ? state : null;
  const errors: PartnerErrors = failed?.errors ?? {};
  // 거절되면 보낸 값으로 칸을 다시 채운다.
  const v: PartnerValues = failed?.values ?? props.initial;
  const attempt = failed ? JSON.stringify(failed) : "first";

  // 제출은 직접 넘긴다 — 폼 동작이 칸을 비우지 않게(거절된 입력을 다시 치지 않도록).
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(() => formAction(form));
  }

  const errorList = PARTNER_ERROR_KEYS.filter((f) => errors[f]).map((f) => [f, LABEL[f], errors[f]!] as const);

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="mt-6 max-w-3xl">
      <ErrorSummary errors={errorList} formError={failed?.formError} />
      <div key={attempt} className="grid gap-8">
        <Fields {...props} v={v} errors={errors} />
      </div>
      <FormActions pending={pending} cancelHref="/master/partners" />
    </form>
  );
}

// 거절될 때마다 다시 그려(key) 국가 고름도 보낸 값으로 돌아간다.
function Fields(props: Props & { v: PartnerValues; errors: PartnerErrors }) {
  const { v, errors } = props;
  const [country, setCountry] = useState(v.country || KOREA);
  const korean = country === KOREA;
  const savedNo = props.mode === "edit" ? props.initial.bizNo || props.initial.foreignBizNo : undefined;
  // 경고는 저장된 번호에 대한 것이다 — 국가를 바꿔 다른 칸이 보이면 감춘다.
  const savedKorean = (props.initial.country || KOREA) === KOREA;
  const warning = props.mode === "edit" && savedNo && savedKorean === korean && (
    <BizNoWarning bizNo={savedNo} korean={korean} shared={props.sharedBizNo ?? []} />
  );
  return (
    <>
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
        <Field field="name" label="거래처명" error={errors.name} hint="100자까지">
          <Input field="name" defaultValue={v.name} maxLength={100} invalid={!!errors.name} />
        </Field>
        <Field field="role" label="구분" error={errors.role} hint="하나 이상 · 둘 다 고를 수 있습니다" as="fieldset">
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            <Check name="isSupplier" defaultChecked={v.isSupplier === "on"}>
              매입처 <span className="text-sm text-muted">— 우리가 사는 곳</span>
            </Check>
            <Check name="isCustomer" defaultChecked={v.isCustomer === "on"}>
              매출처 <span className="text-sm text-muted">— 우리가 파는 곳</span>
            </Check>
          </div>
        </Field>
        <Field field="country" label="국가" error={errors.country} hint="한국이 아니면 그 나라의 사업자번호를 넣습니다">
          <div className="sm:max-w-56">
            <select
              id="f-country"
              name="country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              aria-invalid={!!errors.country || undefined}
              aria-describedby={errors.country ? "e-country" : undefined}
              className={inputClass(!!errors.country)}
            >
              {props.countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                  {c.active ? "" : " (사용 안 함)"}
                </option>
              ))}
              {!props.countries.some((c) => c.code === country) && <option value={country}>{country}</option>}
            </select>
          </div>
        </Field>
        {korean ? (
          <Field field="bizNo" label="사업자등록번호" error={errors.bizNo} hint="000-00-00000 · 비워도 됩니다">
            <div className="sm:max-w-56">
              <Input
                field="bizNo"
                defaultValue={v.bizNo}
                maxLength={12}
                placeholder="000-00-00000"
                invalid={!!errors.bizNo}
              />
            </div>
            {warning}
          </Field>
        ) : (
          <Field
            field="foreignBizNo"
            label="해외 사업자번호"
            error={errors.foreignBizNo}
            hint={`그 나라의 세금 번호를 그대로 · ${FOREIGN_BIZ_NO_MAX}자까지 · 비워도 됩니다`}
          >
            <div className="sm:max-w-80">
              <Input
                field="foreignBizNo"
                defaultValue={v.foreignBizNo}
                maxLength={FOREIGN_BIZ_NO_MAX}
                placeholder="예: 12-3456789"
                invalid={!!errors.foreignBizNo}
              />
            </div>
            {warning}
          </Field>
        )}
      </Section>
      {props.mode === "edit" && <ActiveSection what="거래처" initial={v.active} error={errors.active} />}
    </>
  );
}
