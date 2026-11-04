import { describe, expect, it } from "vitest";
import { codeValues, parseCodeUpdate, parseNewCode } from "@/lib/code-input";

// 공통코드 값의 입력 검사 — 설계 ③ 의 칸마다 맞는 꼴 · 틀린 꼴.

const ok = { code: "BOX", name: "상자", sortOrder: "50" };

describe("값 추가", () => {
  it("코드 · 이름 · 정렬 순서를 읽는다 — 앞뒤 빈칸은 지운다", () => {
    expect(parseNewCode({ code: " BOX ", name: " 상자 ", sortOrder: " 50 " })).toEqual({
      ok: true,
      value: { code: "BOX", name: "상자", sortOrder: 50 },
    });
  });

  it.each(["B", "1L", "PCS_10", "A".repeat(20), "0"])("코드 %s 는 받는다", (code) => {
    expect(parseNewCode({ ...ok, code }).ok).toBe(true);
  });

  it.each([
    ["빈 칸", "", "코드를 넣으세요"],
    ["소문자", "box", "영문 대문자"],
    ["밑줄로 시작", "_BOX", "영문 대문자"],
    ["붙임표", "BOX-1", "영문 대문자"],
    ["한글", "상자", "영문 대문자"],
    ["21자", "A".repeat(21), "영문 대문자"],
  ])("코드가 %s 이면 거절한다", (_name, code, message) => {
    const r = parseNewCode({ ...ok, code });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.code).toContain(message);
  });

  it("코드 칸이 아예 오지 않아도 빈 칸과 같은 말로 거절한다", () => {
    expect(parseNewCode({ name: "상자", sortOrder: "50" })).toEqual({
      ok: false,
      errors: { code: "코드를 넣으세요" },
    });
  });

  it.each([
    ["0", 0],
    ["999", 999],
    ["007", 7],
  ])("정렬 순서 %s 는 받는다", (sortOrder, value) => {
    expect(parseNewCode({ ...ok, sortOrder })).toMatchObject({ ok: true, value: { sortOrder: value } });
  });

  const notInt = "0 ~ 999 의 정수를 넣으세요";
  it.each([
    ["", "정렬 순서를 넣으세요"],
    ["1000", notInt],
    ["-1", notInt],
    ["1.5", notInt],
    ["1,0", notInt],
    ["열", notInt],
  ])("정렬 순서 「%s」는 거절한다", (sortOrder, message) => {
    expect(parseNewCode({ ...ok, sortOrder })).toEqual({ ok: false, errors: { sortOrder: message } });
  });

  it.each([
    ["빈 칸", "", "이름을 넣으세요"],
    ["51자", "가".repeat(51), "이름은 50자까지입니다"],
  ])("이름이 %s 이면 거절한다", (_name, name, message) => {
    expect(parseNewCode({ ...ok, name })).toEqual({ ok: false, errors: { name: message } });
  });

  it("이름 50자는 받는다", () => {
    expect(parseNewCode({ ...ok, name: "가".repeat(50) }).ok).toBe(true);
  });

  it("여러 칸이 함께 틀리면 함께 알린다", () => {
    const r = parseNewCode({ code: "box", name: "", sortOrder: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["code", "name", "sortOrder"]);
  });
});

describe("값 수정", () => {
  it("이름 · 정렬 순서 · 사용 여부를 읽고, 코드는 받지 않는다", () => {
    expect(parseCodeUpdate({ code: "XX", name: "상자", sortOrder: "5", active: "N" })).toEqual({
      ok: true,
      value: { name: "상자", sortOrder: 5, active: false },
    });
  });

  it("사용 여부가 Y · N 이 아니면 거절한다", () => {
    expect(parseCodeUpdate({ name: "상자", sortOrder: "5", active: "maybe" })).toEqual({
      ok: false,
      errors: { active: "사용 여부를 고르세요" },
    });
  });
});

describe("화면이 보낸 칸", () => {
  it("아는 칸만 글자 그대로 모은다", () => {
    const form = new FormData();
    form.set("code", "BOX");
    form.set("name", "상자");
    form.set("groupCode", "ITEM_TYPE");
    form.set("sortOrder", new Blob(["1"]));
    expect(codeValues(form)).toEqual({ code: "BOX", name: "상자" });
  });
});
