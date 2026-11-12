// @vitest-environment node
import { asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  BOM_LINE_LIMIT,
  bomFormOptions,
  deleteBom,
  listBoms,
  openBomSheet,
  saveBom,
  type BomSaveResult,
} from "@/db/boms";
import { createItem, loadItemsForSheet, saveItemRows, updateItem } from "@/db/items";
import { REGISTER_LOCK, STALE } from "@/db/master-shared";
import { resetToSample } from "@/db/reset";
import { bomLines, boms, items } from "@/db/schema";
import type { Db } from "@/db/types";
import type { BomLineValues, BomValues } from "@/lib/bom-input";
import { CODE_KEY, ROW_ERROR } from "@/lib/sheet";
import { migratedDb } from "./pglite";

// BOM 등록(조각 「BOM」 PR A, 설계 ② · ③ · ⑤, ADR 0026) — PGlite 에서 실제 SQL 로.
// B1 거절 시험은 거절 뒤 BOM 두 표를 통째로 읽어 저장 전과 같은지(expectRejected)와 그 칸의 까닭을 함께 본다.
// B2 성공 시험은 저장 뒤 두 표를 DB 에서 다시 읽어 넣은 값과 견주고, 표 전체에서 「돌고 돌지 않는다」 · 「적용 기간이 겹치지 않는다」를 다시 센다(invariant).
// 오늘은 2026-11-12 로 묶는다 — 샘플의 적용 시작일은 180일 앞(2026-05-16), 다이 접착제의 설계변경은 2026-11-25 까지 20 G · 2026-11-26 부터 18 G.

const TODAY = "2026-11-12";
let handle: Awaited<ReturnType<typeof migratedDb>>;
let db: Db;
beforeAll(async () => {
  handle = await migratedDb();
  db = handle.db;
});
afterAll(() => handle.close());
beforeEach(() => resetToSample(db, TODAY));

/** BOM 두 표 전체 — 고친 때까지(거절이 아무것도 건드리지 않았는지 본다). */
async function state() {
  return {
    boms: await db.select().from(boms).orderBy(asc(boms.id)),
    lines: await db.select().from(bomLines).orderBy(asc(bomLines.id)),
  };
}

/** 표 전체에서 다시 센다 — 어느 품목에서 아래로 따라가도 같은 품목이 다시 나오지 않고, 같은 BOM · 자품목의 줄끼리 적용 기간이 겹치지 않는다. */
async function invariant() {
  const lines = await db.select().from(bomLines);
  const next = new Map<number, Set<number>>();
  for (const l of lines) next.set(l.parentItemId, (next.get(l.parentItemId) ?? new Set()).add(l.childItemId));
  // 깊이 우선 — 지금 길에 있는 품목이 다시 나오면 돌고 돈다. 다 본 품목은 다시 보지 않는다(줄 2만이어도 품목 수만큼).
  const done = new Set<number>();
  const visit = (at: number, path: number[]): void => {
    expect(path, `돌고 돈다: ${[...path, at].join(" → ")}`).not.toContain(at);
    if (done.has(at)) return;
    for (const to of next.get(at) ?? []) visit(to, [...path, at]);
    done.add(at);
  };
  for (const start of next.keys()) visit(start, []);
  // 같은 BOM · 자품목끼리만 시작일 차례로 세워 이웃을 견준다 — 앞 줄의 종료일이 비었거나 뒤 줄의 시작일 이상이면 겹친다.
  const groups = new Map<string, typeof lines>();
  for (const l of lines) {
    const key = `${l.bomId}|${l.childItemId}`;
    groups.set(key, [...(groups.get(key) ?? []), l]);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => (a.validFrom < b.validFrom ? -1 : a.validFrom > b.validFrom ? 1 : 0));
    for (let i = 1; i < group.length; i++) {
      const [a, b] = [group[i - 1], group[i]];
      expect(a.validTo !== null && a.validTo < b.validFrom, `줄 ${a.lineNo} · ${b.lineNo} 의 적용 기간이 겹친다`).toBe(
        true,
      );
    }
  }
}

async function expectRejected(run: () => Promise<BomSaveResult>) {
  const before = await state();
  const r = await run();
  expect(r.ok).toBe(false);
  expect(await state()).toEqual(before);
  await invariant();
  return r as Extract<BomSaveResult, { ok: false }>;
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

/** 지금 저장된 BOM 을 화면이 보내는 값으로 — 버전 · 기준수량 · 줄. */
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
    })),
  };
}

