import { describe, expect, it } from "vitest";
import { COUNT_MAX_LINES, countValues, parseCount, type CountValues } from "@/lib/count-input";

// 재고 실사의 꼴 검사(조각 「재고 수불」 설계 ③ 「실사」) — DB 를 보지 않는 것만. DB 에 대는 검사는 src/db/__tests__/stock-counts.test.ts.
const base = (lines: CountValues["lines"], over: Partial<CountValues> = {}): CountValues => ({
  code: "",
  warehouse: "WH-01",
  baseline: "10",
  version: "",
  lines,
  ...over,
});

describe("parseCount", () => {
  it("맞는 꼴 — 실물 수량은 비워도 되고(작성 중), 쉼표를 읽는다", () => {
    const r = parseCount(
      base([
        { item: "RM-0003 금 와이어", lot: "NW-1", status: "AVAILABLE", counted: "1,995" },
        { item: "FG-0001", lot: "", status: "QC", counted: "" },
      ]),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({ code: null, warehouse: "WH-01", baseline: 10 });
    expect(r.value.lines.map((l) => [l.itemCode, l.status, l.counted])).toEqual([
      ["RM-0003", "AVAILABLE", BigInt(1995000)],
      ["FG-0001", "QC", null],
    ]);
  });

  it("더한 줄은 상태를 보내도 늘 가용이다(저자 판정)", () => {
    const r = parseCount(base([{ item: "SF-0001", status: "QC", counted: "1", added: "1" }]));
    expect(r.ok && r.value.lines[0]).toMatchObject({ status: "AVAILABLE", added: true });
  });

  it("품목 · LOT · 실물 수량이 모두 빈 줄은 없는 줄로 친다", () => {
    const r = parseCount(
      base([
        { item: "RM-0003", lot: "A", counted: "1" },
        { status: "AVAILABLE", added: "1" },
      ]),
    );
    expect(r.ok && r.value.lines).toHaveLength(1);
  });

  it.each([
    ["음수", "-1"],
    ["+ 를 붙임", "+1"],
    ["글자", "많음"],
    ["소수 넷째 자리", "1.0001"],
  ])("실물 수량 거절 — %s", (_, counted) => {
    const r = parseCount(base([{ item: "RM-0003", lot: "A", counted }]));
    expect(r).toMatchObject({ ok: false, errors: { lines: { 0: { counted: expect.stringContaining("0 이상") } } } });
  });

  it("품목 · LOT 의 꼴과 같은 줄", () => {
    const r = parseCount(
      base([
        { item: "XX-0001", counted: "1" },
        { item: "RM-0003", lot: "틀린 LOT", counted: "1" },
        { item: "RM-0003", lot: "A", counted: "1" },
        { item: "RM-0003", lot: "A", counted: "2", added: "1" },
      ]),
    );
    expect(r).toMatchObject({
      ok: false,
      errors: {
        lines: {
          0: { item: expect.any(String) },
          1: { lot: expect.any(String) },
          3: { row: expect.stringContaining("같은 품목") },
        },
      },
    });
  });

  it("창고 · 번호의 꼴, 줄 0개 · 101개", () => {
    expect(parseCount(base([{ item: "RM-0003", counted: "1" }], { warehouse: "" }))).toMatchObject({
      formError: "창고를 고르세요",
    });
    expect(parseCount(base([{ item: "RM-0003", counted: "1" }], { code: "IV-20261109-001" }))).toMatchObject({
      ok: false,
    });
    expect(parseCount(base([]))).toMatchObject({ formError: "줄을 하나 이상 넣으세요" });
    const many = Array.from({ length: COUNT_MAX_LINES + 1 }, (_, i) => ({
      item: "RM-0003",
      lot: `L-${i}`,
      counted: "1",
    }));
    expect(parseCount(base(many))).toMatchObject({ formError: "실사 한 건은 100줄까지입니다" });
  });
});

describe("countValues", () => {
  it("머리 칸과 lines.<차례>.<칸> 을 모으고, 모르는 칸은 버린다", () => {
    const form = new FormData();
    form.set("code", "PI-20261109-001");
    form.set("warehouse", "WH-01");
    form.set("lines.1.item", "RM-0003");
    form.set("lines.1.counted", "5");
    form.set("lines.0.secret", "x");
    form.set("lines.999.item", "RM-0001");
    expect(countValues(form)).toEqual({
      code: "PI-20261109-001",
      warehouse: "WH-01",
      lines: [{}, { item: "RM-0003", counted: "5" }],
    });
  });
});
