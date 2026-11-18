// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  createProcess,
  getProcess,
  listProcessOptions,
  listProcesses,
  parseProcessFilter,
  PROCESS_LIMIT,
  updateProcess,
  type ProcessFilter,
} from "@/db/processes";
import { limitMessage, STALE } from "@/db/master-shared";
import { processes } from "@/db/schema";
import type { Db } from "@/db/types";
import { migratedDb, resetWithoutStock } from "./pglite";

// 공정의 목록 · 등록 · 수정 — PGlite 에서 실제 SQL 로.

let handle: Awaited<ReturnType<typeof migratedDb>>;
let db: Db;
beforeAll(async () => {
  handle = await migratedDb();
  db = handle.db;
});
afterAll(() => handle.close());
beforeEach(() => resetWithoutStock(db));

const all: ProcessFilter = { q: "", includeInactive: false };
const codesOf = (rows: { code: string }[]) => rows.map((r) => r.code);
const count = async () => (await db.select().from(processes)).length;

describe("목록", () => {
  it("기본 보기 — 코드 순으로", async () => {
    expect(codesOf(await listProcesses(db, all))).toEqual(["BG", "DA", "FT", "MD", "MK", "SAW", "WB"]);
  });

  it("코드나 공정명에 든 글자로 찾는다 — 대소문자를 가리지 않는다", async () => {
    expect(codesOf(await listProcesses(db, { ...all, q: "본딩" }))).toEqual(["DA", "WB"]);
    expect(codesOf(await listProcesses(db, { ...all, q: "sa" }))).toEqual(["SAW"]);
  });

  it("찾을 글자의 % 는 글자 그대로 찾는다", async () => {
    expect(await listProcesses(db, { ...all, q: "%" })).toEqual([]);
  });

  it("「사용 안 함」은 기본 보기에서 빠지고, 포함이면 보인다", async () => {
    await updateProcess(db, "MK", { name: "마킹", note: "", active: "N" });
    expect(codesOf(await listProcesses(db, all))).not.toContain("MK");
    expect(codesOf(await listProcesses(db, { ...all, includeInactive: true }))).toContain("MK");
  });
});

describe("목록의 거르기 값", () => {
  it("맞는 값을 읽는다", () => {
    expect(parseProcessFilter({ q: " 본딩 ", inactive: "1" })).toEqual({
      filter: { q: "본딩", includeInactive: true },
      notices: [],
    });
  });

  it("51자 찾을 글자는 찾지 않고 알린다", () => {
    const r = parseProcessFilter({ q: "가".repeat(51) });
    expect(r.filter.q).toBe("");
    expect(r.notices).toHaveLength(1);
    expect(r.notices[0].field).toBe("q");
  });
});

describe("공정 하나", () => {
  it("코드로 읽고, 꼴이 틀리면 없다", async () => {
    expect(await getProcess(db, "DA")).toMatchObject({ code: "DA", name: "다이 본딩" });
    expect(await getProcess(db, "da")).toBeUndefined();
    expect(await getProcess(db, "x y")).toBeUndefined();
  });
});

describe("등록", () => {
  it("새 공정은 사용 중으로 등록된다", async () => {
    expect(await createProcess(db, { code: "TF", name: "트림 · 폼", note: "" })).toEqual({ ok: true, code: "TF" });
    expect((await getProcess(db, "TF"))?.active).toBe(true);
  });

  it("공정명 50자(이모지)도 저장된다", async () => {
    expect(await createProcess(db, { code: "EM", name: "😀".repeat(50), note: "" })).toEqual({ ok: true, code: "EM" });
  });

  it("같은 코드는 거절", async () => {
    const r = await createProcess(db, { code: "DA", name: "또 다이", note: "" });
    expect(r).toMatchObject({ ok: false, errors: { code: "이미 있는 공정코드입니다" } });
  });

  it("「사용 안 함」인 공정과 같은 코드는 사용으로 바꾸라고 알린다", async () => {
    await updateProcess(db, "MK", { name: "마킹", note: "", active: "N" });
    const r = await createProcess(db, { code: "MK", name: "마킹 2", note: "" });
    expect(r).toMatchObject({
      ok: false,
      errors: {
        code: "「사용 안 함」으로 있는 공정입니다 — 목록에서 「사용 안 함 포함」을 켜고 그 공정을 「사용」으로 바꾸세요",
      },
    });
  });

  it("상한(50)에 닿으면 거절하고 행 수는 그대로", async () => {
    const n = await count();
    const fill = Array.from({ length: PROCESS_LIMIT - n }, (_, i) => ({
      code: `P${String(i + 1).padStart(2, "0")}`,
      name: `채움 ${i + 1}`,
    }));
    await db.insert(processes).values(fill);
    expect(await count()).toBe(PROCESS_LIMIT);
    const r = await createProcess(db, { code: "TF", name: "트림", note: "" });
    expect(r).toMatchObject({ ok: false, formError: limitMessage("공정", PROCESS_LIMIT) });
    expect(await count()).toBe(PROCESS_LIMIT);
  });

  it("입력이 틀리면 DB 에 쓰지 않고 values 를 돌려준다", async () => {
    const n = await count();
    const values = { code: "da", name: "", note: "x" };
    const r = await createProcess(db, values);
    expect(r).toMatchObject({ ok: false, values });
    expect(await count()).toBe(n);
  });
});

describe("수정", () => {
  it("이름 · 비고 · 사용 여부를 바꾸고 코드는 그대로", async () => {
    const v = (await getProcess(db, "DA"))!.version;
    expect(await updateProcess(db, "DA", { name: "다이 어태치", note: "n", active: "Y" }, v)).toEqual({
      ok: true,
      code: "DA",
    });
    expect(await getProcess(db, "DA")).toMatchObject({ code: "DA", name: "다이 어태치", note: "n" });
  });

  it("옛 버전이면 저장하지 않는다", async () => {
    const v = (await getProcess(db, "DA"))!.version;
    await updateProcess(db, "DA", { name: "먼저", note: "", active: "Y" }, v);
    const r = await updateProcess(db, "DA", { name: "나중", note: "", active: "Y" }, v);
    expect(r).toMatchObject({ ok: false, formError: STALE });
    expect((await getProcess(db, "DA"))?.name).toBe("먼저");
  });

  it("꼴이 틀린 버전도 STALE", async () => {
    const r = await updateProcess(db, "DA", { name: "x", note: "", active: "Y" }, "abc");
    expect(r).toMatchObject({ ok: false, formError: STALE });
  });

  it("입력이 틀리면 values 를 돌려준다", async () => {
    const values = { name: "", note: "", active: "Y" };
    expect(await updateProcess(db, "DA", values)).toMatchObject({
      ok: false,
      errors: { name: "공정명을 넣으세요" },
      values,
    });
  });

  it("없는 코드 · 꼴이 틀린 코드는 notFound", async () => {
    const values = { name: "x", note: "", active: "Y" };
    expect(await updateProcess(db, "ZZ", values)).toEqual({ ok: false, notFound: true });
    expect(await updateProcess(db, "x y", values)).toEqual({ ok: false, notFound: true });
  });
});

describe("공정 고르기", () => {
  it("모든 공정을 코드 순으로", async () => {
    await db.update(processes).set({ active: false }).where(eq(processes.code, "MK"));
    const options = await listProcessOptions(db);
    expect(codesOf(options)).toEqual(["BG", "DA", "FT", "MD", "MK", "SAW", "WB"]);
    expect(options.find((o) => o.code === "MK")).toEqual({ code: "MK", name: "마킹", active: false });
  });
});