async function newItem(itemType: string, name: string, over: Record<string, string> = {}) {
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
    ...over,
  });
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r.code;
}

describe("샘플 BOM — 저자 판정(설계 ④)", () => {
  it("반제품 둘 · 완제품 둘의 BOM 넷, 줄 16, 다이 접착제는 앞으로의 설계변경 줄 둘", async () => {
    expect((await listBoms(db)).map((b) => [b.code, b.baseQty, b.lines])).toEqual([
      ["FG-0001", "2,500", 3],
      ["FG-0002", "10,000", 6],
      ["SF-0001", "10,000", 4],
      ["SF-0002", "1,000", 3],
    ]);
    const sf1 = await openBomSheet(db, "SF-0001");
    expect(sf1.ok && sf1.sheet.lines.filter((l) => l.childCode === "RM-0005")).toEqual([
      expect.objectContaining({ qty: "20", lossRate: "5", validFrom: "2026-05-16", validTo: "2026-11-25" }),
      expect.objectContaining({ qty: "18", lossRate: "5", validFrom: "2026-11-26", validTo: "" }),
    ]);
    await invariant();
  });

  it("새 BOM 의 부모는 BOM 이 없는 「사용」 반제품 · 완제품, 자품목은 「사용」 원자재 · 반제품 · 부자재", async () => {
    const fg = await newItem("FG", "시험 완제품");
    const options = await bomFormOptions(db);
    expect(options.newParents.map((p) => p.code)).toEqual([fg]);
    expect(new Set(options.children.map((c) => c.itemType))).toEqual(new Set(["RM", "SF", "SM"]));
    expect(options.children.find((c) => c.code === "RM-0004")).toMatchObject({ unit: "KG", decimals: 3 });
  });
});

describe("저장 — 성공(B2)", () => {
  it("새 BOM — 넣은 값이 DB 에 그대로 남고 버전이 붙는다. 로스율을 비우면 0, 종료일을 비우면 계속", async () => {
    const fg = await newItem("FG", "시험 완제품");
    const r = await saveBom(db, {
      parent: fg,
      baseQty: "1,000",
      lines: [
        line("SF-0002", "1000", { lossRate: "1.25", note: "주 공정" }),
        line("SM-0002", "1", { validTo: "2026-12-31" }),
      ],
    });
    expect(r).toMatchObject({ ok: true, code: fg, version: expect.stringMatching(/^[0-9]+$/) });
    const [header] = await db.select().from(boms).innerJoin(items, eq(items.id, boms.itemId)).where(eq(items.code, fg));
    expect(header.boms.baseQty).toBe(1000);
    const saved = await db
      .select({
        lineNo: bomLines.lineNo,
        qty: bomLines.qty,
        loss: bomLines.lossRate,
        from: bomLines.validFrom,
        to: bomLines.validTo,
        note: bomLines.note,
      })
      .from(bomLines)
      .where(eq(bomLines.bomId, header.boms.id))
      .orderBy(asc(bomLines.lineNo));
    expect(saved).toEqual([
      { lineNo: 1, qty: 1000, loss: 1.25, from: "2026-01-01", to: null, note: "주 공정" },
      { lineNo: 2, qty: 1, loss: 0, from: "2026-01-01", to: "2026-12-31", note: "" },
    ]);
    await invariant();
  });

  it("고치기 — 화면의 줄이 그 BOM 의 줄이 된다(빼면 지워지고 차례대로 번호), 버전이 바뀐다", async () => {
    const v = await valuesOf("SF-0002");
    const r = await saveBom(db, { ...v, baseQty: "2000", lines: [v.lines[2], v.lines[0]] });
    expect(r.ok).toBe(true);
    const after = await openBomSheet(db, "SF-0002");
    expect(after.ok && after.sheet.baseQty).toBe("2000");
    expect(after.ok && after.sheet.lines.map((l) => l.childCode)).toEqual(["RM-0004", "SF-0001"]);
    expect(after.ok && after.sheet.version).not.toBe(v.version);
    await invariant();
  });

  it("설계변경 — 옛 줄 종료일과 새 줄 시작일이 하루 차이면 겹치지 않는다(종료일은 그날까지)", async () => {
    const v = await valuesOf("SF-0002");
    const wire = v.lines[1];
    const r = await saveBom(db, {
      ...v,
      lines: [
        ...v.lines.slice(0, 1),
        { ...wire, validTo: "2026-11-30" },
        v.lines[2],
        { ...wire, qty: "11", validFrom: "2026-12-01" },
      ],
    });
    expect(r.ok).toBe(true);
    await invariant();
  });

  it("「사용 안 함」이 된 자품목이 이미 그 BOM 에 있으면 그대로 저장된다", async () => {
    await db.update(items).set({ active: false }).where(eq(items.code, "RM-0006"));
    const r = await saveBom(db, await valuesOf("FG-0002"));
    expect(r.ok).toBe(true);
  });
});

