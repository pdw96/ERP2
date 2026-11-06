// @vitest-environment node
import { describe, expect, it } from "vitest";
import { itemValues, parseItemUpdate, parseNewItem, type ItemValues } from "@/lib/item-input";

const NO_CLASS = { cls1: null, cls2: null, cls3: null, note: "" };

// 설계 ③ 의 품목 칸마다 맞는 꼴과 틀린 꼴 — 서버의 검사라 화면을 건너뛴 요청에도 같다.

const good: ItemValues = {
  itemType: "RM",
  procurement: "BUY",
  name: "웨이퍼",
  spec: "8인치",
  unit: "EA",
  inspectIn: "on",
  leadTimeDays: "21",
  safetyStock: "50",
  minLot: "25",
  lotMultiple: "25",
};

describe("등록의 입력", () => {
  it("맞는 꼴 — 값이 그대로 읽히고, 끈 체크 상자는 끔이다", () => {
    expect(parseNewItem(good)).toEqual({
      ok: true,
      value: {
        itemType: "RM",
        procurement: "BUY",
        name: "웨이퍼",
        spec: "8인치",
        unit: "EA",
        inspectIn: true,
        inspectOut: false,
        lotManaged: false,
        lotRuleCode: null,
        defaultInWarehouse: null,
        defaultOutWarehouse: null,
        leadTimeDays: 21,
        safetyStock: 50,
        minLot: 25,
        lotMultiple: 25,
        ...NO_CLASS,
      },
    });
  });

  it("품명 · 규격의 앞뒤 빈칸은 지운다. 규격은 비워도 된다", () => {
    const r = parseNewItem({ ...good, name: "  웨이퍼 ", spec: undefined });
    expect(r).toMatchObject({ ok: true, value: { name: "웨이퍼", spec: "" } });
  });

  it("수량 — 천 단위 쉼표를 읽고, 소수 셋째 자리 · 0 · 상한까지 받는다", () => {
    const r = parseNewItem({ ...good, safetyStock: "1,000.125", minLot: "0", lotMultiple: "999999999.999" });
    expect(r).toMatchObject({ ok: true, value: { safetyStock: 1000.125, minLot: 0, lotMultiple: 999999999.999 } });
  });

  it("리드타임의 경계 0 · 365 를 받는다", () => {
    expect(parseNewItem({ ...good, leadTimeDays: "0" })).toMatchObject({ ok: true });
    expect(parseNewItem({ ...good, leadTimeDays: "365" })).toMatchObject({ ok: true });
  });

  it("품명 100자 · 규격 100자를 받는다 — 글자로 센다", () => {
    expect(parseNewItem({ ...good, name: "가".repeat(100), spec: "😀".repeat(100) })).toMatchObject({ ok: true });
  });

  it.each([
    ["유형 없음", { itemType: undefined }, "itemType", "품목 유형을 고르세요"],
    ["목록 밖의 유형", { itemType: "XX" }, "itemType", "품목 유형을 고르세요"],
    ["목록 밖의 조달구분", { procurement: "OUT" }, "procurement", "조달구분을 고르세요"],
    ["빈 품명", { name: "" }, "name", "품명을 넣으세요"],
    ["빈칸뿐인 품명", { name: "   " }, "name", "품명을 넣으세요"],
    ["101자 품명", { name: "가".repeat(101) }, "name", "품명은 100자까지입니다"],
    ["101자 규격", { spec: "가".repeat(101) }, "spec", "규격은 100자까지입니다"],
    ["빈 단위", { unit: "" }, "unit", "단위를 고르세요"],
    ["꼴이 틀린 단위", { unit: "ea" }, "unit", "단위를 고르세요"],
    ["체크 상자에 다른 값", { inspectOut: "yes" }, "inspectOut", "켬 · 끔 가운데 하나여야 합니다"],
    ["리드타임 366", { leadTimeDays: "366" }, "leadTimeDays", "리드타임은 0 ~ 365 사이의 정수(일)입니다"],
    ["리드타임 음수", { leadTimeDays: "-1" }, "leadTimeDays", "리드타임은 0 ~ 365 사이의 정수(일)입니다"],
    ["리드타임 소수", { leadTimeDays: "1.5" }, "leadTimeDays", "리드타임은 0 ~ 365 사이의 정수(일)입니다"],
    ["리드타임 비움", { leadTimeDays: "" }, "leadTimeDays", "리드타임은 0 ~ 365 사이의 정수(일)입니다"],
    ["안전재고 음수", { safetyStock: "-0.001" }, "safetyStock", "안전재고는 0 이상입니다"],
    ["안전재고 소수 넷째 자리", { safetyStock: "1.2345" }, "safetyStock", "안전재고는 소수 셋째 자리까지입니다"],
    ["안전재고 비움", { safetyStock: "" }, "safetyStock", "안전재고를 넣으세요 — 없으면 0"],
    ["최소량이 글자", { minLot: "많이" }, "minLot", "최소 발주 · 생산량은 숫자로 넣으세요"],
    ["배수가 상한 넘음", { lotMultiple: "1000000000" }, "lotMultiple", "발주 · 생산 배수는 999,999,999.999 까지입니다"],
    ["배수가 지수 꼴", { lotMultiple: "1e3" }, "lotMultiple", "발주 · 생산 배수는 숫자로 넣으세요"],
  ])("%s → 그 칸을 거절한다", (_name, over, field, message) => {
    const r = parseNewItem({ ...good, ...over });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toEqual({ [field]: message });
  });

  it("틀린 칸이 여럿이면 칸마다 하나씩 알린다", () => {
    const r = parseNewItem({ ...good, name: "", unit: "" });
    expect(r).toEqual({ ok: false, errors: { name: "품명을 넣으세요", unit: "단위를 고르세요" } });
  });

  it("등록은 사용 여부를 받지 않는다 — 새 품목은 사용 중이다", () => {
    const r = parseNewItem({ ...good, active: "N" });
    expect(r.ok && "active" in r.value).toBe(false);
  });
});

describe("수정의 입력", () => {
  const edit: ItemValues = { ...good, itemType: undefined, active: "Y" };

  it("코드 · 유형은 받지 않는다 — 보내도 읽은 값에 없다", () => {
    const r = parseItemUpdate({ ...edit, itemType: "FG" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).not.toHaveProperty("itemType");
      expect(r.value).not.toHaveProperty("code");
      expect(r.value.active).toBe(true);
    }
  });

  it("사용 안 함으로 바꾼다", () => {
    expect(parseItemUpdate({ ...edit, active: "N" })).toMatchObject({ ok: true, value: { active: false } });
  });

  it.each([
    ["사용 여부 없음", undefined],
    ["목록 밖의 사용 여부", "maybe"],
  ])("%s → 거절", (_name, active) => {
    expect(parseItemUpdate({ ...edit, active })).toEqual({ ok: false, errors: { active: "사용 여부를 고르세요" } });
  });
});

describe("화면이 보낸 값 모으기", () => {
  it("아는 칸의 글자만 모은다 — 코드 · 모르는 칸 · 파일은 버린다", () => {
    const form = new FormData();
    form.set("name", "웨이퍼");
    form.set("code", "RM-9999");
    form.set("$ACTION_ID_x", "");
    form.set("spec", new Blob(["x"]));
    expect(itemValues(form)).toEqual({ name: "웨이퍼" });
  });
});
