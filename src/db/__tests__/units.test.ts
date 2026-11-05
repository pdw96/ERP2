// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { baseUnitOptions, createCode, getCode, getUnitSpec, listUnitSpecs, updateCode } from "@/db/codes";
import { resetToSample } from "@/db/reset";
import { codes, unitSpecs } from "@/db/schema";
import type { Db } from "@/db/types";
import type { CodeValues } from "@/lib/code-input";
import { migratedDb, rejection } from "./pglite";

// 단위 사양 — 기준 단위 · 배수 · 소수 자릿수(조각 「재고 수불」 설계 ② 「단위」 · ⑤ 「단위(PR A)」, ADR 0017).
// 거절 시험은 거절 뒤 공통코드 값과 사양이 거절 전과 같은지, 성공 시험은 저장된 사양을 본다.

let handle: Awaited<ReturnType<typeof migratedDb>>;
let db: Db;
beforeAll(async () => {
  handle = await migratedDb();
  db = handle.db;
});
afterAll(() => handle.close());
beforeEach(() => resetToSample(db));

/** 공통코드 UNIT 의 값과 사양 전체 — 거절 시험이 거절 전과 견준다. */
async function unitState() {
  const values = await db.select({ code: codes.code, name: codes.name }).from(codes).where(eq(codes.groupCode, "UNIT"));
  return { values: values.map((v) => v.code).sort(), specs: await listUnitSpecs(db) };
}

const newUnit = (over: CodeValues): CodeValues => ({
  code: "TON",
  name: "톤",
  sortOrder: "90",
  baseUnit: "G",
  factor: "1000000",
  decimals: "3",
  ...over,
});

describe("DB 가 막는 것", () => {
  const insert = (v: Partial<typeof unitSpecs.$inferInsert>) =>
    db.insert(unitSpecs).values({ unit: "BOX", baseUnit: "BOX", factor: 1, decimals: 0, ...v });
  beforeEach(() => db.insert(codes).values({ groupCode: "UNIT", code: "BOX", name: "상자" }));

  it("맞는 꼴 — 자신이 기준이면 배수 1", async () => {
    await insert({});
    expect(await getUnitSpec(db, "BOX")).toEqual({ unit: "BOX", baseUnit: "BOX", factor: 1, decimals: 0 });
  });

  it.each([
    ["기준이 자신이 아닌 단위(KG 의 기준은 G)", { baseUnit: "KG", factor: 2 }, "unit_specs_base_fk"],
    ["기준이 사양 없는 단위", { baseUnit: "XX", factor: 2 }, "unit_specs_base_fk"],
    ["배수 0", { baseUnit: "G", factor: 0 }, "unit_specs_factor_positive"],
    ["배수 음수", { baseUnit: "G", factor: -1 }, "unit_specs_factor_positive"],
    ["자신이 기준인데 배수 2", { factor: 2 }, "unit_specs_base_factor_one"],
    ["소수 자릿수 4", { decimals: 4 }, "unit_specs_decimals_range"],
    ["소수 자릿수 -1", { decimals: -1 }, "unit_specs_decimals_range"],
  ])("%s 는 거절한다", async (_, v, constraint) => {
    expect(await rejection(insert(v))).toMatchObject({ constraint });
    expect(await getUnitSpec(db, "BOX")).toBeUndefined();
  });

  it("공통코드 UNIT 에 없는 단위는 거절한다", async () => {
    expect(
      await rejection(db.insert(unitSpecs).values({ unit: "NOPE", baseUnit: "NOPE", factor: 1, decimals: 0 })),
    ).toMatchObject({ constraint: "unit_specs_unit_fk" });
  });

  it("한 단위에 사양은 하나다", async () => {
    expect(
      await rejection(db.insert(unitSpecs).values({ unit: "EA", baseUnit: "EA", factor: 1, decimals: 3 })),
    ).toMatchObject({ constraint: "unit_specs_unit_unique" });
  });

  it("다른 단위의 기준인 단위는 지울 수 없다", async () => {
    expect(await rejection(db.delete(unitSpecs).where(eq(unitSpecs.unit, "G")))).toMatchObject({
      constraint: "unit_specs_base_fk",
    });
  });
});

