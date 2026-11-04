import { describe, expect, it } from "vitest";
import {
  SHEET_MAX_ROWS,
  blankRow,
  headerLine,
  isBlankRow,
  isHeaderRow,
  isMultiCell,
  parseClipboard,
  pasteInto,
  readSheetPayload,
  takesPaste,
  type SheetColumn,
} from "../sheet";
import { itemSheetColumns, partnerSheetColumns } from "../sheet-columns";

// 시트형 등록의 공통 규칙 — 엑셀에서 복사한 글 읽기, 머리글 줄, 100줄, 서버가 받은 글(설계 ⑤ 「시트형 등록(PR F)」).

const cols: SheetColumn[] = [
  { key: "a", label: "유형", rule: "" },
  { key: "b", label: "품명", rule: "" },
  { key: "c", label: "단위", rule: "" },
];

describe("엑셀에서 복사한 글", () => {
  it("칸은 탭, 줄은 줄바꿈 — 끝의 줄바꿈 하나는 빈 줄이 아니다", () => {
    expect(parseClipboard("원자재\t솔더 볼\tEA\r\n완제품\tIC\tEA\r\n")).toEqual([
      ["원자재", "솔더 볼", "EA"],
      ["완제품", "IC", "EA"],
    ]);
  });

  it("빈 칸은 빈 글자로 남는다", () => {
    expect(parseClipboard("원자재\t\tEA")).toEqual([["원자재", "", "EA"]]);
  });

  it("따옴표로 감싼 칸 — 안의 줄바꿈 · 탭 · 두 번 쓴 따옴표를 푼다", () => {
    expect(parseClipboard('"줄\n바꿈"\t"탭\t안"\t"따옴표 ""안"""\nx')).toEqual([
      ["줄\n바꿈", "탭\t안", '따옴표 "안"'],
      ["x"],
    ]);
  });

  it("칸 가운데의 따옴표는 글자 그대로", () => {
    expect(parseClipboard('12" 웨이퍼\tEA')).toEqual([['12" 웨이퍼', "EA"]]);
    expect(parseClipboard('"12" 웨이퍼\tEA')).toEqual([['"12" 웨이퍼', "EA"]]);
  });

  it("여러 칸인지 — 한 칸짜리 글(끝의 줄바꿈 하나 포함)은 아니다", () => {
    expect(isMultiCell("솔더 볼")).toBe(false);
    expect(isMultiCell("솔더 볼\r\n")).toBe(false);
    expect(isMultiCell("a\tb")).toBe(true);
    expect(isMultiCell("a\nb")).toBe(true);
  });
});

describe("머리글 줄", () => {
  it("머리글 줄은 칸 이름을 탭으로 잇는다", () => {
    expect(headerLine(cols)).toBe("유형\t품명\t단위");
  });

  it("칸 이름과 같으면 머리글 — 빈칸 · 띄어쓰기는 보지 않는다", () => {
    expect(isHeaderRow(["유형", "품명", "단위"], cols, 0)).toBe(true);
    expect(isHeaderRow(["유형", "", " 단 위 "], cols, 0)).toBe(true);
    expect(isHeaderRow(["품명", "단위"], cols, 1)).toBe(true);
  });

  it("값이 하나라도 다르거나 칸이 넘치거나 모두 비면 머리글이 아니다", () => {
    expect(isHeaderRow(["유형", "솔더 볼", "단위"], cols, 0)).toBe(false);
    expect(isHeaderRow(["유형", "품명", "단위", "더"], cols, 0)).toBe(false);
    expect(isHeaderRow(["", ""], cols, 0)).toBe(false);
    expect(isHeaderRow(["유형"], cols, 1)).toBe(false);
  });

  it("품목 · 거래처 시트의 머리글 줄을 붙여넣으면 건너뛴다", () => {
    for (const columns of [itemSheetColumns([]), partnerSheetColumns([])]) {
      const r = pasteInto([blankRow(columns)], columns, 0, 0, `${headerLine(columns)}\n`);
      expect(r.skippedHeader).toBe(true);
      expect(r.rows).toEqual([blankRow(columns)]);
    }
  });
});

