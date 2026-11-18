// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { limitMessage, STALE } from "@/db/master-shared";
import { codes, defectTypeProcesses, defectTypes, processes } from "@/db/schema";
import type { Db } from "@/db/types";
import {
  createDefectType,
  DEFECT_TYPE_LIMIT,
  dropUnknownFilters,
  getDefectType,
  listClsOptions,
  listDefectTypes,
  parseDefectTypeFilter,
  updateDefectType,
  type DefectTypeFilter,
} from "@/db/defect-types";
import { migratedDb, resetWithoutStock } from "./pglite";

// 불량 유형의 목록 · 등록 · 수정 — PGlite 에서 실제 SQL 로.

let handle: Awaited<ReturnType<typeof migratedDb>>;
let db: Db;
beforeAll(async () => {
  handle = await migratedDb();
  db = handle.db;
});
afterAll(() => handle.close());
beforeEach(() => resetWithoutStock(db));

const all: DefectTypeFilter = { q: "", cls: "", process: "", includeInactive: false };
const codesOf = (rows: { code: string }[]) => rows.map((r) => r.code);
const count = async () => (await db.select().from(defectTypes)).length;
const linkCount = async () => (await db.select().from(defectTypeProcesses)).length;
const deactivateProcess = (code: string) => db.update(processes).set({ active: false }).where(eq(processes.code, code));
const deactivateCls = (code: string) =>
  db
    .update(codes)
    .set({ active: false })
    .where(and(eq(codes.groupCode, "DEFECT_CLS"), eq(codes.code, code)));
const procsOf = async (code: string) => (await getDefectType(db, code))!.processes.map((p) => p.code);
const NEW = { code: "VOID", name: "보이드", cls: "BOND", processes: ["DA"], note: "" };
const EDIT = { name: "이름", cls: "APPEAR", processes: ["WB"], note: "", active: "Y" };

describe("목록", () => {
  it("기본 보기 — 열넷, 코드 순으로", async () => {
    expect(codesOf(await listDefectTypes(db, all))).toEqual([
      "BALL-LIFT",
      "CHIP",
      "CRACK",
      "DA-TILT",
      "DA-VOID",
      "FM",
      "MD-VOID",
      "MK-ERR",
      "OPEN",
      "SCRATCH",
      "SHORT",
      "THK-OUT",
      "WIRE-BRK",
      "WIRE-SWP",
    ]);
  });

  it("행에 대분류 이름과 발생 공정(공정코드 순)이 든다", async () => {
    const rows = await listDefectTypes(db, { ...all, q: "WIRE-SWP" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ code: "WIRE-SWP", cls: "DIM", clsName: "치수" });
    expect(rows[0].processes.map((p) => p.code)).toEqual(["MD", "WB"]);
    expect(rows[0].processes[0]).toEqual({ code: "MD", name: expect.any(String) });
    const common = await listDefectTypes(db, { ...all, q: "SCRATCH" });
    expect(common[0].processes).toEqual([]);
  });

  it("코드나 불량유형명에 든 글자로 찾는다", async () => {
    expect(codesOf(await listDefectTypes(db, { ...all, q: "와이어" }))).toEqual(["WIRE-BRK", "WIRE-SWP"]);
    expect(codesOf(await listDefectTypes(db, { ...all, q: "wire" }))).toEqual(["WIRE-BRK", "WIRE-SWP"]);
  });

  it("찾을 글자의 % 는 글자 그대로 찾는다", async () => {
    expect(await listDefectTypes(db, { ...all, q: "%" })).toEqual([]);
  });

  it("대분류로 거른다", async () => {
    expect(codesOf(await listDefectTypes(db, { ...all, cls: "ELEC" }))).toEqual(["OPEN", "SHORT"]);
  });

  it("발생 공정으로 거르면 그 공정에 붙은 것과 공통이 보인다", async () => {
    expect(codesOf(await listDefectTypes(db, { ...all, process: "WB" }))).toEqual([
      "BALL-LIFT",
      "FM",
      "SCRATCH",
      "WIRE-BRK",
      "WIRE-SWP",
    ]);
  });

  it("「사용 안 함」은 기본 보기에서 빠지고, 포함이면 보인다", async () => {
    await updateDefectType(db, "OPEN", { ...EDIT, cls: "ELEC", processes: ["FT"], active: "N" });
    expect(codesOf(await listDefectTypes(db, all))).not.toContain("OPEN");
    expect(codesOf(await listDefectTypes(db, { ...all, includeInactive: true }))).toContain("OPEN");
  });
});

