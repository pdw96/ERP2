// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPartner,
  getPartner,
  listPartners,
  PARTNER_LIMIT,
  parsePartnerFilter,
  partnersSharingBizNo,
  previewPartnerCode,
  roleNames,
  updatePartner,
  type PartnerFilter,
} from "@/db/partners";
import { resetToSample } from "@/db/reset";
import { countryNames, countryOptions } from "@/db/partners";
import { updateCode } from "@/db/codes";
import { partners } from "@/db/schema";
import type { Db } from "@/db/types";
import type { PartnerValues } from "@/lib/partner-input";
import { migratedDb } from "./pglite";

// 거래처의 목록 · 등록 · 수정 — PGlite 에서 실제 SQL 로(설계 ⑤).

let handle: Awaited<ReturnType<typeof migratedDb>>;
let db: Db;
beforeAll(async () => {
  handle = await migratedDb();
  db = handle.db;
});
afterAll(() => handle.close());
beforeEach(() => resetToSample(db));

const all: PartnerFilter = { q: "", includeInactive: false };
const codesOf = (rows: { code: string }[]) => rows.map((r) => r.code);
const count = async () => (await db.select().from(partners)).length;
// 한국 거래처의 번호 — 같은 번호 찾기에 넘기는 꼴.
const kr = (bizNo: string | null) => ({ country: "KR", bizNo, foreignBizNo: null });

const newSupplier: PartnerValues = { name: "(가상) 바다솔더", isSupplier: "on", bizNo: "000-00-00006" };
// 샘플 BP-0001 의 값 그대로 — 고칠 칸만 덮어쓴다.
const editOf = (over: PartnerValues = {}): PartnerValues => ({
  name: "(가상) 가람리드프레임",
  isSupplier: "on",
  bizNo: "000-00-00001",
  active: "Y",
  ...over,
});

describe("목록", () => {
  it("기본 보기 — 사용 중인 거래처를 코드 순으로", async () => {
    expect(codesOf(await listPartners(db, all))).toEqual([
      "BP-0001",
      "BP-0002",
      "BP-0003",
      "BP-0004",
      "BP-0005",
      "BP-0006",
      "BP-0007",
    ]);
  });

  it("코드나 거래처명에 든 글자로 찾는다 — 대소문자를 가리지 않는다", async () => {
    expect(codesOf(await listPartners(db, { ...all, q: "누리" }))).toEqual(["BP-0002"]);
    expect(codesOf(await listPartners(db, { ...all, q: "bp-0004" }))).toEqual(["BP-0004"]);
  });

  it("찾을 글자의 % · _ 는 글자 그대로 찾는다", async () => {
    expect(await listPartners(db, { ...all, q: "%" })).toEqual([]);
    expect(await listPartners(db, { ...all, q: "_" })).toEqual([]);
  });

  it("매입처 · 매출처로 거른다 — 둘 다인 거래처는 어느 쪽에도 보인다", async () => {
    expect(codesOf(await listPartners(db, { ...all, role: "supplier" }))).toEqual([
      "BP-0001",
      "BP-0002",
      "BP-0003",
      "BP-0005",
      "BP-0006",
    ]);
    expect(codesOf(await listPartners(db, { ...all, role: "customer" }))).toEqual(["BP-0004", "BP-0005", "BP-0007"]);
  });

  it("「사용 안 함」은 기본 보기에서 빠지고, 「사용 안 함 포함」이면 보인다", async () => {
    await updatePartner(db, "BP-0003", editOf({ name: "(가상) 다온케미칼", bizNo: "000-00-00003", active: "N" }));
    expect(codesOf(await listPartners(db, all))).not.toContain("BP-0003");
    expect(codesOf(await listPartners(db, { ...all, includeInactive: true }))).toContain("BP-0003");
  });
});

describe("목록의 거르기 값", () => {
  it("맞는 값을 읽는다", () => {
    expect(parsePartnerFilter({ q: " 누리 ", role: "supplier", inactive: "1" })).toEqual({
      filter: { q: "누리", role: "supplier", includeInactive: true },
      notices: [],
    });
  });

  it("빈 주소면 거르지 않는다", () => {
    expect(parsePartnerFilter({})).toEqual({ filter: { q: "", includeInactive: false }, notices: [] });
  });

  it.each([
    ["51자 찾을 글자", { q: "가".repeat(51) }, "q"],
    ["목록 밖의 구분", { role: "both" }, "role"],
  ])("%s → 그 값으로 거르지 않고 알린다", (_name, params, field) => {
    const { filter, notices } = parsePartnerFilter(params);
    expect(filter).toEqual({ q: "", includeInactive: false });
    expect(notices.map((n) => n.field)).toEqual([field]);
  });
});

