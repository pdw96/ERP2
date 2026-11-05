import { describe, expect, it } from "vitest";
import {
  itemSheetRow,
  partnerSheetRow,
  pickOption,
  readItemEditRow,
  readItemRow,
  readPartnerEditRow,
  readPartnerRow,
  yesNo,
  type CodeOption,
} from "../sheet-input";

const NO_DESC = {
  ceo: "",
  bizType: "",
  bizItem: "",
  address: "",
  phone: "",
  email: "",
  contactName: "",
  contactPhone: "",
  note: "",
};
const NO_CLASS = { cls1: null, cls2: null, cls3: null, note: "" };

// 시트의 한 줄을 한 건 등록의 규칙으로 읽는다 — 이름 · 코드, Y/N, 빈 칸의 기본값(저자 인터뷰 2026-11-03).

const units: CodeOption[] = [
  { code: "EA", name: "개", active: true },
  { code: "KG", name: "킬로그램", active: true },
  { code: "G", name: "그램", active: false },
  { code: "PCS", name: "낱개", active: true },
  { code: "PC", name: "낱개", active: true },
];
const countries: CodeOption[] = [
  { code: "KR", name: "한국", active: true },
  { code: "US", name: "미국", active: true },
  { code: "TW", name: "대만", active: false },
];

describe("이름이나 코드로 고르기", () => {
  it("코드는 대소문자를 가리지 않고, 이름은 글자 그대로", () => {
    expect(pickOption("kg", units)).toEqual({ code: "KG", active: true });
    expect(pickOption(" 킬로그램 ", units)).toEqual({ code: "KG", active: true });
    expect(pickOption("그램", units)).toEqual({ code: "G", active: false });
  });

  it("비면 blank, 없으면 none, 같은 이름이 둘이면 ambiguous", () => {
    expect(pickOption("  ", units)).toBe("blank");
    expect(pickOption("상자", units)).toBe("none");
    expect(pickOption("낱개", units)).toBe("ambiguous");
  });
});

describe("켬 · 끔", () => {
  it.each([
    ["Y", "on"],
    ["y", "on"],
    ["O", "on"],
    ["o", "on"],
    ["예", "on"],
    ["N", "off"],
    ["x", "off"],
    ["아니오", "off"],
    ["", "blank"],
    ["네", "bad"],
    ["1", "bad"],
  ])("%s → %s", (text, want) => {
    expect(yesNo(text)).toBe(want);
  });
});

