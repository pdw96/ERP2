// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  bomInquiry,
  ceilToDecimals,
  explode,
  EXPLODE_DEPTH,
  EXPLODE_ROWS,
  openBomSheet,
  requiredOf,
  saveBom,
  type Explosion,
  type Ratio,
} from "@/db/boms";
import { createItem } from "@/db/items";
import { resetToSample } from "@/db/reset";
import { bomLines, boms, items, unitSpecs } from "@/db/schema";
import type { Db } from "@/db/types";
import { parseBomInquiry, type BomInquiryNotice, type BomLineValues, type BomValues } from "@/lib/bom-input";
import { migratedDb } from "./pglite";

// BOM 조회(조각 「BOM」 PR B, 설계 ② 「정전개의 필요량」 · 「역전개」 · 「읽기만」, ⑤ 의 B3 · B4) — PGlite 에서 실제 SQL 로.
// B3 펼치기 시험은 정전개 · 역전개가 낸 줄을 시험 안에서 따로 센 기대값(expectedDown · expectedUp — BOM 줄 전체를 DB 에서 읽어 기준일의 줄만 길마다 곱함)과
// 견주고, 정전개와 역전개가 같은 부모 · 자품목 쌍을 보이는지를 샘플과 정한 씨앗의 임의의 BOM 묶음으로 본다.
// 오늘은 2026-11-12 로 묶는다 — 샘플의 적용 시작일은 2026-05-16, 다이 접착제는 2026-11-25 까지 20 G · 2026-11-26 부터 18 G.

const TODAY = "2026-11-12";
const START = "2026-05-16";
let handle: Awaited<ReturnType<typeof migratedDb>>;
let db: Db;
beforeAll(async () => {
  handle = await migratedDb();
  db = handle.db;
});
afterAll(() => handle.close());
beforeEach(() => resetToSample(db, TODAY));

const idOf = async (code: string) => (await db.select({ id: items.id }).from(items).where(eq(items.code, code)))[0].id;
const down = async (code: string, date = TODAY, qty?: string) =>
  explode(db, "down", await idOf(code), date, qty === undefined ? undefined : scaled(qty, 3));
const up = async (code: string, date = TODAY) => explode(db, "up", await idOf(code), date);
/** 줄을 [단계, 품목코드, 필요량] 으로 — 정전개의 모양을 한눈에. */
const shape = (e: Explosion) => e.lines.map((l) => [l.level, l.item.code, l.required]);

// ── 시험 안의 따로 센 기대값 ────────────────────────────────────

/** 「12.5」 → 10^places 배의 정수(12500 · places 3). 쉼표는 없다. */
function scaled(text: string, places: number): bigint {
  const [int, frac = ""] = text.split(".");
  return BigInt(int) * BigInt(10) ** BigInt(places) + BigInt(frac.padEnd(places, "0").slice(0, places));
}

type Frac = { n: bigint; d: bigint };
const sameValue = (a: Frac, b: Frac) => a.n * b.d === b.n * a.d;
/** 소수 decimals 자리로 올린 값을 천분의 일 단위의 정수로. */
const ceilMilli = (f: Frac, decimals: number) => {
  const s = BigInt(10) ** BigInt(decimals);
  const q = f.n * s;
  return ((q + f.d - BigInt(1)) / f.d) * BigInt(10) ** BigInt(3 - decimals);
};
const milliText = (m: bigint) => {
  const int = (m / BigInt(1000)).toLocaleString("ko-KR");
  const frac = String(m % BigInt(1000))
    .padStart(3, "0")
    .replace(/0+$/, "");
  return frac ? `${int}.${frac}` : int;
};

type Expected = { level: number; parent: string; child: string; required?: Frac; shown?: string };

/** BOM 줄 전체와 품목을 DB 에서 다시 읽는다 — 펼치기 함수를 거치지 않고. */
async function snapshot() {
  const all = await db
    .select({
      parent: sql<string>`(select code from items p where p.id = ${bomLines.parentItemId})`,
      child: items.code,
      lineNo: bomLines.lineNo,
      qty: sql<string>`${bomLines.qty}::text`,
      loss: sql<string>`${bomLines.lossRate}::text`,
      from: sql<string>`${bomLines.validFrom}::text`,
      to: sql<string | null>`${bomLines.validTo}::text`,
      base: sql<string>`${boms.baseQty}::text`,
    })
    .from(bomLines)
    .innerJoin(boms, eq(boms.id, bomLines.bomId))
    .innerJoin(items, eq(items.id, bomLines.childItemId))
    .orderBy(asc(bomLines.lineNo));
  const decimals = new Map(
    (
      await db
        .select({ code: items.code, d: sql<number>`coalesce(${unitSpecs.decimals}, 3)` })
        .from(items)
        .leftJoin(unitSpecs, eq(unitSpecs.unit, items.unit))
    ).map((r) => [r.code, Number(r.d)] as const),
  );
  return { all, decimals };
}