describe("목록의 거르기 값", () => {
  it("맞는 값을 읽는다", () => {
    expect(parseDefectTypeFilter({ q: " 와이어 ", cls: "ELEC", process: "WB", inactive: "1" })).toEqual({
      filter: { q: "와이어", cls: "ELEC", process: "WB", includeInactive: true },
      notices: [],
    });
  });

  it("꼴이 틀린 대분류 · 공정은 거르지 않고 알린다", () => {
    const r = parseDefectTypeFilter({ cls: "el!", process: "da!" });
    expect(r.filter).toMatchObject({ cls: "", process: "" });
    expect(r.notices).toEqual([
      { field: "cls", message: "받지 않는 대분류 값이라 거르지 않았습니다" },
      { field: "process", message: "받지 않는 공정 값이라 거르지 않았습니다" },
    ]);
  });

  it("51자 찾을 글자는 찾지 않고 알린다", () => {
    const r = parseDefectTypeFilter({ q: "가".repeat(51) });
    expect(r.filter.q).toBe("");
    expect(r.notices).toHaveLength(1);
    expect(r.notices[0].field).toBe("q");
  });
});

describe("없는 대분류 · 공정으로 거르기", () => {
  const options = {
    classes: [
      { code: "ELEC", name: "전기 특성", active: true },
      { code: "OLD", name: "옛", active: false },
    ],
    processes: [{ code: "DA", name: "다이 본딩", active: true }],
  };

  it("꼴은 맞지만 없는 값이면 거르지 않고 꼴이 틀린 때와 같은 알림을 더한다", () => {
    const malformed = parseDefectTypeFilter({ cls: "el!", process: "da!" }).notices;
    const r = dropUnknownFilters({ ...all, cls: "ZZ", process: "ZZ" }, [], options);
    expect(r.filter).toMatchObject({ cls: "", process: "" });
    expect(r.notices).toEqual(malformed);
  });

  it("있는 값(사용 안 함 포함)이나 빈 값은 그대로 둔다", () => {
    const f = { ...all, cls: "OLD", process: "DA" };
    expect(dropUnknownFilters(f, [], options)).toEqual({ filter: f, notices: [] });
    expect(dropUnknownFilters(all, [], options)).toEqual({ filter: all, notices: [] });
  });
});

describe("대분류 고르기", () => {
  it("모든 대분류를 정렬 순으로, 사용 안 함도 든다", async () => {
    await deactivateCls("DIM");
    const options = await listClsOptions(db);
    expect(codesOf(options)).toEqual(["APPEAR", "DIM", "BOND", "ELEC"]);
    expect(options.find((o) => o.code === "DIM")).toEqual({ code: "DIM", name: "치수", active: false });
  });
});

describe("불량 유형 하나", () => {
  it("코드로 읽고, 꼴이 틀리면 없다", async () => {
    expect(await getDefectType(db, "WIRE-BRK")).toMatchObject({
      code: "WIRE-BRK",
      clsName: "접합",
      processes: [{ code: "WB", name: expect.any(String) }],
      version: expect.stringMatching(/^[0-9]+$/),
    });
    expect(await getDefectType(db, "wire-brk")).toBeUndefined();
    expect(await getDefectType(db, "x y")).toBeUndefined();
    expect(await getDefectType(db, "ZZ-9")).toBeUndefined();
  });
});