describe("목록", () => {
  it("단위마다의 사양", async () => {
    const specs = await listUnitSpecs(db);
    expect(Object.keys(specs).sort()).toEqual(["EA", "G", "KG", "L", "M", "MG", "ML", "MM"]);
    expect(specs.KG).toEqual({ unit: "KG", baseUnit: "G", factor: 1000, decimals: 3 });
    expect(specs.MG).toEqual({ unit: "MG", baseUnit: "G", factor: 0.001, decimals: 0 });
  });

  it("기준으로 고를 수 있는 단위 — 자신이 기준이고 「사용」인 것, 정렬 순서대로", async () => {
    expect((await baseUnitOptions(db)).map((b) => b.code)).toEqual(["EA", "M", "G", "ML"]);
    await updateCode(db, "UNIT", "ML", { name: "밀리리터", sortOrder: "70", active: "N" });
    expect((await baseUnitOptions(db)).map((b) => b.code)).toEqual(["EA", "M", "G"]);
  });

  it("주소로 받은 단위가 꼴에 맞지 않으면 DB 에 묻지 않고 없다고 한다", async () => {
    expect(await getUnitSpec(db, "kg")).toBeUndefined();
  });
});

describe("단위 추가 — 사양을 함께 받는다", () => {
  it("기준 G · 배수 1000000 · 자릿수 3 — 값과 사양이 함께 남는다", async () => {
    expect(await createCode(db, "UNIT", newUnit({}))).toEqual({ ok: true, code: "TON" });
    expect(await getCode(db, "UNIT", "TON")).toMatchObject({ name: "톤", active: true });
    expect(await getUnitSpec(db, "TON")).toEqual({ unit: "TON", baseUnit: "G", factor: 1000000, decimals: 3 });
  });

  it("기준 단위를 비우면 자신이 기준 · 배수 1 이다 — 배수를 비워도, 1 을 넣어도", async () => {
    expect(await createCode(db, "UNIT", newUnit({ code: "BOX", baseUnit: "", factor: "" }))).toMatchObject({
      ok: true,
    });
    expect(await createCode(db, "UNIT", newUnit({ code: "PCS", baseUnit: "PCS", factor: "1" }))).toMatchObject({
      ok: true,
    });
    expect(await getUnitSpec(db, "BOX")).toEqual({ unit: "BOX", baseUnit: "BOX", factor: 1, decimals: 3 });
    expect(await getUnitSpec(db, "PCS")).toEqual({ unit: "PCS", baseUnit: "PCS", factor: 1, decimals: 3 });
  });

  it("가장 큰 배수 999999999.999999 도 넣은 값 그대로 남는다 — 저장한 뒤 다시 읽어도 같다", async () => {
    expect(
      await createCode(db, "UNIT", newUnit({ code: "BIG", baseUnit: "G", factor: "999999999.999999" })),
    ).toMatchObject({ ok: true });
    expect((await getUnitSpec(db, "BIG"))!.factor.toFixed(6)).toBe("999999999.999999");
  });

  it("배수는 소수 여섯째 자리까지 받는다", async () => {
    expect(await createCode(db, "UNIT", newUnit({ code: "UG", baseUnit: "G", factor: "0.000001" }))).toMatchObject({
      ok: true,
    });
    expect(await getUnitSpec(db, "UG")).toMatchObject({ factor: 0.000001 });
  });

  it.each([
    ["기준이 자신이 아닌 단위", { baseUnit: "KG" }, "baseUnit", "기준이 될 수 없는 단위"],
    ["없는 단위", { baseUnit: "NOPE" }, "baseUnit", "기준이 될 수 없는 단위"],
    ["꼴이 틀린 기준", { baseUnit: "g" }, "baseUnit", "목록에서 기준 단위를 고르세요"],
    ["배수 비움", { factor: "" }, "factor", "배수를 넣으세요"],
    ["배수 0", { factor: "0" }, "factor", "0 보다 큰 수"],
    ["배수 음수", { factor: "-5" }, "factor", "0 보다 큰 수"],
    ["배수 일곱째 자리", { factor: "0.0000001" }, "factor", "0 보다 큰 수"],
    ["배수가 글자", { factor: "천" }, "factor", "0 보다 큰 수"],
    ["자신이 기준인데 배수 2", { baseUnit: "", factor: "2" }, "factor", "배수는 1 입니다"],
    ["자릿수 4", { decimals: "4" }, "decimals", "0 ~ 3"],
    ["자릿수 비움", { decimals: "" }, "decimals", "0 ~ 3"],
    ["자릿수 없음", { decimals: undefined }, "decimals", "고르세요"],
  ])("%s 는 저장하지 않고 그 칸을 알린다 — 값도 사양도 남지 않는다", async (_, over, field, message) => {
    const before = await unitState();
    const r = await createCode(db, "UNIT", newUnit(over as CodeValues));
    expect(r).toMatchObject({ ok: false, errors: { [field]: expect.stringContaining(message) } });
    expect(await unitState()).toEqual(before);
  });

  it("「사용 안 함」인 단위는 기준이 될 수 없다", async () => {
    await updateCode(db, "UNIT", "G", { name: "그램", sortOrder: "40", active: "N" });
    const before = await unitState();
    expect(await createCode(db, "UNIT", newUnit({}))).toMatchObject({
      ok: false,
      errors: { baseUnit: expect.stringContaining("기준이 될 수 없는 단위") },
    });
    expect(await unitState()).toEqual(before);
  });

  it("코드와 사양이 함께 틀리면 둘 다 알린다", async () => {
    const r = await createCode(db, "UNIT", newUnit({ code: "ton", factor: "0" }));
    expect(r).toMatchObject({ ok: false, errors: { code: expect.any(String), factor: expect.any(String) } });
  });

  it("다른 묶음에는 사양이 생기지 않는다 — 보낸 사양 칸은 읽지 않는다", async () => {
    const r = await createCode(db, "COUNTRY", {
      code: "DE",
      name: "독일",
      sortOrder: "60",
      baseUnit: "G",
      factor: "0",
    });
    expect(r).toEqual({ ok: true, code: "DE" });
    expect(await getUnitSpec(db, "DE")).toBeUndefined();
  });
});

