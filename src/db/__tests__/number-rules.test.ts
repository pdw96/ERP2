// @vitest-environment node
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  NUMBER_RULE_LIMIT,
  createNumberRule,
  getNumberRule,
  issueLotNumber,
  listNumberRules,
  ruleForItem,
  updateNumberRule,
  type NumberRule,
} from "@/db/number-rules";
import { resetToSample } from "@/db/reset";
import { SAMPLE_NUMBER_RULES } from "@/db/sample";
import { items, numberRuleSeqs, numberRules } from "@/db/schema";
import type { Db } from "@/db/types";
import type { NumberRuleValues } from "@/lib/number-rule-input";
import { migratedDb, rejection } from "./pglite";

// 번호 규칙(조각 「재고 수불」 설계 ② 「번호」 · ③ 「번호 규칙」 · ⑤ 「PR B」, ADR 0016) — PGlite 에서 실제 SQL 로.
// 거절 시험은 거절 뒤 규칙 표가 거절 전과 같은지와 거절한 칸을, 성공 시험은 저장된 값을 본다.

let handle: Awaited<ReturnType<typeof migratedDb>>;
let db: Db;
beforeAll(async () => {
  handle = await migratedDb();
  db = handle.db;
});
afterAll(() => handle.close());
beforeEach(() => resetToSample(db));

const rulesNow = async () =>
  (await db.select().from(numberRules).orderBy(asc(numberRules.code))).map((r) => {
    const rest: Partial<NumberRule> = { ...r };
    delete rest.updatedAt;
    return rest;
  });
const defaults = async () =>
  Object.fromEntries(
    (await listNumberRules(db)).filter((r) => r.defaultFor).map((r) => [r.defaultFor, r.code] as const),
  );

const newRule = (over: NumberRuleValues = {}): NumberRuleValues => ({
  code: "LOT_FG2",
  name: "완제품 LOT 2",
  prefix: "P",
  separator: "_",
  dateFormat: "YYMM",
  seqDigits: "4",
  defaultFor: "NONE",
  ...over,
});
const editOf = (r: NumberRule, over: NumberRuleValues = {}): NumberRuleValues => ({
  name: r.name,
  prefix: r.prefix,
  separator: r.separator || "NONE",
  dateFormat: r.dateFormat || "NONE",
  seqDigits: String(r.seqDigits),
  defaultFor: r.defaultFor ?? "NONE",
  active: r.active ? "Y" : "N",
  ...over,
});

describe("DB 가 막는 것", () => {
  const insert = (v: Partial<typeof numberRules.$inferInsert>) =>
    db.insert(numberRules).values({ code: "LOT_X", name: "x", seqDigits: 3, ...v });

  it.each([
    ["코드 소문자", { code: "lot_x" }, "number_rules_code_format"],
    ["머리 7자", { prefix: "ABCDEFG" }, "number_rules_prefix_format"],
    ["구분자 /", { separator: "/" }, "number_rules_separator_values"],
    ["날짜 꼴 DDMMYY", { dateFormat: "DDMMYY" }, "number_rules_date_format_values"],
    ["자릿수 1", { seqDigits: 1 }, "number_rules_seq_digits_range"],
    ["자릿수 7", { seqDigits: 7 }, "number_rules_seq_digits_range"],
    ["원자재의 기본", { defaultFor: "RM" }, "number_rules_default_for_values"],
    ["한 유형에 기본 둘", { defaultFor: "FG" }, "number_rules_default_for_unique"],
    ["이름 51자", { name: "가".repeat(51) }, "number_rules_name_length"],
    ["겹치는 코드", { code: "LOT_FG" }, "number_rules_code_unique"],
  ])("%s", async (_, v, constraint) => {
    const before = await rulesNow();
    expect(await rejection(insert(v))).toMatchObject({ constraint });
    expect(await rulesNow()).toEqual(before);
  });

  it("기본 규칙을 「사용 안 함」으로 바꾸는 쓰기 · 「사용 안 함」 규칙을 기본으로 바꾸는 쓰기는 DB 도 막는다", async () => {
    expect(
      await rejection(db.update(numberRules).set({ active: false }).where(eq(numberRules.code, "LOT_FG"))),
    ).toMatchObject({ constraint: "number_rules_default_active" });
    // 기본이 아니면 「사용 안 함」이어도 된다.
    await insert({ code: "LOT_Y", active: false });
    await db.update(numberRules).set({ defaultFor: null }).where(eq(numberRules.code, "LOT_SF"));
    expect(
      await rejection(db.update(numberRules).set({ defaultFor: "SF" }).where(eq(numberRules.code, "LOT_Y"))),
    ).toMatchObject({ constraint: "number_rules_default_active" });
  });

  it("품목의 규칙은 만드는 품목만 — 원자재에 규칙을 넣는 쓰기는 DB 도 막는다", async () => {
    expect(
      await rejection(db.update(items).set({ lotRuleCode: "LOT_FG" }).where(eq(items.code, "RM-0001"))),
    ).toMatchObject({ constraint: "items_lot_rule_made_only" });
    expect(
      await rejection(db.update(items).set({ lotRuleCode: "LOT_NO" }).where(eq(items.code, "FG-0001"))),
    ).toMatchObject({ constraint: "items_lot_rule_fk" });
  });

  it("품목이 쓰는 규칙은 지울 수 없다", async () => {
    expect(await rejection(db.delete(numberRules).where(eq(numberRules.code, "LOT_NUM")))).toMatchObject({
      constraint: "items_lot_rule_fk",
    });
  });
});

