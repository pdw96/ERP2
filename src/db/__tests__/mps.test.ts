// @vitest-environment node
import { asc, count, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { limitMessage, STALE } from "@/db/master-shared";
import {
  confirmMps,
  itemsInMps,
  MPS_CHANGE_LIMIT,
  MPS_FIXED_LIMIT,
  MPS_HISTORY_SHOWN,
  mpsHistory,
  mpsQuantitiesFit,
  mpsSupply,
  openMps,
  saveMps,
  unconfirmMps,
  type MpsResult,
  type MpsSheet,
} from "@/db/mps";
import { resetToSample } from "@/db/reset";
import { items, mpsChanges, mpsFixed, partners, salesPlans } from "@/db/schema";
import { milliOf, saveMove } from "@/db/stock";
import { availableByItem } from "@/db/stock-status";
import type { Db } from "@/db/types";
import { planMps, type MpsCalcWeek } from "@/lib/mps-calc";
import { mpsCellKey, type MpsCellInput, type MpsConfirmInput } from "@/lib/mps-input";
import { addWeeks } from "@/lib/weeks";
import { migratedDb } from "./pglite";

// MPS(메뉴 「MPS」) — 열기 · 저장 · 확정 · 확정 취소 · 고친 이력 · MRP 가 읽는 공급량을 PGlite 에서 실제 SQL 로.
// 바탕은 샘플로 되돌린 뒤 MPS · 판매계획 표만 비운 DB 다(재고 · 품목은 샘플 그대로). 오늘은 2026-11-19(목), 이번 주는 2026-11-16.

const TODAY = "2026-11-19";
const W0 = "2026-11-16";
const w = (n: number) => addWeeks(W0, n);
const m = (n: number) => BigInt(n) * BigInt(1000);

let handle: Awaited<ReturnType<typeof migratedDb>>;
let db: Db;

beforeAll(async () => {
  handle = await migratedDb();
  db = handle.db;
});
beforeEach(async () => {
  await resetToSample(db, TODAY);
  await db.execute(sql`truncate table mps_changes, mps_fixed, sales_plan_changes, sales_plans restart identity`);
});
afterAll(() => handle.close());

/** 기대값의 정규 글자 — 음수는 절댓값에 「-」. */
function txt(q: bigint): string {
  const a = q < BigInt(0) ? -q : q;
  const frac = String(a % BigInt(1000))
    .padStart(3, "0")
    .replace(/0+$/, "");
  return `${q < BigInt(0) ? "-" : ""}${a / BigInt(1000)}${frac ? `.${frac}` : ""}`;
}

async function idOf(code: string): Promise<number> {
  const [i] = await db.select({ id: items.id }).from(items).where(eq(items.code, code));
  return i.id;
}

/** 판매계획 칸을 표에 바로 넣는다 — confirmed 면 확정 일시를 채운다. */
async function plan(customer: string, item: string, week: string, qty: number, confirmed = true) {
  const [p] = await db.select({ id: partners.id }).from(partners).where(eq(partners.code, customer));
  await db.insert(salesPlans).values({
    partnerId: p.id,
    itemId: await idOf(item),
    weekStart: week,
    qty,
    confirmedAt: confirmed ? new Date() : null,
  });
}

const open = (from = W0): Promise<MpsSheet> => openMps(db, { from }, TODAY);
const rowOf = (sheet: MpsSheet, code: string) => sheet.rows.find((r) => r.item.code === code);
const cell = (item: string, week: string, before: string, after: string): MpsCellInput => ({
  item,
  week,
  before,
  after,
});
const seen = (item: string, week: string, qty: string): MpsConfirmInput => ({ item, week, qty });
const save = (cells: MpsCellInput[]) => saveMps(db, cells, TODAY);
const confirm = (cells: MpsConfirmInput[]) => confirmMps(db, cells, TODAY);
const unconfirm = (cells: MpsConfirmInput[]) => unconfirmMps(db, cells, TODAY);
const ok = async (p: Promise<MpsResult>) => {
  const r = await p;
  if (!r.ok) throw new Error(`저장되지 않았다: ${JSON.stringify(r)}`);
  return r.changed;
};

/** 고정 칸 — [품목, 주, 수량]. */
async function fixedCells() {
  const rows = await db
    .select({ item: items.code, week: mpsFixed.weekStart, qty: sql<string>`${mpsFixed.qty}::text` })
    .from(mpsFixed)
    .innerJoin(items, eq(items.id, mpsFixed.itemId))
    .orderBy(asc(items.code), asc(mpsFixed.weekStart));
  return rows.map((r) => [r.item, r.week, Number(r.qty)]);
}

async function changeCount(): Promise<number> {
  const [{ n }] = await db.select({ n: count() }).from(mpsChanges);
  return n;
}

const STALE_CONFIRM = "다른 사람이 먼저 바꿨습니다 — 화면을 새로 열어 다시 확정하세요";
const STALE_UNCONFIRM = "다른 사람이 먼저 바꿨습니다 — 화면을 새로 열어 다시 확정 취소하세요";

/** 설계 문서의 예와 같은 품목 값으로 52주를 계산한 기대값. */
const exampleExpected = (available: bigint, demand: Map<string, bigint>, fixed: Map<string, bigint>) =>
  planMps({
    weeks: Array.from({ length: 52 }, (_, i) => w(i)),
    available,
    safety: m(100),
    minLot: m(500),
    multiple: m(100),
    decimals: 0,
    demand,
    fixed,
  });

/**
 * 설계 문서의 예(안전재고 100 · 최소 500 · 배수 100, 수요 200 · 400 · 0 · 300, 처음 재고 300)를 FG-0002 하나로 재현한다.
 * 가용재고는 샘플 재고를 그대로 쓰고, 이번 주 수요를 (가용 − 100)으로 두어 이번 주 끝 예상재고가 예의 100 과 같게 한다.
 */
async function designExample(): Promise<{ available: bigint; demand: Map<string, bigint>; expected: MpsCalcWeek[] }> {
  await db.execute(sql`update items set safety_stock = 100, min_lot = 500, lot_multiple = 100 where code = 'FG-0002'`);
  const available = (await availableByItem(db, [await idOf("FG-0002")])).get(await idOf("FG-0002"))!;
  expect(available > m(100)).toBe(true);
  const first = Number((available - m(100)) / BigInt(1000));
  await plan("BP-0004", "FG-0002", w(0), first);
  await plan("BP-0004", "FG-0002", w(1), 400);
  await plan("BP-0004", "FG-0002", w(3), 300);
  const demand = new Map([
    [w(0), m(first)],
    [w(1), m(400)],
    [w(3), m(300)],
  ]);
  return { available, demand, expected: exampleExpected(available, demand, new Map()) };
}

describe("MPS — 열기", () => {
  it("확정한 판매계획만 수요에 든다 — 미확정 칸은 빠진다", async () => {
    await plan("BP-0004", "FG-0001", w(0), 3000);
    await plan("BP-0005", "FG-0001", w(0), 1000, false);
    await plan("BP-0005", "FG-0001", w(1), 700, false);
    const row = rowOf(await open(), "FG-0001")!;
    expect(row.cells[w(0)].demand).toBe("3000");
    expect(row.cells[w(1)].demand).toBeNull();
  });

  it("설계 문서의 예 — 안 · 예상재고가 planMps 와 같고, 품목 머리에 가용 · 안전 · 최소 · 배수가 보인다", async () => {
    const { available, expected } = await designExample();
    const sheet = await open();
    expect(sheet.thisWeek).toBe(W0);
    expect(sheet.weeks).toEqual(Array.from({ length: 13 }, (_, i) => w(i)));
    const row = rowOf(sheet, "FG-0002")!;
    expect([row.available, row.safety, row.minLot, row.multiple]).toEqual([txt(available), "100", "500", "100"]);
    // 예의 네 주 그대로.
    expect([0, 1, 2, 3].map((i) => row.cells[w(i)].mps)).toEqual(["0", "500", "0", "500"]);
    expect([0, 1, 2, 3].map((i) => row.cells[w(i)].projected)).toEqual(["100", "200", "200", "400"]);
    for (let i = 0; i < 13; i++) {
      const e = expected[i];
      expect(row.cells[w(i)]).toEqual({
        demand: e.demand === BigInt(0) ? null : txt(e.demand),
        mps: txt(e.mps),
        fixed: false,
        projected: txt(e.projected),
      });
    }
  });

  it("미래 쪽 — 13주 뒤부터 열어도 계산은 이번 주부터 이어 쓴다", async () => {
    // 이어 쓰는지 보이려고 앞 13주 안에 고정을 하나 둔다 — 그 뒤 예상재고가 모두 그만큼 올라간다.
    const { available, demand } = await designExample();
    await ok(save([cell("FG-0002", w(5), "", "1000")]));
    const full = exampleExpected(available, demand, new Map([[w(5), m(1000)]]));
    const sheet = await open(w(13));
    expect(sheet.weeks[0]).toBe(w(13));
    const row = rowOf(sheet, "FG-0002")!;
    expect(row.cells[w(13)].projected).toBe(txt(full[13].projected));
    expect(row.cells[w(13)].mps).toBe(txt(full[13].mps));
    expect(row.cells[w(25)].projected).toBe(txt(full[25].projected));
  });

  it("지난 쪽 — 예상재고는 비고, 확정 수요와 고정 칸만 보인다", async () => {
    await db
      .insert(mpsFixed)
      .values({ itemId: await idOf("FG-0001"), weekStart: w(-13), qty: 500, fixedAt: new Date() });
    await plan("BP-0004", "FG-0001", w(-12), 800);
    await plan("BP-0005", "FG-0001", w(-12), 200, false);
    const sheet = await open(w(-13));
    const row = rowOf(sheet, "FG-0001")!;
    expect(Object.keys(row.cells)).toEqual(sheet.weeks);
    expect(Object.values(row.cells).every((c) => c.projected === null)).toBe(true);
    expect(row.cells[w(-13)]).toEqual({ demand: null, mps: "500", fixed: true, projected: null });
    expect(row.cells[w(-12)]).toEqual({ demand: "800", mps: null, fixed: false, projected: null });
    expect(sheet.weeks.filter((x) => row.cells[x].mps !== null)).toEqual([w(-13)]);
  });

  it("지난 쪽에만 수요 · 고정이 있는 완제품도 그 쪽에서는 줄로 보인다 — 계산 범위에 아무것도 없으면 이번 주 쪽에서는 없다", async () => {
    // FG-0002 의 가용이 안전재고 이상이라 안이 없게 안전재고를 0 으로.
    await db.execute(sql`update items set safety_stock = 0 where code = 'FG-0002'`);
    await plan("BP-0004", "FG-0002", w(-2), 100);
    expect(rowOf(await open(), "FG-0002")).toBeUndefined();
    expect(rowOf(await open(w(-13)), "FG-0002")!.cells[w(-2)].demand).toBe("100");
  });

  it("음수 예상재고는 「-」 를 붙인 정규 글자 — 소수 단위의 음수도", async () => {
    // FG-0002 를 소수 3자리 단위(M)로 두고, 가용보다 큰 수요에 0.5 만 고정한다.
    await db.execute(
      sql`update items set unit = 'M', safety_stock = 0, min_lot = 0, lot_multiple = 0 where code = 'FG-0002'`,
    );
    const avail = (await availableByItem(db, [await idOf("FG-0002")])).get(await idOf("FG-0002"))!;
    const big = Number(avail / BigInt(1000)) + 1500;
    await plan("BP-0004", "FG-0002", w(0), big);
    await ok(save([cell("FG-0002", w(0), "", "0.5")]));
    const row = rowOf(await open(), "FG-0002")!;
    expect(row.cells[w(0)]).toEqual({ demand: String(big), mps: "0.5", fixed: true, projected: "-1499.5" });
    // 다음 주의 안이 밀린 생산(1,499.5)을 채운다.
    expect(row.cells[w(1)].mps).toBe("1499.5");
    expect(row.cells[w(1)].projected).toBe("0");
  });
});

describe("MPS — 저장", () => {
  it("수량을 넣으면 고정 · 0 도 고정 · 빈 칸은 고정 풀기 — 이력은 EDIT · UNCONFIRM", async () => {
    expect(await ok(save([cell("FG-0001", w(0), "", "300")]))).toBe(1);
    expect(await fixedCells()).toEqual([["FG-0001", w(0), 300]]);
    let row = rowOf(await open(), "FG-0001")!;
    expect(row.cells[w(0)]).toMatchObject({ mps: "300", fixed: true });

    expect(await ok(save([cell("FG-0001", w(0), "300", "1,200"), cell("FG-0001", w(1), "", "0")]))).toBe(2);
    expect(await fixedCells()).toEqual([
      ["FG-0001", w(0), 1200],
      ["FG-0001", w(1), 0],
    ]);
    row = rowOf(await open(), "FG-0001")!;
    expect(row.cells[w(1)]).toMatchObject({ mps: "0", fixed: true });

    expect(await ok(save([cell("FG-0001", w(0), "1200", "")]))).toBe(1);
    expect(await fixedCells()).toEqual([["FG-0001", w(1), 0]]);

    const { rows } = await mpsHistory(db);
    expect(rows.map((r) => [r.kind, r.week, r.before, r.after])).toEqual([
      ["UNCONFIRM", w(0), "1200", null],
      ["EDIT", w(1), null, "0"],
      ["EDIT", w(0), "300", "1200"],
      ["EDIT", w(0), null, "300"],
    ]);
  });

  it("화면이 본 고정 수량이 지금과 다르면 STALE — 아무것도 바뀌지 않는다", async () => {
    await ok(save([cell("FG-0001", w(0), "", "300")]));
    const before = await fixedCells();
    const n = await changeCount();
    for (const stale of [
      [cell("FG-0001", w(1), "", "100"), cell("FG-0001", w(0), "", "500")], // 화면은 미확정으로 봤다
      [cell("FG-0001", w(0), "200", "500")], // 화면은 다른 수량을 봤다
      [cell("FG-0001", w(2), "100", "")], // 화면은 고정으로 봤다
    ]) {
      expect(await save(stale)).toEqual({ ok: false, errors: {}, formError: STALE });
    }
    expect(await fixedCells()).toEqual(before);
    expect(await changeCount()).toBe(n);
  });

  it("지난 주 · 52주째 · 월요일 아님 · 완제품 아님 · 없는 품목 · 수량의 꼴은 그 칸에 까닭 — 아무것도 쓰지 않는다", async () => {
    const r = await save([
      cell("FG-0001", w(0), "", "100"),
      cell("FG-0001", w(-1), "", "100"),
      cell("FG-0001", w(52), "", "100"),
      cell("FG-0001", "2026-11-17", "", "100"),
      cell("SF-0001", w(1), "", "100"),
      cell("FG-9999", w(1), "", "100"),
      cell("FG-0002", w(1), "", "1.5"),
    ]);
    expect(r).toEqual({
      ok: false,
      errors: {
        [mpsCellKey("FG-0001", w(-1))]: "지난 주는 고치지 못합니다",
        [mpsCellKey("FG-0001", w(52))]: "51주 뒤까지만 넣습니다",
        [mpsCellKey("FG-0001", "2026-11-17")]: "월요일이 아닌 주입니다",
        [mpsCellKey("SF-0001", w(1))]: "MPS 는 완제품에만 있습니다",
        [mpsCellKey("FG-9999", w(1))]: "없는 품목입니다",
        [mpsCellKey("FG-0002", w(1))]: "이 품목의 수량은 소수로 적을 수 없습니다.",
      },
    });
    expect(await fixedCells()).toEqual([]);
    expect(await save([cell("FG-0001", w(51), "", "100")])).toEqual({ ok: true, changed: 1 });
  });

  it("바뀐 것이 없으면 changed 0 · 꼴이 틀리면 화면을 새로 열라고 한다", async () => {
    expect(await save([])).toEqual({ ok: true, changed: 0 });
    expect(await save([cell("FG-0001", w(0), "", "")])).toEqual({ ok: true, changed: 0 });
    await ok(save([cell("FG-0001", w(0), "", "300")]));
    expect(await save([cell("FG-0001", w(0), "300", " 0,300 ")])).toEqual({ ok: true, changed: 0 });
    expect(await changeCount()).toBe(1);
    const form = { ok: false, errors: {}, formError: "저장하지 못했습니다 — 화면을 새로 여세요" };
    expect(await save([cell("FG-0001", w(1), "", "1"), cell("FG-0001", w(1), "", "2")])).toEqual(form);
    expect(await save([{ item: "FG-0001", week: w(1), before: "" } as unknown as MpsCellInput])).toEqual(form);
    expect(await save("x" as unknown as MpsCellInput[])).toEqual(form);
  });
});

describe("MPS — 확정 · 확정 취소", () => {
  it("확정은 화면이 본 안으로 고정한다 — 연 뒤 기타입고로 가용이 늘어 안이 바뀌어도 막지 않는다", async () => {
    await plan("BP-0004", "FG-0001", w(0), 6000);
    const row = rowOf(await open(), "FG-0001")!;
    const proposal = row.cells[w(0)].mps!;
    expect(milliOf(proposal) > BigInt(0)).toBe(true);

    const moved = await saveMove(
      db,
      {
        moveDate: TODAY,
        moveType: "IN",
        lines: [{ item: "FG-0001", lot: "MPS-T-1", warehouse: "WH-03", qty: "50000" }],
      },
      TODAY,
    );
    expect(moved.ok).toBe(true);
    expect(rowOf(await open(), "FG-0001")!.cells[w(0)].mps).toBe("0"); // 지금의 안은 0

    expect(await confirm([seen("FG-0001", w(0), proposal)])).toEqual({ ok: true, changed: 1 });
    expect(await fixedCells()).toEqual([["FG-0001", w(0), Number(proposal)]]);
    const { rows } = await mpsHistory(db);
    expect(rows.map((r) => [r.kind, r.before, r.after])).toEqual([["CONFIRM", null, proposal]]);
  });

  it("화면이 본 수량(before)을 읽지 못하면 STALE — 칸 메시지가 아니고 아무것도 쓰지 않는다", async () => {
    // 「1.5」 는 EA(소수 0자리)에서 읽히지 않지만, 사용자가 친 글자가 아니라 화면이 본 값이니 틀린 입력이 아니라 낡은 화면이다.
    const before = await fixedCells();
    expect(await save([cell("FG-0001", w(2), "1.5", "300")])).toEqual({ ok: false, errors: {}, formError: STALE });
    expect(await fixedCells()).toEqual(before);
  });

  it("이미 고정된 칸을 확정하면 STALE — 아무것도 바뀌지 않는다", async () => {
    await ok(save([cell("FG-0001", w(1), "", "300")]));
    expect(await confirm([seen("FG-0001", w(0), "1000"), seen("FG-0001", w(1), "1000")])).toEqual({
      ok: false,
      errors: {},
      formError: STALE_CONFIRM,
    });
    expect(await fixedCells()).toEqual([["FG-0001", w(1), 300]]);
    expect(await changeCount()).toBe(1);
  });

  it("본 안이 0 이거나 읽지 못하면 그 칸에 「확정할 안이 없습니다」", async () => {
    expect(
      await confirm([seen("FG-0001", w(0), "0"), seen("FG-0001", w(1), ""), seen("FG-0001", w(2), "1000")]),
    ).toEqual({
      ok: false,
      errors: {
        [mpsCellKey("FG-0001", w(0))]: "확정할 안이 없습니다",
        [mpsCellKey("FG-0001", w(1))]: "확정할 안이 없습니다",
      },
    });
    expect(await fixedCells()).toEqual([]);
  });

  it("본 안이 상한(99,999,999)을 넘으면 그 칸에 읽기 오류를 돌려준다 — 「확정할 안이 없습니다」가 아니다", async () => {
    expect(await confirm([seen("FG-0001", w(0), "100,000,000"), seen("FG-0001", w(1), "99999999.5")])).toEqual({
      ok: false,
      errors: {
        [mpsCellKey("FG-0001", w(0))]: "수량은 99,999,999 까지 적을 수 있습니다.",
        [mpsCellKey("FG-0001", w(1))]: "수량은 99,999,999 까지 적을 수 있습니다.",
      },
    });
  });

  it("확정 취소는 본 고정 수량과 같아야 한다 — 풀면 다음 열기에서 그 주는 안으로 돌아온다", async () => {
    await plan("BP-0004", "FG-0001", w(0), 6000);
    const proposal = rowOf(await open(), "FG-0001")!.cells[w(0)];
    await ok(save([cell("FG-0001", w(0), "", "300")]));

    expect(await unconfirm([seen("FG-0001", w(0), "400")])).toEqual({
      ok: false,
      errors: {},
      formError: STALE_UNCONFIRM,
    });
    expect(await unconfirm([seen("FG-0001", w(1), "0")])).toEqual({
      ok: false,
      errors: {},
      formError: STALE_UNCONFIRM,
    });
    expect(await fixedCells()).toEqual([["FG-0001", w(0), 300]]);

    expect(await unconfirm([seen("FG-0001", w(0), "300")])).toEqual({ ok: true, changed: 1 });
    expect(await fixedCells()).toEqual([]);
    expect(rowOf(await open(), "FG-0001")!.cells[w(0)]).toEqual(proposal);
    const { rows } = await mpsHistory(db);
    expect(rows[0]).toMatchObject({ kind: "UNCONFIRM", before: "300", after: null });
  });

  it("고정 0 도 확정 취소한다", async () => {
    await ok(save([cell("FG-0001", w(2), "", "0")]));
    expect(await unconfirm([seen("FG-0001", w(2), "0")])).toEqual({ ok: true, changed: 1 });
    expect(await fixedCells()).toEqual([]);
  });
});

describe("MPS — MRP 가 읽는 공급량", () => {
  it("고정 + 안이 함께, 0 은 빠지고, openMps 의 같은 칸과 같다", async () => {
    await designExample();
    await ok(save([cell("FG-0002", w(1), "", "0"), cell("FG-0002", w(4), "", "700")]));
    const supply = await mpsSupply(db, w(51), TODAY);
    expect(supply.every((s) => s.qty !== "0")).toBe(true);
    expect(supply.map((s) => `${s.item}|${s.week}`)).toEqual(supply.map((s) => `${s.item}|${s.week}`).sort());
    const fg2 = supply.filter((s) => s.item === "FG-0002");
    expect(fg2.find((s) => s.week === w(4))).toEqual({ item: "FG-0002", week: w(4), qty: "700", fixed: true });
    expect(fg2.find((s) => s.week === w(1))).toBeUndefined(); // 고정 0 은 빠진다

    const sheet = await open();
    for (const row of sheet.rows) {
      for (const week of sheet.weeks) {
        const c = row.cells[week];
        const s = supply.find((x) => x.item === row.item.code && x.week === week);
        if (c.mps === "0") expect(s).toBeUndefined();
        else expect(s).toEqual({ item: row.item.code, week, qty: c.mps, fixed: c.fixed });
      }
    }

    // toWeek 까지만.
    const near = await mpsSupply(db, w(3), TODAY);
    expect(near).toEqual(supply.filter((s) => s.week <= w(3)));
  });
});

describe("MPS — 상한 · 이력 · 단위의 도우미", () => {
  it("고정 칸이 20,000 을 넘으면 · 이력이 50,000 을 넘으면 쓰지 않는다", async () => {
    const id = await idOf("FG-0002");
    // 표에 바로 채운다 — 지난 주 쪽으로 MPS_FIXED_LIMIT 칸.
    await db.execute(sql`
      insert into mps_fixed (item_id, week_start, qty, fixed_at)
      select ${id}, date '2026-11-16' - (g * 7), 1, now() from generate_series(1, ${MPS_FIXED_LIMIT}) g`);
    const fixedLimit = { ok: false, errors: {}, formError: limitMessage("MPS 고정 칸", MPS_FIXED_LIMIT) };
    expect(await save([cell("FG-0001", w(0), "", "1")])).toEqual(fixedLimit);
    expect(await confirm([seen("FG-0001", w(0), "1")])).toEqual(fixedLimit);

    await db.execute(sql`truncate table mps_fixed`);
    await db.execute(sql`
      insert into mps_changes (item_id, week_start, after, kind)
      select ${id}, date '2026-11-16', 1, 'EDIT' from generate_series(1, ${MPS_CHANGE_LIMIT - 1}) g`);
    expect(await save([cell("FG-0001", w(0), "", "1"), cell("FG-0001", w(1), "", "1")])).toEqual({
      ok: false,
      errors: {},
      formError: limitMessage("MPS 고친 이력", MPS_CHANGE_LIMIT),
    });
    expect(await save([cell("FG-0001", w(0), "", "1")])).toEqual({ ok: true, changed: 1 });
  });

  it("이력은 최근 100줄 — 같은 일시면 나중에 남긴 것부터, 일시는 한국 시각, total 은 전체 줄 수", async () => {
    const id = await idOf("FG-0002");
    await db.execute(sql`
      insert into mps_changes (item_id, week_start, saved_at, after, kind)
      select ${id}, date '2026-11-16', timestamptz '2026-11-18 15:00:00+00', g, 'EDIT' from generate_series(1, 104) g`);
    await ok(save([cell("FG-0001", w(0), "", "300")]));
    const { rows, total } = await mpsHistory(db);
    expect(total).toBe(105);
    expect(rows).toHaveLength(MPS_HISTORY_SHOWN);
    expect(rows[0]).toMatchObject({
      kind: "EDIT",
      item: { code: "FG-0001", name: "전원 관리 IC" },
      week: w(0),
      before: null,
      after: "300",
    });
    expect(rows[0].savedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    // 2026-11-18 15:00 UTC = 2026-11-19 00:00 한국 시각.
    expect(rows[1]).toMatchObject({ savedAt: "2026-11-19 00:00", after: "104" });
    expect(rows[99].after).toBe("6");
  });

  it("itemsInMps 는 고정 칸이 있는 품목만 · mpsQuantitiesFit 은 자릿수에 맞는지", async () => {
    await ok(save([cell("FG-0001", w(0), "", "1000")]));
    const [a, b] = [await idOf("FG-0001"), await idOf("FG-0002")];
    expect(await itemsInMps(db, [a, b])).toEqual(new Set([a]));
    expect(await itemsInMps(db, [])).toEqual(new Set());
    expect(await mpsQuantitiesFit(db, "EA", 0)).toBe(true);
    await db.execute(sql`update mps_fixed set qty = 1000.5`);
    expect(await mpsQuantitiesFit(db, "EA", 0)).toBe(false);
    expect(await mpsQuantitiesFit(db, "EA", 1)).toBe(true);
  });
});
