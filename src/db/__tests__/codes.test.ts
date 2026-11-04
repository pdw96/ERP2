// @vitest-environment node
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CODE_LIMIT,
  createCode,
  getCode,
  getCodeGroup,
  listCodeGroups,
  listCodes,
  nextSortOrder,
  SYSTEM_LOCKED,
  updateCode,
} from "@/db/codes";
import { createItem, getItem, unitOptions, updateItem } from "@/db/items";
import { resetToSample } from "@/db/reset";
import { codes } from "@/db/schema";
import type { Db } from "@/db/types";
import type { CodeValues } from "@/lib/code-input";
import type { ItemValues } from "@/lib/item-input";
import { SYSTEM_CODE_GROUPS } from "@/lib/master-codes";
import { migratedDb } from "./pglite";

// 공통코드의 목록 · 값 추가 · 수정 — PGlite 에서 실제 SQL 로(설계 ⑤ 「공통코드(PR B · E)」).

let handle: Awaited<ReturnType<typeof migratedDb>>;
let db: Db;
beforeAll(async () => {
  handle = await migratedDb();
  db = handle.db;
});
afterAll(() => handle.close());
beforeEach(() => resetToSample(db));

const codesOf = (rows: { code: string }[]) => rows.map((r) => r.code);
const countIn = async (group: string) => (await db.select().from(codes).where(eq(codes.groupCode, group))).length;
const box = { code: "BOX", name: "상자", sortOrder: "15" };
// 품목 한 건 — 단위만 바꿔 넣는다.
const newItem = (unit: string): ItemValues => ({
  itemType: "RM",
  procurement: "BUY",
  name: "트레이",
  spec: "",
  unit,
  inspectIn: "on",
  leadTimeDays: "0",
  safetyStock: "0",
  minLot: "0",
  lotMultiple: "0",
});

describe("목록", () => {
  it("묶음 — 코드 순으로, 가름과 값의 수", async () => {
    expect(await listCodeGroups(db)).toEqual([
      { code: "COUNTRY", name: "국가", isSystem: false, values: 5 },
      { code: "ITEM_TYPE", name: "품목 유형", isSystem: true, values: 3 },
      { code: "PROC_TYPE", name: "조달구분", isSystem: true, values: 2 },
      { code: "UNIT", name: "단위", isSystem: false, values: 4 },
    ]);
  });

  it("값 — 정렬 순서 · 코드 순으로, 「사용 안 함」까지", async () => {
    await updateCode(db, "UNIT", "M", { name: "미터", sortOrder: "20", active: "N" });
    expect(codesOf(await listCodes(db, "UNIT"))).toEqual(["EA", "M", "KG", "G"]);
    await db.insert(codes).values({ groupCode: "UNIT", code: "AA", name: "같은 순서", sortOrder: 20 });
    expect(codesOf(await listCodes(db, "UNIT"))).toEqual(["EA", "AA", "M", "KG", "G"]);
  });

  it("주소로 받은 묶음 · 값이 꼴에 맞지 않으면 DB 에 묻지 않고 없다고 한다", async () => {
    expect(await getCodeGroup(db, "unit")).toBeUndefined();
    expect(await getCodeGroup(db, "'; drop table codes; --")).toBeUndefined();
    expect(await getCode(db, "UNIT", "ea")).toBeUndefined();
    expect(await getCode(db, "UNIT", "EA")).toMatchObject({ name: "개" });
  });

  it("새 값의 정렬 순서 기본값 — 가장 큰 것 + 10, 999 까지, 값이 없으면 10", async () => {
    expect(await nextSortOrder(db, "UNIT")).toBe(50);
    await updateCode(db, "UNIT", "G", { name: "그램", sortOrder: "995", active: "Y" });
    expect(await nextSortOrder(db, "UNIT")).toBe(999);
    await db
      .delete(codes)
      .where(eq(codes.groupCode, "UNIT"))
      .catch(() => undefined);
    expect(await nextSortOrder(db, "NO_SUCH")).toBe(10);
  });
});

