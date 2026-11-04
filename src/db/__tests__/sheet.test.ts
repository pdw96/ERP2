// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { updateCode } from "@/db/codes";
import { createItemRows, getItem, ITEM_LIMIT } from "@/db/items";
import { createPartnerRows, getPartner, PARTNER_LIMIT } from "@/db/partners";
import { REGISTER_LOCK, registerRowsWithCode } from "@/db/master-shared";
import { resetToSample } from "@/db/reset";
import { items, partners } from "@/db/schema";
import type { Db } from "@/db/types";
import { ROW_ERROR, type SheetRow } from "@/lib/sheet";
import { migratedDb } from "./pglite";

// 시트형 등록(PR F, 성공 기준 11) — 맞는 줄만 저장되고 코드가 줄 차례로 붙는다. PGlite 에서 실제 SQL 로(설계 ⑤).

let handle: Awaited<ReturnType<typeof migratedDb>>;
let db: Db;
beforeAll(async () => {
  handle = await migratedDb();
  db = handle.db;
});
afterAll(() => handle.close());
beforeEach(() => resetToSample(db));

const item = (over: SheetRow = {}): SheetRow => ({ itemType: "원자재", name: "솔더 볼", unit: "EA", ...over });
const partner = (over: SheetRow = {}): SheetRow => ({ name: "(가상) 바다솔더", isSupplier: "Y", ...over });
const itemCount = async () => (await db.select().from(items)).length;
const partnerCount = async () => (await db.select().from(partners)).length;

describe("품목 시트", () => {
  it("맞는 줄 · 틀린 줄이 섞이면 맞는 줄만 저장되고, 코드는 줄 차례로 붙는다", async () => {
    const r = await createItemRows(db, [
      item({ name: "솔더 볼 A" }),
      item({ name: "", unit: "EA" }),
      item({ name: "솔더 볼 B" }),
      item({ itemType: "완제품", name: "SOP-8 IC" }),
      item({ name: "솔더 볼 C", unit: "BOX" }),
      item({ name: "솔더 볼 D" }),
    ]);
    // 샘플은 RM-0006 · FG-0002 까지 있다.
    expect(r.saved).toEqual([
      { code: "RM-0007", name: "솔더 볼 A" },
      { code: "RM-0008", name: "솔더 볼 B" },
      { code: "FG-0003", name: "SOP-8 IC" },
      { code: "RM-0009", name: "솔더 볼 D" },
    ]);
    expect(r.rejected).toEqual([
      { row: item({ name: "", unit: "EA" }), errors: { name: "품명을 넣으세요" } },
      { row: item({ name: "솔더 볼 C", unit: "BOX" }), errors: { unit: "공통코드의 단위(UNIT)에 없는 단위입니다" } },
    ]);
    expect(r.formError).toBeUndefined();
    expect(await itemCount()).toBe(14);
  });

  it("고르는 값은 이름 · 코드 둘 다 받는다", async () => {
    const r = await createItemRows(db, [
      item({ itemType: "RM", unit: "킬로그램", procurement: "생산", inspectIn: "아니오" }),
      item({ itemType: "반제품", unit: "kg", procurement: "BUY", inspectOut: "o" }),
    ]);
    expect(r.rejected).toEqual([]);
    expect(await getItem(db, "RM-0007")).toMatchObject({
      unit: "KG",
      procurement: "MAKE",
      inspectIn: false,
      inspectOut: false,
    });
    expect(await getItem(db, "SF-0003")).toMatchObject({ unit: "KG", procurement: "BUY", inspectOut: true });
  });

  it("빈 칸은 한 건 등록의 기본값 — 조달구분 · 검사 대상은 유형의 것, 계획 정보는 0, 규격은 빈 채로", async () => {
    await createItemRows(db, [item({ itemType: "원자재" }), item({ itemType: "완제품" })]);
    expect(await getItem(db, "RM-0007")).toMatchObject({
      spec: "",
      procurement: "BUY",
      inspectIn: true,
      inspectOut: false,
      leadTimeDays: 0,
      safetyStock: 0,
      minLot: 0,
      lotMultiple: 0,
    });
    expect(await getItem(db, "FG-0003")).toMatchObject({ procurement: "MAKE", inspectIn: false, inspectOut: true });
  });

  it("계획 정보를 넣으면 남는다 — 천 단위 쉼표도 읽는다", async () => {
    await createItemRows(db, [
      item({ leadTimeDays: "14", safetyStock: "1,000", minLot: "500.5", lotMultiple: "0.125" }),
    ]);
    expect(await getItem(db, "RM-0007")).toMatchObject({
      leadTimeDays: 14,
      safetyStock: 1000,
      minLot: 500.5,
      lotMultiple: 0.125,
    });
  });

  it("빈 줄은 건너뛴다 — 틀린 줄도 저장한 줄도 아니다", async () => {
    const r = await createItemRows(db, [{ itemType: "", name: "  " }, item(), {}]);
    expect(r.saved).toHaveLength(1);
    expect(r.rejected).toEqual([]);
  });

  it("「사용 안 함」 단위는 받지 않는다 — 한 건 등록과 같다", async () => {
    await updateCode(db, "UNIT", "G", { name: "그램", sortOrder: "40", active: "N" });
    const r = await createItemRows(db, [item({ unit: "G" }), item({ unit: "그램" })]);
    expect(r.saved).toEqual([]);
    expect(r.rejected.map((x) => x.errors.unit)).toEqual([
      "「사용 안 함」인 단위입니다 — 다른 단위를 넣으세요",
      "「사용 안 함」인 단위입니다 — 다른 단위를 넣으세요",
    ]);
  });

  it("공통코드에 더한 단위를 이름으로 넣을 수 있다", async () => {
    const { createCode } = await import("@/db/codes");
    await createCode(db, "UNIT", { code: "BOX", name: "상자", sortOrder: "50" });
    const r = await createItemRows(db, [item({ unit: "상자" })]);
    expect(r.saved).toEqual([{ code: "RM-0007", name: "솔더 볼" }]);
    expect(await getItem(db, "RM-0007")).toMatchObject({ unit: "BOX" });
  });

  it(`등록 상한 ${ITEM_LIMIT}개를 넘는 줄은 저장되지 않고 남는다`, async () => {
    const filler = Array.from({ length: ITEM_LIMIT - 12 }, (_, i) => ({
      code: `RM-${String(i + 100).padStart(4, "0")}`,
      name: "채움",
      itemType: "RM",
      procurement: "BUY",
      unit: "EA",
    }));
    await db.insert(items).values(filler);
    const r = await createItemRows(db, [item({ name: "가" }), item({ name: "나" }), item({ name: "다" })]);
    expect(r.saved.map((s) => s.name)).toEqual(["가", "나"]);
    expect(r.rejected).toEqual([
      { row: item({ name: "다" }), errors: { [ROW_ERROR]: expect.stringContaining("2,000개까지") } },
    ]);
    expect(await itemCount()).toBe(ITEM_LIMIT);
  });

  it("동시에 시트 둘을 저장해도 코드가 겹치지 않고 상한을 넘지 않는다", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => item({ name: `줄 ${i}` }));
    const [a, b] = await Promise.all([createItemRows(db, rows), createItemRows(db, rows)]);
    const codes = [...a.saved, ...b.saved].map((s) => s.code).sort();
    expect(new Set(codes).size).toBe(10);
    expect(codes[0]).toBe("RM-0007");
    expect(codes[9]).toBe("RM-0016");
  });
});

