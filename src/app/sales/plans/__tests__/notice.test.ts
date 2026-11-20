import { describe, expect, it } from "vitest";
import { confirmNotice, savedNotice } from "../notice";

// 주소에 실린 칸 수의 알림 — 저장(?saved=)은 메뉴 「판매계획 등록」, 확정 · 확정 취소(?confirmed= · ?unconfirmed=)는
// 메뉴 「판매계획 확정」이 보인다. 숫자가 아니면 알림을 내지 않는다.

describe("savedNotice — 판매계획 등록", () => {
  it("saved — 0 이면 「바뀐 칸이 없습니다」, 아니면 「N칸을 저장했습니다」", () => {
    expect(savedNotice({ saved: "0" })).toBe("바뀐 칸이 없습니다");
    expect(savedNotice({ saved: "1200" })).toBe("1,200칸을 저장했습니다");
  });
  it("확정 · 확정 취소의 칸 수는 이 화면에서 알리지 않는다", () => {
    expect(savedNotice({ confirmed: "3" })).toBeUndefined();
    expect(savedNotice({ unconfirmed: "0" })).toBeUndefined();
  });
  it("숫자가 아니거나 없으면 알림이 없다", () => {
    expect(savedNotice({})).toBeUndefined();
    expect(savedNotice({ saved: "12345" })).toBeUndefined();
    expect(savedNotice({ saved: ["x", "1"] })).toBeUndefined();
    expect(savedNotice({ saved: ["4", "x"] })).toBe("4칸을 저장했습니다");
  });
});

describe("confirmNotice — 판매계획 확정", () => {
  it("confirmed · unconfirmed — 0 이면 할 칸이 없다는 안내", () => {
    expect(confirmNotice({ confirmed: "0" })).toBe("확정할 칸이 없습니다");
    expect(confirmNotice({ unconfirmed: "0" })).toBe("확정을 취소할 칸이 없습니다");
  });
  it("confirmed · unconfirmed", () => {
    expect(confirmNotice({ confirmed: "3" })).toBe("3칸을 확정했습니다");
    expect(confirmNotice({ unconfirmed: "2000" })).toBe("2,000칸의 확정을 취소했습니다");
  });
  it("저장의 칸 수는 이 화면에서 알리지 않는다", () => {
    expect(confirmNotice({ saved: "3" })).toBeUndefined();
  });
  it("숫자가 아니거나 없으면 알림이 없다", () => {
    expect(confirmNotice({})).toBeUndefined();
    expect(confirmNotice({ confirmed: "abc" })).toBeUndefined();
    expect(confirmNotice({ unconfirmed: "12345" })).toBeUndefined();
    expect(confirmNotice({ confirmed: ["4", "x"] })).toBe("4칸을 확정했습니다");
  });
});