describe("값 추가", () => {
  it("사용자 코드 묶음에 더하면 사용 중으로 남는다", async () => {
    expect(await createCode(db, "UNIT", box)).toEqual({ ok: true, code: "BOX" });
    expect(await getCode(db, "UNIT", "BOX")).toMatchObject({ name: "상자", sortOrder: 15, active: true });
  });

  it("더한 단위는 품목 등록의 단위 목록에 바로 보이고, 품목에 쓸 수 있다", async () => {
    await createCode(db, "UNIT", box);
    expect(codesOf(await unitOptions(db))).toEqual(["EA", "BOX", "M", "KG", "G"]);
    const r = await createItem(db, newItem("BOX"));
    expect(r).toEqual({ ok: true, code: "RM-0007" });
    expect(await getItem(db, "RM-0007")).toMatchObject({ unit: "BOX" });
  });

  it("보낸 묶음 · 사용 여부는 쓰지 않는다 — 주소의 묶음에, 사용 중으로", async () => {
    const sent = { ...box, groupCode: "ITEM_TYPE", active: "N" } as CodeValues;
    expect(await createCode(db, "UNIT", sent)).toEqual({ ok: true, code: "BOX" });
    expect(await getCode(db, "ITEM_TYPE", "BOX")).toBeUndefined();
    expect(await getCode(db, "UNIT", "BOX")).toMatchObject({ active: true });
  });

  it.each(Object.keys(SYSTEM_CODE_GROUPS))("시스템 코드 묶음 %s 에는 더하지 못한다", async (group) => {
    const before = await countIn(group);
    expect(await createCode(db, group, { code: "XX", name: "시험", sortOrder: "1" })).toMatchObject({
      ok: false,
      formError: SYSTEM_LOCKED,
    });
    expect(await countIn(group)).toBe(before);
  });

  it("없는 묶음이면 찾지 못했다고 돌려준다 — 묶음은 만들지 않는다", async () => {
    expect(await createCode(db, "COLOR", box)).toEqual({ ok: false, notFound: true });
    expect(await getCodeGroup(db, "COLOR")).toBeUndefined();
  });

  it("묶음 안에서 겹치는 코드는 그 칸을 알린다", async () => {
    const r = await createCode(db, "UNIT", { ...box, code: "EA" });
    expect(r).toMatchObject({ ok: false, errors: { code: "이 묶음에 이미 있는 코드입니다" } });
    expect(await countIn("UNIT")).toBe(4);
  });

  it("「사용 안 함」인 값과 겹치면 그 값을 다시 쓰라고 알린다", async () => {
    await updateCode(db, "UNIT", "G", { name: "그램", sortOrder: "40", active: "N" });
    const r = await createCode(db, "UNIT", { ...box, code: "G" });
    expect(r).toMatchObject({ ok: false, errors: { code: expect.stringContaining("「사용」으로 바꾸세요") } });
  });

  it("틀린 값이면 저장되지 않고 칸을 알린다", async () => {
    const r = await createCode(db, "UNIT", { code: "box", name: "", sortOrder: "1000" });
    expect(r).toMatchObject({ ok: false, errors: { code: expect.any(String), name: expect.any(String) } });
    expect(await countIn("UNIT")).toBe(4);
  });

  it("동시에 같은 코드를 더하면 하나만 저장되고, 나머지는 겹친다고 알린다", async () => {
    const results = await Promise.all(Array.from({ length: 3 }, () => createCode(db, "UNIT", box)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual(
      Array.from({ length: 2 }, () => expect.objectContaining({ errors: { code: "이 묶음에 이미 있는 코드입니다" } })),
    );
    expect(await countIn("UNIT")).toBe(5);
  });

  const fill = (n: number) =>
    db
      .insert(codes)
      .values(
        Array.from({ length: n }, (_, i) => ({ groupCode: "UNIT", code: `F${i}`, name: "채움", sortOrder: 900 })),
      );

  it(`한 묶음의 상한 ${CODE_LIMIT}개에 닿으면 저장하지 않는다`, async () => {
    await fill(CODE_LIMIT - 4);
    const r = await createCode(db, "UNIT", box);
    expect(r).toMatchObject({ ok: false, formError: expect.stringContaining("100개까지") });
    expect(await countIn("UNIT")).toBe(CODE_LIMIT);
  });

  it(`동시에 더해도 상한 ${CODE_LIMIT}개를 넘지 않는다`, async () => {
    await fill(CODE_LIMIT - 6);
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => createCode(db, "UNIT", { code: `C${i}`, name: "동시", sortOrder: "1" })),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    expect(await countIn("UNIT")).toBe(CODE_LIMIT);
  });
});

describe("값 수정", () => {
  it("이름 · 정렬 순서를 고치면 남는다 — 코드는 그대로", async () => {
    const sent = { name: "낱개", sortOrder: "5", active: "Y", code: "PCS" } as CodeValues;
    expect(await updateCode(db, "UNIT", "EA", sent)).toEqual({ ok: true, code: "EA" });
    expect(await getCode(db, "UNIT", "EA")).toMatchObject({ name: "낱개", sortOrder: 5, active: true });
    expect(await getCode(db, "UNIT", "PCS")).toBeUndefined();
  });

  it.each(Object.entries(SYSTEM_CODE_GROUPS))("시스템 코드 묶음 %s 의 값은 고치지 못한다", async (group, known) => {
    const code = known[0].code;
    const r = await updateCode(db, group, code, { name: "바꿈", sortOrder: "1", active: "N" });
    expect(r).toMatchObject({ ok: false, formError: SYSTEM_LOCKED });
    expect(await getCode(db, group, code)).toMatchObject({ name: known[0].name, active: true });
  });

  it("없는 묶음 · 값이면 찾지 못했다고 돌려준다", async () => {
    const v = { name: "x", sortOrder: "1", active: "Y" };
    expect(await updateCode(db, "UNIT", "BOX", v)).toEqual({ ok: false, notFound: true });
    expect(await updateCode(db, "COLOR", "EA", v)).toEqual({ ok: false, notFound: true });
  });

  it("틀린 값이면 아무것도 바꾸지 않는다", async () => {
    const r = await updateCode(db, "UNIT", "EA", { name: "가".repeat(51), sortOrder: "-1", active: "N" });
    expect(r).toMatchObject({ ok: false, errors: { name: "이름은 50자까지입니다", sortOrder: expect.any(String) } });
    expect(await getCode(db, "UNIT", "EA")).toMatchObject({ name: "개", sortOrder: 10, active: true });
  });

  it("DB 의 제약에 걸리면(서버의 검사를 빠뜨렸을 때) 그 칸을 알린다", async () => {
    const input = await import("@/lib/code-input");
    const spy = vi.spyOn(input, "parseCodeUpdate").mockReturnValue({
      ok: true,
      value: { name: "개", sortOrder: 1000, active: true },
    });
    try {
      const r = await updateCode(db, "UNIT", "EA", { name: "개", sortOrder: "1000", active: "Y" });
      expect(r).toMatchObject({ ok: false, errors: { sortOrder: "받을 수 없는 값입니다" } });
      expect(await getCode(db, "UNIT", "EA")).toMatchObject({ sortOrder: 10 });
    } finally {
      spy.mockRestore();
    }
  });
});

describe("국가 KR 은 「사용 안 함」으로 바꾸지 못한다(ADR 0011)", () => {
  it("KR 을 「사용 안 함」으로 보내면 거절하고 그대로 둔다 — 이름 · 정렬 순서는 고칠 수 있다", async () => {
    const r = await updateCode(db, "COUNTRY", "KR", { name: "대한민국", sortOrder: "5", active: "N" });
    expect(r).toMatchObject({
      ok: false,
      errors: { active: expect.stringContaining("「사용 안 함」으로 바꿀 수 없습니다") },
    });
    expect(await getCode(db, "COUNTRY", "KR")).toMatchObject({ name: "한국", active: true });
    expect(await updateCode(db, "COUNTRY", "KR", { name: "대한민국", sortOrder: "5", active: "Y" })).toEqual({
      ok: true,
      code: "KR",
    });
  });

  it("다른 나라는 「사용 안 함」으로 바꿀 수 있고, 나라를 더할 수 있다", async () => {
    expect(await updateCode(db, "COUNTRY", "TW", { name: "대만", sortOrder: "50", active: "N" })).toEqual({
      ok: true,
      code: "TW",
    });
    expect(await createCode(db, "COUNTRY", { code: "VN", name: "베트남", sortOrder: "60" })).toEqual({
      ok: true,
      code: "VN",
    });
  });
});

describe("「사용 안 함」 단위(성공 기준 10)", () => {
  beforeEach(() => updateCode(db, "UNIT", "EA", { name: "개", sortOrder: "10", active: "N" }));

  it("새 품목에서 고를 수 없다 — 목록에서 빠지고, 보내도 거절한다", async () => {
    expect(codesOf(await unitOptions(db))).not.toContain("EA");
    const r = await createItem(db, newItem("EA"));
    expect(r).toMatchObject({ ok: false, errors: { unit: expect.stringContaining("「사용 안 함」") } });
  });

  it("이미 그 단위를 쓴 품목에는 그대로 보이고, 그대로 저장된다", async () => {
    const item = (await getItem(db, "RM-0001"))!;
    expect(item.unit).toBe("EA");
    expect(await unitOptions(db, "EA")).toContainEqual({ code: "EA", name: "개", active: false });
    const r = await updateItem(db, "RM-0001", {
      itemType: "RM",
      procurement: "BUY",
      name: item.name,
      spec: item.spec,
      unit: "EA",
      leadTimeDays: String(item.leadTimeDays),
      safetyStock: String(item.safetyStock),
      minLot: String(item.minLot),
      lotMultiple: String(item.lotMultiple),
      active: "Y",
    });
    expect(r).toEqual({ ok: true, code: "RM-0001" });
  });

  it("다시 「사용」으로 바꾸면 새 품목에서 고를 수 있다", async () => {
    await updateCode(db, "UNIT", "EA", { name: "개", sortOrder: "10", active: "Y" });
    expect(codesOf(await unitOptions(db))).toContain("EA");
    const [row] = await db
      .select()
      .from(codes)
      .where(and(eq(codes.groupCode, "UNIT"), eq(codes.code, "EA")));
    expect(row.active).toBe(true);
  });
});
