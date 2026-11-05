// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getCode, updateCode } from "@/db/codes";
import { getItem, loadItemsForSheet, parseItemFilter, saveItemRows, updateItem } from "@/db/items";
import { STALE, STALE_ROW, DUPLICATE_ROW } from "@/db/master-shared";
import { getPartner, loadPartnersForSheet, savePartnerRows, updatePartner } from "@/db/partners";
import { resetToSample } from "@/db/reset";
import { getWarehouse, updateWarehouse } from "@/db/warehouses";
import type { Db } from "@/db/types";
import { CODE_KEY, ROW_ERROR, VERSION_KEY } from "@/lib/sheet";
import { migratedDb } from "./pglite";

// 시트에서 기존 데이터 고치기(PR J, 성공 기준 15)와 버전 확인(저자 판정 2026-11-05 — 시트 · 한 건 수정 다 막음).
// PGlite 에서 실제 SQL 로(설계 ⑤).

let handle: Awaited<ReturnType<typeof migratedDb>>;
let db: Db;
beforeAll(async () => {
  handle = await migratedDb();
  db = handle.db;
});
afterAll(() => handle.close());
beforeEach(() => resetToSample(db));

const all = { q: "", includeInactive: true };
const loadItems = async (q = "") => (await loadItemsForSheet(db, { ...all, q })).rows;
const loadedItem = async (code: string) => (await loadItems(code))[0];
const loadedPartner = async (code: string) => (await loadPartnersForSheet(db, { ...all, q: code })).rows[0];

// 한 건 수정의 값 — 웨이퍼(RM-0001)를 고친다.
const waferEdit = (over: Record<string, string> = {}) => ({
  procurement: "BUY",
  name: "웨이퍼",
  spec: "8인치 · 두께 200µm",
  unit: "EA",
  inspectIn: "on",
  leadTimeDays: "21",
  safetyStock: "50",
  minLot: "25",
  lotMultiple: "25",
  cls1: "WAFER",
  cls2: "COMMON",
  active: "Y",
  ...over,
});

describe("시트에 불러오기", () => {
  it("기존 품목을 코드 순으로, 고르는 값은 코드로, 숨은 칸에 코드와 버전을 둔다", async () => {
    const rows = await loadItems();
    expect(rows.map((r) => r[CODE_KEY])).toEqual([...rows.map((r) => r[CODE_KEY])].sort());
    const wafer = rows.find((r) => r[CODE_KEY] === "RM-0001")!;
    expect(wafer).toMatchObject({
      itemType: "RM",
      name: "웨이퍼",
      unit: "EA",
      procurement: "BUY",
      inspectIn: "Y",
      inspectOut: "N",
      leadTimeDays: "21",
      safetyStock: "50",
      cls1: "WAFER",
      cls2: "COMMON",
      cls3: "",
      active: "Y",
    });
    expect(wafer[VERSION_KEY]).toMatch(/^[0-9]+$/);
    expect(wafer[VERSION_KEY]).toBe((await getItem(db, "RM-0001"))!.version);
  });

  it("등록의 목록과 같은 찾기 · 거르기를 쓴다 — 「사용 안 함」은 고를 때만", async () => {
    await updateItem(
      db,
      "RM-0002",
      waferEdit({ name: "리드프레임", unit: "EA", cls1: "FRAME", cls2: "SOP", active: "N" }),
    );
    const { filter } = parseItemFilter({ type: "RM" });
    const active = await loadItemsForSheet(db, filter);
    expect(active.rows.every((r) => r.itemType === "RM")).toBe(true);
    expect(active.rows.map((r) => r[CODE_KEY])).not.toContain("RM-0002");
    const withInactive = await loadItemsForSheet(db, { ...filter, includeInactive: true });
    expect(withInactive.rows.find((r) => r[CODE_KEY] === "RM-0002")).toMatchObject({ active: "N" });
    expect(withInactive.total).toBe(active.total + 1);
  });

  it("찾은 것이 100건을 넘으면 앞 100건만 오고, 찾은 건수를 함께 준다", async () => {
    const r = await saveItemRows(
      db,
      Array.from({ length: 95 }, (_, i) => ({ itemType: "RM", name: `솔더 볼 ${i}`, unit: "EA" })),
    );
    expect(r.saved).toHaveLength(95);
    const { rows, total } = await loadItemsForSheet(db, { q: "", includeInactive: false });
    expect(total).toBe(105);
    expect(rows).toHaveLength(100);
    expect(rows[0][CODE_KEY]).toBe("FG-0001");
  });

  it("거래처는 사업자번호를 한국 · 해외 가운데 있는 것으로, 구분 · 사용 여부를 Y/N 으로", async () => {
    const { rows } = await loadPartnersForSheet(db, { ...all, country: "JP" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ country: "JP", isSupplier: "Y", isCustomer: "N", active: "Y" });
    expect(rows[0].bizNo).not.toBe("");
    expect((await loadedPartner("BP-0001")).bizNo).toBe("000-00-00001");
  });
});

