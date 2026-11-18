// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { limitMessage, STALE } from "@/db/master-shared";
import { processes, workCenters } from "@/db/schema";
import type { Db } from "@/db/types";
import {
  createWorkCenter,
  dropUnknownProcess,
  getWorkCenter,
  listWorkCenters,
  parseWorkCenterFilter,
  updateWorkCenter,
  WORK_CENTER_LIMIT,
  type WorkCenterFilter,
} from "@/db/work-centers";
import { eq } from "drizzle-orm";
import { migratedDb, resetWithoutStock } from "./pglite";

// 작업장의 목록 · 등록 · 수정 — PGlite 에서 실제 SQL 로.

let handle: Awaited<ReturnType<typeof migratedDb>>;
let db: Db;
beforeAll(async () => {
  handle = await migratedDb();
  db = handle.db;
});
afterAll(() => handle.close());
beforeEach(() => resetWithoutStock(db));

const all: WorkCenterFilter = { q: "", process: "", includeInactive: false };
const codesOf = (rows: { code: string }[]) => rows.map((r) => r.code);
const count = async () => (await db.select().from(workCenters)).length;
const deactivateProcess = (code: string) => db.update(processes).set({ active: false }).where(eq(processes.code, code));
const NEW = { code: "DA-3", name: "다이 본딩 3라인", process: "DA", note: "" };

describe("목록", () => {
  it("기본 보기 — 코드 순으로", async () => {
    expect(codesOf(await listWorkCenters(db, all))).toEqual([
      "BG-1",
      "DA-1",
      "DA-2",
      "FT-1",
      "MD-1",
      "MK-1",
      "SAW-1",
      "WB-1",
      "WB-2",
    ]);
  });

  it("코드나 작업장명에 든 글자로 찾는다", async () => {
    expect(codesOf(await listWorkCenters(db, { ...all, q: "본딩" }))).toEqual(["DA-1", "DA-2", "WB-1", "WB-2"]);
    expect(codesOf(await listWorkCenters(db, { ...all, q: "saw" }))).toEqual(["SAW-1"]);
  });

  it("찾을 글자의 % 는 글자 그대로 찾는다", async () => {
    expect(await listWorkCenters(db, { ...all, q: "%" })).toEqual([]);
  });

  it("공정으로 거른다", async () => {
    expect(codesOf(await listWorkCenters(db, { ...all, process: "DA" }))).toEqual(["DA-1", "DA-2"]);
  });

  it("행에 공정 코드 · 이름이 든다", async () => {
    const [row] = await listWorkCenters(db, { ...all, process: "DA" });
    expect(row).toMatchObject({ code: "DA-1", processCode: "DA", processName: "다이 본딩" });
  });

  it("「사용 안 함」은 기본 보기에서 빠지고, 포함이면 보인다", async () => {
    await updateWorkCenter(db, "MK-1", { name: "레이저 마킹 1호기", note: "", active: "N" });
    expect(codesOf(await listWorkCenters(db, all))).not.toContain("MK-1");
    expect(codesOf(await listWorkCenters(db, { ...all, includeInactive: true }))).toContain("MK-1");
  });
});

describe("목록의 거르기 값", () => {
  it("맞는 값을 읽는다", () => {
    expect(parseWorkCenterFilter({ q: " 본딩 ", process: "DA", inactive: "1" })).toEqual({
      filter: { q: "본딩", process: "DA", includeInactive: true },
      notices: [],
    });
  });

  it("꼴이 틀린 공정은 거르지 않고 알린다", () => {
    const r = parseWorkCenterFilter({ process: "da!" });
    expect(r.filter.process).toBe("");
    expect(r.notices).toEqual([{ field: "process", message: "받지 않는 공정 값이라 거르지 않았습니다" }]);
  });

  it("51자 찾을 글자는 찾지 않고 알린다", () => {
    const r = parseWorkCenterFilter({ q: "가".repeat(51) });
    expect(r.filter.q).toBe("");
    expect(r.notices).toHaveLength(1);
    expect(r.notices[0].field).toBe("q");
  });
});

describe("없는 공정으로 거르기", () => {
  const options = [
    { code: "DA", name: "다이 본딩", active: true },
    { code: "MK", name: "마킹", active: false },
  ];

  it("꼴은 맞지만 없는 공정이면 거르지 않고 꼴이 틀린 때와 같은 알림을 더한다", () => {
    const malformed = parseWorkCenterFilter({ process: "da!" }).notices;
    const r = dropUnknownProcess({ ...all, process: "ZZ" }, [], options);
    expect(r.filter.process).toBe("");
    expect(r.notices).toEqual(malformed);
  });

  it("있는 공정(사용 안 함 포함)이나 빈 값은 그대로 둔다", () => {
    expect(dropUnknownProcess({ ...all, process: "MK" }, [], options)).toEqual({
      filter: { ...all, process: "MK" },
      notices: [],
    });
    expect(dropUnknownProcess(all, [], options)).toEqual({ filter: all, notices: [] });
  });
});

describe("작업장 하나", () => {
  it("코드로 읽고, 꼴이 틀리면 없다", async () => {
    expect(await getWorkCenter(db, "DA-1")).toMatchObject({
      code: "DA-1",
      processCode: "DA",
      processName: "다이 본딩",
    });
    expect(await getWorkCenter(db, "da-1")).toBeUndefined();
    expect(await getWorkCenter(db, "x y")).toBeUndefined();
  });
});

