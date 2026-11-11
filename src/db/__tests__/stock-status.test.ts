// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetToSample } from "@/db/reset";
import { saveMove } from "@/db/stock";
import { listItemStock, type ItemStockRow } from "@/db/stock-status";
import type { Db } from "@/db/types";
import { ITEM_STOCK_SORTS, PAGE_SIZE, parseItemStockQuery, SEARCH_MAX } from "@/lib/stock-query";
import { migratedDb } from "./pglite";

// 재고 현황 · 품목별 재고(조각 「재고 현황」 성공 기준 2 · 3 · 4 · 11 · 12, 설계 ⑤ 의 S1 ~ S4) — PGlite 에서 실제 SQL 로.
// S1: 화면의 수를 시험 안에서 잔액 표 전체로 따로 센 기대값과 견준다. S2: 줄마다 실재고 = 검사대기 + 불량 + 가용재고, 합 = 잔액 = 수불 줄.
// 검사대기는 뒤 조각(구매 · 영업)이 만든다 — 시험이 수불 줄과 잔액을 함께 직접 넣어 S2 가 지게 한다.

const TODAY = "2026-11-11";
let handle: Awaited<ReturnType<typeof migratedDb>>;
let db: Db;
beforeAll(async () => {
  handle = await migratedDb();
  db = handle.db;
});
afterAll(() => handle.close());
beforeEach(() => resetToSample(db, TODAY));

const rows = <T>(result: unknown) => (result as { rows: T[] }).rows;
const num = (s: string | null) => (s === null ? null : Number(s.replace(/,/g, "").replace("−", "-")));
const list = (params: Record<string, string> = {}) => listItemStock(db, parseItemStockQuery(params).query);
const all = async (params: Record<string, string> = {}) => (await list(params)).rows;
const rowOf = async (code: string, params: Record<string, string> = {}) =>
  (await all(params)).find((r) => r.itemCode === code);

type Four = { onHand: number; qc: number; defect: number; available: number };

/** S1 — 잔액 표 전체를 읽어 시험 안에서 따로 센 품목마다의 네 칸(불량창고 → 불량, 그 밖 검사대기 → 검사대기, 나머지 → 가용). */
async function expected(): Promise<Map<string, Four>> {
  const raw = rows<{ code: string; is_defect: boolean; status: string; qty: string }>(
    await db.execute(sql`
      select i.code, w.is_defect, b.status, b.qty::text as qty
      from stock_balances b join items i on i.id = b.item_id join warehouses w on w.id = b.warehouse_id`),
  );
  const m = new Map<string, Four>();
  for (const r of raw) {
    const f = m.get(r.code) ?? { onHand: 0, qc: 0, defect: 0, available: 0 };
    const q = Number(r.qty);
    f.onHand += q;
    if (r.is_defect) f.defect += q;
    else if (r.status === "QC") f.qc += q;
    else f.available += q;
    m.set(r.code, f);
  }
  return m;
}

/** 수불 줄로 센 품목마다의 순수량 — 들어온 쪽(받는 창고)은 더하고 나간 쪽(보내는 창고)은 뺀다. */
async function netOfLines(): Promise<Map<string, number>> {
  const raw = rows<{ code: string; q: string }>(
    await db.execute(sql`
      select i.code, sum(case when ml.to_warehouse_id is not null then ml.qty else 0 end
        - case when ml.from_warehouse_id is not null then ml.qty else 0 end)::text as q
      from stock_move_lines ml join items i on i.id = ml.item_id group by i.code`),
  );
  return new Map(raw.map((r) => [r.code, Number(r.q)]));
}

/** S2 — 줄마다 실재고 = 검사대기 + 불량 + 가용재고, 그리고 S1 의 기대값 · 수불 줄과 같다. */
async function expectMatches(got: ItemStockRow[]) {
  const exp = await expected();
  const net = await netOfLines();
  for (const r of got) {
    const f = { onHand: num(r.onHand)!, qc: num(r.qc)!, defect: num(r.defect)!, available: num(r.available)! };
    expect(f.onHand, r.itemCode).toBeCloseTo(f.qc + f.defect + f.available, 6);
    expect(f, r.itemCode).toEqual(exp.get(r.itemCode) ?? { onHand: 0, qc: 0, defect: 0, available: 0 });
    expect(f.onHand, r.itemCode).toBeCloseTo(net.get(r.itemCode) ?? 0, 6);
  }
}