describe("목록 · 샘플", () => {
  it("샘플 규칙 셋 — 반제품 · 완제품의 기본과 숫자형(설계 「2026-11-06 — PR B 를 열기 전에 정한 것」)", async () => {
    expect((await listNumberRules(db)).map((r) => r.code)).toEqual(["LOT_FG", "LOT_NUM", "LOT_SF"]);
    expect(await defaults()).toEqual({ SF: "LOT_SF", FG: "LOT_FG" });
    expect(SAMPLE_NUMBER_RULES).toHaveLength(3);
  });

  it("주소로 받은 코드가 꼴에 맞지 않으면 DB 에 묻지 않고 없다고 한다", async () => {
    expect(await getNumberRule(db, "lot_fg")).toBeUndefined();
    expect(await getNumberRule(db, "'; drop table number_rules; --")).toBeUndefined();
  });
});

describe("등록", () => {
  it("맞는 꼴이면 저장되고, 사용 중이다", async () => {
    expect(await createNumberRule(db, newRule())).toEqual({ ok: true, code: "LOT_FG2" });
    expect(await getNumberRule(db, "LOT_FG2")).toMatchObject({
      prefix: "P",
      separator: "_",
      dateFormat: "YYMM",
      seqDigits: 4,
      defaultFor: null,
      active: true,
    });
  });

  it("유형의 기본으로 고르면 앞의 기본 규칙에서 기본이 옮겨 온다 — 유형마다 기본은 늘 하나", async () => {
    expect(await createNumberRule(db, newRule({ defaultFor: "FG" }))).toMatchObject({ ok: true });
    expect(await defaults()).toEqual({ SF: "LOT_SF", FG: "LOT_FG2" });
  });

  it("겹치는 코드 · 틀린 꼴은 저장하지 않고 칸을 알린다", async () => {
    const before = await rulesNow();
    expect(await createNumberRule(db, newRule({ code: "LOT_FG" }))).toMatchObject({
      ok: false,
      errors: { code: expect.stringContaining("같은 코드") },
    });
    expect(await createNumberRule(db, newRule({ prefix: "abc", defaultFor: "FG" }))).toMatchObject({
      ok: false,
      errors: { prefix: expect.any(String) },
    });
    expect(await rulesNow()).toEqual(before);
  });

  it(`등록 상한 ${NUMBER_RULE_LIMIT}개에 닿으면 저장하지 않는다 — 「사용 안 함」도 센다`, async () => {
    await db.insert(numberRules).values(
      Array.from({ length: NUMBER_RULE_LIMIT - SAMPLE_NUMBER_RULES.length }, (_, i) => ({
        code: `LOT_${i}`,
        name: "채움",
        seqDigits: 3,
        active: i % 2 === 0,
      })),
    );
    const r = await createNumberRule(db, newRule());
    expect(r).toMatchObject({ ok: false, formError: expect.stringContaining("50개까지") });
    expect(await listNumberRules(db)).toHaveLength(NUMBER_RULE_LIMIT);
  });

  it("동시에 등록해도 상한을 넘지 않는다 — 세기 · 넣기가 잠금 안에서 차례로", async () => {
    await db.insert(numberRules).values(
      Array.from({ length: NUMBER_RULE_LIMIT - SAMPLE_NUMBER_RULES.length - 1 }, (_, i) => ({
        code: `LOT_${i}`,
        name: "채움",
        seqDigits: 3,
      })),
    );
    const results = await Promise.all(
      ["LOT_A1", "LOT_A2", "LOT_A3"].map((code) => createNumberRule(db, newRule({ code }))),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await listNumberRules(db)).toHaveLength(NUMBER_RULE_LIMIT);
  });
});