describe("품목 시트의 고침", () => {
  it("불러온 줄을 고쳐 저장하면 그 품목이 바뀌고 버전이 달라진다 — 코드는 그대로, 「고침」으로 알린다", async () => {
    const row = await loadedItem("RM-0001");
    const r = await saveItemRows(db, [{ ...row, safetyStock: "200", note: "시트에서 고침" }]);
    expect(r).toEqual({ saved: [{ code: "RM-0001", name: "웨이퍼", updated: true }], rejected: [] });
    const after = (await getItem(db, "RM-0001"))!;
    expect(after).toMatchObject({ safetyStock: 200, note: "시트에서 고침", leadTimeDays: 21 });
    expect(after.version).not.toBe(row[VERSION_KEY]);
  });

  it("새 줄과 고친 줄을 한 시트에 같이 저장한다 — 새 줄에만 코드가 붙는다", async () => {
    const row = await loadedItem("RM-0003");
    const r = await saveItemRows(db, [
      { itemType: "원자재", name: "솔더 볼", unit: "EA" },
      { ...row, name: "금 와이어 25µm" },
    ]);
    expect(r.saved).toEqual([
      { code: "RM-0007", name: "솔더 볼" },
      { code: "RM-0003", name: "금 와이어 25µm", updated: true },
    ]);
  });

  it("유형은 고치지 않는다 — 불러온 줄의 유형 칸에 다른 값이 와도 그 품목의 유형으로 본다", async () => {
    const row = await loadedItem("RM-0001");
    const r = await saveItemRows(db, [{ ...row, itemType: "FG", procurement: "" }]);
    expect(r.rejected).toEqual([]);
    // 빈 조달구분은 그 품목 유형(원자재)의 기본값인 구매다.
    expect(await getItem(db, "RM-0001")).toMatchObject({ itemType: "RM", procurement: "BUY" });
  });

  it("시트에서 「사용 안 함」으로 바꾸고, 비우면 사용이다", async () => {
    const [a, b] = [await loadedItem("RM-0001"), await loadedItem("RM-0002")];
    await saveItemRows(db, [
      { ...a, active: "N" },
      { ...b, active: "", note: "x" },
    ]);
    expect((await getItem(db, "RM-0001"))!.active).toBe(false);
    expect((await getItem(db, "RM-0002"))!.active).toBe(true);
    const c = await loadedItem("RM-0001");
    await saveItemRows(db, [{ ...c, active: "" }]);
    expect((await getItem(db, "RM-0001"))!.active).toBe(true);
  });

  it("새 줄은 「사용」으로만 등록한다 — N 이면 그 줄을 거절한다", async () => {
    const r = await saveItemRows(db, [{ itemType: "RM", name: "솔더 볼", unit: "EA", active: "N" }]);
    expect(r.saved).toEqual([]);
    expect(r.rejected[0].errors).toEqual({ active: "새 행은 사용(Y)으로만 등록합니다 — 비우거나 Y 를 넣으세요" });
  });

  it("「사용 안 함」 단위 · 분류도 그 품목의 지금 값이면 남는다 — 새로 고르면 거절한다(한 건 수정과 같다)", async () => {
    await updateCode(db, "UNIT", "M", { name: "미터", sortOrder: "20", active: "N" });
    await updateCode(db, "ITEM_CLS1", "WIRE", { name: "와이어", sortOrder: "30", active: "N" });
    const wire = await loadedItem("RM-0003");
    expect(wire).toMatchObject({ unit: "M", cls1: "WIRE" });
    const kept = await saveItemRows(db, [{ ...wire, note: "단위 그대로" }]);
    expect(kept.rejected).toEqual([]);

    const wafer = await loadedItem("RM-0001");
    const r = await saveItemRows(db, [{ ...wafer, unit: "M", cls1: "WIRE" }]);
    expect(r.rejected[0].errors).toEqual({
      unit: "「사용 안 함」인 단위입니다 — 다른 단위를 넣으세요",
      cls1: "「사용 안 함」인 대분류입니다 — 다른 값을 넣으세요",
    });
  });

  it("불러온 뒤 다른 사람이 고쳤으면 그 줄만 남고, 다른 사람의 값은 그대로다 — 나머지 줄은 저장된다", async () => {
    const [mine, other] = [await loadedItem("RM-0003"), await loadedItem("RM-0004")];
    // B 가 한 건 수정 화면에서 RM-0003 의 안전재고를 고친다.
    const b = (await getItem(db, "RM-0003"))!;
    await updateItem(
      db,
      "RM-0003",
      waferEdit({ name: b.name, spec: b.spec, unit: "M", cls1: "WIRE", safetyStock: "999" }),
      b.version,
    );

    const r = await saveItemRows(db, [
      { ...mine, safetyStock: "100" },
      { ...other, note: "A 가 고침" },
    ]);
    expect(r.saved).toEqual([{ code: "RM-0004", name: other.name, updated: true }]);
    expect(r.rejected).toEqual([{ row: { ...mine, safetyStock: "100" }, errors: { [ROW_ERROR]: STALE_ROW } }]);
    expect((await getItem(db, "RM-0003"))!.safetyStock).toBe(999);
  });

  it("없는 코드 · 버전의 꼴이 틀린 줄 · 같은 코드가 둘인 줄은 저장하지 않는다", async () => {
    const row = await loadedItem("RM-0001");
    const r = await saveItemRows(db, [
      { ...row, [CODE_KEY]: "RM-9999" },
      { ...row, [CODE_KEY]: "RM-0002", [VERSION_KEY]: "abc" },
      { ...(await loadedItem("RM-0005")), note: "1" },
      { ...(await loadedItem("RM-0005")), note: "2" },
    ]);
    expect(r.saved).toEqual([]);
    expect(r.rejected.map((x) => x.errors[ROW_ERROR])).toEqual([
      "없는 품목입니다 — 이 행을 지우세요",
      STALE_ROW,
      DUPLICATE_ROW,
      DUPLICATE_ROW,
    ]);
  });

  it("bigint 를 넘는 버전(20자리)은 그 줄만 남고 같은 시트의 다른 줄은 저장된다(대장 NC-9)", async () => {
    const [big, other] = [await loadedItem("RM-0002"), await loadedItem("RM-0003")];
    const r = await saveItemRows(db, [
      { ...big, [VERSION_KEY]: "99999999999999999999", note: "버전 조작" },
      { ...other, note: "고침" },
      { ...big, [CODE_KEY]: "", [VERSION_KEY]: "", name: "새 품목" },
    ]);
    expect(r.saved.map((s) => s.updated ?? false)).toEqual([true, false]);
    expect(r.rejected.map((x) => x.errors[ROW_ERROR])).toEqual([STALE_ROW]);
    expect((await getItem(db, "RM-0003"))!.note).toBe("고침");
  });

  it("고친 줄이 칸의 규칙에 걸리면 한 건 수정과 같은 까닭으로 남는다", async () => {
    const row = await loadedItem("RM-0001");
    const r = await saveItemRows(db, [{ ...row, name: "", leadTimeDays: "400" }]);
    expect(r.rejected[0].errors).toEqual({
      name: "품명을 넣으세요",
      leadTimeDays: "리드타임은 0 ~ 365 사이의 정수(일)입니다",
    });
  });
});

