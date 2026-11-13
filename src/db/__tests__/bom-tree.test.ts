// @vitest-environment node
import { asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  BOM_CHANGE_LIMIT,
  bomHistory,
  deleteBom,
  openBomSheet,
  openSubBom,
  saveBom,
  saveBoms,
  type BomTreeSaveResult,
} from "@/db/boms";
import { createItem } from "@/db/items";
import { STALE } from "@/db/master-shared";
import { resetToSample } from "@/db/reset";
import { bomChanges, bomLines, boms, items } from "@/db/schema";
import type { Db } from "@/db/types";
import type { BomLineValues, BomValues } from "@/lib/bom-input";
import { migratedDb } from "./pglite";

// 한 화면 다단계 등록 · 고친 이력(조각 「BOM」 PR C, 성공 기준 15 · 16, ADR 0028) — PGlite 에서 실제 SQL 로.
// B1 거절 시험은 거절 뒤 BOM 두 표와 고친 이력 표를 통째로 읽어 저장 전과 같은지(expectRejected)와 그 BOM · 칸의 까닭을 함께 본다.
// B2 성공 시험은 저장 뒤 고친 BOM 모두와 이력 줄을 DB 에서 다시 읽어 견주고, 표 전체에서 「돌고 돌지 않는다」 · 「적용 기간이 겹치지 않는다」를 다시 센다.

const TODAY = "2026-11-13";
let handle: Awaited<ReturnType<typeof migratedDb>>;
let db: Db;
beforeAll(async () => {
  handle = await migratedDb();
  db = handle.db;
});
afterAll(() => handle.close());
beforeEach(() => resetToSample(db, TODAY));

async function state() {
  return {
    boms: await db.select().from(boms).orderBy(asc(boms.id)),
    lines: await db.select().from(bomLines).orderBy(asc(bomLines.id)),
    changes: await db.select().from(bomChanges).orderBy(asc(bomChanges.id)),
  };
}

/** 표 전체에서 다시 센다 — 돌고 돌지 않고, 같은 BOM · 자품목의 줄끼리 적용 기간이 겹치지 않는다. */
async function invariant() {
  const lines = await db.select().from(bomLines);
  const next = new Map<number, Set<number>>();
  for (const l of lines) next.set(l.parentItemId, (next.get(l.parentItemId) ?? new Set()).add(l.childItemId));
  const done = new Set<number>();
  const visit = (at: number, path: number[]): void => {
    expect(path, `돌고 돈다: ${[...path, at].join(" → ")}`).not.toContain(at);
    if (done.has(at)) return;
    for (const to of next.get(at) ?? []) visit(to, [...path, at]);
    done.add(at);
  };
  for (const start of next.keys()) visit(start, []);
  const groups = new Map<string, typeof lines>();
  for (const l of lines)
    groups.set(`${l.bomId}|${l.childItemId}`, [...(groups.get(`${l.bomId}|${l.childItemId}`) ?? []), l]);
  for (const group of groups.values()) {
    group.sort((a, b) => (a.validFrom < b.validFrom ? -1 : 1));
    for (let i = 1; i < group.length; i++)
      expect(group[i - 1].validTo !== null && group[i - 1].validTo! < group[i].validFrom).toBe(true);
  }
}

async function expectRejected(run: () => Promise<BomTreeSaveResult>) {
  const before = await state();
  const r = await run();
  expect(r.ok).toBe(false);
  expect(await state()).toEqual(before);
  await invariant();
  return r as Extract<BomTreeSaveResult, { ok: false }>;
}

