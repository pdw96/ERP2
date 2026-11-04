import { z } from "zod";
import { activeFlag, firstErrors as firstOf, formValues, text, toggle } from "./input-common";
import { eul, eun } from "./josa";
import { ITEM_FIELDS, NOTE_MAX, type ItemErrors, type ItemField, type ItemValues } from "./item-fields";
import { ITEM_TYPES, PROC_TYPES } from "./master-codes";

// 품목 등록 · 수정의 입력 검사(설계 ③). 서버가 한다 — 화면의 검사를 건너뛴 요청도 같은 규칙으로 거절한다.
// 단위 · 분류가 공통코드에 있고 「사용 안 함」이 아닌지는 DB 를 봐야 해서 src/db/items.ts 가 이어서 본다.

export {
  ITEM_CLASSES,
  ITEM_FIELDS,
  NOTE_MAX,
  type ItemClassField,
  type ItemErrors,
  type ItemField,
  type ItemValues,
} from "./item-fields";

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
  cls1: string | null;
  cls2: string | null;
  cls3: string | null;
  note: string;
};
export type NewItemInput = ItemInput & { itemType: "RM" | "SF" | "FG" };
export type ItemUpdateInput = ItemInput & { active: boolean };

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

// 분류 — 비우면 없음(null). 고른 값이 공통코드에 있는지는 DB 를 본다.
const itemClass = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^$|^[A-Z0-9][A-Z0-9_]{0,19}$/, { error: `${eul(label)} 목록에서 고르세요` })
    .transform((s) => s || null);

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
  cls1: itemClass("대분류"),
  cls2: itemClass("중분류"),
  cls3: itemClass("소분류"),
  note: text("비고", 0, NOTE_MAX),
};

const createSchema = z.object({
  ...common,
  itemType: z.enum(codeOf(ITEM_TYPES), { error: "품목 유형을 고르세요" }),
});

const updateSchema = z.object({
  ...common,
  active: activeFlag,
});

export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: ItemErrors };

/** 화면이 보낸 칸을 글자 그대로 모은다 — 아는 칸만, 글자가 아닌 값(파일 등)은 버린다. */
export function itemValues(form: FormData): ItemValues {
  return formValues(form, ITEM_FIELDS);
}

function raw(values: ItemValues) {
  return {
    ...values,
    spec: values.spec ?? "",
    // 분류 · 비고는 비워도 된다 — 칸이 오지 않으면 빈 칸이다(PR H 앞의 화면 · 시트도 그대로 저장된다).
    cls1: values.cls1 ?? "",
    cls2: values.cls2 ?? "",
    cls3: values.cls3 ?? "",
    note: values.note ?? "",
    // 끈 체크 상자는 칸이 오지 않는다.
    inspectIn: values.inspectIn ?? "off",
    inspectOut: values.inspectOut ?? "off",
  };
}

const firstErrors = (error: z.ZodError): ItemErrors => firstOf<ItemField>(error);

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
