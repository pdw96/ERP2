// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseNewPartner, parsePartnerUpdate, partnerValues, type PartnerValues } from "@/lib/partner-input";

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

// 설계 ③ 의 거래처 칸마다 맞는 꼴과 틀린 꼴 — 서버의 검사라 화면을 건너뛴 요청에도 같다.

const good: PartnerValues = { name: "(가상) 바다솔더", isSupplier: "on", bizNo: "000-00-00006" };
const ROLE = "매입처 · 매출처 가운데 하나 이상을 고르세요";
const BIZ = "사업자등록번호는 000-00-00000 꼴로 넣거나 비우세요";

describe("거래처 등록의 입력", () => {
  it("맞는 꼴 — 값이 그대로 읽히고, 끈 체크 상자는 끔이다", () => {
    expect(parseNewPartner(good)).toEqual({
      ok: true,
      value: {
        name: "(가상) 바다솔더",
        isSupplier: true,
        isCustomer: false,
        country: "KR",
        bizNo: "000-00-00006",
        foreignBizNo: null,
        ...NO_DESC,
      },
    });
  });

  it("매출처만 · 둘 다를 받는다", () => {
    expect(parseNewPartner({ ...good, isSupplier: undefined, isCustomer: "on" })).toMatchObject({
      ok: true,
      value: { isSupplier: false, isCustomer: true },
    });
    expect(parseNewPartner({ ...good, isCustomer: "on" })).toMatchObject({
      ok: true,
      value: { isSupplier: true, isCustomer: true },
    });
  });

  it("사업자등록번호 — 비우면 없음, 앞뒤 빈칸은 지운다", () => {
    expect(parseNewPartner({ ...good, bizNo: "" })).toMatchObject({ ok: true, value: { bizNo: null } });
    expect(parseNewPartner({ ...good, bizNo: undefined })).toMatchObject({ ok: true, value: { bizNo: null } });
    expect(parseNewPartner({ ...good, bizNo: " 123-45-67890 " })).toMatchObject({
      ok: true,
      value: { bizNo: "123-45-67890" },
    });
  });

  it("거래처명 100자를 받는다", () => {
    expect(parseNewPartner({ ...good, name: "가".repeat(100) })).toMatchObject({ ok: true });
  });

  it.each([
    ["거래처명 없음", { name: "" }, "name", "거래처명을 넣으세요"],
    ["거래처명 101자", { name: "가".repeat(101) }, "name", "거래처명은 100자까지입니다"],
    ["구분 없음", { isSupplier: undefined }, "role", ROLE],
    ["매입처 칸에 목록 밖 값", { isSupplier: "yes" }, "role", "켬 · 끔 가운데 하나여야 합니다"],
    ["사업자등록번호 숫자만", { bizNo: "1234567890" }, "bizNo", BIZ],
    ["사업자등록번호 자리가 다름", { bizNo: "12-345-67890" }, "bizNo", BIZ],
    ["사업자등록번호에 글자", { bizNo: "abc-de-fghij" }, "bizNo", BIZ],
  ])("%s → 그 칸을 거절", (_name, over, field, message) => {
    expect(parseNewPartner({ ...good, ...over })).toEqual({ ok: false, errors: { [field]: message } });
  });

  it("틀린 칸이 여럿이면 함께 알린다 — 구분도", () => {
    expect(parseNewPartner({ name: "", bizNo: "x" })).toEqual({
      ok: false,
      errors: { name: "거래처명을 넣으세요", role: ROLE, bizNo: BIZ },
    });
  });
});

describe("거래처 수정의 입력", () => {
  it("맞는 꼴 — 사용 여부를 받는다", () => {
    expect(parsePartnerUpdate({ ...good, active: "N" })).toEqual({
      ok: true,
      value: {
        name: "(가상) 바다솔더",
        isSupplier: true,
        isCustomer: false,
        country: "KR",
        bizNo: "000-00-00006",
        foreignBizNo: null,
        active: false,
        ...NO_DESC,
      },
    });
  });

  it("사용 여부가 없으면 거절", () => {
    expect(parsePartnerUpdate(good)).toEqual({ ok: false, errors: { active: "사용 여부를 고르세요" } });
  });
});

describe("국가와 해외 사업자번호(PR G)", () => {
  const us: PartnerValues = { name: "(가상) 노스필드디바이스", isCustomer: "on", country: "US" };

  it("국가 칸이 오지 않으면 한국이다", () => {
    expect(parseNewPartner(good)).toMatchObject({ ok: true, value: { country: "KR" } });
  });

  it("해외 — 해외 사업자번호를 글자 그대로 받고(앞뒤 빈칸만 지움), 사업자등록번호는 보지 않는다", () => {
    const r = parseNewPartner({ ...us, foreignBizNo: "  EIN 12-3456789 ", bizNo: "틀린 꼴" });
    expect(r).toEqual({
      ok: true,
      value: {
        name: "(가상) 노스필드디바이스",
        isSupplier: false,
        isCustomer: true,
        country: "US",
        bizNo: null,
        foreignBizNo: "EIN 12-3456789",
        ...NO_DESC,
      },
    });
  });

  it("한국 — 해외 사업자번호는 보지 않고 없음으로 남긴다", () => {
    expect(parseNewPartner({ ...good, foreignBizNo: "x".repeat(99) })).toMatchObject({
      ok: true,
      value: { country: "KR", bizNo: "000-00-00006", foreignBizNo: null },
    });
  });

  it("해외 사업자번호 — 비우면 없음, 30자는 받고 31자는 거절", () => {
    expect(parseNewPartner({ ...us, foreignBizNo: "" })).toMatchObject({ ok: true, value: { foreignBizNo: null } });
    expect(parseNewPartner({ ...us, foreignBizNo: "가".repeat(30) })).toMatchObject({ ok: true });
    expect(parseNewPartner({ ...us, foreignBizNo: "가".repeat(31) })).toEqual({
      ok: false,
      errors: { foreignBizNo: "해외 사업자번호는 30자까지입니다" },
    });
  });

  it.each(["", "kr", "한국", "K-R"])("국가 「%s」는 거절", (country) => {
    expect(parseNewPartner({ ...good, country })).toEqual({ ok: false, errors: { country: "국가를 고르세요" } });
  });
});

describe("화면이 보낸 칸", () => {
  it("아는 칸의 글자만 모은다 — 코드는 버린다", () => {
    const form = new FormData();
    form.set("name", "(가상) 바다솔더");
    form.set("isSupplier", "on");
    form.set("code", "BP-9999");
    expect(partnerValues(form)).toEqual({ name: "(가상) 바다솔더", isSupplier: "on" });
  });
});
