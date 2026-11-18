// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseNewProcess, parseProcessUpdate, processValues } from "@/lib/process-input";

// 공정의 칸마다 맞는 꼴과 틀린 꼴 — 서버의 검사라 화면을 건너뛴 요청에도 같다.

const CODE_SHAPE = "영문 대문자로 시작해 대문자 · 숫자 2 ~ 6자입니다 — 예: DA, WB";

describe("공정 등록의 입력", () => {
  it("맞는 꼴 — 앞뒤 빈칸을 지운다", () => {
    expect(parseNewProcess({ code: " DA ", name: " 다이 본딩 ", note: "" })).toEqual({
      ok: true,
      value: { code: "DA", name: "다이 본딩", note: "" },
    });
  });

  it("코드가 비면 넣으라고 알린다", () => {
    expect(parseNewProcess({ code: "", name: "다이 본딩", note: "" })).toEqual({
      ok: false,
      errors: { code: "공정코드를 넣으세요" },
    });
  });

  it.each(["da", "D", "ABCDEFG", "D-A"])("코드 %s → 꼴을 알린다(대문자로 바꾸지 않는다)", (code) => {
    expect(parseNewProcess({ code, name: "다이 본딩", note: "" })).toEqual({
      ok: false,
      errors: { code: CODE_SHAPE },
    });
  });

  it.each([
    ["없음", "", "공정명을 넣으세요"],
    ["51자", "가".repeat(51), "공정명은 50자까지입니다"],
  ])("공정명 %s → 거절", (_n, name, message) => {
    expect(parseNewProcess({ code: "DA", name, note: "" })).toEqual({ ok: false, errors: { name: message } });
  });

  it("공정명 50자를 받는다 — 글자로 센다", () => {
    expect(parseNewProcess({ code: "DA", name: "😀".repeat(50), note: "" })).toMatchObject({ ok: true });
  });

  it("비고 501자는 거절, 칸이 없으면 빈 비고", () => {
    expect(parseNewProcess({ code: "DA", name: "다이 본딩", note: "가".repeat(501) })).toEqual({
      ok: false,
      errors: { note: "비고는 500자까지입니다" },
    });
    expect(parseNewProcess({ code: "DA", name: "다이 본딩" })).toEqual({
      ok: true,
      value: { code: "DA", name: "다이 본딩", note: "" },
    });
  });
});

describe("공정 수정의 입력", () => {
  it("코드는 무시한다", () => {
    const r = parseProcessUpdate({ code: "ZZ", name: "몰딩", note: "x", active: "N" });
    expect(r).toEqual({ ok: true, value: { name: "몰딩", note: "x", active: false } });
    expect(r.ok && "code" in r.value).toBe(false);
  });

  it("사용 여부가 없으면 거절", () => {
    expect(parseProcessUpdate({ name: "몰딩", note: "x" })).toEqual({
      ok: false,
      errors: { active: "사용 여부를 고르세요" },
    });
  });
});

describe("화면이 보낸 칸", () => {
  it("아는 칸만 글자 그대로 모은다", () => {
    const form = new FormData();
    form.set("code", "DA");
    form.set("name", "다이 본딩");
    form.set("other", "x");
    expect(processValues(form)).toEqual({ code: "DA", name: "다이 본딩" });
  });
});