describe("거래처 시트의 고침", () => {
  it("불러온 줄을 고쳐 저장하고, 같은 사업자번호 경고도 고친 줄에 붙는다", async () => {
    const row = await loadedPartner("BP-0002");
    const r = await savePartnerRows(db, [{ ...row, bizNo: "000-00-00001", phone: "031-0000-0099" }]);
    expect(r.saved).toEqual([
      {
        code: "BP-0002",
        name: row.name,
        updated: true,
        sharedBizNo: [{ code: "BP-0001", name: "(가상) 가람리드프레임", active: true }],
      },
    ]);
    expect(await getPartner(db, "BP-0002")).toMatchObject({ bizNo: "000-00-00001", phone: "031-0000-0099" });
  });

  it("「사용 안 함」 국가도 그 거래처의 지금 값이면 남고, 사용 여부를 시트에서 바꾼다", async () => {
    const jp = (await loadPartnersForSheet(db, { ...all, country: "JP" })).rows[0];
    await updateCode(db, "COUNTRY", "JP", { name: "일본", sortOrder: "30", active: "N" });
    const r = await savePartnerRows(db, [{ ...jp, active: "N" }]);
    expect(r.rejected).toEqual([]);
    expect(await getPartner(db, jp[CODE_KEY])).toMatchObject({ country: "JP", active: false });
  });

  it("불러온 뒤 다른 사람이 고쳤으면 그 줄은 남는다", async () => {
    const row = await loadedPartner("BP-0001");
    const now = (await getPartner(db, "BP-0001"))!;
    await updatePartner(
      db,
      "BP-0001",
      { name: "(가상) 가람리드프레임 본사", isSupplier: "on", bizNo: now.bizNo!, active: "Y" },
      now.version,
    );
    const r = await savePartnerRows(db, [{ ...row, note: "A" }]);
    expect(r.saved).toEqual([]);
    expect(r.rejected[0].errors).toEqual({ [ROW_ERROR]: STALE_ROW });
    expect((await getPartner(db, "BP-0001"))!.name).toBe("(가상) 가람리드프레임 본사");
  });
});