describe("등록", () => {
  it("새 불량 유형은 사용 중으로 등록되고 공정이 붙는다", async () => {
    expect(await createDefectType(db, NEW)).toEqual({ ok: true, code: "VOID" });
    expect(await getDefectType(db, "VOID")).toMatchObject({ active: true, cls: "BOND", clsName: "접합" });
    expect(await procsOf("VOID")).toEqual(["DA"]);
  });

  it("공정을 비우면 공통, 둘이면 둘 다 붙는다", async () => {
    await createDefectType(db, { ...NEW, code: "COMMON", processes: [] });
    await createDefectType(db, { ...NEW, code: "TWO", processes: ["WB", "MD"] });
    expect(await procsOf("COMMON")).toEqual([]);
    expect(await procsOf("TWO")).toEqual(["MD", "WB"]);
  });

  it("발생 공정이 겹치면 하나로 저장한다", async () => {
    expect(await createDefectType(db, { ...NEW, processes: ["WB", "WB", " MD "] })).toEqual({
      ok: true,
      code: "VOID",
    });
    expect(await procsOf("VOID")).toEqual(["MD", "WB"]);
  });

  it("같은 코드는 거절", async () => {
    const r = await createDefectType(db, { ...NEW, code: "CHIP" });
    expect(r).toMatchObject({ ok: false, errors: { code: "이미 있는 불량유형코드입니다" } });
  });

  it("「사용 안 함」인 불량 유형과 같은 코드는 사용으로 바꾸라고 알린다", async () => {
    await updateDefectType(db, "OPEN", { ...EDIT, cls: "ELEC", processes: ["FT"], active: "N" });
    const r = await createDefectType(db, { ...NEW, code: "OPEN" });
    expect(r).toMatchObject({
      ok: false,
      errors: {
        code: "「사용 안 함」으로 있는 불량 유형입니다 — 목록에서 「사용 안 함 포함」을 켜고 그 불량 유형을 「사용」으로 바꾸세요",
      },
    });
  });

  it("상한(100)에 닿으면 거절하고 행 수는 그대로", async () => {
    const n = await count();
    await db.insert(defectTypes).values(
      Array.from({ length: DEFECT_TYPE_LIMIT - n }, (_, i) => ({
        code: `X${String(i + 1).padStart(2, "0")}`,
        name: `채움 ${i + 1}`,
        cls: "DIM",
      })),
    );
    expect(await count()).toBe(DEFECT_TYPE_LIMIT);
    const r = await createDefectType(db, NEW);
    expect(r).toMatchObject({ ok: false, formError: limitMessage("불량 유형", DEFECT_TYPE_LIMIT) });
    expect(await count()).toBe(DEFECT_TYPE_LIMIT);
  });

  it("없는 · 「사용 안 함」인 대분류는 거절", async () => {
    expect(await createDefectType(db, { ...NEW, cls: "ZZ" })).toMatchObject({
      ok: false,
      errors: { cls: "대분류를 목록에서 고르세요" },
    });
    await deactivateCls("BOND");
    const n = await count();
    expect(await createDefectType(db, NEW)).toMatchObject({
      ok: false,
      errors: { cls: "「사용 안 함」인 대분류입니다 — 다른 값을 고르세요" },
    });
    expect(await count()).toBe(n);
  });

  it("없는 · 「사용 안 함」인 공정은 거절하고 아무것도 넣지 않는다", async () => {
    const n = await count();
    const links = await linkCount();
    expect(await createDefectType(db, { ...NEW, processes: ["DA", "ZZ"] })).toMatchObject({
      ok: false,
      errors: { processes: "없는 공정입니다 — 목록에서 고르세요" },
    });
    await deactivateProcess("MK");
    expect(await createDefectType(db, { ...NEW, processes: ["DA", "MK"] })).toMatchObject({
      ok: false,
      errors: { processes: "「사용 안 함」인 공정입니다 — 다른 공정을 고르세요" },
    });
    expect(await count()).toBe(n);
    expect(await linkCount()).toBe(links);
  });

  it("입력이 틀리면 DB 에 쓰지 않고 values 를 돌려준다", async () => {
    const n = await count();
    const values = { code: "da-1", name: "", cls: "", processes: ["wb"], note: "x" };
    const r = await createDefectType(db, values);
    expect(r).toMatchObject({ ok: false, values });
    expect(await count()).toBe(n);
  });
});

