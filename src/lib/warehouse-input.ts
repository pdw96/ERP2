import { z } from "zod";
import { activeFlag, firstErrors, formValues, text, toggle } from "./input-common";
import { WAREHOUSE_FIELDS, type WarehouseErrors, type WarehouseField, type WarehouseValues } from "./warehouse-fields";

// 창고 등록 · 수정의 입력 검사(설계 ③ — 창고명 1 ~ 50자, 불량창고 표시, 사용 여부). 서버가 한다.
// 불량창고(조각 「재고 수불」 PR B, ADR 0015) — 그 창고의 재고는 불량이다. 비우면 아니오.
// 코드는 받지 않는다 — 서버가 붙이고(WH-01 꼴), 등록한 뒤 바뀌지 않는다.

export { WAREHOUSE_FIELDS, type WarehouseErrors, type WarehouseField, type WarehouseValues } from "./warehouse-fields";

export type NewWarehouseInput = { name: string; isDefect: boolean };
export type WarehouseUpdateInput = { name: string; isDefect: boolean; active: boolean };

const createSchema = z.object({ name: text("창고명", 1, 50), isDefect: toggle });
const updateSchema = z.object({ name: text("창고명", 1, 50), isDefect: toggle, active: activeFlag });

export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: WarehouseErrors };

export function warehouseValues(form: FormData): WarehouseValues {
  return formValues(form, WAREHOUSE_FIELDS);
}

function parse<T>(schema: z.ZodType<T>, values: WarehouseValues): Parsed<T> {
  // 끈 체크 상자는 칸이 오지 않는다 — 불량창고가 아니다.
  const result = schema.safeParse({ ...values, isDefect: values.isDefect ?? "off" });
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, errors: firstErrors<WarehouseField>(result.error) };
}

/** 등록 — 창고명만. 새 창고는 사용 중으로 등록된다. */
export const parseNewWarehouse = (values: WarehouseValues): Parsed<NewWarehouseInput> => parse(createSchema, values);

/** 수정 — 창고명 · 사용 여부. */
export const parseWarehouseUpdate = (values: WarehouseValues): Parsed<WarehouseUpdateInput> =>
  parse(updateSchema, values);
