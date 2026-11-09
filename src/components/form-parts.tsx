import Link from "next/link";
import type { ReactNode } from "react";
import { eun } from "@/lib/josa";

// 기준정보 입력 화면(품목 · 창고 · 거래처)의 칸 부품. 검사는 서버가 하고(설계 ②), 화면은 거절된 칸과 까닭을 칸 옆과
// 맨 위 목록에 보인다. 칸의 id 는 `f-<칸>`, 까닭의 id 는 `e-<칸>` — 맨 위 목록의 링크가 그 칸으로 간다.

export const inputClass = (invalid: boolean) =>
  `w-full min-w-0 rounded border bg-white px-3 py-2 ${invalid ? "border-red-700" : "border-rule"} focus-visible:outline-machine`;

/** 맨 위의 「저장하지 않았습니다」 — 칸마다의 까닭(화면의 칸 순서대로)과 저장 자체를 못 한 까닭. */
export function ErrorSummary({
  errors,
  formError,
}: {
  errors: readonly (readonly [field: string, label: string, message: string])[];
  formError?: string;
}) {
  if (errors.length === 0 && !formError) return null;
  return (
    <div role="alert" className="mb-6 border-l-4 border-red-700 bg-white px-5 py-4">
      <p className="font-semibold">저장하지 않았습니다.</p>
      {formError && <p className="mt-1 text-sm">{formError}</p>}
      {errors.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-sm">
          {errors.map(([field, label, message]) => (
            <li key={field}>
              <a href={`#f-${field}`} className="underline underline-offset-2">
                {label}
              </a>{" "}
              — {message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 「저장」 · 「취소」. */
export function FormActions({ pending, cancelHref }: { pending: boolean; cancelHref: string }) {
  return (
    <div className="mt-8 flex flex-wrap items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-machine px-6 py-2.5 font-semibold text-white hover:bg-machine-deep disabled:opacity-60"
      >
        {pending ? "저장 중…" : "저장"}
      </button>
      <Link href={cancelHref} className="px-3 py-2.5 text-muted underline underline-offset-4 hover:text-ink">
        취소
      </Link>
    </div>
  );
}

export function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
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

export function Field({
  field,
  label,
  error,
  hint,
  as,
  hideLabel,
  children,
}: {
  field: string;
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

export function Input({
  field,
  defaultValue,
  invalid,
  suffix,
  ...rest
}: {
  field: string;
  defaultValue?: string;
  invalid: boolean;
  suffix?: string;
  maxLength?: number;
  inputMode?: "numeric" | "decimal";
  placeholder?: string;
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

/** 사용 여부 — 수정 화면에만 있다. 지우는 길은 없다. */
export function ActiveSection({
  what,
  initial,
  error,
  note,
}: {
  what: string;
  initial?: string;
  error?: string;
  /** 기본 안내를 바꿀 때 — 예: 공통코드의 값 표는 「사용 안 함」까지 늘 보인다. */
  note?: string;
}) {
  return (
    <Section
      title="사용 여부"
      note={note ?? `「사용 안 함」인 ${eun(what)} 목록의 기본 보기와 새 입력에서 빠집니다. 지우는 길은 없습니다.`}
    >
      <Field field="active" label="사용 여부" error={error} as="fieldset" hideLabel>
        <div className="flex flex-wrap gap-2">
          <ActiveChoice value="Y" initial={initial}>
            사용
          </ActiveChoice>
          <ActiveChoice value="N" initial={initial}>
            사용 안 함
          </ActiveChoice>
        </div>
      </Field>
    </Section>
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

/** 바꿀 수 없는 값(코드 · 품목 유형) — 보이기만 하고 보내지 않는다. */
export function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 font-semibold">{label}</p>
      <p className="rounded border border-dashed border-rule px-3 py-2 font-mono">{value}</p>
      <span className="sr-only">바꿀 수 없음</span>
    </div>
  );
}

/** 체크 상자 하나 — 켜면 "on" 을 보낸다. 값을 화면이 쥐면 checked · onChange 를, 아니면 defaultChecked 를 쓴다. */
export function Check({
  name,
  error,
  children,
  ...state
}: {
  name: string;
  error?: string;
  children: ReactNode;
} & ({ checked: boolean; onChange: (v: boolean) => void } | { defaultChecked: boolean })) {
  const controlled =
    "checked" in state
      ? { checked: state.checked, onChange: (e: { target: { checked: boolean } }) => state.onChange(e.target.checked) }
      : { defaultChecked: state.defaultChecked };
  return (
    <div id={`f-${name}`}>
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          name={name}
          aria-invalid={!!error || undefined}
          className="size-5 accent-machine"
          {...controlled}
        />
        {children}
      </label>
      {error && <p className="mt-1 text-sm font-semibold text-red-700">{error}</p>}
    </div>
  );
}

/** 고르기 단추 하나 — 라디오를 숨기고 이름표를 단추처럼 보인다(유형 · 조달구분 · 구분자 따위). */
export function Choice({
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
