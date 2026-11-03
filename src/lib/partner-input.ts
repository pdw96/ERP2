import { z } from "zod";
import { activeFlag, firstErrors, formValues, text, toggle } from "./input-common";
import { PARTNER_FIELDS, type PartnerErrorKey, type PartnerErrors, type PartnerValues } from "./partner-fields";

// 거래처 등록 · 수정의 입력 검사(설계 ③ — 거래처명 1 ~ 100자, 매입처 · 매출처 하나 이상, 사업자등록번호는 비우거나
// 000-00-00000 꼴, 사용 여부). 서버가 한다. 코드는 받지 않는다 — 서버가 붙이고(BP-0001 꼴), 등록한 뒤 바뀌지 않는다.

export {
  PARTNER_ERROR_KEYS,
  PARTNER_FIELDS,
  type PartnerErrorKey,
  type PartnerErrors,
  type PartnerField,
  type PartnerValues,
} from "./partner-fields";

export type NewPartnerInput = { name: string; isSupplier: boolean; isCustomer: boolean; bizNo: string | null };
export type PartnerUpdateInput = NewPartnerInput & { active: boolean };

// 비우면 없음(null). 앞뒤 빈칸은 지운다.
const bizNo = z
  .string()
  .trim()
  .regex(/^$|^[0-9]{3}-[0-9]{2}-[0-9]{5}$/, { error: "사업자등록번호는 000-00-00000 꼴로 넣거나 비우세요" })
  .transform((s) => s || null);

const ROLE = "매입처 · 매출처 가운데 하나 이상을 고르세요";

const common = {
  name: text("거래처명", 1, 100),
  isSupplier: toggle,
  isCustomer: toggle,
  bizNo,
};
const createSchema = z.object(common);
const updateSchema = z.object({ ...common, active: activeFlag });

export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: PartnerErrors };

export function partnerValues(form: FormData): PartnerValues {
  return formValues(form, PARTNER_FIELDS);
}

// 끈 체크 상자는 칸이 오지 않는다. 사업자등록번호는 비워 둘 수 있다.
const raw = (values: PartnerValues) => ({
  ...values,
  isSupplier: values.isSupplier ?? "off",
  isCustomer: values.isCustomer ?? "off",
  bizNo: values.bizNo ?? "",
});

// 매입처 · 매출처 하나 이상 — 다른 칸이 틀려도 함께 알리게 칸의 검사와 따로 본다.
function parse<T>(schema: z.ZodType<T>, values: PartnerValues): Parsed<T> {
  const input = raw(values);
  const result = schema.safeParse(input);
  const byPath = result.success ? {} : firstErrors<PartnerErrorKey | "isSupplier" | "isCustomer">(result.error);
  // 매입처 · 매출처 칸의 거절은 「구분」 자리에 보인다.
  const { isSupplier, isCustomer, ...errors } = byPath;
  const role = isSupplier ?? isCustomer ?? (input.isSupplier !== "on" && input.isCustomer !== "on" ? ROLE : undefined);
  if (role) errors.role = role;
  if (result.success && !role) return { ok: true, value: result.data };
  return { ok: false, errors };
}

/** 등록 — 새 거래처는 사용 중으로 등록된다. */
export const parseNewPartner = (values: PartnerValues): Parsed<NewPartnerInput> => parse(createSchema, values);

/** 수정 — 코드는 받지 않는다. 사용 여부를 받는다. */
export const parsePartnerUpdate = (values: PartnerValues): Parsed<PartnerUpdateInput> => parse(updateSchema, values);