/** 정전개의 기대값 — 깊이 우선, 형제는 줄 번호 차례. 필요량 = 윗 필요량 × 소요량 ÷ 기준수량 × (100 + 로스율) ÷ 100. */
async function expectedDown(root: string, date: string, qty: string): Promise<Expected[]> {
  const { all, decimals } = await snapshot();
  const applies = (l: (typeof all)[number]) => l.from <= date && (l.to === null || l.to >= date);
  const out: Expected[] = [];
  const go = (parent: string, upper: Frac, level: number) => {
    for (const l of all.filter((x) => x.parent === parent && applies(x))) {
      // 수량은 소수 셋째, 로스율은 둘째 자리까지 — 10^3 · 10^2 배의 정수로 곱하고 나눈다.
      const required = {
        n: upper.n * scaled(l.qty, 3) * (BigInt(10000) + scaled(l.loss, 2)),
        d: upper.d * scaled(l.base, 3) * BigInt(10000),
      };
      out.push({
        level,
        parent,
        child: l.child,
        required,
        shown: milliText(ceilMilli(required, decimals.get(l.child)!)),
      });
      go(l.child, required, level + 1);
    }
  };
  go(root, { n: scaled(qty, 3), d: BigInt(1000) }, 1);
  return out;
}

/** 역전개의 기대값 — 깊이 우선, 형제는 부모 품목코드 차례. */
async function expectedUp(leaf: string, date: string): Promise<Expected[]> {
  const { all } = await snapshot();
  const out: Expected[] = [];
  const go = (child: string, level: number) => {
    const parents = all
      .filter((l) => l.child === child && l.from <= date && (l.to === null || l.to >= date))
      .sort((a, b) => (a.parent < b.parent ? -1 : 1));
    for (const l of parents) {
      out.push({ level, parent: l.parent, child });
      go(l.parent, level + 1);
    }
  };
  go(leaf, 1);
  return out;
}

/** 펼친 줄마다 [부모, 자품목] — 정전개는 줄의 품목이 자품목, 역전개는 줄의 품목이 부모다. 위 줄은 경로(key)로 찾는다. */
function pairs(e: Explosion, mode: "down" | "up", root: string): string[] {
  const byKey = new Map(e.lines.map((l) => [l.key, l]));
  return e.lines.map((l) => {
    const cut = l.key.lastIndexOf("/");
    const other = cut < 0 ? root : byKey.get(l.key.slice(0, cut))!.item.code;
    return mode === "down" ? `${other}>${l.item.code}@${l.level}` : `${l.item.code}>${other}`;
  });
}

function expectMatchesDown(e: Explosion, expected: Expected[]) {
  expect(e.truncated).toBe(false);
  expect(e.depthStopped).toBe(false);
  expect(e.lines.map((l) => [l.level, l.item.code])).toEqual(expected.map((x) => [x.level, x.child]));
  e.lines.forEach((l, i) => {
    expect(sameValue(l.requiredExact!, expected[i].required!), `${l.key} ${l.item.code} 의 필요량`).toBe(true);
    expect(l.required).toBe(expected[i].shown);
  });
}

// ── 샘플 ─────────────────────────────────────────────