describe("품목 한 줄", () => {
  it("빈 칸은 기본값으로 — 원자재면 구매 · 수입검사, 계획 정보는 0", () => {
    expect(readItemRow({ itemType: "원자재", name: "솔더 볼", unit: "EA" }, units)).toEqual({
      ok: true,
      value: {
        itemType: "RM",
        procurement: "BUY",
        name: "솔더 볼",
        spec: "",
        unit: "EA",
        inspectIn: true,
        inspectOut: false,
        leadTimeDays: 0,
        safetyStock: 0,
        minLot: 0,
        lotMultiple: 0,
        ...NO_CLASS,
      },
    });
  });

  it("넣은 값은 기본값보다 앞선다", () => {
    const r = readItemRow(
      { itemType: "FG", name: "IC", unit: "개", procurement: "구매", inspectIn: "Y", inspectOut: "N" },
      units,
    );
    expect(r).toMatchObject({
      ok: true,
      value: { procurement: "BUY", inspectIn: true, inspectOut: false, unit: "EA" },
    });
  });

  it("기본값이 없는 칸(품명 · 유형 · 단위)이 비면 틀린 줄 — 칸마다 까닭", () => {
    expect(readItemRow({ spec: "x" }, units)).toEqual({
      ok: false,
      errors: {
        itemType: "유형을 넣으세요 — 원자재(RM) · 반제품(SF) · 완제품(FG)",
        unit: "단위를 넣으세요",
        name: "품명을 넣으세요",
      },
    });
  });

  it("모르는 값 · 「사용 안 함」 단위 · 같은 이름의 단위 · 틀린 Y/N", () => {
    const r = readItemRow({ itemType: "부품", name: "x", unit: "그램", procurement: "외주", inspectIn: "네" }, units);
    expect(r).toEqual({
      ok: false,
      errors: {
        itemType: "유형은 원자재(RM) · 반제품(SF) · 완제품(FG) 가운데 하나입니다",
        procurement: "조달구분은 구매(BUY) · 생산(MAKE) 가운데 하나입니다",
        unit: "「사용 안 함」인 단위입니다 — 다른 단위를 넣으세요",
        inspectIn: "Y · N 가운데 하나로 넣으세요(O · X, 예 · 아니오도 됩니다)",
      },
    });
    expect(readItemRow({ itemType: "RM", name: "x", unit: "낱개" }, units)).toMatchObject({
      ok: false,
      errors: { unit: "같은 이름의 단위가 둘 이상입니다 — 코드로 넣으세요" },
    });
  });

  it("유형을 못 읽고 조달구분이 비면 유형의 까닭 하나만", () => {
    const r = readItemRow({ itemType: "부품", name: "x", unit: "EA" }, units);
    expect(r).toEqual({ ok: false, errors: { itemType: expect.any(String) } });
  });

  it("칸의 규칙은 한 건 등록과 같다 — 품명 100자 · 리드타임 365 · 수량 소수 셋째 자리", () => {
    const r = readItemRow(
      { itemType: "RM", name: "가".repeat(101), unit: "EA", leadTimeDays: "366", safetyStock: "1.0001", minLot: "-1" },
      units,
    );
    expect(r).toEqual({
      ok: false,
      errors: {
        name: "품명은 100자까지입니다",
        leadTimeDays: "리드타임은 0 ~ 365 사이의 정수(일)입니다",
        safetyStock: "안전재고는 소수 셋째 자리까지입니다",
        minLot: "최소 발주 · 생산량은 0 이상입니다",
      },
    });
  });
});

describe("거래처 한 줄", () => {
  it("빈 칸 — 국가는 한국, 매입처 · 매출처는 N, 번호는 없음", () => {
    expect(readPartnerRow({ name: "(가상) 바다", isSupplier: "Y" }, countries)).toEqual({
      ok: true,
      value: {
        name: "(가상) 바다",
        isSupplier: true,
        isCustomer: false,
        country: "KR",
        bizNo: null,
        foreignBizNo: null,
        ...NO_DESC,
      },
    });
  });

  it("사업자번호 칸은 국가를 따라 읽는다", () => {
    expect(
      readPartnerRow({ name: "a", isCustomer: "O", country: "미국", bizNo: " 12-3456789 " }, countries),
    ).toMatchObject({
      ok: true,
      value: { country: "US", bizNo: null, foreignBizNo: "12-3456789" },
    });
    expect(
      readPartnerRow({ name: "a", isCustomer: "예", country: "kr", bizNo: "000-00-00001" }, countries),
    ).toMatchObject({
      ok: true,
      value: { country: "KR", bizNo: "000-00-00001", foreignBizNo: null },
    });
  });

  it("매입처 · 매출처가 다 비거나 N 이면 「구분」의 까닭", () => {
    expect(readPartnerRow({ name: "a", isSupplier: "N" }, countries)).toEqual({
      ok: false,
      errors: { role: "매입처 · 매출처 가운데 하나 이상을 고르세요" },
    });
  });

  it("틀린 Y/N 도 「구분」 자리에 — 그 칸 이름과 함께", () => {
    expect(readPartnerRow({ name: "a", isSupplier: "Y", isCustomer: "네" }, countries)).toEqual({
      ok: false,
      errors: { role: "매출처 칸은 Y · N 가운데 하나로 넣으세요(O · X, 예 · 아니오도 됩니다)" },
    });
  });

  it("국가를 못 읽으면 국가의 까닭 하나만 — 번호는 보지 않는다", () => {
    expect(readPartnerRow({ name: "a", isSupplier: "Y", country: "대만", bizNo: "x" }, countries)).toEqual({
      ok: false,
      errors: { country: "「사용 안 함」인 국가입니다 — 다른 국가를 넣으세요" },
    });
    expect(readPartnerRow({ name: "a", isSupplier: "Y", country: "독일" }, countries)).toEqual({
      ok: false,
      errors: { country: "공통코드의 국가(COUNTRY)에 없는 국가입니다" },
    });
  });

  it("해외 사업자번호의 거절도 「사업자번호」 칸에", () => {
    expect(readPartnerRow({ name: "a", isSupplier: "Y", country: "US", bizNo: "x".repeat(31) }, countries)).toEqual({
      ok: false,
      errors: { bizNo: "해외 사업자번호는 30자까지입니다" },
    });
  });
});