describe("단위 수정 — 소수 자릿수만 바뀐다", () => {
  it("자릿수를 고치면 남는다 — 보낸 기준 · 배수는 쓰지 않는다", async () => {
    const sent = { name: "킬로그램", sortOrder: "30", active: "Y", decimals: "1", baseUnit: "KG", factor: "1" };
    expect(await updateCode(db, "UNIT", "KG", sent)).toEqual({ ok: true, code: "KG" });
    expect(await getUnitSpec(db, "KG")).toEqual({ unit: "KG", baseUnit: "G", factor: 1000, decimals: 1 });
  });

  it("자릿수를 보내지 않으면 그대로 둔다", async () => {
    expect(await updateCode(db, "UNIT", "KG", { name: "킬로그램", sortOrder: "30", active: "Y" })).toMatchObject({
      ok: true,
    });
    expect(await getUnitSpec(db, "KG")).toMatchObject({ decimals: 3 });
  });

  it("틀린 자릿수면 이름도 자릿수도 바뀌지 않는다", async () => {
    const before = await unitState();
    const r = await updateCode(db, "UNIT", "KG", { name: "바꿈", sortOrder: "30", active: "Y", decimals: "9" });
    expect(r).toMatchObject({ ok: false, errors: { decimals: expect.stringContaining("0 ~ 3") } });
    expect(await getCode(db, "UNIT", "KG")).toMatchObject({ name: "킬로그램" });
    expect(await unitState()).toEqual(before);
  });

  it("그 사이 다른 사람이 고쳤으면 이름도 자릿수도 바뀌지 않는다", async () => {
    const opened = (await getCode(db, "UNIT", "KG"))!.version;
    await updateCode(db, "UNIT", "KG", { name: "킬로", sortOrder: "30", active: "Y" }, opened);
    const r = await updateCode(
      db,
      "UNIT",
      "KG",
      { name: "킬로그램", sortOrder: "30", active: "Y", decimals: "0" },
      opened,
    );
    expect(r).toMatchObject({ ok: false, formError: expect.stringContaining("다른 사람이 먼저") });
    expect(await getUnitSpec(db, "KG")).toMatchObject({ decimals: 3 });
  });
});