describe("붙여넣기", () => {
  const rows = [blankRow(cols), blankRow(cols)];

  it("고른 칸부터 오른쪽 · 아래로 채우고, 모자란 줄은 더한다", () => {
    const r = pasteInto(rows, cols, 1, 1, "솔더 볼\tEA\nIC\tEA\n와이어\tM");
    expect(r.rows).toEqual([
      { a: "", b: "", c: "" },
      { a: "", b: "솔더 볼", c: "EA" },
      { a: "", b: "IC", c: "EA" },
      { a: "", b: "와이어", c: "M" },
    ]);
    expect(r).toMatchObject({ skippedHeader: false, droppedRows: 0, droppedColumns: false });
  });

  it("첫 줄이 머리글이면 건너뛴다", () => {
    const r = pasteInto(rows, cols, 0, 0, "유형\t품명\t단위\n원자재\t솔더 볼\tEA");
    expect(r.skippedHeader).toBe(true);
    expect(r.rows[0]).toEqual({ a: "원자재", b: "솔더 볼", c: "EA" });
  });

  it("시트의 칸을 넘는 칸은 버리고 알린다 — 빈 칸만 넘치면 알리지 않는다", () => {
    expect(pasteInto(rows, cols, 0, 0, "원자재\t솔더 볼\tEA\t남는 칸").droppedColumns).toBe(true);
    expect(pasteInto(rows, cols, 0, 0, "원자재\t솔더 볼\tEA\t").droppedColumns).toBe(false);
  });

  it(`${SHEET_MAX_ROWS}줄까지만 받고, 101번째 줄부터는 버린 수를 알린다`, () => {
    const text = Array.from({ length: 105 }, (_, i) => `원자재\t품목 ${i + 1}\tEA`).join("\n");
    const r = pasteInto(rows, cols, 0, 0, text);
    expect(r.rows).toHaveLength(SHEET_MAX_ROWS);
    expect(r.rows[99].b).toBe("품목 100");
    expect(r.droppedRows).toBe(5);
  });

  it("아래쪽 줄에서 붙여넣으면 남은 자리만큼 받는다", () => {
    const many = Array.from({ length: 98 }, () => blankRow(cols));
    const r = pasteInto(many, cols, 97, 0, "a\nb\nc\nd");
    expect(r.rows).toHaveLength(SHEET_MAX_ROWS);
    expect(r.droppedRows).toBe(1);
  });

  it("붙여넣기 전의 줄은 바꾸지 않는다", () => {
    const before = [blankRow(cols)];
    pasteInto(before, cols, 0, 0, "원자재\t솔더 볼");
    expect(before).toEqual([blankRow(cols)]);
  });
});

describe("빈 줄", () => {
  it("모든 칸이 비었거나 빈칸뿐이면 빈 줄", () => {
    expect(isBlankRow({ a: "", b: "  " })).toBe(true);
    expect(isBlankRow({ a: "", b: "x" })).toBe(false);
  });
});

describe("서버가 받은 시트", () => {
  it("아는 칸만 글자로 남기고, 빠진 칸은 빈 글자로 채운다", () => {
    const r = readSheetPayload(JSON.stringify([{ a: "원자재", b: "솔더 볼", z: "모르는 칸" }]), cols);
    expect(r).toEqual({ ok: true, rows: [{ a: "원자재", b: "솔더 볼", c: "" }] });
  });

  it(`${SHEET_MAX_ROWS}줄까지 받고, 넘으면 통째로 거절한다`, () => {
    const at = (n: number) => JSON.stringify(Array.from({ length: n }, () => ({ a: "원자재" })));
    expect(readSheetPayload(at(SHEET_MAX_ROWS), cols)).toMatchObject({ ok: true });
    expect(readSheetPayload(at(SHEET_MAX_ROWS + 1), cols)).toEqual({
      ok: false,
      formError: "한 번에 100줄까지 받습니다 — 나눠서 저장하세요",
    });
  });

  it.each([
    ["JSON 이 아님", "{"],
    ["배열이 아님", JSON.stringify({ a: "x" })],
    ["줄이 객체가 아님", JSON.stringify(["x"])],
    ["칸이 글자가 아님", JSON.stringify([{ a: 1 }])],
    ["칸이 1000자를 넘음", JSON.stringify([{ a: "x".repeat(1001) }])],
  ])("꼴이 틀리면 거절한다 — %s", (_, text) => {
    expect(readSheetPayload(text, cols)).toMatchObject({
      ok: false,
      formError: expect.stringContaining("읽지 못했습니다"),
    });
  });

  it("칸이 오지 않으면 거절한다", () => {
    expect(readSheetPayload(null, cols)).toMatchObject({ ok: false });
  });
});

describe("리뷰 1회차", () => {
  it("붙여넣은 줄 수 — 머리글 · 100줄을 넘는 줄은 세지 않는다", () => {
    const rows = Array.from({ length: 5 }, () => blankRow(cols));
    expect(pasteInto(rows, cols, 0, 0, "a\nb").pastedRows).toBe(2);
    expect(pasteInto(rows, cols, 0, 0, "유형\t품명\na").pastedRows).toBe(1);
    expect(pasteInto(rows, cols, 98, 0, "a\nb\nc\nd").pastedRows).toBe(2);
  });

  it("시트가 가로챌 글 — 여러 칸 · 여러 줄, 또는 따옴표로 감싸 풀면 달라지는 한 칸", () => {
    expect(takesPaste("a\tb")).toBe(true);
    expect(takesPaste('"12"" 웨이퍼"\r\n')).toBe(true);
    expect(takesPaste('"줄\n바꿈"')).toBe(true);
    expect(takesPaste("솔더 볼")).toBe(false);
    expect(takesPaste("솔더 볼\r\n")).toBe(false);
    expect(takesPaste('12" 웨이퍼')).toBe(false);
  });
});