describe("저장 — 거절(B1)", () => {
  it.each([
    ["RM-0001", "BOM 의 부모는 반제품 · 완제품입니다"],
    ["SM-0001", "BOM 의 부모는 반제품 · 완제품입니다"],
    ["CS-0001", "BOM 의 부모는 반제품 · 완제품입니다"],
    ["FG-9999", "없는 품목입니다 — 목록에서 고르세요"],
  ])("부모 %s — %s", async (parent, message) => {
    const r = await expectRejected(() => saveBom(db, { parent, baseQty: "1", lines: [line("RM-0002", "1")] }));
    expect(r.errors.header.parent).toBe(message);
  });

  it("부모의 꼴이 틀리면 저장 전에 거절한다", async () => {
    const r = await expectRejected(() => saveBom(db, { parent: "XX-1", baseQty: "1", lines: [line("RM-0002", "1")] }));
    expect(r.errors.header.parent).toBe("목록에서 부모 품목을 고르세요");
  });

  it.each([
    ["CS-0001", "소모품은 BOM 에 넣지 않습니다"],
    ["FG-0002", "완제품은 자품목이 되지 않습니다"],
    ["RM-9999", "없는 품목입니다 — 목록에서 고르세요"],
  ])("자품목 %s — %s", async (child, message) => {
    const v = await valuesOf("FG-0001");
    const r = await expectRejected(() => saveBom(db, { ...v, lines: [...v.lines, line(child, "1")] }));
    expect(r.errors.lines[3].child).toBe(message);
  });

  it("「사용 안 함」 품목은 새 자품목 · 새 BOM 의 부모로 받지 않는다", async () => {
    await db.update(items).set({ active: false }).where(eq(items.code, "RM-0006"));
    const v = await valuesOf("SF-0001");
    const r = await expectRejected(() => saveBom(db, { ...v, lines: [...v.lines, line("RM-0006", "1")] }));
    expect(r.errors.lines[4].child).toBe("「사용 안 함」 품목은 새로 넣지 못합니다");
    const fg = await newItem("FG", "쉬는 완제품");
    await db.update(items).set({ active: false }).where(eq(items.code, fg));
    const r2 = await expectRejected(() => saveBom(db, { parent: fg, baseQty: "1", lines: [line("RM-0002", "1")] }));
    expect(r2.errors.header.parent).toBe("「사용 안 함」 품목이라 새 BOM 을 만들지 못합니다");
  });

  it("단위의 자릿수 — 기준수량은 부모 단위, 소요량은 자품목 단위", async () => {
    const v = await valuesOf("SF-0002");
    const r = await expectRejected(() => saveBom(db, { ...v, baseQty: "1000.5" }));
    expect(r.errors.header.baseQty).toBe("단위 EA는 정수로 넣습니다");
    const r2 = await expectRejected(() =>
      saveBom(db, { ...v, lines: [{ ...v.lines[0], qty: "1000.5" }, v.lines[1], v.lines[2]] }),
    );
    expect(r2.errors.lines[0].qty).toBe("단위 EA는 정수로 넣습니다");
    // KG 는 소수 셋째 자리까지 — 넷째 자리는 꼴에서 거절한다.
    const r3 = await expectRejected(() =>
      saveBom(db, { ...v, lines: [v.lines[0], v.lines[1], { ...v.lines[2], qty: "0.0005" }] }),
    );
    expect(r3.errors.lines[2].qty).toContain("소수 셋째 자리까지");
    expect((await saveBom(db, { ...v, lines: [v.lines[0], v.lines[1], { ...v.lines[2], qty: "0.505" }] })).ok).toBe(
      true,
    );
  });

  it.each([
    ["qty", "0", "소요량은 0 보다 큰 수입니다"],
    ["qty", "-1", "소요량은 0 보다 큰 수입니다"],
    ["lossRate", "100", "로스율은 0 이상 100 미만입니다"],
    ["lossRate", "-1", "로스율은 0 이상 100 미만입니다"],
    ["lossRate", "5.125", "로스율은 0 이상 100 미만입니다"],
    ["validFrom", "", "적용 시작일을 넣으세요"],
    ["validFrom", "2026-02-30", "적용 시작일은 YYYY-MM-DD"],
    ["validTo", "2025-12-31", "적용 종료일이 시작일보다 앞섭니다"],
  ] as const)("줄의 %s = 「%s」 — %s", async (field, value, message) => {
    const v = await valuesOf("SF-0002");
    const r = await expectRejected(() =>
      saveBom(db, { ...v, lines: [v.lines[0], { ...line("RM-0003", "12"), [field]: value }, v.lines[2]] }),
    );
    expect(r.errors.lines[1][field]).toContain(message);
  });

  it.each([
    ["하루 겹침", { validTo: "2026-11-30" }, { validFrom: "2026-11-30" }],
    ["끝없는 줄 둘", {}, { validFrom: "2027-01-01" }],
    ["뒤 줄이 앞 줄 안", { validTo: "2026-12-31" }, { validFrom: "2026-06-01", validTo: "2026-07-01" }],
  ])("같은 자품목의 적용 기간이 겹치면 거절한다 — %s", async (_name, a, b) => {
    const v = await valuesOf("SF-0002");
    const r = await expectRejected(() =>
      saveBom(db, { ...v, lines: [v.lines[0], line("RM-0003", "12", a), v.lines[2], line("RM-0003", "11", b)] }),
    );
    expect(r.errors.lines[3].validFrom).toContain("같은 자품목의 줄 2과 적용 기간이 겹칩니다");
  });

  it("줄은 하나 이상 · 200까지", async () => {
    const v = await valuesOf("SF-0002");
    const r = await expectRejected(() => saveBom(db, { ...v, lines: [] }));
    expect(r.formError).toBe("자품목 줄을 하나 이상 넣으세요");
    const days = (k: number) =>
      Array.from({ length: k }, (_, i) => {
        const d = new Date(Date.UTC(2030, 0, 1 + i)).toISOString().slice(0, 10);
        return line("RM-0002", "1", { validFrom: d, validTo: d });
      });
    const r2 = await expectRejected(() => saveBom(db, { ...v, lines: days(201) }));
    expect(r2.formError).toBe("BOM 하나는 200줄까지입니다");
    expect((await saveBom(db, { ...v, lines: days(200) })).ok).toBe(true);
    await invariant();
  });
});

