// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseItemUpdate, parseNewItem, type ItemValues } from "@/lib/item-input";
import { eun } from "@/lib/josa";
import { PARTNER_TEXT_FIELDS, isEmail, isPhone } from "@/lib/partner-fields";
import { parseNewPartner, parsePartnerUpdate, type PartnerValues } from "@/lib/partner-input";
import { readItemRow, readPartnerRow, type CodeOption } from "@/lib/sheet-input";

// 설명용 칸(PR H, 성공 기준 13 · ADR 0012) — 칸마다 빈 값 · 맞는 값 · 길이를 넘는 값, 전화 · 이메일의 꼴, 시트의 분류.
// 서버의 검사라 화면을 건너뛴 요청에도 같다. 분류가 공통코드에 있는지 · 「사용 안 함」인지는 DB 쪽 시험(descriptive.test.ts)이 본다.

const item: ItemValues = {
  itemType: "RM",
  procurement: "BUY",
  name: "솔더 볼",
  unit: "EA",
  leadTimeDays: "0",
  safetyStock: "0",
  minLot: "0",
  lotMultiple: "0",
};
const partner: PartnerValues = { name: "(가상) 바다솔더", isSupplier: "on" };

describe("품목의 분류 · 비고", () => {
  it("모두 비우거나 칸이 오지 않으면 없음 — 분류는 null, 비고는 빈 글자", () => {
    const r = parseNewItem(item);
    expect(r).toMatchObject({ ok: true, value: { cls1: null, cls2: null, cls3: null, note: "" } });
    expect(parseNewItem({ ...item, cls1: "", cls2: " ", note: "  " })).toMatchObject({
      ok: true,
      value: { cls1: null, cls2: null, note: "" },
    });
  });

  it("맞는 값 — 분류는 코드 그대로, 비고는 앞뒤 빈칸만 지우고 줄바꿈은 남는다", () => {
    expect(
      parseNewItem({ ...item, cls1: "WAFER", cls2: " SOP ", cls3: "POWER", note: " 냉장 보관\n5℃ 이하 " }),
    ).toMatchObject({ ok: true, value: { cls1: "WAFER", cls2: "SOP", cls3: "POWER", note: "냉장 보관\n5℃ 이하" } });
  });

  it("분류가 코드의 꼴이 아니면 그 칸을 알린다", () => {
    expect(parseNewItem({ ...item, cls1: "wafer", cls3: "전원" })).toEqual({
      ok: false,
      errors: { cls1: "대분류를 목록에서 고르세요", cls3: "소분류를 목록에서 고르세요" },
    });
  });

  it("비고는 500자까지 — 501자면 거절", () => {
    expect(parseNewItem({ ...item, note: "가".repeat(500) })).toMatchObject({ ok: true });
    expect(parseItemUpdate({ ...item, active: "Y", note: "가".repeat(501) })).toEqual({
      ok: false,
      errors: { note: "비고는 500자까지입니다" },
    });
  });
});

