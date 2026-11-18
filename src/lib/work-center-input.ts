import { z } from "zod";
import { activeFlag, firstErrors, formValues, text } from "./input-common";
import { PROCESS_CODE } from "./process-input";
import {
  WORK_CENTER_FIELDS,
  type WorkCenterErrors,
  type WorkCenterField,
  type WorkCenterValues,
} from "./work-center-fields";

// 작업장 등록 · 수정의 입력 검사 — 작업장코드 · 작업장명 1 ~ 50자 · 공정 · 비고 0 ~ 500자 · 사용 여부. 서버가 한다.
// 코드와 공정은 등록할 때만 받고, 등록한 뒤 바뀌지 않는다.

export {
  WORK_CENTER_FIELDS,
  type WorkCenterErrors,
  type WorkCenterField,
  type WorkCenterValues,
} from "./work-center-fields";

/** 작업장코드의 꼴 — 영문 대문자로 시작, 대문자 · 숫자 · - 2 ~ 10자, - 는 끝에 오거나 둘 잇달 수 없다(DB 의 work_centers_code_format 과 같다). */
export const WORK_CENTER_CODE = /^(?=.{2,10}$)[A-Z](-?[A-Z0-9])+$/;

export type NewWorkCenterInput = { code: string; name: string; process: string; note: string };
export type WorkCenterUpdateInput = { name: string; note: string; active: boolean };

export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: WorkCenterErrors };

const custom = (ctx: { value: string; issues: unknown[] }, message: string) =>
  (ctx.issues as { code: string; input: string; message: string }[]).push({
    code: "custom",
    input: ctx.value,
    message,
  });

/** 코드 — 등록할 때만. 소문자를 대문자로 바꾸지 않는다 — 꼴을 알린다. */
const code = z
  .string({ error: "작업장코드를 넣으세요" })
  .trim()
  .check((ctx) => {
    if (!ctx.value) custom(ctx, "작업장코드를 넣으세요");
    else if (!WORK_CENTER_CODE.test(ctx.value))
      custom(ctx, "영문 대문자로 시작해 대문자 · 숫자 · - 2 ~ 10자입니다 — 예: DA-1, WB-L2");
  });

/** 공정 — 등록할 때만. 공정코드의 꼴만 본다(있는지 · 사용 중인지는 DB 를 보는 쪽이 본다). */
const processCode = z
  .string({ error: "공정을 고르세요" })
  .trim()
  .check((ctx) => {
    if (!ctx.value) custom(ctx, "공정을 고르세요");
    else if (!PROCESS_CODE.test(ctx.value)) custom(ctx, "없는 공정입니다 — 목록에서 고르세요");
  });

const name = text("작업장명", 1, 50);
const note = text("비고", 0, 500);

const createSchema = z.object({ code, name, process: processCode, note });
const updateSchema = z.object({ name, note, active: activeFlag });

export function workCenterValues(form: FormData): WorkCenterValues {
  return formValues(form, WORK_CENTER_FIELDS);
}

function parse<T>(schema: z.ZodType<T>, values: WorkCenterValues): Parsed<T> {
  // 비고 칸이 오지 않으면 빈 비고다.
  const result = schema.safeParse({ ...values, note: values.note ?? "" });
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, errors: firstErrors<WorkCenterField>(result.error) };
}

/** 등록 — 코드 · 작업장명 · 공정 · 비고. 새 작업장은 사용 중으로 등록된다. */
export const parseNewWorkCenter = (values: WorkCenterValues): Parsed<NewWorkCenterInput> => parse(createSchema, values);

/** 수정 — 작업장명 · 비고 · 사용 여부. 코드 · 공정은 받아도 무시한다. */
export const parseWorkCenterUpdate = (values: WorkCenterValues): Parsed<WorkCenterUpdateInput> =>
  parse(updateSchema, values);