describe("정전개 — 샘플(성공 기준 8 · 12 · 13)", () => {
  it("전원 관리 IC 10,000 EA — 세 단계, 단계마다 필요량, 로스율이 얹히고 자품목 단위의 자릿수로 올린다", async () => {
    const e = await down("FG-0001", TODAY, "10000");
    // 손으로 센 값 — 몰딩 완료품 10000 × 2500 ÷ 2500 × 1.01 = 10,100, 웨이퍼 10100 × 5 ÷ 10000 × 1.02 = 5.151 → 6 EA,
    // 다이 접착제 10100 × 20 ÷ 10000 × 1.05 = 21.21 → 22 G, 금 와이어 10100 × 12 ÷ 1000 × 1.03 = 124.836 M,
    // 에폭시 10100 × 0.5 ÷ 1000 × 1.05 = 5.3025 → 5.303 KG, 캐리어 테이프 10000 × 10 ÷ 2500 × 1.02 = 40.8 M.
    expect(shape(e)).toEqual([
      [1, "SF-0002", "10,100"],
      [2, "SF-0001", "10,100"],
      [3, "RM-0001", "6"],
      [3, "RM-0002", "10,201"],
      [3, "RM-0005", "22"],
      [2, "RM-0003", "124.836"],
      [2, "RM-0004", "5.303"],
      [1, "SM-0001", "40.8"],
      [1, "SM-0002", "4"],
    ]);
    expectMatchesDown(e, await expectedDown("FG-0001", TODAY, "10000"));
    const glue = e.lines[4];
    expect(glue).toMatchObject({
      item: { name: expect.any(String), itemType: "RM", unit: "G", active: true },
      qty: "20",
      qtyUnit: "G",
      baseQty: "10,000",
      baseUnit: "EA",
      lossRate: "5",
      validFrom: START,
      validTo: "2026-11-25",
      noBom: false,
    });
    // 끝수를 버리지 않은 값 — 21.21 = 2121/100.
    expect(sameValue(glue.requiredExact!, { n: BigInt(2121), d: BigInt(100) })).toBe(true);
  });

  it("기준일을 설계변경 날로 바꾸면 다이 접착제가 새 줄(18 G)로 — 앞날 · 그날 · 종료일 그날(성공 기준 10)", async () => {
    const at = async (date: string) =>
      (await down("FG-0001", date, "10000")).lines.find((l) => l.item.code === "RM-0005")!;
    expect(await at("2026-11-25")).toMatchObject({ qty: "20", required: "22", validTo: "2026-11-25" });
    // 10100 × 18 ÷ 10000 × 1.05 = 19.089 → 20 G.
    expect(await at("2026-11-26")).toMatchObject({ qty: "18", required: "20", validFrom: "2026-11-26", validTo: "" });
    for (const date of ["2026-11-25", "2026-11-26", "2027-03-01"])
      expectMatchesDown(await down("FG-0001", date, "10000"), await expectedDown("FG-0001", date, "10000"));
  });

  it("기준일이 적용 시작일이면 줄이 들고, 하루 앞이면 들지 않는다", async () => {
    expect((await down("FG-0001", START)).lines).toHaveLength(9);
    expect((await down("FG-0001", "2026-05-15")).lines).toEqual([]);
  });

  it("수량을 비우면 그 BOM 의 기준수량으로 펼친다 — 전원 관리 IC 2,500 EA", async () => {
    const e = await down("FG-0001");
    expect(shape(e)[0]).toEqual([1, "SF-0002", "2,525"]);
    expectMatchesDown(e, await expectedDown("FG-0001", TODAY, "2500"));
  });

  it("센서 IC — 한 단계 여섯 줄, 로스율 0 은 그대로(방습백 4 EA)", async () => {
    const e = await down("FG-0002");
    expect(shape(e)).toEqual([
      [1, "RM-0001", "9"],
      [1, "RM-0006", "10,100"],
      [1, "RM-0005", "32"],
      [1, "RM-0003", "329.6"],
      [1, "RM-0004", "3.15"],
      [1, "SM-0002", "4"],
    ]);
    expectMatchesDown(e, await expectedDown("FG-0002", TODAY, "10000"));
  });
});

describe("역전개 — 샘플(성공 기준 9)", () => {
  it("금 와이어 — 몰딩 완료품 → 전원 관리 IC 와 센서 IC, 형제는 부모 품목코드 차례", async () => {
    const e = await up("RM-0003");
    expect(e.lines.map((l) => [l.level, l.item.code, l.qty, l.qtyUnit, l.baseQty, l.baseUnit, l.lossRate])).toEqual([
      [1, "FG-0002", "320", "M", "10,000", "EA", "3"],
      [1, "SF-0002", "12", "M", "1,000", "EA", "3"],
      [2, "FG-0001", "2,500", "EA", "2,500", "EA", "1"],
    ]);
    expect(e.lines.every((l) => l.required === undefined && l.noBom === undefined)).toBe(true);
    expect(e.lines.map((l) => [l.level, l.item.code])).toEqual(
      (await expectedUp("RM-0003", TODAY)).map((x) => [x.level, x.parent]),
    );
  });

  it("기준일에 적용되지 않는 줄은 보이지 않는다 — 다이 접착제의 몰딩 완료품 길은 20 G 줄에서 18 G 줄로", async () => {
    const before = await up("RM-0005", "2026-11-25");
    const after = await up("RM-0005", "2026-11-26");
    expect(before.lines.map((l) => [l.level, l.item.code, l.qty])).toEqual([
      [1, "FG-0002", "30"],
      [1, "SF-0001", "20"],
      [2, "SF-0002", "1,000"],
      [3, "FG-0001", "2,500"],
    ]);
    expect(after.lines.find((l) => l.item.code === "SF-0001")?.qty).toBe("18");
    expect((await up("RM-0005", "2026-05-15")).lines).toEqual([]);
  });

  it("어디에도 들지 않는 품목 · 완제품은 줄이 없다", async () => {
    expect((await up("FG-0001")).lines).toEqual([]);
    expect((await up("CS-0001")).lines).toEqual([]);
  });

  it("정전개와 역전개가 같은 부모 · 자품목 쌍을 보인다(설계 ② 「역전개」)", async () => {
    await expectPairsAgree(TODAY);
    await expectPairsAgree("2026-11-26");
  });
});

