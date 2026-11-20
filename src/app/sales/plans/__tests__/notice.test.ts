import { describe, expect, it } from "vitest";
import { planNotice } from "../notice";

// 저장 · 확정 · 확정 취소 뒤 주소에 실린 칸 수의 알림(메뉴 「판매계획」). 숫자가 아니면 알림을 내지 않는다.

describe("planNotice", () => {
  it("saved — 0 이면 「바뀐 칸이 없습니다」, 아니면 「N칸을 저장했습니다」", () => {
    expect(planNotice({ saved: "0" })).toBe("바뀐 칸이 없습니다");
    expect(planNotice({ saved: "1200" })).toBe("1,200칸을 저장했습니다");
  });
  it("confirmed · unconfirmed", () => {
    expect(planNotice({ confirmed: "3" })).toBe("3칸을 확정했습니다");
    expect(planNotice({ unconfirmed: "2000" })).toBe("2,000칸의 확정을 취소했습니다");
  });
  it("숫자가 아니거나 없으면 알림이 없다", () => {
    expect(planNotice({})).toBeUndefined();
    expect(planNotice({ confirmed: "abc" })).toBeUndefined();
    expect(planNotice({ unconfirmed: "12345" })).toBeUndefined();
    expect(planNotice({ saved: ["x", "1"] })).toBeUndefined();
    expect(planNotice({ confirmed: ["4", "x"] })).toBe("4칸을 확정했습니다");
  });
});
