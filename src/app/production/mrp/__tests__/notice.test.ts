import { describe, expect, it } from "vitest";
import { mrpNotice } from "../notice";

// 주소에 실린 결과의 알림(메뉴 「MRP」) — 실행(?ran=계획오더 수) · 완성일 기준 요일 저장(?setting=saved · same). 알 수 없는 값이면 알림이 없다.

describe("mrpNotice", () => {
  it("ran — 「MRP 를 실행했습니다 — 계획오더 N건」(천 단위 쉼표)", () => {
    expect(mrpNotice({ ran: "12" })).toBe("MRP 를 실행했습니다 — 계획오더 12건");
    expect(mrpNotice({ ran: "0" })).toBe("MRP 를 실행했습니다 — 계획오더 0건");
    expect(mrpNotice({ ran: "20000" })).toBe("MRP 를 실행했습니다 — 계획오더 20,000건");
  });
  it("setting — saved 는 「다음 실행부터 적용합니다」, same 은 「바뀐 것이 없습니다」", () => {
    expect(mrpNotice({ setting: "saved" })).toBe("완성일 기준 요일을 저장했습니다 — 다음 실행부터 적용합니다");
    expect(mrpNotice({ setting: "same" })).toBe("바뀐 것이 없습니다");
  });
  it("숫자가 아니거나 모르는 값 · 없으면 null — 같은 이름이 여럿이면 앞의 것", () => {
    expect(mrpNotice({})).toBeNull();
    expect(mrpNotice({ ran: "abc" })).toBeNull();
    expect(mrpNotice({ ran: "-1" })).toBeNull();
    expect(mrpNotice({ ran: "123456" })).toBeNull();
    expect(mrpNotice({ setting: "other" })).toBeNull();
    expect(mrpNotice({ ran: ["7", "x"] })).toBe("MRP 를 실행했습니다 — 계획오더 7건");
    expect(mrpNotice({ setting: ["x", "saved"] })).toBeNull();
  });
});