/** 모든 BOM 의 정전개에서 본 [부모 > 자품목] 과 모든 품목의 역전개에서 본 [부모 > 자품목] 이 같다. */
async function expectPairsAgree(date: string) {
  const codes = (await db.select({ code: items.code }).from(items)).map((r) => r.code);
  const roots = (await db.select({ code: items.code }).from(boms).innerJoin(items, eq(items.id, boms.itemId))).map(
    (r) => r.code,
  );
  const fromDown = new Set<string>();
  for (const r of roots)
    for (const p of pairs(await down(r, date, "1"), "down", r)) fromDown.add(p.replace(/@\d+$/, ""));
  const fromUp = new Set<string>();
  for (const c of codes) for (const p of pairs(await up(c, date), "up", c)) fromUp.add(p);
  expect(fromDown.size).toBeGreaterThan(0);
  expect([...fromUp].sort()).toEqual([...fromDown].sort());
}

// ── 경계 ─────────────────────────────────────────────

async function newItem(itemType: string, name: string, unit = "EA") {
  const r = await createItem(db, {
    itemType,
    procurement: itemType === "SF" || itemType === "FG" ? "MAKE" : "BUY",
    name,
    unit,
    lotManaged: itemType === "SM" ? "" : "on",
    leadTimeDays: "0",
    safetyStock: "0",
    minLot: "0",
    lotMultiple: "0",
  });
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r.code;
}

const line = (child: string, qty: string, over: BomLineValues = {}): BomLineValues => ({
  child,
  qty,
  lossRate: "",
  validFrom: "2026-01-01",
  validTo: "",
  note: "",
  ...over,
});

async function save(parent: string, baseQty: string, lines: BomLineValues[]) {
  const opened = await openBomSheet(db, parent);
  const version = opened.ok ? (opened.sheet.version ?? "") : "";
  const values: BomValues = { parent, baseQty, version, lines };
  const r = await saveBom(db, values);
  if (!r.ok) throw new Error(JSON.stringify(r));
}

/** 시험 BOM 을 저장을 거치지 않고 바로 넣는다 — 펼치기의 상한만 보는 시험(줄이 많다). */
async function insertBom(parent: string, baseQty: string, children: string[]) {
  const parentId = await idOf(parent);
  const [b] = await db
    .insert(boms)
    .values({ itemId: parentId, baseQty: baseQty as unknown as number })
    .returning({ id: boms.id });
  await db.insert(bomLines).values(
    await Promise.all(
      children.map(async (c, i) => ({
        bomId: b.id,
        parentItemId: parentId,
        lineNo: i + 1,
        childItemId: await idOf(c),
        qty: "1" as unknown as number,
        lossRate: "0" as unknown as number,
        validFrom: "2026-01-01",
        validTo: null,
        note: "",
      })),
    ),
  );
}

