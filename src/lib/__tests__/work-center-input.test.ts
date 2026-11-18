// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseNewWorkCenter, parseWorkCenterUpdate, workCenterValues } from "@/lib/work-center-input";

// 작업장의 칸마다 맞는 꼴과 틀린 꼴 — 서버의 검사라 화면을 건너뛴 요청에도 같다.

const CODE_SHAPE = "영문 대문자로 시작해 대문자 · 숫자 · - 2 ~ 10자입니다 — 예: DA-1, WB-L2";
const ok = { code: "DA-3", name: "다이 본딩 3라인", process: "DA", note: "" };

describe("작업장 등록의 입력", () => {
  it("맞는 꼴 — 앞뒤 빈칸을 지운다", () => {
    expect(parseNewWorkCenter(ok)).toEqual({ ok: true, value: ok });
    expect(parseNewWorkCenter({ code: " DA-3 ", name: " 다이 본딩 3라인 ", process: " DA ", note: "" })).toEqual({
      ok: true,
      value: ok,
    });
  });

  it("코드가 비면 넣으라고 알린다", () => {
    expect(parseNewWorkCenter({ ...ok, code: "" })).toEqual({
      ok: false,
      errors: { code: "작업장코드를 넣으세요" },
    });
  });

  it.each(["da-1", "DA-", "D--A", "ABCDEFGHIJK", "가1", "D", "-DA"])(
    "코드 %s → 꼴을 알린다(대문자로 바꾸지 않는다)",
    (code) => {
      expect(parseNewWorkCenter({ ...ok, code })).toEqual({ ok: false, errors: { code: CODE_SHAPE } });
    },
  );

  it.each(["DA", "WB-L2", "ABCDEFGH-1", "A1"])("코드 %s 는 받는다", (code) => {
    expect(parseNewWorkCenter({ ...ok, code })).toMatchObject({ ok: true });
  });

  it("공정이 비면 고르라고, 꼴이 틀리면 없는 공정이라고 알린다", () => {
    expect(parseNewWorkCenter({ ...ok, process: "" })).toEqual({ ok: false, errors: { process: "공정을 고르세요" } });
    expect(parseNewWorkCenter({ ...ok, process: undefined })).toEqual({
      ok: false,
      errors: { process: "공정을 고르세요" },
    });
    expect(parseNewWorkCenter({ ...ok, process: "da" })).toEqual({
      ok: false,
      errors: { process: "없는 공정입니다 — 목록에서 고르세요" },
    });
  });

  it.each([
    ["없음", "", "작업장명을 넣으세요"],
    ["51자", "가".repeat(51), "작업장명은 50자까지입니다"],
  ])("작업장명 %s → 거절", (_n, name, message) => {
    expect(parseNewWorkCenter({ ...ok, name })).toEqual({ ok: false, errors: { name: message } });
  });

  it("작업장명 50자를 받는다 — 글자로 센다", () => {
    expect(parseNewWorkCenter({ ...ok, name: "😀".repeat(50) })).toMatchObject({ ok: true });
  });

  it("비고 501자는 거절, 칸이 없으면 빈 비고", () => {
    expect(parseNewWorkCenter({ ...ok, note: "가".repeat(501) })).toEqual({
      ok: false,
      errors: { note: "비고는 500자까지입니다" },
    });
    expect(parseNewWorkCenter({ code: "DA-3", name: "다이 본딩 3라인", process: "DA" })).toEqual({
      ok: true,
      value: ok,
    });
  });
});

describe("작업장 수정의 입력", () => {
  it("코드 · 공정은 무시한다", () => {
    const r = parseWorkCenterUpdate({ code: "ZZ", process: "WB", name: "몰딩", note: "x", active: "N" });
    expect(r).toEqual({ ok: true, value: { name: "몰딩", note: "x", active: false } });
    expect(r.ok && ("code" in r.value || "process" in r.value)).toBe(false);
  });

  it("사용 여부가 없으면 거절", () => {
    expect(parseWorkCenterUpdate({ name: "몰딩", note: "x" })).toEqual({
      ok: false,
      errors: { active: "사용 여부를 고르세요" },
    });
  });
});

describe("화면이 보낸 칸", () => {
  it("아는 칸만 글자 그대로 모은다", () => {
    const form = new FormData();
    form.set("code", "DA-1");
    form.set("process", "DA");
    form.set("other", "x");
    expect(workCenterValues(form)).toEqual({ code: "DA-1", process: "DA" });
  });
});