describe("등록", () => {
  it("샘플의 다음 번호 BP-0008 이 붙고, 넣은 값이 그대로 남는다", async () => {
    expect(await createPartner(db, newSupplier)).toEqual({ ok: true, code: "BP-0008" });
    expect(await getPartner(db, "BP-0008")).toMatchObject({
      name: "(가상) 바다솔더",
      isSupplier: true,
      isCustomer: false,
      bizNo: "000-00-00006",
      active: true,
    });
  });

  it("빈 테이블이면 첫 번호 BP-0001 이다", async () => {
    await db.delete(partners);
    expect(await createPartner(db, newSupplier)).toEqual({ ok: true, code: "BP-0001" });
  });

  it("매입처 · 매출처 둘 다, 사업자등록번호 없이 등록한다", async () => {
    const r = await createPartner(db, { name: "(가상) 사랑전자", isSupplier: "on", isCustomer: "on", bizNo: "" });
    expect(r).toEqual({ ok: true, code: "BP-0008" });
    expect(await getPartner(db, "BP-0008")).toMatchObject({ isSupplier: true, isCustomer: true, bizNo: null });
  });

  it("보낸 코드는 쓰지 않는다 — 서버가 붙인다", async () => {
    const r = await createPartner(db, { ...newSupplier, code: "BP-9999" } as PartnerValues);
    expect(r).toEqual({ ok: true, code: "BP-0008" });
    expect(await getPartner(db, "BP-9999")).toBeUndefined();
  });

  it("매입처 · 매출처를 하나도 고르지 않으면 저장되지 않는다 — 다른 칸의 거절과 함께 알린다", async () => {
    const r = await createPartner(db, { name: "", bizNo: "12345" });
    expect(r).toEqual({
      ok: false,
      errors: {
        name: "거래처명을 넣으세요",
        role: "매입처 · 매출처 가운데 하나 이상을 고르세요",
        bizNo: "사업자등록번호는 000-00-00000 꼴로 넣거나 비우세요",
      },
      values: { name: "", bizNo: "12345" },
    });
    expect(await count()).toBe(7);
  });

  it("두 사람이 같은 번호를 받으면 다음 번호로 한 번 더 넣는다", async () => {
    const numbering = await import("@/db/numbering");
    const spy = vi.spyOn(numbering, "nextCode").mockResolvedValueOnce("BP-0007");
    try {
      expect(await createPartner(db, newSupplier)).toEqual({ ok: true, code: "BP-0008" });
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      spy.mockRestore();
    }
  });

  const fill = (n: number) =>
    db.insert(partners).values(
      Array.from({ length: n }, (_, i) => ({
        code: `BP-${String(i + 100).padStart(4, "0")}`,
        name: "채움",
        isSupplier: true,
      })),
    );

  it(`등록 상한 ${PARTNER_LIMIT}개에 닿으면 저장하지 않는다`, async () => {
    await fill(PARTNER_LIMIT - 7);
    const r = await createPartner(db, newSupplier);
    expect(r).toMatchObject({ ok: false, formError: expect.stringContaining("거래처는 1,000개까지") });
    expect(await count()).toBe(PARTNER_LIMIT);
  });

  it(`동시에 등록해도 상한 ${PARTNER_LIMIT}개를 넘지 않는다`, async () => {
    await fill(PARTNER_LIMIT - 8);
    const results = await Promise.all(Array.from({ length: 5 }, () => createPartner(db, newSupplier)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await count()).toBe(PARTNER_LIMIT);
  });
});

describe("수정", () => {
  it("거래처명 · 구분 · 사업자등록번호를 고치면 남는다 — 코드는 그대로", async () => {
    const r = await updatePartner(
      db,
      "BP-0001",
      editOf({ name: "(가상) 가람프레임", isCustomer: "on", bizNo: "000-00-00011" }),
    );
    expect(r).toEqual({ ok: true, code: "BP-0001" });
    expect(await getPartner(db, "BP-0001")).toMatchObject({
      code: "BP-0001",
      name: "(가상) 가람프레임",
      isSupplier: true,
      isCustomer: true,
      bizNo: "000-00-00011",
    });
  });

  it("매입처를 끄고 매출처만 남긴다 · 사업자등록번호를 비운다", async () => {
    await updatePartner(db, "BP-0005", editOf({ isSupplier: undefined, isCustomer: "on", bizNo: "" }));
    expect(await getPartner(db, "BP-0005")).toMatchObject({ isSupplier: false, isCustomer: true, bizNo: null });
  });

  it("코드를 보내도 바뀌지 않는다", async () => {
    await updatePartner(db, "BP-0001", { ...editOf(), code: "BP-0777" } as PartnerValues);
    expect(await getPartner(db, "BP-0001")).toMatchObject({ code: "BP-0001" });
    expect(await getPartner(db, "BP-0777")).toBeUndefined();
  });

  it("둘 다 끄면 아무것도 바꾸지 않는다", async () => {
    const r = await updatePartner(db, "BP-0001", editOf({ isSupplier: undefined, name: "바뀜" }));
    expect(r).toMatchObject({ ok: false, errors: { role: expect.any(String) } });
    expect(await getPartner(db, "BP-0001")).toMatchObject({ name: "(가상) 가람리드프레임", isSupplier: true });
  });

  it("없는 거래처면 찾지 못했다고 돌려준다", async () => {
    expect(await updatePartner(db, "BP-0999", editOf())).toEqual({ ok: false, notFound: true });
    expect(await updatePartner(db, "'; drop table partners; --", editOf())).toEqual({ ok: false, notFound: true });
  });

  it("「사용 안 함」으로 바꾸고 다시 사용으로 돌린다 — 행은 남는다", async () => {
    await updatePartner(db, "BP-0001", editOf({ active: "N" }));
    expect(await getPartner(db, "BP-0001")).toMatchObject({ active: false });
    await updatePartner(db, "BP-0001", editOf({ active: "Y" }));
    expect(await getPartner(db, "BP-0001")).toMatchObject({ active: true });
    expect(await count()).toBe(7);
  });

  it("DB 의 제약에 걸리면(서버의 검사를 빠뜨렸을 때) 그 칸을 알린다", async () => {
    const input = await import("@/lib/partner-input");
    const spy = vi.spyOn(input, "parsePartnerUpdate").mockReturnValue({
      ok: true,
      value: {
        name: "x",
        isSupplier: false,
        isCustomer: false,
        country: "KR",
        bizNo: "123",
        foreignBizNo: null,
        ceo: "",
        bizType: "",
        bizItem: "",
        address: "",
        phone: "",
        email: "",
        contactName: "",
        contactPhone: "",
        note: "",
        active: true,
      },
    });
    try {
      const r = await updatePartner(db, "BP-0001", editOf());
      // 제약 둘(구분 · 사업자등록번호)이 걸릴 수 있고, DB 는 먼저 본 하나를 알린다.
      expect(r).toMatchObject({ ok: false, errors: expect.any(Object) });
      expect(Object.values((r as { errors: Record<string, string> }).errors)).toEqual(["받을 수 없는 값입니다"]);
      expect(await getPartner(db, "BP-0001")).toMatchObject({ isSupplier: true, bizNo: "000-00-00001" });
    } finally {
      spy.mockRestore();
    }
  });
});

describe("같은 사업자등록번호 — 막지 않고 경고만", () => {
  it("겹쳐도 저장된다", async () => {
    const r = await createPartner(db, { ...newSupplier, bizNo: "000-00-00005" });
    expect(r).toEqual({ ok: true, code: "BP-0008" });
  });

  it("같은 번호를 쓰는 다른 거래처를 코드 순으로 찾는다 — 자기 자신은 빼고, 「사용 안 함」도 넣는다", async () => {
    await createPartner(db, { ...newSupplier, bizNo: "000-00-00005" });
    await updatePartner(db, "BP-0005", editOf({ name: "(가상) 마루반도체", bizNo: "000-00-00005", active: "N" }));
    expect(await partnersSharingBizNo(db, { code: "BP-0008", ...kr("000-00-00005") })).toEqual([
      { code: "BP-0005", name: "(가상) 마루반도체", active: false },
    ]);
    expect(await partnersSharingBizNo(db, { code: "BP-0005", ...kr("000-00-00005") })).toEqual([
      { code: "BP-0008", name: "(가상) 바다솔더", active: true },
    ]);
  });

  it("겹치지 않거나 번호가 없으면 빈 목록", async () => {
    expect(await partnersSharingBizNo(db, { code: "BP-0001", ...kr("000-00-00001") })).toEqual([]);
    await createPartner(db, { ...newSupplier, bizNo: "" });
    expect(await partnersSharingBizNo(db, { code: "BP-0008", ...kr(null) })).toEqual([]);
  });
});

describe("국가와 해외 사업자번호(PR G · 성공 기준 12)", () => {
  const usCustomer: PartnerValues = {
    name: "(가상) 하버라인칩스",
    isCustomer: "on",
    country: "US",
    foreignBizNo: "00-0000099",
  };
  const deactivate = (code: string, name: string, sortOrder: string) =>
    updateCode(db, "COUNTRY", code, { name, sortOrder, active: "N" });

  it("샘플의 해외 거래처 — 일본 매입처 · 미국 매출처, 해외 사업자번호를 두고 사업자등록번호는 없다", async () => {
    expect(await getPartner(db, "BP-0006")).toMatchObject({
      country: "JP",
      bizNo: null,
      foreignBizNo: "0000000000006",
    });
    expect(await getPartner(db, "BP-0007")).toMatchObject({ country: "US", bizNo: null, foreignBizNo: "00-0000007" });
    expect(await getPartner(db, "BP-0001")).toMatchObject({ country: "KR", foreignBizNo: null });
  });

  it("해외 거래처를 등록한다 — 국가와 해외 사업자번호가 남는다", async () => {
    expect(await createPartner(db, usCustomer)).toEqual({ ok: true, code: "BP-0008" });
    expect(await getPartner(db, "BP-0008")).toMatchObject({ country: "US", bizNo: null, foreignBizNo: "00-0000099" });
  });

  it("국가를 보내지 않으면 한국으로 등록된다", async () => {
    await createPartner(db, newSupplier);
    expect(await getPartner(db, "BP-0008")).toMatchObject({ country: "KR", bizNo: "000-00-00006" });
  });

  it("공통코드에 없는 국가는 거절한다", async () => {
    const r = await createPartner(db, { ...usCustomer, country: "XX" });
    expect(r).toMatchObject({ ok: false, errors: { country: "국가를 고르세요" } });
    expect(await count()).toBe(7);
  });

  it("「사용 안 함」 국가 — 새 거래처에서는 거절하고 목록에서 빠지며, 이미 쓴 거래처에는 남아 그대로 저장된다", async () => {
    await deactivate("JP", "일본", "30");
    expect((await countryOptions(db)).map((c) => c.code)).toEqual(["KR", "US", "CN", "TW"]);
    expect(await countryOptions(db, "JP")).toContainEqual({ code: "JP", name: "일본", active: false });
    const r = await createPartner(db, { ...usCustomer, country: "JP" });
    expect(r).toMatchObject({ ok: false, errors: { country: expect.stringContaining("「사용 안 함」") } });
    const kept = await updatePartner(db, "BP-0006", {
      name: "(가상) 소라몰드머티리얼",
      isSupplier: "on",
      country: "JP",
      foreignBizNo: "0000000000006",
      active: "Y",
    });
    expect(kept).toEqual({ ok: true, code: "BP-0006" });
  });

  it("한국 거래처를 해외로 바꾸면 사업자등록번호는 비고 해외 사업자번호가 남는다 — 그 반대도", async () => {
    await updatePartner(db, "BP-0001", editOf({ country: "CN", foreignBizNo: "91110000000000000X" }));
    expect(await getPartner(db, "BP-0001")).toMatchObject({
      country: "CN",
      bizNo: null,
      foreignBizNo: "91110000000000000X",
    });
    await updatePartner(db, "BP-0001", editOf({ country: "KR" }));
    expect(await getPartner(db, "BP-0001")).toMatchObject({ country: "KR", bizNo: "000-00-00001", foreignBizNo: null });
  });

  it("같은 해외 사업자번호 — 같은 나라면 경고하고, 나라가 다르면 다른 번호다", async () => {
    await createPartner(db, { ...usCustomer, foreignBizNo: "00-0000007" });
    const shared = await partnersSharingBizNo(db, {
      code: "BP-0008",
      country: "US",
      bizNo: null,
      foreignBizNo: "00-0000007",
    });
    expect(shared).toEqual([{ code: "BP-0007", name: "(가상) 노스필드디바이스", active: true }]);
    const other = await partnersSharingBizNo(db, {
      code: "BP-0008",
      country: "JP",
      bizNo: null,
      foreignBizNo: "00-0000007",
    });
    expect(other).toEqual([]);
  });

  it("목록은 국가를 이름으로 보인다 — 「사용 안 함」 국가도", async () => {
    await deactivate("TW", "대만", "50");
    expect(await countryNames(db)).toEqual({ KR: "한국", US: "미국", JP: "일본", CN: "중국", TW: "대만" });
  });
});

describe("입력 화면 · 표시", () => {
  it("등록하면 붙을 코드", async () => {
    expect(await previewPartnerCode(db)).toBe("BP-0008");
  });

  it("구분을 한 줄로", () => {
    expect(roleNames({ isSupplier: true, isCustomer: true })).toBe("매입처 · 매출처");
    expect(roleNames({ isSupplier: false, isCustomer: true })).toBe("매출처");
  });
});
