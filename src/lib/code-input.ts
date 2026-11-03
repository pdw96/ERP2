import { z } from "zod";
import { CODE_FIELDS, MINOR_CODE, type CodeErrors, type CodeField, type CodeValues } from "./code-fields";
import { activeFlag, firstErrors, formValues, text } from "./input-common";

// 공통코드 값(Minor) 추가 · 수정의 입력 검사(설계 ③ — 코드 · 이름 · 정렬 순서 · 사용 여부). 서버가 한다.
// 묶음이 사용자 코드인지 · 묶음 안의 겹침 · 등록 상한은 DB 를 봐야 해서 src/db/codes.ts 가 이어서 본다.

export { CODE_FIELDS, type CodeErrors, type CodeField, type CodeValues } from "./code-fields";

export type NewCodeInput = { code: string; name: string; sortOrder: number };
export type CodeUpdateInput = { name: string; sortOrder: number; active: boolean };

/** 코드 — 등록할 때만. 앞뒤 빈칸만 지우고, 소문자를 대문자로 바꾸지 않는다 — 꼴을 알린다. */
const code = z
  .string({ error: "코드를 넣으세요" })
  .trim()
  .check((ctx) => {
    if (!ctx.value) ctx.issues.push({ code: "custom", input: ctx.value, message: "코드를 넣으세요" });
    else if (!MINOR_CODE.test(ctx.value))
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        message: "영문 대문자 · 숫자 · 밑줄(_) 20자까지이고, 대문자나 숫자로 시작합니다 — 예: BOX",
      });
  });

/** 정렬 순서 — 0 ~ 999 의 정수. 목록에서 작은 것이 위에 온다. */
const sortOrder = z
  .string({ error: "정렬 순서를 넣으세요" })
  .trim()
  .check((ctx) => {
    if (!ctx.value) ctx.issues.push({ code: "custom", input: ctx.value, message: "정렬 순서를 넣으세요" });
    else if (!/^[0-9]{1,3}$/.test(ctx.value))
      ctx.issues.push({ code: "custom", input: ctx.value, message: "0 ~ 999 의 정수를 넣으세요" });
  })
  .transform(Number);

const createSchema = z.object({ code, name: text("이름", 1, 50), sortOrder });
const updateSchema = z.object({ name: text("이름", 1, 50), sortOrder, active: activeFlag });

export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: CodeErrors };

export function codeValues(form: FormData): CodeValues {
  return formValues(form, CODE_FIELDS);
}

function parse<T>(schema: z.ZodType<T>, values: CodeValues): Parsed<T> {
  const result = schema.safeParse(values);
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, errors: firstErrors<CodeField>(result.error) };
}

/** 추가 — 코드 · 이름 · 정렬 순서. 새 값은 사용 중으로 더해진다. */
export const parseNewCode = (values: CodeValues): Parsed<NewCodeInput> => parse(createSchema, values);

/** 수정 — 이름 · 정렬 순서 · 사용 여부. 코드는 바꾸지 않는다. */
export const parseCodeUpdate = (values: CodeValues): Parsed<CodeUpdateInput> => parse(updateSchema, values);