describe("수정", () => {
  const fg = async () => (await getNumberRule(db, "LOT_FG"))!;
  const num = async () => (await getNumberRule(db, "LOT_NUM"))!;

  it("꼴을 고치면 남는다 — 코드는 그대로", async () => {
    const r = await num();
    expect(await updateNumberRule(db, "LOT_NUM", editOf(r, { prefix: "N", seqDigits: "5" }), r.version)).toEqual({
      ok: true,
      code: "LOT_NUM",
    });
    expect(await num()).toMatchObject({ code: "LOT_NUM", prefix: "N", seqDigits: 5 });
  });

  it("유형의 기본 규칙은 「사용 안 함」으로 바꾸지 못한다(ADR 0016)", async () => {
    const before = await rulesNow();
    const r = await fg();
    expect(await updateNumberRule(db, "LOT_FG", editOf(r, { active: "N" }), r.version)).toMatchObject({
      ok: false,
      errors: { active: "유형의 기본 규칙은 「사용 안 함」으로 바꾸지 못합니다" },
    });
    expect(await rulesNow()).toEqual(before);
  });

  it("기본을 떼지 못한다 — 다른 규칙을 기본으로 고르면 옮겨 간다", async () => {
    const before = await rulesNow();
    const r = await fg();
    expect(await updateNumberRule(db, "LOT_FG", editOf(r, { defaultFor: "NONE" }), r.version)).toMatchObject({
      ok: false,
      errors: { defaultFor: expect.stringContaining("다른 규칙을 완제품의 기본으로") },
    });
    expect(await updateNumberRule(db, "LOT_FG", editOf(r, { defaultFor: "SF" }), r.version)).toMatchObject({
      ok: false,
      errors: { defaultFor: expect.any(String) },
    });
    expect(await rulesNow()).toEqual(before);

    const n = await num();
    expect(await updateNumberRule(db, "LOT_NUM", editOf(n, { defaultFor: "FG" }), n.version)).toMatchObject({
      ok: true,
    });
    expect(await defaults()).toEqual({ SF: "LOT_SF", FG: "LOT_NUM" });
    // 기본에서 풀린 규칙은 이제 「사용 안 함」으로 바꿀 수 있다.
    const freed = await fg();
    expect(await updateNumberRule(db, "LOT_FG", editOf(freed, { active: "N" }), freed.version)).toMatchObject({
      ok: true,
    });
  });

  it("「사용 안 함」인 규칙을 기본으로 고르면서 「사용 안 함」으로 두지 못한다", async () => {
    const n = await num();
    expect(
      await updateNumberRule(db, "LOT_NUM", editOf(n, { defaultFor: "SF", active: "N" }), n.version),
    ).toMatchObject({ ok: false, errors: { active: expect.any(String) } });
    expect(await defaults()).toEqual({ SF: "LOT_SF", FG: "LOT_FG" });
  });

  it("그 사이 다른 사람이 고쳤으면 저장하지 않는다 — 기본도 옮겨 가지 않는다", async () => {
    const n = await num();
    await updateNumberRule(db, "LOT_NUM", editOf(n, { name: "먼저 고침" }));
    expect(await updateNumberRule(db, "LOT_NUM", editOf(n, { defaultFor: "FG" }), n.version)).toMatchObject({
      ok: false,
      formError: expect.stringContaining("다른 사람이 먼저"),
    });
    expect(await defaults()).toEqual({ SF: "LOT_SF", FG: "LOT_FG" });
  });

  it("없는 규칙", async () => {
    expect(await updateNumberRule(db, "LOT_NO", editOf((await num())!))).toEqual({ ok: false, notFound: true });
  });
});

describe("품목이 쓰는 규칙", () => {
  it("품목에서 고른 규칙, 없으면 유형의 기본 규칙. 사 오는 품목은 없다", async () => {
    expect((await ruleForItem(db, { itemType: "FG", lotRuleCode: "LOT_NUM" }))?.code).toBe("LOT_NUM");
    expect((await ruleForItem(db, { itemType: "FG", lotRuleCode: null }))?.code).toBe("LOT_FG");
    expect((await ruleForItem(db, { itemType: "SF", lotRuleCode: null }))?.code).toBe("LOT_SF");
    for (const itemType of ["RM", "SM", "CS"])
      expect(await ruleForItem(db, { itemType, lotRuleCode: null })).toBeUndefined();
  });

  it("「사용 안 함」 규칙도 이미 고른 품목은 그 규칙으로 계속 받는다", async () => {
    await db.update(numberRules).set({ active: false }).where(eq(numberRules.code, "LOT_NUM"));
    expect((await ruleForItem(db, { itemType: "FG", lotRuleCode: "LOT_NUM" }))?.code).toBe("LOT_NUM");
  });
});