describe("거래처 시트", () => {
  it("맞는 줄만 저장되고 BP 의 다음 번호가 줄 차례로 붙는다", async () => {
    const r = await createPartnerRows(db, [
      partner({ name: "(가상) 하나" }),
      partner({ name: "(가상) 둘", isSupplier: "N", isCustomer: "" }),
      partner({ name: "(가상) 셋", isCustomer: "Y", bizNo: "000-00-00099" }),
    ]);
    expect(r.saved).toEqual([
      { code: "BP-0008", name: "(가상) 하나" },
      { code: "BP-0009", name: "(가상) 셋" },
    ]);
    expect(r.rejected).toEqual([
      {
        row: partner({ name: "(가상) 둘", isSupplier: "N", isCustomer: "" }),
        errors: { role: "매입처 · 매출처 가운데 하나 이상을 고르세요" },
      },
    ]);
    expect(await getPartner(db, "BP-0009")).toMatchObject({
      isSupplier: true,
      isCustomer: true,
      bizNo: "000-00-00099",
    });
  });

  it("국가는 이름 · 코드 둘 다 받고, 비우면 한국이다", async () => {
    await createPartnerRows(db, [
      partner({ name: "(가상) 미국", country: "미국", bizNo: "00-0000099" }),
      partner({ name: "(가상) 일본", country: "jp", bizNo: "0000000000099" }),
      partner({ name: "(가상) 한국", bizNo: "000-00-00098" }),
    ]);
    expect(await getPartner(db, "BP-0008")).toMatchObject({ country: "US", bizNo: null, foreignBizNo: "00-0000099" });
    expect(await getPartner(db, "BP-0009")).toMatchObject({ country: "JP", foreignBizNo: "0000000000099" });
    expect(await getPartner(db, "BP-0010")).toMatchObject({ country: "KR", bizNo: "000-00-00098", foreignBizNo: null });
  });

  it("한국이면 사업자번호를 000-00-00000 꼴로 본다 — 다른 나라는 글자 그대로 30자까지", async () => {
    const r = await createPartnerRows(db, [
      partner({ bizNo: "0000000001" }),
      partner({ country: "US", bizNo: "x".repeat(31) }),
      partner({ country: "US", bizNo: "x".repeat(30) }),
    ]);
    expect(r.rejected.map((x) => x.errors)).toEqual([
      { bizNo: "사업자등록번호는 000-00-00000 꼴로 넣거나 비우세요" },
      { bizNo: "해외 사업자번호는 30자까지입니다" },
    ]);
    expect(r.saved).toHaveLength(1);
  });

  it("「사용 안 함」 · 없는 국가는 받지 않는다", async () => {
    await updateCode(db, "COUNTRY", "TW", { name: "대만", sortOrder: "50", active: "N" });
    const r = await createPartnerRows(db, [partner({ country: "대만" }), partner({ country: "독일" })]);
    expect(r.rejected.map((x) => x.errors)).toEqual([
      { country: "「사용 안 함」인 국가입니다 — 다른 국가를 넣으세요" },
      { country: "공통코드의 국가(COUNTRY)에 없는 국가입니다" },
    ]);
  });

  it("같은 사업자번호는 막지 않고, 저장한 줄에 같은 번호를 쓰는 다른 거래처를 알린다 — 같은 시트의 줄끼리도", async () => {
    const r = await createPartnerRows(db, [
      partner({ name: "(가상) 가람 2공장", bizNo: "000-00-00001" }),
      partner({ name: "(가상) 새 거래처", bizNo: "000-00-00077" }),
      partner({ name: "(가상) 새 거래처 지점", bizNo: "000-00-00077" }),
    ]);
    expect(r.saved).toEqual([
      {
        code: "BP-0008",
        name: "(가상) 가람 2공장",
        sharedBizNo: [{ code: "BP-0001", name: "(가상) 가람리드프레임", active: true }],
      },
      {
        code: "BP-0009",
        name: "(가상) 새 거래처",
        sharedBizNo: [{ code: "BP-0010", name: "(가상) 새 거래처 지점", active: true }],
      },
      {
        code: "BP-0010",
        name: "(가상) 새 거래처 지점",
        sharedBizNo: [{ code: "BP-0009", name: "(가상) 새 거래처", active: true }],
      },
    ]);
  });

  it(`등록 상한 ${PARTNER_LIMIT}개를 넘는 줄은 저장되지 않고 남는다`, async () => {
    await db.insert(partners).values(
      Array.from({ length: PARTNER_LIMIT - 8 }, (_, i) => ({
        code: `BP-${String(i + 100).padStart(4, "0")}`,
        name: "채움",
        isSupplier: true,
      })),
    );
    const r = await createPartnerRows(db, [partner({ name: "가" }), partner({ name: "나" })]);
    expect(r.saved.map((s) => s.name)).toEqual(["가"]);
    expect(r.rejected[0].errors[ROW_ERROR]).toContain("거래처는 1,000개까지");
    expect(await partnerCount()).toBe(PARTNER_LIMIT);
  });
});

