import { z } from "zod";
import { activeFlag, firstErrors, formValues, text } from "./input-common";
import { PROCESS_FIELDS, type ProcessErrors, type ProcessField, type ProcessValues } from "./process-fields";

// 공정 등록 · 수정의 입력 검사 — 공정코드 · 공정명 1 ~ 50자 · 비고 0 ~ 500자 · 사용 여부. 서버가 한다.
// 코드는 등록할 때만 받고, 등록한 뒤 바뀌지 않는다.

export { PROCESS_FIELDS, type ProcessErrors, type ProcessField, type ProcessValues } from "./process-fields";

/** 공정코드의 꼴 — 영문 대문자로 시작, 대문자 · 숫자 2 ~ 6자(DB 의 processes_code_format 과 같다). */
export const PROCESS_CODE = /^[A-Z][A-Z0-9]{1,5}$/;

export type NewProcessInput = { code: string; name: string; note: string };
export type ProcessUpdateInput = { name: string; note: string; active: boolean };

export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: ProcessErrors };

const custom = (ctx: { value: string; issues: unknown[] }, message: string) =>
  (ctx.issues as { code: string; input: string; message: string }[]).push({
    code: "custom",
    input: ctx.value,
    message,
  });

/** 코드 — 등록할 때만. 소문자를 대문자로 바꾸지 않는다 — 꼴을 알린다(번호 규칙과 같다). */
const code = z
  .string({ error: "공정코드를 넣으세요" })
  .trim()
  .check((ctx) => {
    if (!ctx.value) custom(ctx, "공정코드를 넣으세요");
    else if (!PROCESS_CODE.test(ctx.value))
      custom(ctx, "영문 대문자로 시작해 대문자 · 숫자 2 ~ 6자입니다 — 예: DA, WB");
  });

const name = text("공정명", 1, 50);
const note = text("비고", 0, 500);

const createSchema = z.object({ code, name, note });
const updateSchema = z.object({ name, note, active: activeFlag });

export function processValues(form: FormData): ProcessValues {
  return formValues(form, PROCESS_FIELDS);
}

function parse<T>(schema: z.ZodType<T>, values: ProcessValues): Parsed<T> {
  // 비고 칸이 오지 않으면 빈 비고다.
  const result = schema.safeParse({ ...values, note: values.note ?? "" });
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, errors: firstErrors<ProcessField>(result.error) };
}

/** 등록 — 코드 · 공정명 · 비고. 새 공정은 사용 중으로 등록된다. */
export const parseNewProcess = (values: ProcessValues): Parsed<NewProcessInput> => parse(createSchema, values);

/** 수정 — 공정명 · 비고 · 사용 여부. 코드는 받아도 무시한다. */
export const parseProcessUpdate = (values: ProcessValues): Parsed<ProcessUpdateInput> => parse(updateSchema, values);
