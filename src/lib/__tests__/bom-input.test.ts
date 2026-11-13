import { describe, expect, it } from "vitest";
import {
  bomTreeValues,
  bomValues,
  EXPLODE_QTY_MAX,
  formatLossRate,
  isUntouchedNewBom,
  parseBom,
  parseBomInquiry,
  parseLossRate,
} from "@/lib/bom-input";

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
            origLineNo: null,
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

// BOM 조회의 주소(조각 「BOM」 PR B, 설계 ③ 「BOM 조회의 주소」) — 꼴만 본다. 품목이 있는지 · 수량이 부모 단위의 자릿수 안인지는 bom-inquiry.test.ts.
describe("BOM 조회의 주소 — parseBomInquiry", () => {
  const TODAY = "2026-11-12";
  const parse = (params: Record<string, string | string[] | undefined>) => parseBomInquiry(params, TODAY);

  it("비우면 정전개 · 오늘 · 품목 없음 · 수량 없음, 알림 없음", () => {
    expect(parse({})).toEqual({ query: { mode: "down", item: undefined, date: TODAY, qty: undefined }, notices: [] });
  });

  it("mode — up 이면 역전개, 틀리면 알림 없이 정전개", () => {
    expect(parse({ mode: "up" }).query.mode).toBe("up");
    for (const mode of ["UP", "down", "x", ""])
      expect(parse({ mode })).toMatchObject({ query: { mode: "down" }, notices: [] });
  });

  it("item — 품목코드의 꼴이면 받고(앞뒤 빈칸은 떼고), 틀리면 버리고 알린다", () => {
    expect(parse({ item: " FG-0001 " }).query.item).toBe("FG-0001");
    expect(parse({ item: "RM-12345" }).query.item).toBe("RM-12345");
    for (const item of ["FG-001", "fg-0001", "XX-0001", "FG-0001 x", "'; drop table"]) {
      const r = parse({ item });
      expect(r.query.item, item).toBeUndefined();
      expect(r.notices.map((n) => n.field)).toEqual(["item"]);
    }
  });

  it("date — 달력에 있는 날이면 받고, 틀리면 오늘로 두고 알린다", () => {
    expect(parse({ date: "2026-11-26" }).query.date).toBe("2026-11-26");
    expect(parse({ date: "2028-02-29" }).query.date).toBe("2028-02-29");
    for (const date of ["2026-02-30", "2026-13-01", "20261126", "2026-1-1"]) {
      const r = parse({ date });
      expect(r.query.date, date).toBe(TODAY);
      expect(r.notices).toEqual([{ field: "date", message: "달력에 없는 날짜라 기준일을 오늘로 두었습니다" }]);
    }
  });

  it("qty — 0 보다 크고 1,000,000,000 까지, 소수 셋째 자리까지, 쉼표는 받는다", () => {
    expect(parse({ qty: "10,000" }).query.qty).toEqual({ qty: BigInt(10000000), decimals: 0 });
    expect(parse({ qty: "0.005" }).query.qty).toEqual({ qty: BigInt(5), decimals: 3 });
    expect(parse({ qty: "1000000000" }).query.qty).toEqual({ qty: EXPLODE_QTY_MAX, decimals: 0 });
    for (const qty of ["0", "-1", "+1", "1000000000.001", "1.0005", "abc", "1e3"]) {
      const r = parse({ qty });
      expect(r.query.qty, qty).toBeUndefined();
      expect(r.notices.map((n) => n.field)).toEqual(["qty"]);
    }
  });

  it("qty — 역전개는 읽지 않는다(알림도 없다)", () => {
    expect(parse({ mode: "up", qty: "abc" })).toMatchObject({ query: { mode: "up", qty: undefined }, notices: [] });
  });

  it("값이 여럿이면 첫 값만, 아래 밖의 이름은 읽지 않는다", () => {
    expect(parse({ item: ["SF-0001", "FG-0001"], mode: ["up", "down"] }).query).toMatchObject({
      mode: "up",
      item: "SF-0001",
    });
    expect(Object.keys(parse({ item: "SF-0001", sort: "x", page: "2", parent: "FG-0001" }).query).sort()).toEqual([
      "date",
      "item",
      "mode",
      "qty",
    ]);
  });
});

// 한 화면 다단계의 칸(조각 「BOM」 PR C) — 펼친 반제품 BOM 은 `boms.<차례>.` 아래, 줄의 원래 번호는 `lineNo`.
describe("다단계 저장의 칸 — bomTreeValues · 원래 줄 번호", () => {
  const form = (entries: [string, string][]) => {
    const f = new FormData();
    for (const [k, v] of entries) f.append(k, v);
    return f;
  };

  it("맨 위 BOM 과 펼친 BOM 들을 차례대로 모은다 — 아래 밖의 이름은 읽지 않는다", () => {
    const v = bomTreeValues(
      form([
        ["parent", "FG-0001"],
        ["version", "1"],
        ["lines.0.child", "SF-0002"],
        ["lines.0.lineNo", "1"],
        ["boms.3.parent", "SF-0001"],
        ["boms.3.lines.0.qty", "5"],
        ["boms.0.parent", "SF-0002"],
        ["boms.0.baseQty", "1000"],
        ["boms.0.lines.1.note", "비고"],
        ["boms.0.lines.0.evil", "x"],
        ["boms.100.parent", "SF-9999"],
        ["other.parent", "SF-9999"],
      ]),
    );
    expect(v.root).toEqual({ parent: "FG-0001", version: "1", lines: [{ child: "SF-0002", lineNo: "1" }] });
    expect(v.subs).toEqual([
      { parent: "SF-0002", baseQty: "1000", lines: [{}, { note: "비고" }] },
      { parent: "SF-0001", lines: [{ qty: "5" }] },
    ]);
  });

  it("원래 줄 번호는 1 ~ 200 의 정수만 — 아니면 새 줄(null)", () => {
    const parsed = (lineNo: string) =>
      parseBom({
        parent: "FG-0001",
        baseQty: "1",
        lines: [{ child: "RM-0001", qty: "1", validFrom: "2026-01-01", lineNo }],
      });
    for (const [text, n] of [
      ["1", 1],
      ["200", 200],
      ["0", null],
      ["201", null],
      ["1.5", null],
      ["", null],
      ["x", null],
    ] as const) {
      const r = parsed(text);
      expect(r.ok && r.value.lines[0].origLineNo, text).toBe(n);
    }
  });

  it("원래 번호만 있는 줄은 빈 줄로 친다 — 원래 번호는 칸이 아니다", () => {
    const r = parseBom({
      parent: "FG-0001",
      baseQty: "1",
      lines: [{ child: "RM-0001", qty: "1", validFrom: "2026-01-01" }, { lineNo: "2" }],
    });
    expect(r.ok && r.value.lines).toHaveLength(1);
  });

  it("펼쳐 보기만 한 새 BOM 은 건너뛴다 — 버전이 있거나 칸에 무엇이 있으면 아니다", () => {
    expect(isUntouchedNewBom({ parent: "SF-0003", version: "", baseQty: "", lines: [{ validFrom: "" }] })).toBe(true);
    expect(isUntouchedNewBom({ parent: "SF-0003", version: "1", lines: [] })).toBe(false);
    expect(isUntouchedNewBom({ parent: "SF-0003", baseQty: "1", lines: [] })).toBe(false);
    expect(isUntouchedNewBom({ parent: "SF-0003", lines: [{ child: "RM-0001" }] })).toBe(false);
  });
});