describe("LOT 번호를 낸다(ADR 0016)", () => {
  const ruleOf = async (code: string) => (await getNumberRule(db, code))!;
  const none: (lot: string) => Promise<boolean> = async () => false;
  // 규칙은 트랜잭션 밖에서 먼저 읽는다 — 시험 DB 는 접속이 하나라 트랜잭션 안에서 바깥 접속을 부르면 기다리기만 한다.
  const issue = async (code: string, date: string, isTaken = none) => {
    const rule = await ruleOf(code);
    return db.transaction((tx) => issueLotNumber(tx, rule, date, isTaken));
  };
  const seqs = () =>
    db
      .select({ rule: numberRuleSeqs.ruleCode, period: numberRuleSeqs.period, last: numberRuleSeqs.lastSeq })
      .from(numberRuleSeqs)
      .orderBy(asc(numberRuleSeqs.ruleCode), asc(numberRuleSeqs.period));

  it("YYMMDD — 날마다 1 부터 센다", async () => {
    expect(await issue("LOT_FG", "2026-11-05")).toBe("FG-261105-001");
    expect(await issue("LOT_FG", "2026-11-05")).toBe("FG-261105-002");
    expect(await issue("LOT_FG", "2026-11-06")).toBe("FG-261106-001");
    expect(await issue("LOT_NUM", "2026-11-05")).toBe("261105001");
    expect(await seqs()).toEqual([
      { rule: "LOT_FG", period: "261105", last: 2 },
      { rule: "LOT_FG", period: "261106", last: 1 },
      { rule: "LOT_NUM", period: "261105", last: 1 },
    ]);
  });

  it("YYMM 은 달마다, 날짜 꼴이 없으면 다시 세지 않는다", async () => {
    await db.update(numberRules).set({ dateFormat: "YYMM" }).where(eq(numberRules.code, "LOT_SF"));
    expect(await issue("LOT_SF", "2026-11-05")).toBe("SF-2611-001");
    expect(await issue("LOT_SF", "2026-11-30")).toBe("SF-2611-002");
    expect(await issue("LOT_SF", "2026-12-01")).toBe("SF-2612-001");
    await db.update(numberRules).set({ dateFormat: "" }).where(eq(numberRules.code, "LOT_SF"));
    expect(await issue("LOT_SF", "2026-11-05")).toBe("SF-001");
    expect(await issue("LOT_SF", "2027-01-01")).toBe("SF-002");
  });

  it("그 품목에 이미 있는 번호면 다음 일련으로 넘어간다", async () => {
    const taken = new Set(["FG-261105-001", "FG-261105-002"]);
    expect(await issue("LOT_FG", "2026-11-05", async (lot) => taken.has(lot))).toBe("FG-261105-003");
    expect(await seqs()).toEqual([{ rule: "LOT_FG", period: "261105", last: 3 }]);
  });

  it("부르는 쪽이 되돌리면 일련도 되돌아간다 — 전표 단위(설계 ②)", async () => {
    await issue("LOT_FG", "2026-11-05");
    const rule = await ruleOf("LOT_FG");
    await expect(
      db.transaction(async (tx) => {
        await issueLotNumber(tx, rule, "2026-11-05", none);
        throw new Error("전표의 다른 줄이 틀림");
      }),
    ).rejects.toThrow("전표의 다른 줄이 틀림");
    expect(await seqs()).toEqual([{ rule: "LOT_FG", period: "261105", last: 1 }]);
    expect(await issue("LOT_FG", "2026-11-05")).toBe("FG-261105-002");
  });

  it("동시에 내도 같은 번호가 나오지 않는다", async () => {
    const lots = await Promise.all(Array.from({ length: 5 }, () => issue("LOT_FG", "2026-11-05")));
    expect(new Set(lots).size).toBe(5);
    expect(lots.sort()).toEqual(["001", "002", "003", "004", "005"].map((n) => `FG-261105-${n}`));
  });

  it("규칙을 고치면 그 뒤에 붙는 번호부터 바뀐다", async () => {
    expect(await issue("LOT_FG", "2026-11-05")).toBe("FG-261105-001");
    await db.update(numberRules).set({ prefix: "PK", separator: "" }).where(eq(numberRules.code, "LOT_FG"));
    expect(await issue("LOT_FG", "2026-11-05")).toBe("PK261105002");
  });

  it("겹친 번호가 끝없이 이어지면 멈춘다", async () => {
    await expect(issue("LOT_FG", "2026-11-05", async () => true)).rejects.toThrow("건너뛰었다");
    expect(await seqs()).toEqual([]);
  });
});