/** 검사대기 재고를 넣는다 — 수불 줄과 잔액을 함께(잔액 = 수불 줄의 합이 지게). */
async function putQc(itemCode: string, warehouse: string, lot: string, qty: number, seq: number) {
  const code = `IV-20261111-${String(900 + seq)}`;
  await db.execute(sql`insert into stock_moves (code, move_date, move_type) values (${code}, ${TODAY}, 'IN')`);
  await db.execute(sql`
    insert into stock_move_lines (move_id, line_no, move_date, item_id, lot, status, to_warehouse_id, qty, entered_qty, entered_unit)
    select m.id, 1, ${TODAY}, i.id, ${lot}, 'QC', w.id, ${qty}, ${qty}, i.unit
    from stock_moves m, items i, warehouses w where m.code = ${code} and i.code = ${itemCode} and w.code = ${warehouse}`);
  await db.execute(sql`
    insert into stock_balances (item_id, warehouse_id, lot, status, qty)
    select i.id, w.id, ${lot}, 'QC', ${qty} from items i, warehouses w where i.code = ${itemCode} and w.code = ${warehouse}`);
}

const setSafety = (code: string, v: number) =>
  db.execute(sql`update items set safety_stock = ${v} where code = ${code}`);
const setActive = (code: string, v: boolean) => db.execute(sql`update items set active = ${v} where code = ${code}`);
/** 재고가 없는 「사용」 품목 하나 — 품목의 다른 칸은 기본값. */
const addEmptyItem = (code: string, safety = 0) =>
  db.execute(sql`
    insert into items (code, name, item_type, procurement, unit, safety_stock, lot_managed)
    values (${code}, '시험용 빈 품목', 'RM', 'BUY', 'EA', ${safety}, true)`);

describe("품목별 재고 — 샘플(성공 기준 3 · 12)", () => {
  it("「사용」인 품목 열넷이 다 보이고, 네 칸이 잔액 · 수불 줄과 맞는다", async () => {
    const page = await list();
    expect(page.total).toBe(14);
    expect(page.rows.map((r) => r.itemCode)).toEqual([...page.rows.map((r) => r.itemCode)].sort());
    await expectMatches(page.rows);
  });

  it("몰딩 완료품 — 실재고 1,500 · 불량 30 · 가용재고 1,470, 검사대기 0", async () => {
    expect(await rowOf("SF-0002")).toMatchObject({ onHand: "1,500", qc: "0", defect: "30", available: "1,470" });
  });

  it("「미달만」 — 다이싱 블레이드 하나, 가용재고 8 에 안전재고 10 이라 2 모자람", async () => {
    const got = await all({ short: "1" });
    expect(got.map((r) => r.itemCode)).toEqual(["CS-0001"]);
    expect(got[0]).toMatchObject({ available: "8", safety: "10", short: "2" });
  });

  it("되돌리면 같은 샘플로 돌아온다", async () => {
    await setSafety("RM-0001", 500);
    await resetToSample(db, TODAY);
    expect((await all({ short: "1" })).map((r) => r.itemCode)).toEqual(["CS-0001"]);
  });
});