describe("한 건 수정의 버전", () => {
  it("연 때의 버전이 맞으면 저장되고 버전이 달라진다", async () => {
    const before = (await getItem(db, "RM-0001"))!;
    expect(await updateItem(db, "RM-0001", waferEdit({ safetyStock: "60" }), before.version)).toEqual({
      ok: true,
      code: "RM-0001",
    });
    const after = (await getItem(db, "RM-0001"))!;
    expect(after.safetyStock).toBe(60);
    expect(after.version).not.toBe(before.version);
  });

  it("연 뒤 다른 사람이 고쳤으면 저장하지 않고 넣은 값을 돌려준다 — 다른 사람의 값이 남는다", async () => {
    const opened = (await getItem(db, "RM-0001"))!.version;
    await updateItem(db, "RM-0001", waferEdit({ safetyStock: "200" }), opened);
    const mine = waferEdit({ safetyStock: "100" });
    expect(await updateItem(db, "RM-0001", mine, opened)).toEqual({
      ok: false,
      errors: {},
      formError: STALE,
      values: mine,
    });
    expect((await getItem(db, "RM-0001"))!.safetyStock).toBe(200);
  });

  it("버전이 없거나 꼴이 틀리면 고치지 않는다", async () => {
    for (const version of ["", "abc", "1; drop table items", "99999999999999999999"])
      expect(await updateItem(db, "RM-0001", waferEdit({ safetyStock: "1" }), version)).toMatchObject({
        formError: STALE,
      });
    expect((await getItem(db, "RM-0001"))!.safetyStock).toBe(50);
  });

  it("같은 화면을 두 번 저장해도 두 번째는 막힌다 — 이어서 고쳐도 버전이 갈린다", async () => {
    const opened = (await getItem(db, "RM-0001"))!.version;
    expect(await updateItem(db, "RM-0001", waferEdit({ safetyStock: "1" }), opened)).toMatchObject({ ok: true });
    expect(await updateItem(db, "RM-0001", waferEdit({ safetyStock: "2" }), opened)).toMatchObject({
      formError: STALE,
    });
  });

  it("거래처도 같다", async () => {
    const p = (await getPartner(db, "BP-0001"))!;
    const values = { name: p.name, isSupplier: "on", bizNo: p.bizNo!, active: "Y" };
    expect(await updatePartner(db, "BP-0001", { ...values, note: "먼저" }, p.version)).toMatchObject({ ok: true });
    expect(await updatePartner(db, "BP-0001", { ...values, note: "늦게" }, p.version)).toMatchObject({
      formError: STALE,
    });
    expect((await getPartner(db, "BP-0001"))!.note).toBe("먼저");
  });

  it("창고도 같다(저자 판정 2026-11-05 — 창고 · 공통코드에도)", async () => {
    const w = (await getWarehouse(db, "WH-04"))!;
    expect(await updateWarehouse(db, "WH-04", { name: "불량품 창고", active: "Y" }, w.version)).toMatchObject({
      ok: true,
    });
    expect(await updateWarehouse(db, "WH-04", { name: "늦은 이름", active: "Y" }, w.version)).toEqual({
      ok: false,
      errors: {},
      formError: STALE,
      values: { name: "늦은 이름", active: "Y" },
    });
    expect(await updateWarehouse(db, "WH-04", { name: "늦은 이름", active: "Y" }, "")).toMatchObject({
      formError: STALE,
    });
    expect((await getWarehouse(db, "WH-04"))!.name).toBe("불량품 창고");
  });

  it("공통코드도 같다", async () => {
    const g = (await getCode(db, "UNIT", "G"))!;
    expect(
      await updateCode(db, "UNIT", "G", { name: "그램(g)", sortOrder: "40", active: "Y" }, g.version),
    ).toMatchObject({
      ok: true,
    });
    expect(
      await updateCode(db, "UNIT", "G", { name: "늦은 이름", sortOrder: "40", active: "Y" }, g.version),
    ).toMatchObject({ ok: false, formError: STALE });
    expect(await updateCode(db, "UNIT", "G", { name: "늦은 이름", sortOrder: "40", active: "Y" }, "x")).toMatchObject({
      formError: STALE,
    });
    expect((await getCode(db, "UNIT", "G"))!.name).toBe("그램(g)");
  });
});