describe("돌고 도는 BOM — 적용일자와 상관없이 막는다(ADR 0026 의 8)", () => {
  it("자기 자신은 꼴에서 거절한다", async () => {
    const v = await valuesOf("SF-0002");
    const r = await expectRejected(() => saveBom(db, { ...v, lines: [...v.lines, line("SF-0002", "1")] }));
    expect(r.errors.lines[3].child).toBe("부모 품목을 자기 자품목으로 넣지 못합니다");
  });

  it("한 단계 — 다이 본딩 완료품 아래에 몰딩 완료품, 길을 이름으로 보인다", async () => {
    const v = await valuesOf("SF-0001");
    const r = await expectRejected(() => saveBom(db, { ...v, lines: [...v.lines, line("SF-0002", "1")] }));
    expect(r.errors.lines[4].child).toBe(
      "「몰딩 완료품」 아래에 「다이 본딩 완료품」이 있어 돌고 돕니다 — 다이 본딩 완료품 → 몰딩 완료품 → 다이 본딩 완료품",
    );
  });

  it("세 단계 — 새 반제품을 거쳐 돌아온다", async () => {
    const sf = await newItem("SF", "시험 반제품");
    expect((await saveBom(db, { parent: sf, baseQty: "1", lines: [line("SF-0002", "1")] })).ok).toBe(true);
    const v = await valuesOf("SF-0001");
    const r = await expectRejected(() => saveBom(db, { ...v, lines: [...v.lines, line(sf, "1")] }));
    expect(r.errors.lines[4].child).toBe(
      "「시험 반제품」 아래에 「다이 본딩 완료품」이 있어 돌고 돕니다 — 다이 본딩 완료품 → 시험 반제품 → 몰딩 완료품 → 다이 본딩 완료품",
    );
  });

  it("적용 기간이 겹치지 않아도 막는다 — 먼 앞날에만 쓰는 줄이라도", async () => {
    const v = await valuesOf("SF-0001");
    const r = await expectRejected(() =>
      saveBom(db, {
        ...v,
        lines: [...v.lines, line("SF-0002", "1", { validFrom: "2030-01-01", validTo: "2030-01-31" })],
      }),
    );
    expect(r.errors.lines[4].child).toContain("돌고 돕니다");
  });

  it("같은 순간의 두 저장(A 아래 B · B 아래 A) — 하나만 선다", async () => {
    const a = await newItem("SF", "반제품 A");
    const b = await newItem("SF", "반제품 B");
    const results = await Promise.all([
      saveBom(db, { parent: a, baseQty: "1", lines: [line(b, "1")] }),
      saveBom(db, { parent: b, baseQty: "1", lines: [line(a, "1")] }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    await invariant();
  });
});

describe("버전 — 남이 저장한 BOM 을 덮지 않는다", () => {
  it("같은 BOM 을 연 두 화면 — 먼저 저장한 쪽만 서고, 뒤는 거절된 채 DB 가 그대로다", async () => {
    const first = await valuesOf("SF-0002");
    const second = await valuesOf("SF-0002");
    expect((await saveBom(db, { ...first, baseQty: "500" })).ok).toBe(true);
    const r = await expectRejected(() => saveBom(db, { ...second, baseQty: "700" }));
    expect(r.formError).toBe(STALE);
  });

  it("새 BOM 을 둘이 함께 만들면 뒤가 거절된다 — 버전이 없는데 BOM 이 있다", async () => {
    const r = await expectRejected(() =>
      saveBom(db, { parent: "SF-0002", baseQty: "1", lines: [line("RM-0003", "1")] }),
    );
    expect(r.formError).toBe(STALE);
  });

  it("지우기도 버전이 맞을 때만 — 지우면 머리와 줄이 함께 사라진다", async () => {
    const v = await valuesOf("FG-0002");
    expect(await deleteBom(db, "FG-0002", "1")).toEqual({ ok: false, formError: STALE });
    expect(await deleteBom(db, "FG-0002", v.version!)).toEqual({ ok: true, code: "FG-0002" });
    expect((await listBoms(db)).map((b) => b.code)).not.toContain("FG-0002");
    expect(await deleteBom(db, "FG-0002", v.version!)).toEqual({ ok: false, notFound: true });
    expect((await db.select().from(bomLines)).length).toBe(10);
  });
});

describe("등록 상한", () => {
  it(`BOM 줄은 전체 ${BOM_LINE_LIMIT.toLocaleString()}줄까지 — 넘는 저장은 통째로 거절`, async () => {
    // 부모 99개에 줄 200씩(19,800) — 샘플 16줄과 합쳐 19,816.
    await db.execute(sql`
      insert into items (code, name, item_type, procurement, unit)
      select 'FG-' || (1000 + g), '대량 완제품 ' || g, 'FG', 'MAKE', 'EA' from generate_series(0, 98) g`);
    await db.execute(sql`
      insert into boms (item_id, base_qty) select id, 1 from items where code like 'FG-1%'`);
    await db.execute(sql`
      insert into bom_lines (bom_id, parent_item_id, line_no, child_item_id, qty, valid_from, valid_to)
      select b.id, b.item_id, n, (select id from items where code = 'RM-0002'), 1, '2030-01-01'::date + n, '2030-01-01'::date + n
      from boms b join items i on i.id = b.item_id cross join generate_series(1, 200) n where i.code like 'FG-1%'`);
    expect((await db.select().from(bomLines)).length).toBe(19816);
    const days = (k: number) =>
      Array.from({ length: k }, (_, i) => {
        const d = new Date(Date.UTC(2030, 0, 1 + i)).toISOString().slice(0, 10);
        return line("RM-0002", "1", { validFrom: d, validTo: d });
      });
    const fg = await newItem("FG", "상한 시험");
    const r = await expectRejected(() => saveBom(db, { parent: fg, baseQty: "1", lines: days(185) }));
    expect(r.formError).toBe("BOM 줄은 20,000개까지 등록됩니다 — 매일 밤 샘플 데이터로 돌아간 뒤 다시 등록하세요");
    expect((await saveBom(db, { parent: fg, baseQty: "1", lines: days(184) })).ok).toBe(true);
    // 고치는 BOM 의 지금 줄은 빼고 센다 — 줄 수가 그대로인 고침은 선다.
    expect((await saveBom(db, await valuesOf("SF-0002"))).ok).toBe(true);
  });
});

describe("BOM 에 든 품목은 단위를 바꾸지 못한다(ADR 0026 의 11)", () => {
  const base = {
    procurement: "BUY",
    name: "솔더 볼",
    leadTimeDays: "0",
    safetyStock: "0",
    minLot: "0",
    lotMultiple: "0",
    active: "Y",
  };

  it("한 건 수정 — BOM 에 들면 거절, 빼면 바뀐다(수불이 없는 품목)", async () => {
    const rm = await newItem("RM", "솔더 볼");
    const v = await valuesOf("SF-0002");
    expect((await saveBom(db, { ...v, lines: [...v.lines, line(rm, "4")] })).ok).toBe(true);
    expect(await updateItem(db, rm, { ...base, unit: "KG", lotManaged: "on" })).toMatchObject({
      ok: false,
      errors: { unit: expect.stringContaining("BOM 에 든 품목이라 단위를 바꾸지 못합니다") },
    });
    expect(await updateItem(db, rm, { ...base, unit: "EA", lotManaged: "on", spec: "지름 0.3mm" })).toEqual({
      ok: true,
      code: rm,
    });
    expect((await saveBom(db, await valuesOf("SF-0002").then((x) => ({ ...x, lines: x.lines.slice(0, 3) })))).ok).toBe(
      true,
    );
    expect(await updateItem(db, rm, { ...base, unit: "KG", lotManaged: "on" })).toEqual({ ok: true, code: rm });
  });

  it("부모 품목도 같다", async () => {
    const fg = await newItem("FG", "시험 완제품");
    expect((await saveBom(db, { parent: fg, baseQty: "1", lines: [line("SF-0002", "1")] })).ok).toBe(true);
    expect(
      await updateItem(db, fg, { ...base, procurement: "MAKE", name: "시험 완제품", unit: "KG", lotManaged: "on" }),
    ).toMatchObject({ ok: false, errors: { unit: expect.stringContaining("BOM 에 든 품목") } });
  });

  it("시트 — BOM 에 든 품목의 단위를 바꾸는 줄만 남고 다른 줄은 저장된다", async () => {
    const rm = await newItem("RM", "솔더 볼");
    const other = await newItem("RM", "플럭스");
    const v = await valuesOf("SF-0002");
    expect((await saveBom(db, { ...v, lines: [...v.lines, line(rm, "4")] })).ok).toBe(true);
    const rows = (await loadItemsForSheet(db, { q: "", includeInactive: true })).rows;
    const r = await saveItemRows(db, [
      { ...rows.find((x) => x[CODE_KEY] === rm)!, unit: "KG" },
      { ...rows.find((x) => x[CODE_KEY] === other)!, unit: "KG" },
    ]);
    expect(r.saved.map((s) => s.code)).toEqual([other]);
    expect(r.rejected[0].errors.unit ?? r.rejected[0].errors[ROW_ERROR]).toContain("BOM 에 든 품목");
  });
});

describe("DB 가 막는 것 — 서버를 건너뛴 쓰기", () => {
  const ids = async () => {
    const rows = await db.select({ id: items.id, code: items.code }).from(items);
    const id = (c: string) => rows.find((r) => r.code === c)!.id;
    const [sf2] = await db
      .select()
      .from(boms)
      .where(eq(boms.itemId, id("SF-0002")));
    return { id, sf2 };
  };
  const insertLine = async (over: Record<string, unknown>) => {
    const { id, sf2 } = await ids();
    return db.insert(bomLines).values({
      bomId: sf2.id,
      parentItemId: id("SF-0002"),
      lineNo: 9,
      childItemId: id("RM-0003"),
      qty: 1,
      validFrom: "2026-01-01",
      ...over,
    } as typeof bomLines.$inferInsert);
  };

  it.each([
    ["부모 = 자품목", async (id: (c: string) => number) => ({ childItemId: id("SF-0002") }), "bom_lines_not_self"],
    [
      "줄의 부모가 머리와 다름",
      async (id: (c: string) => number) => ({ parentItemId: id("SF-0001") }),
      "bom_lines_bom_fk",
    ],
    ["소요량 0", async () => ({ qty: 0 }), "bom_lines_qty_positive"],
    ["로스율 100", async () => ({ lossRate: 100 }), "bom_lines_loss_rate_range"],
    ["종료일 < 시작일", async () => ({ validTo: "2025-12-31" }), "bom_lines_valid_range"],
    ["줄 번호 201", async () => ({ lineNo: 201 }), "bom_lines_line_no_range"],
    ["같은 줄 번호", async () => ({ lineNo: 1 }), "bom_lines_line_unique"],
  ])("%s — %s", async (_name, over, constraint) => {
    const { id } = await ids();
    const { rejection } = await import("./pglite");
    expect((await rejection(insertLine(await over(id)))).constraint).toBe(constraint);
  });

  it("BOM 머리는 품목마다 하나 · 기준수량은 0 보다 크다 · BOM 에 든 품목은 지우지 못한다", async () => {
    const { id } = await ids();
    const { rejection } = await import("./pglite");
    expect((await rejection(db.insert(boms).values({ itemId: id("SF-0002"), baseQty: 1 }))).constraint).toBe(
      "boms_item_id_unique",
    );
    expect((await rejection(db.insert(boms).values({ itemId: id("RM-0001"), baseQty: 0 }))).constraint).toBe(
      "boms_base_qty_positive",
    );
    expect((await rejection(db.delete(items).where(eq(items.code, "RM-0004")))).code).toBe("23503");
  });
});

describe("잠금 — BOM 을 고치는 쓰기는 맨 먼저 BOM 의 잠금을 쥔다(설계 ②)", () => {
  // 시험의 DB(PGlite)는 연결이 하나라 두 저장이 저절로 차례로 돈다 — 그래서 같은 순간의 두 저장 시험만으로는 잠금이 빠져도 떨어지지 않는다.
  // 실행한 SQL 을 받아 적어, 트랜잭션 안의 첫 쿼리가 BOM 의 잠금(REGISTER_LOCK.bom)인지 본다.
  async function firstQueries(run: (logged: Db) => Promise<unknown>) {
    const { drizzle } = await import("drizzle-orm/pglite");
    const log: { query: string; params: unknown[] }[] = [];
    const logged = drizzle(handle.client, {
      logger: { logQuery: (query, params) => log.push({ query, params }) },
    }) as unknown as Db;
    await run(logged);
    return log;
  }
  const isBomLock = (q: { query: string; params: unknown[] }) =>
    q.query.includes("pg_advisory_xact_lock") && q.params.map(String).includes(String(REGISTER_LOCK.bom));

  it("저장 · 지우기는 다른 어떤 읽기보다 먼저 잠금을 쥔다", async () => {
    const v = await valuesOf("SF-0002");
    const save = await firstQueries((logged) => saveBom(logged, v));
    expect(isBomLock(save[0]), save[0]?.query).toBe(true);
    const v2 = await valuesOf("SF-0002");
    const del = await firstQueries((logged) => deleteBom(logged, "SF-0002", v2.version!));
    expect(isBomLock(del[0]), del[0]?.query).toBe(true);
  });

  it("품목의 단위를 바꾸는 고침은 BOM 에 들었는지 세기 전에 잠금을 쥔다", async () => {
    const base = {
      procurement: "BUY",
      name: "솔더 볼",
      leadTimeDays: "0",
      safetyStock: "0",
      minLot: "0",
      lotMultiple: "0",
      active: "Y",
    };
    const rm = await newItem("RM", "솔더 볼");
    const log = await firstQueries((logged) => updateItem(logged, rm, { ...base, unit: "KG", lotManaged: "on" }));
    const lock = log.findIndex(isBomLock);
    const count = log.findIndex((q) => q.query.includes('from "boms"') || q.query.includes('from "bom_lines"'));
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(lock).toBeLessThan(count);
  });
});
