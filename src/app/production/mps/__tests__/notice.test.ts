import { describe, expect, it } from "vitest";
import { mpsNotice } from "../notice";

// 주소에 실린 칸 수의 알림(메뉴 「MPS」) — 저장(?saved=) · 확정(?confirmed=) · 확정 취소(?unconfirmed=). 숫자가 아니면 알림을 내지 않는다.

describe("mpsNotice", () => {
  it("saved — 0 이면 「바뀐 칸이 없습니다」, 아니면 「N칸을 저장했습니다」", () => {
    expect(mpsNotice({ saved: "0" })).toBe("바뀐 칸이 없습니다");
    expect(mpsNotice({ saved: "1200" })).toBe("1,200칸을 저장했습니다");
  });
  it("confirmed — 0 이면 「고정할 안이 없습니다」, 아니면 「N칸을 고정했습니다」", () => {
    expect(mpsNotice({ confirmed: "0" })).toBe("고정할 안이 없습니다");
    expect(mpsNotice({ confirmed: "3" })).toBe("3칸을 고정했습니다");
  });
  it("unconfirmed — 0 이면 「풀 칸이 없습니다」, 아니면 「N칸의 고정을 풀었습니다」", () => {
    expect(mpsNotice({ unconfirmed: "0" })).toBe("풀 칸이 없습니다");
    expect(mpsNotice({ unconfirmed: "2000" })).toBe("2,000칸의 고정을 풀었습니다");
  });
  it("숫자가 아니거나 없으면 알림이 없다 — 같은 이름이 여럿이면 앞의 것", () => {
    expect(mpsNotice({})).toBeUndefined();
    expect(mpsNotice({ saved: "12345" })).toBeUndefined();
    expect(mpsNotice({ confirmed: "abc" })).toBeUndefined();
    expect(mpsNotice({ unconfirmed: ["x", "1"] })).toBeUndefined();
    expect(mpsNotice({ saved: ["4", "x"] })).toBe("4칸을 저장했습니다");
  });
});