describe("네 칸 — 상태 구분(성공 기준 2, ADR 0023 의 2)", () => {
  it("불량창고 밖의 검사대기는 검사대기, 불량창고 밖의 가용은 가용", async () => {
    await putQc("RM-0003", "WH-01", "QC-1", 1000, 1);
    expect(await rowOf("RM-0003")).toMatchObject({ onHand: "10,995", qc: "1,000", defect: "0", available: "9,995" });
    await expectMatches(await all());
  });

  it("불량창고의 검사대기 상태도 불량이다", async () => {
    await putQc("RM-0003", "WH-04", "QC-2", 40, 2);
    expect(await rowOf("RM-0003")).toMatchObject({ qc: "0", defect: "40", available: "9,995" });
    await expectMatches(await all());
  });

  it("불량창고의 가용 상태는 불량이다(샘플의 격리 30)", async () => {
    const [{ status }] = rows<{ status: string }>(
      await db.execute(sql`
        select b.status from stock_balances b join warehouses w on w.id = b.warehouse_id
        join items i on i.id = b.item_id where w.code = 'WH-04' and i.code = 'SF-0002'`),
    );
    expect(status).toBe("AVAILABLE");
    expect(await rowOf("SF-0002")).toMatchObject({ defect: "30", available: "1,470" });
  });

  it("수불을 저장하면 다시 읽을 때 바뀐 수가 보인다(성공 기준 9)", async () => {
    const r = await saveMove(
      db,
      {
        moveDate: TODAY,
        moveType: "XFER",
        lines: [{ item: "RM-0003", lot: "NW-25-0702", warehouse: "WH-01", toWarehouse: "WH-04", qty: "100" }],
      },
      TODAY,
    );
    expect(r.ok).toBe(true);
    expect(await rowOf("RM-0003")).toMatchObject({ onHand: "9,995", defect: "100", available: "9,895" });
    await expectMatches(await all());
  });
});

describe("안전재고 미달(성공 기준 4, ADR 0023 의 4)", () => {
  it("가용재고 = 안전재고면 미달이 아니고, 하나 적으면 미달 1", async () => {
    await setSafety("RM-0001", 100);
    expect(await rowOf("RM-0001")).toMatchObject({ available: "100", safety: "100", short: null });
    await setSafety("RM-0001", 101);
    expect(await rowOf("RM-0001")).toMatchObject({ short: "1" });
    expect((await all({ short: "1" })).map((r) => r.itemCode)).toContain("RM-0001");
  });

  it("안전재고가 0 이면 미달이 아니다(안전재고 칸은 비울 수 없고 처음 값이 0)", async () => {
    await setSafety("CS-0001", 0);
    expect(await rowOf("CS-0001")).toMatchObject({ safety: "0", short: null });
    expect(await all({ short: "1" })).toEqual([]);
  });

  it("재고가 0 인 「사용」 품목도 줄이 있고 안전재고만큼 미달이다", async () => {
    await addEmptyItem("RM-0099", 5);
    expect(await rowOf("RM-0099")).toMatchObject({ onHand: "0", available: "0", safety: "5", short: "5" });
  });

  it("실재고는 넉넉해도 검사대기 · 불량을 빼고 모자라면 미달이다", async () => {
    await putQc("RM-0003", "WH-01", "QC-1", 1000, 1);
    await setSafety("RM-0003", 10000);
    expect(await rowOf("RM-0003")).toMatchObject({ onHand: "10,995", available: "9,995", short: "5" });
  });
});

describe("줄의 범위(성공 기준 3, ADR 0023 의 5)", () => {
  it("「사용 안 함」 품목은 재고가 있을 때만 보인다", async () => {
    await addEmptyItem("RM-0099");
    await setActive("RM-0099", false);
    await setActive("CS-0001", false);
    const got = await all();
    expect(got.find((r) => r.itemCode === "RM-0099")).toBeUndefined();
    expect(got.find((r) => r.itemCode === "CS-0001")).toMatchObject({ active: false, onHand: "8" });
  });

  it("「사용」 품목은 재고가 0 이어도 보인다", async () => {
    await addEmptyItem("RM-0099");
    expect(await rowOf("RM-0099")).toMatchObject({ active: true, onHand: "0", short: null });
  });
});

