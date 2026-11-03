import { z } from "zod";
import { eul, eun } from "./josa";
import { ITEM_FIELDS, type ItemErrors, type ItemField, type ItemValues } from "./item-fields";
import { ITEM_TYPES, PROC_TYPES } from "./master-codes";

// 품목 등록 · 수정의 입력 검사(설계 ③). 서버가 한다 — 화면의 검사를 건너뛴 요청도 같은 규칙으로 거절한다.
// 단위가 공통코드에 있고 「사용 안 함」이 아닌지는 DB 를 봐야 해서 src/db/items.ts 가 이어서 본다.

export { ITEM_FIELDS, type ItemErrors, type ItemField, type ItemValues } from "./item-fields";

export type ItemInput = {
  procurement: "BUY" | "MAKE";
  name: string;
  spec: string;
  unit: string;
  inspectIn: boolean;
  inspectOut: boolean;
  leadTimeDays: number;
  safetyStock: number;
  minLot: number;
  lotMultiple: number;
};
export type NewItemInput = ItemInput & { itemType: "RM" | "SF" | "FG" };
export type ItemUpdateInput = ItemInput & { active: boolean };

// DB 의 char_length 와 같게 글자(코드 포인트)로 센다.
const length = (s: string) => Array.from(s).length;

const text = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .check((ctx) => {
      if (length(ctx.value) < min)
        ctx.issues.push({ code: "custom", input: ctx.value, message: `${eul(label)} 넣으세요` });
      else if (length(ctx.value) > max)
        ctx.issues.push({ code: "custom", input: ctx.value, message: `${eun(label)} ${max}자까지입니다` });
    });

// 켬 · 끔 — 체크 상자는 켜면 "on" 을 보내고 끄면 아무것도 보내지 않는다.
const toggle = z.enum(["on", "off"], { error: "켬 · 끔 가운데 하나여야 합니다" }).transform((v) => v === "on");

// 수량 — 품목의 단위로 0 이상, 소수 셋째 자리까지. 천 단위 쉼표는 지우고 읽는다.
// 위로는 DB 칸(numeric(12,3))이 담는 999,999,999.999 까지.
const quantity = (label: string) =>
  z
    .string()
    .transform((s) => s.replace(/[,\s]/g, ""))
    .check((ctx) => {
      const s = ctx.value;
      const fail = (message: string) => ctx.issues.push({ code: "custom", input: s, message });
      if (s === "") fail(`${eul(label)} 넣으세요 — 없으면 0`);
      else if (/^-/.test(s)) fail(`${eun(label)} 0 이상입니다`);
      else if (!/^\d+(\.\d+)?$/.test(s)) fail(`${eun(label)} 숫자로 넣으세요`);
      else if (/\.\d{4,}$/.test(s)) fail(`${eun(label)} 소수 셋째 자리까지입니다`);
      else if (/^\d{10,}/.test(s.replace(/^0+(?=\d)/, ""))) fail(`${eun(label)} 999,999,999.999 까지입니다`);
    })
    .transform(Number);

const leadTime = z
  .string()
  .trim()
  .check((ctx) => {
    const s = ctx.value;
    if (!/^\d{1,3}$/.test(s) || Number(s) > 365)
      ctx.issues.push({ code: "custom", input: s, message: "리드타임은 0 ~ 365 사이의 정수(일)입니다" });
  })
  .transform(Number);

const codeOf = <T extends readonly { code: string }[]>(list: T) => list.map((t) => t.code) as [string, ...string[]];

const common = {
  procurement: z.enum(codeOf(PROC_TYPES), { error: "조달구분을 고르세요" }),
  name: text("품명", 1, 100),
  spec: text("규격", 0, 100),
  unit: z.string().regex(/^[A-Z0-9][A-Z0-9_]{0,19}$/, { error: "단위를 고르세요" }),
  inspectIn: toggle,
  inspectOut: toggle,
  leadTimeDays: leadTime,
  safetyStock: quantity("안전재고"),
  minLot: quantity("최소 발주 · 생산량"),
  lotMultiple: quantity("발주 · 생산 배수"),
};

const createSchema = z.object({
  ...common,
  itemType: z.enum(codeOf(ITEM_TYPES), { error: "품목 유형을 고르세요" }),
});

const updateSchema = z.object({
  ...common,
  active: z.enum(["Y", "N"], { error: "사용 여부를 고르세요" }).transform((v) => v === "Y"),
});

export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: ItemErrors };

/** 화면이 보낸 칸을 글자 그대로 모은다 — 아는 칸만, 글자가 아닌 값(파일 등)은 버린다. */
export function itemValues(form: FormData): ItemValues {
  const values: ItemValues = {};
  for (const field of ITEM_FIELDS) {
    const v = form.get(field);
    if (typeof v === "string") values[field] = v;
  }
  return values;
}

function raw(values: ItemValues) {
  return {
    ...values,
    spec: values.spec ?? "",
    // 끈 체크 상자는 칸이 오지 않는다.
    inspectIn: values.inspectIn ?? "off",
    inspectOut: values.inspectOut ?? "off",
  };
}

function firstErrors(error: z.ZodError): ItemErrors {
  const errors: ItemErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0] as ItemField;
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}

/** 등록 — 유형을 받는다. 코드는 받지 않는다(서버가 붙인다). */
export function parseNewItem(values: ItemValues): Parsed<NewItemInput> {
  const result = createSchema.safeParse(raw(values));
  return result.success
    ? { ok: true, value: result.data as NewItemInput }
    : { ok: false, errors: firstErrors(result.error) };
}

/** 수정 — 코드와 유형은 받지 않는다(등록 뒤 바뀌지 않는다). 사용 여부를 받는다. */
export function parseItemUpdate(values: ItemValues): Parsed<ItemUpdateInput> {
  const result = updateSchema.safeParse(raw(values));
  return result.success
    ? { ok: true, value: result.data as ItemUpdateInput }
    : { ok: false, errors: firstErrors(result.error) };
}
