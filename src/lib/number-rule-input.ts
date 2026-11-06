import { z } from "zod";
import { activeFlag, firstErrors, formValues, text } from "./input-common";
import { eul } from "./josa";
import { MADE_ITEM_TYPES, type MadeItemType } from "./master-codes";
import {
  DATE_FORMATS,
  NONE,
  NUMBER_RULE_FIELDS,
  RULE_CODE,
  SEPARATORS,
  SEQ_DIGITS_MAX,
  SEQ_DIGITS_MIN,
  type DateFormat,
  type NumberRuleErrors,
  type NumberRuleField,
  type NumberRuleValues,
  type Separator,
} from "./number-rule-fields";

// LOT 번호 규칙의 입력 검사(조각 「재고 수불」 설계 ③ 「번호 규칙」, ADR 0016). 서버가 한다 — 화면을 건너뛴 요청도 같은 규칙으로 거절한다.
// 규칙의 겹침 · 기본 규칙을 옮기는 것 · 등록 상한은 DB 를 봐야 해서 src/db/number-rules.ts 가 이어서 본다.

export {
  NUMBER_RULE_FIELDS,
  type NumberRuleErrors,
  type NumberRuleField,
  type NumberRuleValues,
} from "./number-rule-fields";

export type NumberRuleInput = {
  name: string;
  prefix: string;
  separator: Separator;
  dateFormat: DateFormat;
  seqDigits: number;
  /** 이 규칙을 기본으로 쓰는 유형 — 반제품 · 완제품 가운데 하나, 없으면 null. */
  defaultFor: MadeItemType | null;
};
export type NewNumberRuleInput = NumberRuleInput & { code: string };
export type NumberRuleUpdateInput = NumberRuleInput & { active: boolean };

const custom = (ctx: { value: string; issues: unknown[] }, message: string) =>
  (ctx.issues as { code: string; input: string; message: string }[]).push({
    code: "custom",
    input: ctx.value,
    message,
  });

/** 코드 — 등록할 때만. 소문자를 대문자로 바꾸지 않는다 — 꼴을 알린다. */
const code = z
  .string({ error: "코드를 넣으세요" })
  .trim()
  .check((ctx) => {
    if (!ctx.value) custom(ctx, "코드를 넣으세요");
    else if (!RULE_CODE.test(ctx.value))
      custom(ctx, "영문 대문자로 시작해 대문자 · 숫자 · 밑줄(_) 2 ~ 20자입니다 — 예: LOT_FG");
  });

/** 머리 — 영문 대문자 · 숫자 0 ~ 6자. 비우면 머리가 없다. */
const prefix = z
  .string()
  .trim()
  .check((ctx) => {
    if (!/^[A-Z0-9]{0,6}$/.test(ctx.value)) custom(ctx, "머리는 영문 대문자 · 숫자 6자까지입니다 — 비워도 됩니다");
  });

/** 닫힌 목록에서 고르는 칸 — 「없음」은 `NONE`(또는 빈 글자)으로 온다. */
const pick = <T extends string>(list: readonly { value: T }[], label: string) =>
  z
    .string({ error: `${eul(label)} 고르세요` })
    .transform((s) => (s === NONE ? "" : s))
    .check((ctx) => {
      if (!list.some((o) => o.value === ctx.value)) custom(ctx, `${eul(label)} 목록에서 고르세요`);
    })
    .transform((s) => s as T);

const seqDigits = z
  .string({ error: "일련 자릿수를 고르세요" })
  .trim()
  .check((ctx) => {
    const n = Number(ctx.value);
    if (!/^[0-9]$/.test(ctx.value) || n < SEQ_DIGITS_MIN || n > SEQ_DIGITS_MAX)
      custom(ctx, `일련 자릿수는 ${SEQ_DIGITS_MIN} ~ ${SEQ_DIGITS_MAX} 가운데 하나입니다`);
  })
  .transform(Number);

const defaultFor = z
  .string()
  .transform((s) => (s === NONE ? "" : s))
  .check((ctx) => {
    if (ctx.value !== "" && !(MADE_ITEM_TYPES as readonly string[]).includes(ctx.value))
      custom(ctx, "기본으로 쓰는 유형은 반제품 · 완제품 가운데 하나이거나 없음입니다");
  })
  .transform((s) => (s === "" ? null : (s as MadeItemType)));

const common = {
  name: text("이름", 1, 50),
  prefix,
  separator: pick(SEPARATORS, "구분자"),
  dateFormat: pick(DATE_FORMATS, "날짜 꼴"),
  seqDigits,
  defaultFor,
};

const createSchema = z.object({ code, ...common });
const updateSchema = z.object({ ...common, active: activeFlag });

export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: NumberRuleErrors };

export function numberRuleValues(form: FormData): NumberRuleValues {
  return formValues(form, NUMBER_RULE_FIELDS);
}

// 머리 · 기본 유형은 비워도 된다 — 칸이 오지 않으면 빈 칸이다.
const raw = (values: NumberRuleValues) => ({
  ...values,
  prefix: values.prefix ?? "",
  defaultFor: values.defaultFor ?? "",
});

function parse<T>(schema: z.ZodType<T>, values: NumberRuleValues): Parsed<T> {
  const result = schema.safeParse(raw(values));
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, errors: firstErrors<NumberRuleField>(result.error) };
}

/** 등록 — 코드를 받는다. 새 규칙은 사용 중으로 등록된다. */
export const parseNewNumberRule = (values: NumberRuleValues): Parsed<NewNumberRuleInput> =>
  parse(createSchema, values) as Parsed<NewNumberRuleInput>;

/** 수정 — 코드는 바꾸지 않는다. 사용 여부를 받는다. */
export const parseNumberRuleUpdate = (values: NumberRuleValues): Parsed<NumberRuleUpdateInput> =>
  parse(updateSchema, values) as Parsed<NumberRuleUpdateInput>;