describe("정전개 — 경계(설계 ⑤ 의 B4)", () => {
  it("BOM 없는 반제품은 그 단계에서 멈추고 「BOM 없음」 — 그날 줄이 없는 반제품도", async () => {
    const bare = await newItem("SF", "시험 반제품 BOM 없음");
    const later = await newItem("SF", "시험 반제품 앞날 BOM");
    await save(later, "1", [line("RM-0001", "1", { validFrom: "2027-01-01" })]);
    await save("FG-0002", "10000", [line("RM-0001", "8"), line(bare, "10000"), line(later, "10000")]);
    const e = await down("FG-0002");
    expect(e.lines.map((l) => [l.level, l.item.code, l.noBom])).toEqual([
      [1, "RM-0001", false],
      [1, bare, true],
      [1, later, true],
    ]);
    expect((await down("FG-0002", "2027-01-01")).lines.map((l) => [l.level, l.item.code, l.noBom])).toEqual([
      [1, "RM-0001", false],
      [1, bare, true],
      [1, later, false],
      [2, "RM-0001", false],
    ]);
  });

  it("같은 자재가 두 길로 들면 길마다 줄이 있다", async () => {
    await save("FG-0002", "10000", [line("RM-0005", "30", { lossRate: "5" }), line("SF-0001", "10000")]);
    const e = await down("FG-0002");
    expect(shape(e)).toEqual([
      [1, "RM-0005", "32"],
      [1, "SF-0001", "10,000"],
      [2, "RM-0001", "6"],
      [2, "RM-0002", "10,100"],
      [2, "RM-0005", "21"],
    ]);
    expectMatchesDown(e, await expectedDown("FG-0002", TODAY, "10000"));
    // 역전개도 두 길 — 센서 IC 는 바로, 다이 본딩 완료품을 거쳐 한 번 더.
    expect((await up("RM-0005")).lines.map((l) => [l.level, l.item.code])).toEqual([
      [1, "FG-0002"],
      [1, "SF-0001"],
      [2, "FG-0002"],
      [2, "SF-0002"],
      [3, "FG-0001"],
    ]);
  });

  it("끝수 — 올림은 보일 때만, 다음 단계는 올리지 않은 값으로 잇는다", async () => {
    // 반제품 3 ÷ 7 EA 는 끝나지 않는 소수다. 보이는 값은 1 EA(올림)이지만 아래 원자재는 3/7 로 센다.
    const half = await newItem("SF", "시험 반제품 끝수");
    const kg = await newItem("RM", "시험 원자재 KG", "KG");
    await save(half, "7", [line(kg, "1.001", { lossRate: "0.5" })]);
    await save("FG-0002", "7", [line(half, "3")]);
    const e = await down("FG-0002", TODAY, "1");
    // 1 × 3 ÷ 7 = 0.428571… → 1 EA. 아래 KG: 3/7 × 1.001 ÷ 7 × 1.005 = 3018.015/49000 = 0.0615921… → 0.062 KG.
    expect(shape(e)).toEqual([
      [1, half, "1"],
      [2, kg, "0.062"],
    ]);
    expect(sameValue(e.lines[0].requiredExact!, { n: BigInt(3), d: BigInt(7) })).toBe(true);
    expect(sameValue(e.lines[1].requiredExact!, { n: BigInt(3018015), d: BigInt(49000000) })).toBe(true);
    expectMatchesDown(e, await expectedDown("FG-0002", TODAY, "1"));
    // 딱 떨어지면 올리지 않는다 — 1 × 7 ÷ 7 = 1.
    expect(shape(await down("FG-0002", TODAY, "7"))[0]).toEqual([1, half, "3"]);
  });

  it("「사용 안 함」 자품목도 펼쳐지고 표시된다(성공 기준 7)", async () => {
    // 사용 여부만 바로 고친다 — 이 시험은 펼치기의 표시만 본다(품목 수정의 검사는 items.test.ts).
    await db.update(items).set({ active: false }).where(eq(items.code, "SM-0002"));
    const e = await down("FG-0001");
    expect(e.lines.find((l) => l.item.code === "SM-0002")?.item.active).toBe(false);
  });

  it("돌고 도는 줄이 DB 에 있어도 펼치기는 끝난다 — 지나온 품목은 다시 따라가지 않는다", async () => {
    // 저장은 돌고 도는 BOM 을 막는다(boms.test.ts). 저장을 거치지 않고 넣어 펼치기의 막음만 본다.
    const a = await newItem("SF", "시험 고리 가");
    const b = await newItem("SF", "시험 고리 나");
    await insertBom(a, "1", [b, "RM-0001"]);
    await insertBom(b, "1", [a]);
    const e = await explode(db, "down", await idOf(a), TODAY, BigInt(1000));
    expect(e.lines.map((l) => [l.level, l.item.code])).toEqual([
      [1, b],
      [1, "RM-0001"],
    ]);
    expect(e.depthStopped).toBe(false);
    expect((await up("RM-0001")).lines.map((l) => [l.level, l.item.code])).toEqual([
      [1, "FG-0002"],
      [1, "SF-0001"],
      [2, "SF-0002"],
      [3, "FG-0001"],
      [1, a],
      [2, b],
    ]);
  });

  it(`${EXPLODE_DEPTH} 단계에서 멈추고 알린다 — ${EXPLODE_DEPTH} 단계까지는 다 보인다`, async () => {
    const chain: string[] = [];
    for (let i = 0; i < EXPLODE_DEPTH + 1; i++) chain.push(await newItem("SF", `시험 사슬 ${i + 1}`));
    for (let i = 0; i < chain.length - 1; i++) await insertBom(chain[i], "1", [chain[i + 1]]);
    await insertBom(chain[chain.length - 1], "1", ["RM-0001"]);
    // 사슬 21 + 웨이퍼 — 맨 위에서 22 줄, 21 단계까지.
    const top = await explode(db, "down", await idOf(chain[0]), TODAY, BigInt(1000));
    expect(top.depthStopped).toBe(true);
    expect(top.lines).toHaveLength(EXPLODE_DEPTH);
    expect(top.lines.at(-1)!.level).toBe(EXPLODE_DEPTH);
    // 한 칸 아래에서 펼치면 사슬 20 + 웨이퍼가 20 단계 안에 다 든다.
    const fits = await explode(db, "down", await idOf(chain[1]), TODAY, BigInt(1000));
    expect(fits.depthStopped).toBe(false);
    expect(fits.lines).toHaveLength(EXPLODE_DEPTH);
    expect(fits.lines.at(-1)!.item.code).toBe("RM-0001");
    // 역전개도 같은 상한 — 웨이퍼에서 위로 21 단계 넘게.
    const fromLeaf = await up("RM-0001");
    expect(fromLeaf.depthStopped).toBe(true);
    expect(fromLeaf.lines.every((l) => l.level <= EXPLODE_DEPTH)).toBe(true);
  });

  it(`줄이 ${EXPLODE_ROWS} 을 넘으면 앞 단계부터 ${EXPLODE_ROWS} 줄만 — 단계 차례로 남는다`, async () => {
    // 단계마다 반제품 둘이 다음 단계의 둘을 다 쓴다 — 길이 단계마다 두 배(2 + 4 + … + 2^11 = 4094 줄).
    const levels: string[][] = [];
    for (let i = 0; i < 11; i++)
      levels.push([await newItem("SF", `시험 그물 ${i}a`), await newItem("SF", `시험 그물 ${i}b`)]);
    const top = await newItem("FG", "시험 그물 완제품");
    await insertBom(top, "1", levels[0]);
    for (let i = 0; i < levels.length - 1; i++) for (const p of levels[i]) await insertBom(p, "1", levels[i + 1]);
    const e = await explode(db, "down", await idOf(top), TODAY, BigInt(1000));
    expect(e.truncated).toBe(true);
    expect(e.depthStopped).toBe(false);
    expect(e.lines).toHaveLength(EXPLODE_ROWS);
    // 1 ~ 9 단계(2 + … + 512 = 1022 줄)는 다 있고, 10 단계(1024 줄)는 978 줄만.
    const count = (level: number) => e.lines.filter((l) => l.level === level).length;
    for (let level = 1; level <= 9; level++) expect(count(level)).toBe(2 ** level);
    expect(count(10)).toBe(EXPLODE_ROWS - 1022);
    expect(count(11)).toBe(0);
    // 줄 상한 아래면 다 — 3 단계 아래의 반제품에서 펼치면 2 + … + 2^8 = 510 줄.
    const fits = await explode(db, "down", await idOf(levels[2][0]), TODAY, BigInt(1000));
    expect(fits.truncated).toBe(false);
    expect(fits.lines).toHaveLength(510);
  });
});

