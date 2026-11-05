import { z } from "zod";
import { MINOR_CODE, type CodeErrors, type CodeField, type CodeValues } from "./code-fields";
import { firstErrors } from "./input-common";

// 단위 사양의 입력 검사(조각 「재고 수불」 설계 ③ 「단위 사양」, ADR 0017). 서버가 한다.
// 기준 단위가 정말 「자신이 기준인 단위」인지는 DB 를 봐야 해서 src/db/codes.ts 가 이어서 본다 — DB 의 참조도 막는다.

export type UnitSpecInput = { baseUnit: string; factor: number; decimals: number };

/** 배수의 꼴 — 0 보다 큰 수, 정수 열두 자리 · 소수 여섯째 자리까지(DB 는 numeric(18,6)). */
const FACTOR = /^[0-9]{1,12}(\.[0-9]{1,6})?$/;

/** 소수 자릿수 — 0 ~ 3. 수불 수량이 이 자리까지만 들어간다. */
const decimals = z
  .string({ error: "소수 자릿수를 고르세요" })
  .trim()
  .check((ctx) => {
    if (!/^[0-3]$/.test(ctx.value))
      ctx.issues.push({ code: "custom", input: ctx.value, message: "소수 자릿수는 0 ~ 3 가운데 하나입니다" });
  })
  .transform(Number);

const decimalsSchema = z.object({ decimals });

function newSpecSchema(code: string) {
  return z
    .object({
      // 비우면 이 단위 자신이 기준이다.
      baseUnit: z
        .string()
        .trim()
        .default("")
        .check((ctx) => {
          if (ctx.value && !MINOR_CODE.test(ctx.value))
            ctx.issues.push({ code: "custom", input: ctx.value, message: "목록에서 기준 단위를 고르세요" });
        })
        .transform((v) => v || code),
      factor: z.string().trim().default(""),
      decimals,
    })
    .transform((v, ctx) => {
      const self = v.baseUnit === code;
      if (self) {
        // 자신이 기준이면 배수는 1 이다 — 비워도 1.
        if (v.factor && v.factor !== "1" && Number(v.factor) !== 1)
          ctx.issues.push({
            code: "custom",
            path: ["factor"],
            input: v.factor,
            message: "이 단위 자신이 기준이면 배수는 1 입니다",
          });
        return { baseUnit: code, factor: 1, decimals: v.decimals };
      }
      if (!v.factor) ctx.issues.push({ code: "custom", path: ["factor"], input: v.factor, message: "배수를 넣으세요" });
      else if (!FACTOR.test(v.factor) || Number(v.factor) <= 0)
        ctx.issues.push({
          code: "custom",
          path: ["factor"],
          input: v.factor,
          message: "0 보다 큰 수, 소수 여섯째 자리까지 — 예: 1000 · 0.001",
        });
      return { baseUnit: v.baseUnit, factor: Number(v.factor), decimals: v.decimals };
    });
}

export type ParsedSpec<T> = { ok: true; value: T } | { ok: false; errors: CodeErrors };

function pick(values: CodeValues, fields: readonly CodeField[]): Record<string, string | undefined> {
  return Object.fromEntries(fields.map((f) => [f, values[f]]));
}

/** 새 단위의 사양 — 기준 단위(비우면 자신) · 배수 · 소수 자릿수. code 는 새 단위의 코드다. */
export function parseNewUnitSpec(values: CodeValues, code: string): ParsedSpec<UnitSpecInput> {
  const result = newSpecSchema(code).safeParse(pick(values, ["baseUnit", "factor", "decimals"]));
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, errors: firstErrors<CodeField>(result.error) };
}

/** 수정 — 소수 자릿수만. 기준 단위 · 배수는 등록 뒤 바꾸지 않는다(ADR 0017). */
export function parseUnitDecimals(values: CodeValues): ParsedSpec<{ decimals: number }> {
  const result = decimalsSchema.safeParse(pick(values, ["decimals"]));
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, errors: firstErrors<CodeField>(result.error) };
}