describe("여러 줄의 등록 — 줄마다 저장점", () => {
  const raw = (name: string) => ({
    prefix: "RM" as const,
    insert: (tx: Db, code: string) =>
      tx.insert(items).values({ code, name, itemType: "RM", procurement: "BUY", unit: "EA" }),
  });

  it("DB 제약에 걸린 줄만 되돌아가고 앞뒤 줄은 저장된다 — 번호도 비지 않는다", async () => {
    const r = await registerRowsWithCode(db, {
      table: items,
      lock: REGISTER_LOCK.items,
      limit: ITEM_LIMIT,
      uniqueConstraint: "items_code_unique",
      rows: [raw("가"), raw("나".repeat(101)), raw("다")],
    });
    expect(r[0]).toEqual({ ok: true, code: "RM-0007" });
    expect(r[1]).toMatchObject({ ok: false, reason: "rejected" });
    expect(r[2]).toEqual({ ok: true, code: "RM-0008" });
    expect(await itemCount()).toBe(12);
  });

  it("제약 위반이 아닌 실패는 던지고, 아무것도 저장하지 않는다", async () => {
    const boom = { prefix: "RM" as const, insert: () => Promise.reject(new Error("끊김")) };
    await expect(
      registerRowsWithCode(db, {
        table: items,
        lock: REGISTER_LOCK.items,
        limit: ITEM_LIMIT,
        uniqueConstraint: "items_code_unique",
        rows: [raw("가"), boom],
      }),
    ).rejects.toThrow("끊김");
    expect(await itemCount()).toBe(10);
  });
});