// ── 정한 씨앗의 임의의 BOM 묶음 ────────────────────────────────

/** 정한 씨앗의 고른 난수(mulberry32) — 시험이 늘 같은 BOM 묶음을 만든다. */
function random(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("정한 씨앗의 임의의 BOM 묶음(설계 ⑤ 의 B3)", () => {
  it.each([7, 2026, 11120])("씨앗 %i — 정전개는 따로 센 필요량과 같고, 정전개 · 역전개의 쌍이 같다", async (seed) => {
    const rnd = random(seed);
    const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
    // 반제품 여섯 · 완제품 둘을 더한다. 차례가 곧 위아래다 — 뒤 품목만 앞 품목의 자품목이 되어 돌지 않는다.
    const sf: string[] = [];
    for (let i = 0; i < 6; i++) sf.push(await newItem("SF", `시험 임의 반제품 ${seed}-${i}`, pick(["EA", "KG"])));
    const fg = [await newItem("FG", `시험 임의 완제품 ${seed}-a`), await newItem("FG", `시험 임의 완제품 ${seed}-b`)];
    const leaves = ["RM-0001", "RM-0003", "RM-0004", "RM-0005", "SM-0001", "SM-0002"];
    const order = [...fg, ...sf];
    const dates = ["2026-01-01", "2026-11-01", "2026-11-13", "2027-01-01"];
    const units = new Map(
      (await db.select({ code: items.code, unit: items.unit }).from(items)).map((r) => [r.code, r.unit] as const),
    );
    const qtyFor = (code: string) =>
      units.get(code) === "EA" || units.get(code) === "G"
        ? String(1 + Math.floor(rnd() * 5000))
        : `${Math.floor(rnd() * 50)}.${String(1 + Math.floor(rnd() * 999)).padStart(3, "0")}`;
    for (let i = 0; i < order.length; i++) {
      const below = [...order.slice(i + 1).filter((c) => !fg.includes(c)), ...leaves];
      const lines: BomLineValues[] = [];
      const used = new Set<string>();
      for (let k = 0; k < 2 + Math.floor(rnd() * 4); k++) {
        const child = pick(below);
        if (used.has(child)) continue;
        used.add(child);
        // 같은 자품목의 줄 둘을 적용일자로 가르기도 한다.
        if (rnd() < 0.3) {
          lines.push(line(child, qtyFor(child), { validFrom: "2026-01-01", validTo: "2026-11-12", lossRate: "1.5" }));
          lines.push(line(child, qtyFor(child), { validFrom: "2026-11-13", lossRate: String(Math.floor(rnd() * 10)) }));
        } else
          lines.push(
            line(child, qtyFor(child), { validFrom: pick(dates.slice(0, 2)), lossRate: rnd() < 0.5 ? "0" : "2.25" }),
          );
      }
      if (lines.length)
        await save(order[i], units.get(order[i]) === "EA" ? String(1 + Math.floor(rnd() * 999)) : "2.5", lines);
    }
    let deepest = 0;
    for (const date of [TODAY, "2026-11-13"]) {
      for (const root of order) {
        const opened = await openBomSheet(db, root);
        if (!opened.ok || !opened.sheet.version) continue;
        const e = await down(root, date, "1234");
        expectMatchesDown(e, await expectedDown(root, date, "1234"));
        deepest = Math.max(deepest, ...e.lines.map((l) => l.level));
      }
      await expectPairsAgree(date);
    }
    // 묶음이 여러 단계로 내려가야 시험이 뜻이 있다.
    expect(deepest).toBeGreaterThanOrEqual(3);
  });
});

// ── 화면이 부르는 입구 ─────────────────────────────────────

async function inquiry(params: Record<string, string>) {
  const { query, notices } = parseBomInquiry(params, TODAY);
  const all: BomInquiryNotice[] = [...notices];
  const view = await bomInquiry(db, query, all);
  return { view, notices: all };
}

describe("BOM 조회의 입구 — 주소의 값을 DB 에 대어 본다(설계 ③)", () => {
  it("고를 품목 — 정전개는 BOM 이 있는 품목, 역전개는 원자재 · 반제품 · 부자재", async () => {
    expect((await inquiry({})).view.options.map((o) => o.code)).toEqual(["FG-0001", "FG-0002", "SF-0001", "SF-0002"]);
    const upOptions = (await inquiry({ mode: "up" })).view.options;
    expect(upOptions.length).toBeGreaterThan(0);
    expect(upOptions.every((o) => ["RM", "SF", "SM"].includes(o.itemType))).toBe(true);
    expect(upOptions.map((o) => o.code)).toContain("RM-0003");
  });

  it("품목을 고르지 않으면 펼치지 않는다", async () => {
    const { view, notices } = await inquiry({});
    expect(view).toMatchObject({ mode: "down", date: TODAY });
    expect(view.item).toBeUndefined();
    expect(view.explosion).toBeUndefined();
    expect(notices).toEqual([]);
  });

  it("정전개 — 기준수량 · 펼친 수량 · 기준일, 수량을 넣으면 그 수량", async () => {
    const { view, notices } = await inquiry({ item: "FG-0001", qty: "10,000", date: "2026-11-26" });
    expect(notices).toEqual([]);
    expect(view).toMatchObject({ item: { code: "FG-0001" }, baseQty: "2,500", qty: "10,000", date: "2026-11-26" });
    expect(view.explosion!.lines.find((l) => l.item.code === "RM-0005")?.required).toBe("20");
  });

  it("수량의 상한 1,000,000,000 — 필요량이 열 자리를 넘어도 쉼표로 보인다", async () => {
    const { view, notices } = await inquiry({ item: "FG-0001", qty: "1,000,000,000" });
    expect(notices).toEqual([]);
    expect(view.qty).toBe("1,000,000,000");
    expect(view.explosion!.lines[0]).toMatchObject({ item: { code: "SF-0002" }, required: "1,010,000,000" });
    expectMatchesDown(view.explosion!, await expectedDown("FG-0001", TODAY, "1000000000"));
  });

  it("없는 품목 · BOM 없는 품목은 버리고 알린다", async () => {
    for (const item of ["RM-9999", "RM-0001", "SF-9999"]) {
      const { view, notices } = await inquiry({ item });
      expect(view.explosion, item).toBeUndefined();
      expect(view.item).toBeUndefined();
      expect(notices.map((n) => n.field)).toEqual(["item"]);
    }
    expect((await inquiry({ item: "RM-0001" })).notices[0].message).toContain("BOM 이 없는 품목");
    expect((await inquiry({ item: "RM-9999" })).notices[0].message).toContain("없는 품목");
  });

  it("수량이 부모 단위의 자릿수를 넘으면 기준수량으로 펼치고 알린다 — EA 는 정수", async () => {
    const { view, notices } = await inquiry({ item: "FG-0001", qty: "10.5" });
    expect(view.qty).toBe("2,500");
    expect(notices).toEqual([{ field: "qty", message: "단위 EA는 정수라 기준수량으로 펼쳤습니다" }]);
  });

  it("역전개 — 어느 품목이든 받는다. 없는 품목은 버리고 알린다", async () => {
    const wire = await inquiry({ mode: "up", item: "RM-0003" });
    expect(wire.view.explosion!.lines.map((l) => l.item.code)).toEqual(["FG-0002", "SF-0002", "FG-0001"]);
    expect(wire.view.qty).toBeUndefined();
    const product = await inquiry({ mode: "up", item: "FG-0001" });
    expect(product.view.explosion!.lines).toEqual([]);
    expect(product.notices).toEqual([]);
    const missing = await inquiry({ mode: "up", item: "RM-9999" });
    expect(missing.view.explosion).toBeUndefined();
    expect(missing.notices.map((n) => n.field)).toEqual(["item"]);
  });

  it("저장하면 바로 — BOM 등록에서 고친 구성이 다음 조회에 보인다(성공 기준 11)", async () => {
    await save("FG-0001", "2500", [line("SF-0002", "2500", { lossRate: "1" }), line("SM-0002", "2")]);
    expect(
      (await inquiry({ item: "FG-0001" })).view.explosion!.lines.filter((l) => l.level === 1).map((l) => l.item.code),
    ).toEqual(["SF-0002", "SM-0002"]);
  });
});

// ── 읽기만 ───────────────────────────────────────────

function walkDir(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walkDir(p) : [p];
  });
}

