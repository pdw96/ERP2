import { describe, expect, it } from "vitest";
import { bomValues, formatLossRate, parseBom, parseLossRate } from "@/lib/bom-input";

// BOM 등록의 꼴 검사(조각 「BOM」 설계 ③) — DB 를 보지 않는 몫. DB 를 보는 몫은 src/db/__tests__/boms.test.ts.

describe("로스율", () => {
  it.each([
    ["", 0],
    ["0", 0],
    ["5", 500],
    ["5.2", 520],
    ["5.25", 525],
    ["99.99", 9999],
  ])("「%s」 → %i (백분의 일)", (text, value) => expect(parseLossRate(text)).toBe(value));

  it.each(["100", "-1", "5.125", "abc", "1e2", " 5"])("「%s」는 받지 않는다", (text) =>
    expect(parseLossRate(text)).toBeNull(),
  );

  it.each([
    [0, "0"],
    [300, "3"],
    [525, "5.25"],
    [520, "5.2"],
  ])("%i → 「%s」", (h, text) => expect(formatLossRate(h)).toBe(text));
});

describe("BOM 의 꼴", () => {
  const ok = {
    parent: "SF-0002 몰딩 완료품",
    baseQty: "1,000",
    lines: [{ child: "RM-0004", qty: "0.5", validFrom: "2026-01-01" }],
  };

  it("맞는 꼴 — 코드만 읽고, 쉼표를 받고, 빈 줄은 없는 줄이다", () => {
    const r = parseBom({ ...ok, lines: [{}, ...ok.lines, { child: " ", qty: "" }] });
    expect(r).toEqual({
      ok: true,
      value: {
        parentCode: "SF-0002",
        baseQty: BigInt(1000000),
        baseQtyDecimals: 0,
        version: "",
        lines: [
          {
            index: 1,
            childCode: "RM-0004",
            qty: BigInt(500),
            qtyDecimals: 1,
            lossRate: 0,
            validFrom: "2026-01-01",
            validTo: null,
            note: "",
          },
        ],
      },
    });
  });

  it.each([
    [{ baseQty: "" }, "header", "baseQty", "기준수량을 넣으세요"],
    [{ baseQty: "0" }, "header", "baseQty", "기준수량은 0 보다 큰 수입니다"],
    [{ baseQty: "1.2345" }, "header", "baseQty", "소수 셋째 자리까지"],
    [{ parent: "" }, "header", "parent", "부모 품목을 고르세요"],
  ] as const)("머리 %o — %s.%s", (over, part, field, message) => {
    const r = parseBom({ ...ok, ...over });
    expect(r.ok).toBe(false);
    expect(!r.ok && (r.errors[part] as Record<string, string>)[field]).toContain(message);
  });

  it("비고는 200자까지", () => {
    const r = parseBom({ ...ok, lines: [{ ...ok.lines[0], note: "가".repeat(201) }] });
    expect(!r.ok && r.errors.lines[0].note).toBe("비고는 200자까지입니다");
    expect(parseBom({ ...ok, lines: [{ ...ok.lines[0], note: "가".repeat(200) }] }).ok).toBe(true);
  });

  it("폼의 칸을 모은다 — 모르는 칸 · 너무 큰 차례는 버린다", () => {
    const form = new FormData();
    form.set("parent", "SF-0002");
    form.set("baseQty", "1000");
    form.set("version", "123");
    form.set("lines.0.child", "RM-0004");
    form.set("lines.0.qty", "0.5");
    form.set("lines.0.evil", "x");
    form.set("lines.999.child", "RM-0001");
    expect(bomValues(form)).toEqual({
      parent: "SF-0002",
      baseQty: "1000",
      version: "123",
      lines: [{ child: "RM-0004", qty: "0.5" }],
    });
  });
});