describe("불러온 줄(PR J)", () => {
  const units: CodeOption[] = [
    { code: "EA", name: "개", active: true },
    { code: "M", name: "미터", active: false },
  ];
  const classes = { cls1: [{ code: "WIRE", name: "와이어", active: false }], cls2: [], cls3: [] };
  const wire = {
    code: "RM-0003",
    version: "1",
    itemType: "RM",
    name: "금 와이어",
    spec: "지름 25µm",
    unit: "M",
    procurement: "BUY",
    inspectIn: true,
    inspectOut: false,
    leadTimeDays: 30,
    safetyStock: 1000.5,
    minLot: 0,
    lotMultiple: 0,
    cls1: "WIRE",
    cls2: null,
    cls3: null,
    note: "",
    active: false,
  };

  it("불러온 품목을 그대로 다시 읽으면 같은 값이다 — 지금 값인 「사용 안 함」 단위 · 분류도 남는다", () => {
    const r = readItemEditRow(itemSheetRow(wire), units, classes, wire);
    expect(r).toEqual({
      ok: true,
      value: {
        procurement: "BUY",
        name: "금 와이어",
        spec: "지름 25µm",
        unit: "M",
        inspectIn: true,
        inspectOut: false,
        leadTimeDays: 30,
        safetyStock: 1000.5,
        minLot: 0,
        lotMultiple: 0,
        cls1: "WIRE",
        cls2: null,
        cls3: null,
        note: "",
        active: false,
      },
    });
  });

  it("새 줄은 「사용 안 함」 단위를 거절하고, 사용 여부 N 을 받지 않는다", () => {
    const r = readItemRow({ itemType: "RM", name: "x", unit: "M", active: "N" }, units, classes);
    expect(r).toEqual({
      ok: false,
      errors: {
        unit: "「사용 안 함」인 단위입니다 — 다른 단위를 넣으세요",
        active: "새 줄은 사용(Y)으로만 등록합니다 — 비우거나 Y 를 넣으세요",
      },
    });
    expect(readItemRow({ itemType: "RM", name: "x", unit: "EA", active: "Y" }, units).ok).toBe(true);
    expect(readItemRow({ itemType: "RM", name: "x", unit: "EA", active: "가" }, units)).toMatchObject({
      errors: { active: expect.stringContaining("Y · N") },
    });
  });

  it("불러온 거래처를 그대로 다시 읽으면 같은 값이다 — 해외 번호는 사업자번호 칸에서 읽는다", () => {
    const jp = {
      code: "BP-0006",
      version: "1",
      name: "(가상) 몰딩",
      isSupplier: true,
      isCustomer: false,
      country: "JP",
      bizNo: null,
      foreignBizNo: "0000000000000",
      ...NO_DESC,
      active: true,
    };
    const countries: CodeOption[] = [
      { code: "KR", name: "한국", active: true },
      { code: "JP", name: "일본", active: false },
    ];
    expect(readPartnerEditRow(partnerSheetRow(jp), countries, jp)).toEqual({
      ok: true,
      value: {
        name: "(가상) 몰딩",
        isSupplier: true,
        isCustomer: false,
        country: "JP",
        bizNo: null,
        foreignBizNo: "0000000000000",
        ...NO_DESC,
        active: true,
      },
    });
    // 새 줄이면 「사용 안 함」 국가는 거절한다.
    expect(readPartnerRow({ ...partnerSheetRow(jp), _code: "" }, countries)).toMatchObject({
      errors: { country: "「사용 안 함」인 국가입니다 — 다른 국가를 넣으세요" },
    });
  });
});
