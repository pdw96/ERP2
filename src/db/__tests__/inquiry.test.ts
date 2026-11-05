// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { listItems, type ItemFilter } from "@/db/items";
import { allCountries, listPartners, parsePartnerFilter, type PartnerFilter } from "@/db/partners";
import { resetToSample } from "@/db/reset";
import type { Db } from "@/db/types";
import { migratedDb } from "./pglite";

// 품목 조회 · 거래처 조회의 찾기 · 거르기(PR I, 성공 기준 14) — PGlite 에서 실제 SQL 로.
// 조회의 찾기는 글 칸 전체를 보고, 등록의 목록은 그대로 코드 · 이름만 본다(저자 판정 2026-11-04).

let handle: Awaited<ReturnType<typeof migratedDb>>;
let db: Db;
beforeAll(async () => {
  handle = await migratedDb();
  db = handle.db;
});
afterAll(() => handle.close());
beforeEach(() => resetToSample(db));

const codesOf = (rows: { code: string }[]) => rows.map((r) => r.code);
const items: ItemFilter = { q: "", includeInactive: false };
const partners: PartnerFilter = { q: "", includeInactive: false };

describe("품목 조회의 찾기", () => {
  it("규격 · 비고의 글자로도 찾는다", async () => {
    expect(codesOf(await listItems(db, { ...items, q: "냉장" }, "allText"))).toEqual(["RM-0004"]);
    expect(codesOf(await listItems(db, { ...items, q: "200µm" }, "allText"))).toEqual(["RM-0001"]);
    expect(codesOf(await listItems(db, { ...items, q: "qfn-32" }, "allText"))).toEqual(["FG-0002", "RM-0006"]);
  });

  it("코드 · 품명은 그대로 찾는다", async () => {
    expect(codesOf(await listItems(db, { ...items, q: "fg-000" }, "allText"))).toEqual(["FG-0001", "FG-0002"]);
  });

  it("등록의 목록은 코드 · 품명만 본다 — 비고의 글자로는 찾지 않는다", async () => {
    expect(await listItems(db, { ...items, q: "냉장" })).toEqual([]);
  });

  it("찾을 글자의 % · _ 는 글자 그대로 찾는다", async () => {
    expect(await listItems(db, { ...items, q: "%" }, "allText")).toEqual([]);
    expect(await listItems(db, { ...items, q: "_" }, "allText")).toEqual([]);
  });

  it("찾기와 거르기가 함께 걸린다", async () => {
    expect(codesOf(await listItems(db, { ...items, q: "SOP-8", itemType: "SF" }, "allText"))).toEqual([
      "SF-0001",
      "SF-0002",
    ]);
  });
});

describe("거래처 조회의 찾기", () => {
  it("대표자 · 담당자 · 이메일 · 비고 · 해외 사업자번호의 글자로도 찾는다", async () => {
    expect(codesOf(await listPartners(db, { ...partners, q: "김철수" }, "allText"))).toEqual(["BP-0001"]);
    expect(codesOf(await listPartners(db, { ...partners, q: "yamada" }, "allText"))).toEqual(["BP-0006"]);
    expect(codesOf(await listPartners(db, { ...partners, q: "northfield" }, "allText"))).toEqual(["BP-0007"]);
    expect(codesOf(await listPartners(db, { ...partners, q: "주 공급처" }, "allText"))).toEqual(["BP-0001", "BP-0006"]);
    expect(codesOf(await listPartners(db, { ...partners, q: "00-0000007" }, "allText"))).toEqual(["BP-0007"]);
  });

  it("등록의 목록은 코드 · 거래처명만 본다 — 담당자 이름으로는 찾지 않는다", async () => {
    expect(await listPartners(db, { ...partners, q: "김철수" })).toEqual([]);
  });
});

describe("거래처 조회의 국가 거르기", () => {
  it("국가로 거르고, 구분 · 찾기와 함께 걸린다", async () => {
    expect(codesOf(await listPartners(db, { ...partners, country: "JP" }, "allText"))).toEqual(["BP-0006"]);
    expect(codesOf(await listPartners(db, { ...partners, country: "KR", role: "customer" }, "allText"))).toEqual([
      "BP-0004",
      "BP-0005",
    ]);
    expect(await listPartners(db, { ...partners, country: "US", role: "supplier" }, "allText")).toEqual([]);
  });

  it("주소의 국가는 공통코드에 있는 값만 거르고, 없는 값은 거르지 않고 알린다", async () => {
    const countries = await allCountries(db);
    expect(parsePartnerFilter({ country: "JP" }, countries).filter.country).toBe("JP");
    const unknown = parsePartnerFilter({ country: "ZZ" }, countries);
    expect(unknown.filter.country).toBeUndefined();
    expect(unknown.notices).toEqual([{ field: "country", message: "없는 국가라 거르지 않았습니다" }]);
  });

  it("「사용 안 함」 국가로도 거른다 — 이미 쓴 거래처를 찾을 수 있게", () => {
    const countries = [{ code: "JP", name: "일본", active: false }];
    expect(parsePartnerFilter({ country: "JP" }, countries).filter.country).toBe("JP");
  });

  it("등록의 목록(국가 목록을 주지 않음)은 국가를 거르지 않고 알리지도 않는다", () => {
    expect(parsePartnerFilter({ country: "JP" })).toEqual({ filter: partners, notices: [] });
  });
});