/** 지금 저장된 BOM 을 화면이 보내는 값으로 — 버전 · 기준수량 · 줄(원래 줄 번호까지). */
async function valuesOf(code: string): Promise<BomValues> {
  const opened = await openBomSheet(db, code);
  if (!opened.ok) throw new Error(opened.message);
  const s = opened.sheet;
  return {
    parent: code,
    baseQty: s.baseQty,
    version: s.version ?? "",
    lines: s.lines.map((l) => ({
      child: l.childCode,
      qty: l.qty,
      lossRate: l.lossRate,
      validFrom: l.validFrom,
      validTo: l.validTo,
      note: l.note,
      lineNo: String(l.lineNo),
    })),
  };
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

async function newItem(itemType: string, name: string) {
  const r = await createItem(db, {
    itemType,
    procurement: itemType === "SF" || itemType === "FG" ? "MAKE" : "BUY",
    name,
    unit: "EA",
    lotManaged: "on",
    leadTimeDays: "0",
    safetyStock: "0",
    minLot: "0",
    lotMultiple: "0",
  });
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r.code;
}

const idOf = async (code: string) => (await db.select({ id: items.id }).from(items).where(eq(items.code, code)))[0].id;
const versionOf = async (code: string) => (await valuesOf(code)).version ?? "";

/** 한 품목의 고친 이력 — [구분, 자품목, 줄 번호, 전, 후], 남긴 차례로. */
async function changesFor(code: string) {
  const rows = await db
    .select({
      kind: bomChanges.kind,
      child: items.code,
      lineNo: bomChanges.lineNo,
      before: bomChanges.before,
      after: bomChanges.after,
    })
    .from(bomChanges)
    .leftJoin(items, eq(items.id, bomChanges.childItemId))
    .where(eq(bomChanges.parentItemId, await idOf(code)))
    .orderBy(asc(bomChanges.id));
  return rows.map((r) => [r.kind, r.child, r.lineNo, r.before, r.after]);
}

describe("샘플 — 되돌림의 BOM 저장도 고친 이력을 남긴다", () => {
  it("샘플 BOM 넷의 등록 — BOM 등록 넷 · 줄 더함 열여섯", async () => {
    const all = await db.select({ kind: bomChanges.kind }).from(bomChanges);
    expect(all.filter((r) => r.kind === "BOM_ADD")).toHaveLength(4);
    expect(all.filter((r) => r.kind === "LINE_ADD")).toHaveLength(16);
    expect(all).toHaveLength(20);
    expect((await changesFor("SF-0002"))[0]).toEqual(["BOM_ADD", null, null, null, { baseQty: "1,000" }]);
    expect((await changesFor("SF-0002"))[2]).toEqual([
      "LINE_ADD",
      "RM-0003",
      2,
      null,
      { qty: "12", lossRate: "3", validFrom: "2026-05-17", validTo: "", note: "" },
    ]);
  });
});

describe("한 화면 다단계 저장(성공 기준 15)", () => {
  it("맨 위 BOM 과 펼친 반제품 BOM 둘(하나는 새 BOM)이 한 번에 선다 — 바꾼 BOM 만 고치고 이력을 남긴다", async () => {
    const fresh = await newItem("SF", "시험 반제품 새 BOM");
    const root = await valuesOf("FG-0001");
    root.lines.push(line(fresh, "2500"));
    const sf2 = await valuesOf("SF-0002");
    sf2.lines[1] = { ...sf2.lines[1], qty: "13" };
    const sf1 = await valuesOf("SF-0001"); // 펼쳤지만 바꾸지 않았다
    const before1 = await versionOf("SF-0001");
    const sub = { parent: fresh, baseQty: "100", version: "", lines: [line("RM-0002", "100"), line("RM-0005", "2")] };

    const r = await saveBoms(db, { root, subs: [sf2, sf1, sub] });
    expect(r).toMatchObject({ ok: true, code: "FG-0001", changed: ["FG-0001", "SF-0002", fresh] });
    // DB 에서 다시 읽는다.
    expect((await valuesOf("FG-0001")).lines.map((l) => l.child)).toEqual(["SF-0002", "SM-0001", "SM-0002", fresh]);
    expect((await valuesOf("SF-0002")).lines[1]).toMatchObject({ child: "RM-0003", qty: "13" });
    expect(await valuesOf(fresh)).toMatchObject({
      baseQty: "100",
      lines: [{ child: "RM-0002" }, { child: "RM-0005" }],
    });
    expect(await versionOf("SF-0001")).toBe(before1);
    await invariant();
    // 고친 이력 — 바꾼 BOM 마다, 바꾸지 않은 다이 본딩 완료품은 없다.
    expect((await changesFor("FG-0001")).slice(4)).toEqual([
      ["LINE_ADD", fresh, 4, null, { qty: "2,500", lossRate: "0", validFrom: "2026-01-01", validTo: "", note: "" }],
    ]);
    expect((await changesFor("SF-0002")).slice(4)).toEqual([["LINE_EDIT", "RM-0003", 2, { qty: "12" }, { qty: "13" }]]);
    expect(await changesFor("SF-0001")).toHaveLength(5);
    expect((await changesFor(fresh)).map((c) => c[0])).toEqual(["BOM_ADD", "LINE_ADD", "LINE_ADD"]);
    // 한 저장의 이력은 같은 일시다.
    const at = await db
      .selectDistinct({ at: bomChanges.savedAt })
      .from(bomChanges)
      .where(sql`${bomChanges.id} > 20`);
    expect(at).toHaveLength(1);
  });

  it("아무것도 바꾸지 않고 저장하면 버전도 이력도 그대로다", async () => {
    const before = await state();
    const r = await saveBoms(db, { root: await valuesOf("FG-0001"), subs: [await valuesOf("SF-0002")] });
    expect(r).toMatchObject({ ok: true, changed: [] });
    expect(await state()).toEqual(before);
  });

  it("BOM 이 없는 반제품을 펼쳐 보기만 하면(빈 칸) 그 BOM 은 만들지 않는다", async () => {
    const fresh = await newItem("SF", "시험 반제품 펼쳐 보기만");
    const root = await valuesOf("FG-0002");
    root.lines.push(line(fresh, "1"));
    const r = await saveBoms(db, {
      root,
      subs: [{ parent: fresh, baseQty: "", version: "", lines: [line("", "", { validFrom: "" })] }],
    });
    expect(r).toMatchObject({ ok: true, changed: ["FG-0002"] });
    expect((await openBomSheet(db, fresh)).ok && (await openBomSheet(db, fresh))).toMatchObject({
      sheet: { version: null },
    });
  });
});

describe("한 화면 다단계 저장 — 거절(B1 · B4)", () => {
  it("펼친 BOM 하나가 틀리면 아무것도 서지 않는다 — 까닭은 그 BOM 의 그 줄에", async () => {
    const root = await valuesOf("FG-0001");
    root.lines[1] = { ...root.lines[1], qty: "11" };
    const sf2 = await valuesOf("SF-0002");
    sf2.lines.push(line("CS-0001", "1"));
    const r = await expectRejected(() => saveBoms(db, { root, subs: [sf2] }));
    expect(r.errors).toEqual({ header: {}, lines: {} });
    expect(r.subs["SF-0002"].errors.lines[3]).toEqual({ child: "소모품은 BOM 에 넣지 않습니다" });
  });

  it("셋째 BOM 의 꼴이 틀려도 통째로 — 까닭은 그 BOM 에", async () => {
    const root = await valuesOf("FG-0001");
    const sf2 = await valuesOf("SF-0002");
    sf2.lines[0] = { ...sf2.lines[0], qty: "1000" };
    const sf1 = await valuesOf("SF-0001");
    sf1.lines[0] = { ...sf1.lines[0], lossRate: "100" };
    const r = await expectRejected(() => saveBoms(db, { root, subs: [sf2, sf1] }));
    expect(r.subs["SF-0001"].errors.lines[0].lossRate).toContain("로스율");
    expect(r.subs["SF-0002"]).toBeUndefined();
  });

  it("같은 저장에서 고친 BOM 둘이 함께 만드는 순환(A 아래 B · B 아래 A)을 막는다", async () => {
    const a = await newItem("SF", "시험 고리 가");
    const b = await newItem("SF", "시험 고리 나");
    const root = await valuesOf("FG-0002");
    root.lines.push(line(a, "1"));
    const r = await expectRejected(() =>
      saveBoms(db, {
        root,
        subs: [
          { parent: a, baseQty: "1", version: "", lines: [line(b, "1")] },
          { parent: b, baseQty: "1", version: "", lines: [line(a, "1")] },
        ],
      }),
    );
    expect(r.subs[a].errors.lines[0].child).toContain("돌고 돕니다");
    expect(r.subs[b].errors.lines[0].child).toContain("돌고 돕니다");
  });

  it("DB 의 BOM 과 맨 위 BOM 이 만드는 순환 — 다이 본딩 완료품 아래에 몰딩 완료품을 넣으면(몰딩 완료품 아래에 다이 본딩 완료품)", async () => {
    const root = await valuesOf("SF-0001");
    root.lines.push(line("SF-0002", "1", { validFrom: "2030-01-01" }));
    const r = await expectRejected(() => saveBoms(db, { root, subs: [] }));
    expect(r.errors.lines[4].child).toContain("돌고 돕니다");
  });

  it("펼친 BOM 이 화면을 연 뒤 남에게 고쳐졌고 이 저장이 그것을 바꾸면 통째로 거절 — 바꾸지 않았으면 그대로 선다", async () => {
    const root = await valuesOf("FG-0001");
    root.lines[1] = { ...root.lines[1], qty: "11" };
    const sf2 = await valuesOf("SF-0002");
    const other = await valuesOf("SF-0002");
    other.lines[2] = { ...other.lines[2], qty: "0.6" };
    expect((await saveBom(db, other)).ok).toBe(true);

    // 이 화면이 몰딩 완료품을 바꿨으면 거절된다.
    const edited = { ...sf2, lines: sf2.lines.map((l, i) => (i === 1 ? { ...l, qty: "13" } : l)) };
    const r = await expectRejected(() => saveBoms(db, { root, subs: [edited] }));
    expect(r.subs["SF-0002"].formError).toBe(STALE);

    // 바꾸지 않았으면(남이 고친 값 그대로를 보냈으면) 맨 위만 선다.
    const now = await valuesOf("SF-0002");
    const ok = await saveBoms(db, { root, subs: [{ ...now, version: sf2.version }] });
    expect(ok).toMatchObject({ ok: true, changed: ["FG-0001"] });
  });

  it("펼친 반제품이 이 저장의 자품목 줄에 없으면 거절 — 맨 위와 상관없는 BOM 을 고치지 못한다", async () => {
    const root = await valuesOf("FG-0002");
    const sf2 = await valuesOf("SF-0002");
    sf2.lines[1] = { ...sf2.lines[1], qty: "13" };
    const r = await expectRejected(() => saveBoms(db, { root, subs: [sf2] }));
    expect(r.subs["SF-0002"].formError).toContain("자품목 줄에 없습니다");
  });

  it("같은 반제품을 두 번 펼치면 거절", async () => {
    const root = await valuesOf("FG-0001");
    const sf2 = await valuesOf("SF-0002");
    const r = await expectRejected(() => saveBoms(db, { root, subs: [sf2, sf2] }));
    expect(r.subs["SF-0002"].formError).toContain("두 번");
  });

  it("펼친 BOM 이 너무 많으면 거절(51)", async () => {
    const root = await valuesOf("FG-0001");
    const subs = Array.from({ length: 51 }, () => ({ parent: "SF-0002", baseQty: "1", version: "", lines: [] }));
    const r = await expectRejected(() => saveBoms(db, { root, subs }));
    expect(r.formError).toContain("50개");
  });
});

describe("고친 이력의 가름(성공 기준 16)", () => {
  it("원래 줄 번호가 같고 자품목이 같으면 「줄 고침」(바뀐 칸만), 자품목을 바꾸면 「줄 뺌」 · 「줄 더함」, 뺀 줄은 옛 번호로", async () => {
    const v = await valuesOf("SF-0001");
    // 줄 1 웨이퍼: 로스율 · 비고 고침. 줄 2 리드프레임 → QFN 리드프레임(자품목 바꿈). 줄 3 은 뺀다. 줄 4 는 그대로. 새 줄 하나.
    v.lines[0] = { ...v.lines[0], lossRate: "2.5", note: "수율 반영" };
    v.lines[1] = { ...v.lines[1], child: "RM-0006" };
    v.lines.splice(2, 1);
    v.lines.push(line("SM-0002", "1"));
    v.baseQty = "5000";
    expect((await saveBom(db, v)).ok).toBe(true);
    expect((await changesFor("SF-0001")).slice(5)).toEqual([
      ["BASE", null, null, { baseQty: "10,000" }, { baseQty: "5,000" }],
      ["LINE_EDIT", "RM-0001", 1, { lossRate: "2", note: "" }, { lossRate: "2.5", note: "수율 반영" }],
      [
        "LINE_ADD",
        "RM-0006",
        2,
        null,
        { qty: "10,000", lossRate: "1", validFrom: "2026-05-17", validTo: "", note: "" },
      ],
      ["LINE_ADD", "SM-0002", 4, null, { qty: "1", lossRate: "0", validFrom: "2026-01-01", validTo: "", note: "" }],
      [
        "LINE_DEL",
        "RM-0002",
        2,
        { qty: "10,000", lossRate: "1", validFrom: "2026-05-17", validTo: "", note: "" },
        null,
      ],
      [
        "LINE_DEL",
        "RM-0005",
        3,
        { qty: "20", lossRate: "5", validFrom: "2026-05-17", validTo: "2026-11-26", note: "설계변경 전" },
        null,
      ],
    ]);
  });

  it("원래 줄 번호가 없거나 틀린 값이면 새 줄로 친다 — 같은 번호를 둘이 가리키면 뒤는 새 줄", async () => {
    const v = await valuesOf("SF-0002");
    v.lines = [
      { ...v.lines[0], lineNo: "abc" },
      { ...v.lines[1], validTo: "2026-12-31" },
      { ...v.lines[1], qty: "11", validFrom: "2027-01-01", validTo: "", lineNo: "2" },
    ];
    expect((await saveBom(db, v)).ok).toBe(true);
    expect((await changesFor("SF-0002")).slice(4)).toEqual([
      ["LINE_ADD", "SF-0001", 1, null, { qty: "1,000", lossRate: "0", validFrom: "2026-05-17", validTo: "", note: "" }],
      ["LINE_EDIT", "RM-0003", 2, { validTo: "" }, { validTo: "2026-12-31" }],
      ["LINE_ADD", "RM-0003", 3, null, { qty: "11", lossRate: "3", validFrom: "2027-01-01", validTo: "", note: "" }],
      ["LINE_DEL", "SF-0001", 1, { qty: "1,000", lossRate: "0", validFrom: "2026-05-17", validTo: "", note: "" }, null],
      ["LINE_DEL", "RM-0004", 3, { qty: "0.5", lossRate: "5", validFrom: "2026-05-17", validTo: "", note: "" }, null],
    ]);
  });

  it("거절된 저장은 이력을 남기지 않는다", async () => {
    const v = await valuesOf("SF-0002");
    v.lines.push(line("CS-0001", "1"));
    await expectRejected(() => saveBoms(db, { root: v, subs: [] }));
  });

  it("BOM 지우기 — 「BOM 지움」과 줄마다 「줄 뺌」이 남고, 다시 열면 지운 BOM 의 이력이 보인다", async () => {
    expect((await deleteBom(db, "FG-0002", await versionOf("FG-0002"))).ok).toBe(true);
    const h = await bomHistory(db, "FG-0002");
    expect(h.total).toBe(14);
    // 최근 저장부터 — 지운 것이 맨 앞, 그 안은 남긴 차례.
    expect(h.entries.slice(0, 7).map((e) => [e.kind, e.child?.code ?? null, e.lineNo ?? null])).toEqual([
      ["BOM_DEL", null, null],
      ["LINE_DEL", "RM-0001", 1],
      ["LINE_DEL", "RM-0006", 2],
      ["LINE_DEL", "RM-0005", 3],
      ["LINE_DEL", "RM-0003", 4],
      ["LINE_DEL", "RM-0004", 5],
      ["LINE_DEL", "SM-0002", 6],
    ]);
    expect(h.entries[0]).toMatchObject({ before: { baseQty: "10,000" }, after: {} });
    expect(h.entries[1].child).toMatchObject({ name: expect.any(String), unit: "EA" });
    expect(h.entries[0].savedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(h.entries.at(-1)).toMatchObject({ kind: "LINE_ADD", child: { code: "SM-0002" } });
  });

  it(`고친 이력은 전체 ${BOM_CHANGE_LIMIT.toLocaleString("ko-KR")}줄까지 — 넘는 저장 · 지우기는 거절, 딱 맞으면 선다`, async () => {
    const fg = await idOf("FG-0001");
    const fill = async (to: number) =>
      db.execute(
        sql`insert into bom_changes (parent_item_id, kind, after) select ${fg}, 'BASE', '{}'::jsonb from generate_series(1, ${to} - (select count(*)::int from bom_changes))`,
      );
    await fill(BOM_CHANGE_LIMIT - 1);
    const v = await valuesOf("SF-0002");
    v.lines[1] = { ...v.lines[1], qty: "13" };
    v.lines[2] = { ...v.lines[2], qty: "0.6", lineNo: "" }; // 줄 고침 하나 + 줄 더함 · 뺌 둘 = 셋
    const r = await expectRejected(() => saveBoms(db, { root: v, subs: [] }));
    expect(r.formError).toContain("BOM 고친 이력");
    expect(await deleteBom(db, "SF-0002", v.version ?? "")).toMatchObject({
      ok: false,
      formError: expect.stringContaining("BOM 고친 이력"),
    });
    // 한 줄만 고치면 딱 맞는다.
    const one = await valuesOf("SF-0002");
    one.lines[1] = { ...one.lines[1], qty: "13" };
    expect((await saveBoms(db, { root: one, subs: [] })).ok).toBe(true);
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(bomChanges);
    expect(n).toBe(BOM_CHANGE_LIMIT);
  });
});

describe("펼칠 반제품의 BOM", () => {
  it("BOM 과 그 반제품을 쓰는 BOM 의 부모 — 품목코드 차례", async () => {
    const r = await openSubBom(db, "SF-0002");
    expect(r).toMatchObject({
      ok: true,
      sub: { sheet: { parent: { code: "SF-0002" }, baseQty: "1000" }, usedBy: [{ code: "FG-0001" }] },
    });
    expect((r.ok && r.sub.sheet.lines.map((l) => l.lineNo)) || []).toEqual([1, 2, 3]);
    expect((await openSubBom(db, "SF-0001")).ok && (await openSubBom(db, "SF-0001"))).toMatchObject({
      sub: { usedBy: [{ code: "SF-0002" }] },
    });
  });

  it("BOM 이 없는 반제품은 새 BOM 의 빈 칸 · 쓰는 BOM 이 없으면 빈 목록", async () => {
    const fresh = await newItem("SF", "시험 반제품 빈 BOM");
    expect(await openSubBom(db, fresh)).toMatchObject({
      ok: true,
      sub: { sheet: { version: null, lines: [] }, usedBy: [] },
    });
  });

  it("반제품이 아니면 · 없는 품목이면 펼치지 않는다", async () => {
    expect(await openSubBom(db, "FG-0001")).toMatchObject({ ok: false });
    expect(await openSubBom(db, "RM-0001")).toMatchObject({ ok: false });
    expect(await openSubBom(db, "SF-9999")).toEqual({ ok: false, message: "없는 품목입니다" });
  });
});
