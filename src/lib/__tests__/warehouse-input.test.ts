// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseNewWarehouse, parseWarehouseUpdate, warehouseValues } from "@/lib/warehouse-input";

// 설계 ③ 의 창고 칸마다 맞는 꼴과 틀린 꼴 — 서버의 검사라 화면을 건너뛴 요청에도 같다.

describe("창고 등록의 입력", () => {
  it("맞는 꼴 — 앞뒤 빈칸을 지운 창고명", () => {
    expect(parseNewWarehouse({ name: "  외주창고 " })).toEqual({
      ok: true,
      value: { name: "외주창고", isDefect: false },
    });
  });

  it("창고명 50자를 받는다 — 글자로 센다", () => {
    expect(parseNewWarehouse({ name: "😀".repeat(50) })).toMatchObject({ ok: true });
  });

  it.each([
    ["없음", undefined, "창고명을 넣으세요"],
    ["빈칸뿐", "   ", "창고명을 넣으세요"],
    ["51자", "가".repeat(51), "창고명은 50자까지입니다"],
  ])("창고명 %s → 거절", (_name, name, message) => {
    expect(parseNewWarehouse({ name })).toEqual({ ok: false, errors: { name: message } });
  });

  it("사용 여부는 받지 않는다 — 새 창고는 사용 중", () => {
    expect(parseNewWarehouse({ name: "외주창고", active: "N" })).toEqual({
      ok: true,
      value: { name: "외주창고", isDefect: false },
    });
  });
});

describe("창고 수정의 입력", () => {
  it("맞는 꼴 — 창고명 · 사용 여부", () => {
    expect(parseWarehouseUpdate({ name: "자재창고", active: "N" })).toEqual({
      ok: true,
      value: { name: "자재창고", isDefect: false, active: false },
    });
  });

  it.each([
    ["없음", undefined],
    ["목록 밖", "maybe"],
  ])("사용 여부 %s → 거절", (_name, active) => {
    expect(parseWarehouseUpdate({ name: "자재창고", active })).toEqual({
      ok: false,
      errors: { active: "사용 여부를 고르세요" },
    });
  });
});

describe("화면이 보낸 칸", () => {
  it("아는 칸의 글자만 모은다 — 코드 · 파일은 버린다", () => {
    const form = new FormData();
    form.set("name", "외주창고");
    form.set("code", "WH-99");
    form.set("active", new Blob(["Y"]));
    expect(warehouseValues(form)).toEqual({ name: "외주창고" });
  });
});
