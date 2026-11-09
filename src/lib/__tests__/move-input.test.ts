import { describe, expect, it } from "vitest";
import { formatMilli, moveValues, parseMove, parseQty } from "@/lib/move-input";

// 수불 전표의 꼴 검사(조각 「재고 수불」 설계 ③ 「수불 전표」) — DB 를 보지 않는 몫. DB 에 대어 보는 몫은 src/db/__tests__/stock.test.ts.

const TODAY = "2026-11-09";
const line = { item: "RM-0003 금 와이어", lot: "T-1", warehouse: "WH-01", qty: "1,500.5" };

describe("수량", () => {
  it.each([
    ["1500", BigInt(1500000), 0],
    ["1,500.5", BigInt(1500500), 1],
    ["-0.001", BigInt(-1), 3],
    ["+3", BigInt(3000), 0],
    ["999999999.999", BigInt(999999999999), 3],
  ])("%s", (text, milli, decimals) => {
    expect(parseQty(text)).toEqual({ qty: milli, decimals });
  });
  it.each(["", "1.2345", "1234567890", "1e3", "１", "--1", "."])("거절 — %s", (text) => {
    expect(parseQty(text)).toBeNull();
  });
  it("보이는 글자", () => {
    expect([
      formatMilli(BigInt(1500000)),
      formatMilli(BigInt(500)),
      formatMilli(BigInt(-120000)),
      formatMilli(BigInt(1234567001)),
    ]).toEqual(["1,500", "0.5", "−120", "1,234,567.001"]);
  });
});

describe("전표의 꼴", () => {
  it("품목은 「코드 이름」의 첫 마디, 수량은 천분의 일 단위, 빈 줄은 건너뛴다", () => {
    const r = parseMove({ moveDate: TODAY, moveType: "IN", lines: [{}, line] }, TODAY);
    expect(r).toEqual({
      ok: true,
      value: {
        moveDate: TODAY,
        moveType: "IN",
        reason: null,
        note: "",
        lines: [
          {
            index: 1,
            itemCode: "RM-0003",
            lot: "T-1",
            warehouse: "WH-01",
            toWarehouse: null,
            qty: BigInt(1500500),
            qtyDecimals: 1,
            unit: null,
          },
        ],
      },
    });
  });

  it("까닭은 보낸 줄의 차례에 붙는다", () => {
    const r = parseMove({ moveDate: TODAY, moveType: "OUT", lines: [line, {}, { ...line, qty: "-1" }] }, TODAY);
    expect(r).toMatchObject({ ok: false, errors: { lines: { 2: { qty: expect.stringContaining("조정에만") } } } });
  });

  it("조정은 + · − 를 받고 사유가 반드시다", () => {
    expect(
      parseMove({ moveDate: TODAY, moveType: "ADJ", reason: "ETC", lines: [{ ...line, qty: "-2" }] }, TODAY),
    ).toMatchObject({
      ok: true,
      value: { reason: "ETC", lines: [{ qty: BigInt(-2000) }] },
    });
  });
});

describe("화면이 보낸 칸", () => {
  it("머리 칸과 lines.<차례>.<칸> — 모르는 칸은 버린다", () => {
    const f = new FormData();
    f.set("moveDate", TODAY);
    f.set("moveType", "XFER");
    f.set("lines.1.item", "RM-0003");
    f.set("lines.1.toWarehouse", "WH-02");
    f.set("lines.0.qty", "1");
    f.set("lines.0.secret", "x");
    f.set("lines.999.item", "x");
    expect(moveValues(f)).toEqual({
      moveDate: TODAY,
      moveType: "XFER",
      lines: [{ qty: "1" }, { item: "RM-0003", toWarehouse: "WH-02" }],
    });
  });
});