describe("읽기만 한다(설계 ② 「읽기만」, 성공 기준 11)", () => {
  it("BOM 조회 화면에 DB 에 쓰는 문장 · 서버 액션 · 폼 제출 액션이 없다", () => {
    const files = walkDir("src/app/production/bom/inquiry");
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(
        /"use server"|\binsert\s+into\b|\bupdate\s+\w+\s+set\b|\bdelete\s+from\b|\.insert\(|\.update\(|\.delete\(|saveBom|deleteBom|actions/i,
      );
    }
  });

  it("펼치기 절(src/db/boms.ts 의 「펼치기」 · 「BOM 조회 화면」)에 DB 에 쓰는 문장이 없다", () => {
    const text = readFileSync("src/db/boms.ts", "utf8");
    const part = text.slice(text.indexOf("// ── 펼치기"));
    expect(part.length).toBeGreaterThan(1000);
    expect(part).not.toMatch(
      /\binsert\s+into\b|\bupdate\s+\w+\s+set\b|\bdelete\s+from\b|\.insert\(|\.update\(|\.delete\(|lockBom/i,
    );
  });

  it("펼쳐도 BOM 두 표가 바뀌지 않는다", async () => {
    const state = async () => ({
      boms: await db.select().from(boms).orderBy(asc(boms.id)),
      lines: await db.select().from(bomLines).orderBy(asc(bomLines.id)),
    });
    const before = await state();
    await inquiry({ item: "FG-0001", qty: "10000" });
    await inquiry({ mode: "up", item: "RM-0003" });
    expect(await state()).toEqual(before);
  });
});

// ── 필요량의 셈 ──────────────────────────────────────

describe("필요량의 셈 — 분수 · 올림(ADR 0026 의 13)", () => {
  const r = (n: number, d: number): Ratio => ({ n: BigInt(n), d: BigInt(d) });
  it("윗 필요량 × 소요량 ÷ 기준수량 × (1 + 로스율) — 약분한 분수", () => {
    // 10100 × 20 ÷ 10000 × 1.05 = 21.21
    expect(requiredOf(r(10100, 1), BigInt(20000), BigInt(10000000), 500)).toEqual(r(2121, 100));
    // 로스율 0 — 1 × 1 ÷ 3
    expect(requiredOf(r(1, 1), BigInt(1000), BigInt(3000), 0)).toEqual(r(1, 3));
  });
  it("자릿수로 올린다 — 딱 떨어지면 그대로, 쉼표를 붙인다", () => {
    expect(ceilToDecimals(r(42, 10000), 3)).toBe("0.005");
    expect(ceilToDecimals(r(5, 1000), 3)).toBe("0.005");
    expect(ceilToDecimals(r(21, 10), 0)).toBe("3");
    expect(ceilToDecimals(r(2, 1), 0)).toBe("2");
    expect(ceilToDecimals(r(1, 3), 0)).toBe("1");
    expect(ceilToDecimals(r(12345678, 1), 0)).toBe("12,345,678");
    expect(ceilToDecimals(r(124836, 1000), 3)).toBe("124.836");
  });
});