describe("거래처의 설명용 칸", () => {
  it("모두 비우거나 칸이 오지 않으면 빈 글자", () => {
    const r = parseNewPartner(partner);
    expect(r.ok).toBe(true);
    if (r.ok) for (const { field } of PARTNER_TEXT_FIELDS) expect(r.value[field], field).toBe("");
  });

  it("맞는 값 — 앞뒤 빈칸만 지운다", () => {
    expect(
      parsePartnerUpdate({
        ...partner,
        active: "Y",
        ceo: " 홍길동 ",
        bizType: "제조업",
        bizItem: "리드프레임",
        address: "가상시 가람구 산단로 101",
        phone: "031-0000-0001",
        email: "sales@garam.example.com",
        contactName: "김철수",
        contactPhone: "+82 (10) 0000-0001",
        note: "주 공급처",
      }),
    ).toMatchObject({
      ok: true,
      value: { ceo: "홍길동", phone: "031-0000-0001", contactPhone: "+82 (10) 0000-0001", note: "주 공급처" },
    });
  });

  it.each(PARTNER_TEXT_FIELDS.map((f) => [f.label, f] as const))(
    "%s — 길이의 경계",
    (_label, { field, label, max }) => {
      // 전화 · 이메일은 꼴을 지키며 길이만 늘린다.
      const fill = (n: number) =>
        field === "email"
          ? `${"a".repeat(n - "@example.com".length)}@example.com`
          : field.endsWith("hone")
            ? "0".repeat(n)
            : "가".repeat(n);
      expect(parseNewPartner({ ...partner, [field]: fill(max) }), `${max}자`).toMatchObject({ ok: true });
      const over = parseNewPartner({ ...partner, [field]: fill(max + 1) });
      expect(over.ok).toBe(false);
      if (!over.ok) expect(over.errors[field]).toBe(`${eun(label)} ${max}자까지입니다`);
    },
  );

  it.each([
    ["02-1234-5678", true],
    ["+81-6-0000-0000", true],
    ["(02) 123 4567", true],
    ["010.1234.5678", false],
    ["내선 12", false],
    ["--", false],
  ])("전화 %s → %s", (phone, ok) => {
    expect(isPhone(phone)).toBe(ok);
    const r = parseNewPartner({ ...partner, phone, contactPhone: phone });
    expect(r.ok).toBe(ok);
    if (!r.ok) {
      expect(r.errors.phone).toBe("전화는 숫자 · 붙임표(-) · + · 괄호로 넣으세요");
      expect(r.errors.contactPhone).toBe("담당자 연락처는 숫자 · 붙임표(-) · + · 괄호로 넣으세요");
    }
  });

  it("전화가 20자를 넘으면 길이를 알린다(꼴은 21자째부터 보지 않는다)", () => {
    expect(isPhone("0".repeat(21))).toBe(false);
    expect(parseNewPartner({ ...partner, phone: "0".repeat(21) })).toEqual({
      ok: false,
      errors: { phone: "전화는 20자까지입니다" },
    });
  });

  it.each([
    ["name@example.com", true],
    ["a.b+c@sub.example.co.kr", true],
    ["name@example", false],
    ["@example.com", false],
    ["name@@example.com", false],
    ["na me@example.com", false],
    ["name@example.", false],
  ])("이메일 %s → %s", (email, ok) => {
    expect(isEmail(email)).toBe(ok);
    const r = parseNewPartner({ ...partner, email });
    expect(r.ok).toBe(ok);
    if (!r.ok) expect(r.errors).toEqual({ email: "이메일은 name@example.com 꼴로 넣으세요" });
  });
});

describe("시트의 설명용 칸", () => {
  const units: CodeOption[] = [{ code: "EA", name: "개", active: true }];
  const classes = {
    cls1: [
      { code: "WAFER", name: "웨이퍼", active: true },
      { code: "OLD", name: "옛 분류", active: false },
    ],
    cls2: [
      { code: "SOP", name: "SOP", active: true },
      { code: "S1", name: "같은 이름", active: true },
      { code: "S2", name: "같은 이름", active: true },
    ],
    cls3: [{ code: "POWER", name: "전원", active: true }],
  };
  const row = { itemType: "원자재", name: "웨이퍼", unit: "EA" };

  it("분류는 이름 · 코드 둘 다 받고(코드는 대소문자 무시), 비우면 없음", () => {
    expect(readItemRow({ ...row, cls1: "웨이퍼", cls2: "sop", note: "메모" }, units, classes)).toMatchObject({
      ok: true,
      value: { cls1: "WAFER", cls2: "SOP", cls3: null, note: "메모" },
    });
  });

  it("없는 값 · 「사용 안 함」 값 · 같은 이름이 둘인 값은 그 칸의 까닭과 함께 남는다", () => {
    expect(readItemRow({ ...row, cls1: "옛 분류", cls2: "같은 이름", cls3: "센서" }, units, classes)).toEqual({
      ok: false,
      errors: {
        cls1: "「사용 안 함」인 대분류입니다 — 다른 값을 넣으세요",
        cls2: "같은 이름의 중분류가 둘 이상입니다 — 코드로 넣으세요",
        cls3: "공통코드의 소분류(ITEM_CLS3)에 없는 값입니다",
      },
    });
  });

  it("PR F 꼴의 줄(분류 · 비고 칸이 없음)도 그대로 읽힌다", () => {
    expect(readItemRow(row, units, classes)).toMatchObject({ ok: true, value: { cls1: null, note: "" } });
  });

  it("거래처 — 설명용 칸은 글자 그대로, 꼴이 틀린 전화 · 이메일은 그 칸에 남는다", () => {
    const countries: CodeOption[] = [{ code: "KR", name: "한국", active: true }];
    expect(
      readPartnerRow({ name: "(가상) 바다", isSupplier: "Y", ceo: "홍길동", phone: "02-0000-0001" }, countries),
    ).toMatchObject({ ok: true, value: { ceo: "홍길동", phone: "02-0000-0001", email: "" } });
    expect(readPartnerRow({ name: "(가상) 바다", isSupplier: "Y", phone: "없음", email: "x" }, countries)).toEqual({
      ok: false,
      errors: {
        phone: "전화는 숫자 · 붙임표(-) · + · 괄호로 넣으세요",
        email: "이메일은 name@example.com 꼴로 넣으세요",
      },
    });
  });
});
