// @vitest-environment node
import { describe, expect, it } from "vitest";
import { defectTypeValues, parseDefectTypeUpdate, parseNewDefectType } from "@/lib/defect-type-input";

// 불량 유형의 칸마다 맞는 꼴과 틀린 꼴 — 서버의 검사라 화면을 건너뛴 요청에도 같다.

const CODE_SHAPE = "영문 대문자로 시작해 대문자 · 숫자 · - 2 ~ 10자입니다 — 예: VOID, WIRE-BRK";
const ok = { code: "DA-VOID2", name: "접착 보이드 2", cls: "BOND", processes: ["DA"], note: "" };

describe("불량 유형 등록의 입력", () => {
  it("맞는 꼴 — 앞뒤 빈칸을 지운다", () => {
    expect(parseNewDefectType(ok)).toEqual({ ok: true, value: ok });
    expect(
      parseNewDefectType({ code: " DA-VOID2 ", name: " 접착 보이드 2 ", cls: " BOND ", processes: [" DA "], note: "" }),
    ).toEqual({ ok: true, value: ok });
  });

  it("코드가 비면 넣으라고 알린다", () => {
    expect(parseNewDefectType({ ...ok, code: "" })).toEqual({
      ok: false,
      errors: { code: "불량유형코드를 넣으세요" },
    });
  });

  it.each(["void", "DA-", "D--A", "ABCDEFGHIJK", "가1", "D", "-DA"])(
    "코드 %s → 꼴을 알린다(대문자로 바꾸지 않는다)",
    (code) => {
      expect(parseNewDefectType({ ...ok, code })).toEqual({ ok: false, errors: { code: CODE_SHAPE } });
    },
  );

  it.each(["VOID", "WIRE-BRK", "ABCDEFGH-1", "A1"])("코드 %s 는 받는다", (code) => {
    expect(parseNewDefectType({ ...ok, code })).toMatchObject({ ok: true });
  });

  it.each([
    ["없음", "", "불량유형명을 넣으세요"],
    ["51자", "가".repeat(51), "불량유형명은 50자까지입니다"],
  ])("불량유형명 %s → 거절", (_n, name, message) => {
    expect(parseNewDefectType({ ...ok, name })).toEqual({ ok: false, errors: { name: message } });
  });

  it("대분류가 비면 고르라고, 꼴이 틀리면 목록에서 고르라고 알린다", () => {
    expect(parseNewDefectType({ ...ok, cls: "" })).toEqual({ ok: false, errors: { cls: "대분류를 고르세요" } });
    expect(parseNewDefectType({ ...ok, cls: undefined })).toEqual({
      ok: false,
      errors: { cls: "대분류를 고르세요" },
    });
    expect(parseNewDefectType({ ...ok, cls: "bond!" })).toEqual({
      ok: false,
      errors: { cls: "대분류를 목록에서 고르세요" },
    });
  });

  it("발생 공정이 겹치면 하나로, 빈 것은 버린다", () => {
    const r = parseNewDefectType({ ...ok, processes: ["WB", "WB", " MD ", "", "  "] });
    expect(r).toEqual({ ok: true, value: { ...ok, processes: ["WB", "MD"] } });
  });

  it("발생 공정이 없어도 받는다(공통)", () => {
    expect(parseNewDefectType({ ...ok, processes: [] })).toEqual({ ok: true, value: { ...ok, processes: [] } });
    expect(parseNewDefectType({ code: ok.code, name: ok.name, cls: ok.cls })).toEqual({
      ok: true,
      value: { ...ok, processes: [] },
    });
  });

  it("꼴이 틀린 공정은 없는 공정이라고 알린다", () => {
    expect(parseNewDefectType({ ...ok, processes: ["wb"] })).toEqual({
      ok: false,
      errors: { processes: "없는 공정입니다 — 목록에서 고르세요" },
    });
  });

  it("비고 501자는 거절, 칸이 없으면 빈 비고", () => {
    expect(parseNewDefectType({ ...ok, note: "가".repeat(501) })).toEqual({
      ok: false,
      errors: { note: "비고는 500자까지입니다" },
    });
    expect(parseNewDefectType({ code: ok.code, name: ok.name, cls: ok.cls, processes: ["DA"] })).toEqual({
      ok: true,
      value: ok,
    });
  });
});

describe("불량 유형 수정의 입력", () => {
  it("코드는 무시하고 사용 여부를 받는다", () => {
    const r = parseDefectTypeUpdate({
      code: "ZZ",
      name: "몰딩",
      cls: "DIM",
      processes: ["MD"],
      note: "x",
      active: "N",
    });
    expect(r).toEqual({ ok: true, value: { name: "몰딩", cls: "DIM", processes: ["MD"], note: "x", active: false } });
    expect(r.ok && "code" in r.value).toBe(false);
  });

  it("사용 여부가 없으면 거절", () => {
    expect(parseDefectTypeUpdate({ name: "몰딩", cls: "DIM", note: "x" })).toEqual({
      ok: false,
      errors: { active: "사용 여부를 고르세요" },
    });
  });
});

describe("화면이 보낸 칸", () => {
  it("아는 칸만 글자 그대로 모으고, 공정은 여럿을 받는다", () => {
    const form = new FormData();
    form.set("code", "VOID");
    form.append("processes", "DA");
    form.append("processes", "WB");
    form.set("other", "x");
    expect(defectTypeValues(form)).toEqual({ code: "VOID", processes: ["DA", "WB"] });
  });

  it("공정이 하나도 오지 않으면 processes 칸이 없다", () => {
    const form = new FormData();
    form.set("code", "VOID");
    expect(defectTypeValues(form)).toEqual({ code: "VOID" });
  });
});
