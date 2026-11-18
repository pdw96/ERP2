import { z } from "zod";
import { MINOR_CODE } from "./code-fields";
import {
  DEFECT_TYPE_FIELDS,
  type DefectTypeErrors,
  type DefectTypeField,
  type DefectTypeValues,
} from "./defect-type-fields";
import { activeFlag, firstErrors, formValues, text } from "./input-common";
import { PROCESS_CODE } from "./process-input";

// 불량 유형 등록 · 수정의 입력 검사 — 불량유형코드 · 불량유형명 1 ~ 50자 · 대분류 · 발생 공정(0개 이상) · 비고 0 ~ 500자 · 사용 여부. 서버가 한다.
// 코드는 등록할 때만 받고, 등록한 뒤 바뀌지 않는다.

export {
  DEFECT_CLS_GROUP,
  DEFECT_TYPE_FIELDS,
  type DefectTypeErrors,
  type DefectTypeField,
  type DefectTypeValues,
} from "./defect-type-fields";

/** 불량유형코드의 꼴 — 영문 대문자로 시작, 대문자 · 숫자 · - 2 ~ 10자, - 는 끝에 오거나 둘 잇달 수 없다(DB 의 defect_types_code_format 과 같다). */
export const DEFECT_TYPE_CODE = /^(?=.{2,10}$)[A-Z](-?[A-Z0-9])+$/;

export type NewDefectTypeInput = { code: string; name: string; cls: string; processes: string[]; note: string };
export type DefectTypeUpdateInput = { name: string; cls: string; processes: string[]; note: string; active: boolean };

export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: DefectTypeErrors };

const custom = (ctx: { value: string; issues: unknown[] }, message: string) =>
  (ctx.issues as { code: string; input: string; message: string }[]).push({
    code: "custom",
    input: ctx.value,
    message,
  });

/** 코드 — 등록할 때만. 소문자를 대문자로 바꾸지 않는다 — 꼴을 알린다. */
const code = z
  .string({ error: "불량유형코드를 넣으세요" })
  .trim()
  .check((ctx) => {
    if (!ctx.value) custom(ctx, "불량유형코드를 넣으세요");
    else if (!DEFECT_TYPE_CODE.test(ctx.value))
      custom(ctx, "영문 대문자로 시작해 대문자 · 숫자 · - 2 ~ 10자입니다 — 예: VOID, WIRE-BRK");
  });

/** 대분류 — 꼴만 본다(있는지 · 사용 중인지는 DB 를 보는 쪽이 본다). */
const cls = z
  .string({ error: "대분류를 고르세요" })
  .trim()
  .check((ctx) => {
    if (!ctx.value) custom(ctx, "대분류를 고르세요");
    else if (!MINOR_CODE.test(ctx.value)) custom(ctx, "대분류를 목록에서 고르세요");
  });

/** 발생 공정 — 빈 것은 버리고 겹침은 하나로(체크 칸을 조작해 같은 공정을 두 번 보내도 거절하지 않는다). 공정코드의 꼴만 본다. */
const processList = z.array(z.string()).transform((list, ctx) => {
  const cleaned = [...new Set(list.map((p) => p.trim()).filter(Boolean))];
  if (cleaned.some((p) => !PROCESS_CODE.test(p)))
    ctx.issues.push({ code: "custom", input: list, message: "없는 공정입니다 — 목록에서 고르세요" });
  return cleaned;
});

const name = text("불량유형명", 1, 50);
const note = text("비고", 0, 500);

const createSchema = z.object({ code, name, cls, processes: processList, note });
const updateSchema = z.object({ name, cls, processes: processList, note, active: activeFlag });

export function defectTypeValues(form: FormData): DefectTypeValues {
  const fields = formValues(
    form,
    DEFECT_TYPE_FIELDS.filter((f): f is Exclude<DefectTypeField, "processes"> => f !== "processes"),
  );
  const processes = form.getAll("processes").filter((v): v is string => typeof v === "string");
  return processes.length ? { ...fields, processes } : fields;
}

function parse<T>(schema: z.ZodType<T>, values: DefectTypeValues): Parsed<T> {
  // 비고 칸이 오지 않으면 빈 비고, 공정이 오지 않으면 공통이다.
  const result = schema.safeParse({ ...values, note: values.note ?? "", processes: values.processes ?? [] });
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, errors: firstErrors<DefectTypeField>(result.error) };
}

/** 등록 — 코드 · 불량유형명 · 대분류 · 발생 공정 · 비고. 새 불량 유형은 사용 중으로 등록된다. */
export const parseNewDefectType = (values: DefectTypeValues): Parsed<NewDefectTypeInput> => parse(createSchema, values);

/** 수정 — 불량유형명 · 대분류 · 발생 공정 · 비고 · 사용 여부. 코드는 받아도 무시한다. */
export const parseDefectTypeUpdate = (values: DefectTypeValues): Parsed<DefectTypeUpdateInput> =>
  parse(updateSchema, values);