describe("등록", () => {
  it("새 작업장은 사용 중으로 등록되고 공정이 붙는다", async () => {
    expect(await createWorkCenter(db, NEW)).toEqual({ ok: true, code: "DA-3" });
    expect(await getWorkCenter(db, "DA-3")).toMatchObject({ active: true, processCode: "DA" });
  });

  it("「사용 안 함」인 공정에는 등록하지 않는다", async () => {
    await deactivateProcess("MK");
    const n = await count();
    const r = await createWorkCenter(db, { ...NEW, code: "MK-2", process: "MK" });
    expect(r).toMatchObject({ ok: false, errors: { process: "「사용 안 함」인 공정입니다 — 다른 공정을 고르세요" } });
    expect(await count()).toBe(n);
  });

  it("없는 공정에는 등록하지 않는다", async () => {
    const r = await createWorkCenter(db, { ...NEW, process: "ZZ" });
    expect(r).toMatchObject({ ok: false, errors: { process: "없는 공정입니다 — 목록에서 고르세요" } });
  });

  it("같은 코드는 거절", async () => {
    const r = await createWorkCenter(db, { ...NEW, code: "DA-1" });
    expect(r).toMatchObject({ ok: false, errors: { code: "이미 있는 작업장코드입니다" } });
  });

  it("「사용 안 함」인 작업장과 같은 코드는 사용으로 바꾸라고 알린다", async () => {
    await updateWorkCenter(db, "MK-1", { name: "레이저 마킹 1호기", note: "", active: "N" });
    const r = await createWorkCenter(db, { ...NEW, code: "MK-1", process: "MK" });
    expect(r).toMatchObject({
      ok: false,
      errors: {
        code: "「사용 안 함」으로 있는 작업장입니다 — 목록에서 「사용 안 함 포함」을 켜고 그 작업장을 「사용」으로 바꾸세요",
      },
    });
  });

  it("상한(100)에 닿으면 거절하고 행 수는 그대로", async () => {
    const n = await count();
    const [da] = await db.select().from(processes).where(eq(processes.code, "DA"));
    await db.insert(workCenters).values(
      Array.from({ length: WORK_CENTER_LIMIT - n }, (_, i) => ({
        code: `X${String(i + 1).padStart(2, "0")}`,
        name: `채움 ${i + 1}`,
        processId: da.id,
      })),
    );
    expect(await count()).toBe(WORK_CENTER_LIMIT);
    const r = await createWorkCenter(db, NEW);
    expect(r).toMatchObject({ ok: false, formError: limitMessage("작업장", WORK_CENTER_LIMIT) });
    expect(await count()).toBe(WORK_CENTER_LIMIT);
  });

  it("입력이 틀리면 DB 에 쓰지 않고 values 를 돌려준다", async () => {
    const n = await count();
    const values = { code: "da-1", name: "", process: "", note: "x" };
    const r = await createWorkCenter(db, values);
    expect(r).toMatchObject({ ok: false, values });
    expect(await count()).toBe(n);
  });
});

describe("수정", () => {
  it("이름 · 비고 · 사용 여부를 바꾸고 코드는 그대로", async () => {
    const v = (await getWorkCenter(db, "DA-1"))!.version;
    expect(await updateWorkCenter(db, "DA-1", { name: "다이 1", note: "n", active: "Y" }, v)).toEqual({
      ok: true,
      code: "DA-1",
    });
    expect(await getWorkCenter(db, "DA-1")).toMatchObject({ code: "DA-1", name: "다이 1", note: "n" });
  });

  it("공정을 실어 보내도 무시한다", async () => {
    await updateWorkCenter(db, "DA-1", { name: "다이 1", note: "", active: "Y", process: "WB", code: "ZZ" });
    expect(await getWorkCenter(db, "DA-1")).toMatchObject({ code: "DA-1", processCode: "DA" });
  });

  it("옛 버전이면 저장하지 않는다", async () => {
    const v = (await getWorkCenter(db, "DA-1"))!.version;
    await updateWorkCenter(db, "DA-1", { name: "먼저", note: "", active: "Y" }, v);
    const r = await updateWorkCenter(db, "DA-1", { name: "나중", note: "", active: "Y" }, v);
    expect(r).toMatchObject({ ok: false, formError: STALE });
    expect((await getWorkCenter(db, "DA-1"))?.name).toBe("먼저");
  });

  it("꼴이 틀린 버전도 STALE", async () => {
    const r = await updateWorkCenter(db, "DA-1", { name: "x", note: "", active: "Y" }, "abc");
    expect(r).toMatchObject({ ok: false, formError: STALE });
  });

  it("입력이 틀리면 values 를 돌려준다", async () => {
    const values = { name: "", note: "", active: "Y" };
    expect(await updateWorkCenter(db, "DA-1", values)).toMatchObject({
      ok: false,
      errors: { name: "작업장명을 넣으세요" },
      values,
    });
  });

  it("없는 코드 · 꼴이 틀린 코드는 notFound", async () => {
    const values = { name: "x", note: "", active: "Y" };
    expect(await updateWorkCenter(db, "ZZ-9", values)).toEqual({ ok: false, notFound: true });
    expect(await updateWorkCenter(db, "x y", values)).toEqual({ ok: false, notFound: true });
  });
});