describe("거르기 · 세우기 · 쪽(성공 기준 3 · 11, 설계 ③)", () => {
  it("찾기는 품목코드 · 품목명의 일부, 대소문자를 가리지 않는다", async () => {
    expect((await all({ q: "rm-000" })).every((r) => r.itemCode.startsWith("RM-"))).toBe(true);
    expect((await all({ q: "블레이드" })).map((r) => r.itemCode)).toEqual(["CS-0001"]);
    // `%` · `_` 는 글자 그대로다
    expect(await all({ q: "%" })).toEqual([]);
    expect(await all({ q: "RM_0001" })).toEqual([]);
  });

  it("품목 유형으로 거른다 — 다른 거르기와 함께", async () => {
    const cs = await all({ type: "CS" });
    expect(cs.map((r) => r.itemCode)).toEqual(["CS-0001", "CS-0002"]);
    expect((await all({ type: "CS", short: "1" })).map((r) => r.itemCode)).toEqual(["CS-0001"]);
    expect(await all({ type: "RM", short: "1" })).toEqual([]);
  });

  it.each(ITEM_STOCK_SORTS)("칸 「%s」로 세우면 그 칸의 차례이고 거꾸로도 된다", async (sort) => {
    const asc = await all({ sort });
    const desc = await all({ sort, dir: "desc" });
    expect(asc).toHaveLength(14);
    expect(desc).toHaveLength(14);
    expect(new Set(desc.map((r) => r.itemCode))).toEqual(new Set(asc.map((r) => r.itemCode)));
  });

  it("수량 칸은 수의 차례로 세운다(글자 차례가 아니다)", async () => {
    const got = await all({ sort: "onHand", dir: "desc" });
    const qs = got.map((r) => num(r.onHand)!);
    expect(qs).toEqual([...qs].sort((a, b) => b - a));
  });

  it("빈 값(미달이 아닌 줄)은 어느 방향이든 맨 뒤", async () => {
    await setSafety("RM-0001", 150);
    for (const dir of ["asc", "desc"]) {
      const got = await all({ sort: "short", dir });
      expect(
        got
          .slice(0, 2)
          .map((r) => r.itemCode)
          .sort(),
      ).toEqual(["CS-0001", "RM-0001"]);
      expect(got.slice(2).every((r) => r.short === null)).toBe(true);
    }
  });

  it("100줄씩 — 넘친 쪽은 마지막 쪽", async () => {
    const page = await list({ page: "9" });
    expect(PAGE_SIZE).toBe(100);
    expect(page).toMatchObject({ page: 1, pages: 1, total: 14 });
  });

  it.each<[string, Record<string, string>, string]>([
    ["찾기가 50자를 넘음", { q: "가".repeat(SEARCH_MAX + 1) }, "q"],
    ["없는 품목 유형", { type: "XX" }, "type"],
    ["「미달만」 값이 1 이 아님", { short: "yes" }, "short"],
  ])("주소의 틀린 값은 버리고 알린다 — %s", async (_, params, field) => {
    const { query, notices } = parseItemStockQuery(params);
    expect(notices.map((n) => n.field)).toEqual([field]);
    expect(query).toMatchObject({ q: undefined, itemType: undefined, shortOnly: false });
    expect((await listItemStock(db, query)).total).toBe(14);
  });

  it("모르는 칸 · 차례 · 쪽은 처음 값", () => {
    expect(parseItemStockQuery({ sort: "price", dir: "desc", page: "0" }).query).toMatchObject({
      sort: "item",
      dir: "asc",
      page: 1,
    });
    expect(parseItemStockQuery({ sort: "short", dir: "desc", page: "2" }).query).toMatchObject({
      sort: "short",
      dir: "desc",
      page: 2,
    });
    expect(parseItemStockQuery({ q: "  ", short: "1" }).query).toMatchObject({ q: undefined, shortOnly: true });
  });
});

describe("읽기만 한다(설계 ② 「읽기만」)", () => {
  it("재고 현황의 읽기와 화면에 DB 에 쓰는 문장 · 서버 액션이 없다", () => {
    const files = ["src/db/stock-status.ts", ...walk("src/app/inventory/status")];
    expect(files.length).toBeGreaterThan(1);
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(
        /"use server"|\binsert\s+into\b|\bupdate\s+\w+\s+set\b|\bdelete\s+from\b|\.insert\(|\.update\(|\.delete\(/i,
      );
    }
  });

  it("읽어도 잔액 · 수불 줄이 바뀌지 않는다", async () => {
    const before = await expected();
    await list();
    await list({ short: "1", sort: "short", dir: "desc" });
    expect(await expected()).toEqual(before);
  });
});

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