describe("수정", () => {
  it("이름 · 대분류 · 비고 · 사용 여부를 바꾸고 코드는 그대로", async () => {
    const v = (await getDefectType(db, "CHIP"))!.version;
    expect(await updateDefectType(db, "CHIP", { ...EDIT, name: "칩 깨짐", note: "n", processes: ["SAW"] }, v)).toEqual({
      ok: true,
      code: "CHIP",
    });
    expect(await getDefectType(db, "CHIP")).toMatchObject({ code: "CHIP", name: "칩 깨짐", note: "n", cls: "APPEAR" });
  });

  it("공정을 바꾼다 — 둘에서 하나로, 다시 읽어 확인", async () => {
    await updateDefectType(db, "WIRE-SWP", { ...EDIT, cls: "DIM", processes: ["MD"] });
    expect(await procsOf("WIRE-SWP")).toEqual(["MD"]);
    await updateDefectType(db, "WIRE-SWP", { ...EDIT, cls: "DIM", processes: [] });
    expect(await procsOf("WIRE-SWP")).toEqual([]);
    await updateDefectType(db, "WIRE-SWP", { ...EDIT, cls: "DIM", processes: ["WB", "WB", "BG"] });
    expect(await procsOf("WIRE-SWP")).toEqual(["BG", "WB"]);
  });

  it("이미 붙은 「사용 안 함」 공정을 그대로 두는 저장은 받고, 새 「사용 안 함」 공정은 거절", async () => {
    await deactivateProcess("WB");
    expect(await updateDefectType(db, "WIRE-SWP", { ...EDIT, cls: "DIM", processes: ["WB", "MD"] })).toEqual({
      ok: true,
      code: "WIRE-SWP",
    });
    expect(await procsOf("WIRE-SWP")).toEqual(["MD", "WB"]);
    const r = await updateDefectType(db, "CHIP", { ...EDIT, processes: ["SAW", "WB"] });
    expect(r).toMatchObject({
      ok: false,
      errors: { processes: "「사용 안 함」인 공정입니다 — 다른 공정을 고르세요" },
    });
    expect(await procsOf("CHIP")).toEqual(["SAW"]);
  });

  it("사용 안 함이 된 대분류를 그대로 두고 이름만 고침은 받고, 새로 그 대분류로 바꾸면 거절", async () => {
    await deactivateCls("DIM");
    expect(
      await updateDefectType(db, "WIRE-SWP", { ...EDIT, cls: "DIM", name: "휨", processes: ["WB", "MD"] }),
    ).toEqual({
      ok: true,
      code: "WIRE-SWP",
    });
    expect(await getDefectType(db, "WIRE-SWP")).toMatchObject({ name: "휨", cls: "DIM" });
    const r = await updateDefectType(db, "CHIP", { ...EDIT, cls: "DIM", processes: ["SAW"] });
    expect(r).toMatchObject({ ok: false, errors: { cls: "「사용 안 함」인 대분류입니다 — 다른 값을 고르세요" } });
    expect((await getDefectType(db, "CHIP"))!.cls).toBe("APPEAR");
  });

  it("없는 대분류 · 공정은 거절하고 아무것도 바꾸지 않는다", async () => {
    const before = (await getDefectType(db, "CHIP"))!;
    expect(await updateDefectType(db, "CHIP", { ...EDIT, cls: "ZZ", name: "바뀜", processes: ["SAW"] })).toMatchObject({
      ok: false,
      errors: { cls: "대분류를 목록에서 고르세요" },
    });
    expect(await updateDefectType(db, "CHIP", { ...EDIT, name: "바뀜", processes: ["ZZ"] })).toMatchObject({
      ok: false,
      errors: { processes: "없는 공정입니다 — 목록에서 고르세요" },
    });
    expect(await getDefectType(db, "CHIP")).toEqual(before);
  });

  it("옛 버전이면 이름도 공정도 그대로", async () => {
    const v = (await getDefectType(db, "WIRE-SWP"))!.version;
    await updateDefectType(db, "WIRE-SWP", { ...EDIT, cls: "DIM", name: "먼저", processes: ["WB", "MD"] }, v);
    const r = await updateDefectType(db, "WIRE-SWP", { ...EDIT, cls: "DIM", name: "나중", processes: ["BG"] }, v);
    expect(r).toMatchObject({ ok: false, formError: STALE });
    const now = (await getDefectType(db, "WIRE-SWP"))!;
    expect(now.name).toBe("먼저");
    expect(now.processes.map((p) => p.code)).toEqual(["MD", "WB"]);
  });

  it("꼴이 틀린 버전도 STALE", async () => {
    const r = await updateDefectType(db, "CHIP", { ...EDIT, processes: ["SAW"] }, "abc");
    expect(r).toMatchObject({ ok: false, formError: STALE });
  });

  it("입력이 틀리면 values 를 돌려준다", async () => {
    const values = { ...EDIT, name: "" };
    expect(await updateDefectType(db, "CHIP", values)).toMatchObject({
      ok: false,
      errors: { name: "불량유형명을 넣으세요" },
      values,
    });
  });

  it("없는 코드 · 꼴이 틀린 코드는 notFound", async () => {
    expect(await updateDefectType(db, "ZZ-9", EDIT)).toEqual({ ok: false, notFound: true });
    expect(await updateDefectType(db, "x y", EDIT)).toEqual({ ok: false, notFound: true });
  });
});
