import { describe, expect, it } from "vitest";
import { parseNewUnitSpec, parseUnitDecimals } from "@/lib/unit-input";

// 단위 사양의 입력 검사(ADR 0017) — 서버가 DB 에 묻기 전에 보는 꼴. 기준이 정말 기준 단위인지는 DB 시험(units.test.ts)이 본다.

describe("새 단위의 사양", () => {
  it("다른 단위가 기준이면 배수를 숫자로", () => {
    expect(parseNewUnitSpec({ baseUnit: "G", factor: "1000", decimals: "3" }, "KG")).toEqual({
      ok: true,
      value: { baseUnit: "G", factor: 1000, decimals: 3 },
    });
  });

  it.each([
    ["비움", { baseUnit: "", factor: "" }],
    ["자신을 고름", { baseUnit: "BOX", factor: "1" }],
    ["보내지 않음", {}],
    ["앞뒤 빈칸", { baseUnit: " ", factor: " 1.000 " }],
  ])("기준이 %s 이면 자신 · 배수 1", (_, v) => {
    expect(parseNewUnitSpec({ ...v, decimals: "0" }, "BOX")).toEqual({
      ok: true,
      value: { baseUnit: "BOX", factor: 1, decimals: 0 },
    });
  });

  it.each(["999999999.999999", "123456789.123456", "0.000001"])(
    "배수 %s — 정수 아홉 자리 · 소수 여섯째 자리까지는 값이 바뀌지 않고 그대로 남는다",
    (factor) => {
      const r = parseNewUnitSpec({ baseUnit: "G", factor, decimals: "0" }, "BOX");
      expect(r).toMatchObject({ ok: true });
      if (r.ok) expect(r.value.factor.toFixed(6)).toBe(Number(factor).toFixed(6));
      if (r.ok) expect(String(r.value.factor)).toBe(factor);
    },
  );

  it.each(["0", "1", "2", "3"])("자릿수 %s", (d) => {
    expect(parseNewUnitSpec({ decimals: d }, "BOX")).toMatchObject({ ok: true, value: { decimals: Number(d) } });
  });

  it.each([
    [{ decimals: "4" }, "decimals"],
    [{ decimals: "1.5" }, "decimals"],
    [{ decimals: "-1" }, "decimals"],
    [{}, "decimals"],
    [{ baseUnit: "G", factor: "", decimals: "0" }, "factor"],
    [{ baseUnit: "G", factor: "0", decimals: "0" }, "factor"],
    [{ baseUnit: "G", factor: "0.0000001", decimals: "0" }, "factor"],
    [{ baseUnit: "G", factor: "1e3", decimals: "0" }, "factor"],
    [{ baseUnit: "G", factor: "1,000", decimals: "0" }, "factor"],
    [{ baseUnit: "G", factor: "1234567890123", decimals: "0" }, "factor"],
    // 정수 열 자리부터는 받지 않는다 — 소수 여섯째 자리와 합쳐 유효숫자 열다섯 자리를 넘으면 값이 바뀐다(PR A 리뷰 1회차).
    [{ baseUnit: "G", factor: "1234567890", decimals: "0" }, "factor"],
    [{ baseUnit: "G", factor: "123456789012.123456", decimals: "0" }, "factor"],
    [{ baseUnit: "G", factor: "999999999999.999999", decimals: "0" }, "factor"],
    [{ baseUnit: "", factor: "0.5", decimals: "0" }, "factor"],
    [{ baseUnit: "g", factor: "1", decimals: "0" }, "baseUnit"],
  ])("%o 는 %s 칸을 거절한다", (v, field) => {
    const r = parseNewUnitSpec(v, "BOX");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors)).toContain(field);
  });
});

describe("수정 — 자릿수만", () => {
  it("0 ~ 3 은 받는다", () => {
    expect(parseUnitDecimals({ decimals: "2" })).toEqual({ ok: true, value: { decimals: 2 } });
  });

  it.each(["", "4", "a"])("「%s」은 거절한다", (d) => {
    expect(parseUnitDecimals({ decimals: d })).toMatchObject({ ok: false, errors: { decimals: expect.any(String) } });
  });
});
