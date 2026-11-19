// @vitest-environment node
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { openBomSheet, saveBom } from "@/db/boms";
import { limitMessage, STALE } from "@/db/master-shared";
import { resetToSample } from "@/db/reset";
import {
  deleteRouting,
  listRoutings,
  parseRoutingFilter,
  openRouting,
  ROUTING_STEP_LIMIT,
  routingFormOptions,
  routingHistory,
  saveRouting,
  type RoutingSaveResult,
} from "@/db/routings";
import { items, processes, routingChanges, routingMaterials, routings, routingSteps, workCenters } from "@/db/schema";
import type { Db } from "@/db/types";
import type { RoutingStepValues, RoutingValues } from "@/lib/routing-input";
import { migratedDb, rejection } from "./pglite";

// 라우팅(메뉴 「라우팅」) — 표의 제약과 열기 · 저장 · 지우기 · 고친 이력을 PGlite 에서 실제 SQL 로.
// 바탕은 샘플(BOM 넷 · 공정 일곱 · 작업장 아홉)로 되돌린 뒤 라우팅 표만 비운 DB 다.

const TODAY = "2026-11-12";
let handle: Awaited<ReturnType<typeof migratedDb>>;
let db: Db;

beforeAll(async () => {
  handle = await migratedDb();
  db = handle.db;
});
beforeEach(async () => {
  await resetToSample(db, TODAY);
  await db.execute(sql`truncate table routing_changes, routing_materials, routing_steps, routings restart identity`);
});
afterAll(() => handle.close());

/** 공정 코드마다 하나씩 작업장을 골라, 공정과 맞는 줄 · 맞지 않는 줄을 만든다. */
async function pick() {
  const [item] = await db.select({ id: items.id }).from(items).where(eq(items.code, "SF-0001"));
  const centers = await db
    .select({ id: workCenters.id, processId: workCenters.processId })
    .from(workCenters)
    .orderBy(workCenters.id);
  const first = centers[0];
  const other = (await db.select({ id: processes.id }).from(processes)).find((p) => p.id !== first.processId)!;
  const [rm] = await db.select({ id: items.id }).from(items).where(eq(items.code, "RM-0001"));
  const [head] = await db.insert(routings).values({ itemId: item.id }).returning({ id: routings.id });
  return { head, first, otherProcessId: other.id, rm };
}

describe("라우팅 표의 제약", () => {
  it("공정과 맞지 않는 작업장은 넣지 못한다", async () => {
    const { head, first, otherProcessId } = await pick();
    const e = await rejection(
      db.insert(routingSteps).values({
        routingId: head.id,
        seq: 10,
        processId: otherProcessId,
        workCenterId: first.id,
        setupMin: 0,
        runMs: 0,
      }),
    );
    expect(e.constraint).toBe("routing_steps_work_center_fk");
  });

  it("순번은 10 단위 10 ~ 500 이다", async () => {
    const { head, first } = await pick();
    const e = await rejection(
      db.insert(routingSteps).values({
        routingId: head.id,
        seq: 15,
        processId: first.processId,
        workCenterId: first.id,
        setupMin: 0,
        runMs: 0,
      }),
    );
    expect(e.constraint).toBe("routing_steps_seq_range");
  });

  it("같은 라우팅에 같은 자재를 두 번 붙이지 못한다", async () => {
    const { head, first, rm } = await pick();
    await db.insert(routingSteps).values({
      routingId: head.id,
      seq: 10,
      processId: first.processId,
      workCenterId: first.id,
      setupMin: 0,
      runMs: 0,
    });
    await db.insert(routingMaterials).values({ routingId: head.id, seq: 10, itemId: rm.id });
    const e = await rejection(db.insert(routingMaterials).values({ routingId: head.id, seq: 10, itemId: rm.id }));
    expect(e.constraint).toBe("routing_materials_item_unique");
  });

  it("없는 순번을 가리키는 자재는 넣지 못한다", async () => {
    const { head, rm } = await pick();
    const e = await rejection(db.insert(routingMaterials).values({ routingId: head.id, seq: 20, itemId: rm.id }));
    expect(e.constraint).toBe("routing_materials_step_fk");
  });
});

// ── 열기 · 저장 · 지우기 · 고친 이력 ─────────────────────────

const step = (process: string, workCenter: string, setupMin: string, runSec: string, over: RoutingStepValues = {}) =>
  ({ process, workCenter, setupMin, runSec, note: "", ...over }) satisfies RoutingStepValues;

/** 지금 저장된 라우팅을 화면이 보내는 값으로 — 버전 · 공정 줄(원래 순번) · 투입 자재(붙은 줄의 차례, 붙지 않음은 빈 글자). */
async function valuesOf(code: string): Promise<RoutingValues> {
  const opened = await openRouting(db, code);
  if (!opened.ok) throw new Error(opened.message);
  const s = opened.sheet;
  return {
    item: code,
    version: s.version ?? "",
    steps: s.steps.map((x) => ({
      process: x.processCode,
      workCenter: x.workCenterCode,
      setupMin: String(x.setupMin),
      runSec: x.runSec,
      note: x.note,
      origSeq: String(x.seq),
    })),
    materials: s.materials.map((m) => ({
      item: m.code,
      step: m.seq === null ? "" : String(s.steps.findIndex((x) => x.seq === m.seq)),
    })),
  };
}

async function saved(values: RoutingValues) {
  const r = await saveRouting(db, values);
  if (!r.ok) throw new Error(JSON.stringify([r.errors, r.formError]));
  return r;
}

async function rejected(values: RoutingValues) {
  const before = {
    heads: await db.select().from(routings),
    steps: await db.select().from(routingSteps),
    materials: await db.select().from(routingMaterials),
    changes: await db.select().from(routingChanges),
  };
  const r = await saveRouting(db, values);
  expect(r.ok).toBe(false);
  expect({
    heads: await db.select().from(routings),
    steps: await db.select().from(routingSteps),
    materials: await db.select().from(routingMaterials),
    changes: await db.select().from(routingChanges),
  }).toEqual(before);
  const failed = r as Extract<RoutingSaveResult, { ok: false }>;
  expect(failed.values).toBe(values);
  return failed;
}

/** 그 품목의 이력 — 남긴 차례(오래된 저장부터)로, 구분 · 순번 · 자재 · 전 · 후. */
async function changes(code: string) {
  const h = await routingHistory(db, code);
  return [...h.entries]
    .sort((a, b) => a.id - b.id)
    .map((e) => ({ kind: e.kind, seq: e.seq, material: e.material?.code, before: e.before, after: e.after }));
}

/** SF-0002 의 공정 셋 — 다이 본딩(SF-0001 붙임) · 와이어 본딩 · 몰딩(RM-0004 붙임). */
const threeSteps = (): RoutingValues => ({
  item: "SF-0002",
  version: "",
  steps: [step("DA", "DA-1", "10", "1"), step("WB", "WB-1", "20", "2.4"), step("MD", "MD-1", "30", "0.12")],
  materials: [
    { item: "SF-0001", step: "0" },
    { item: "RM-0004", step: "2" },
  ],
});

async function setActive(table: typeof processes | typeof workCenters, code: string, active: boolean) {
  await db.update(table).set({ active }).where(eq(table.code, code));
}

describe("라우팅 저장", () => {
  it("새 라우팅 — 순번 10 · 20, 자재 붙임, 이력 ROUTING_ADD · STEP_ADD 둘 · MAT_ADD 둘", async () => {
    const r = await saved({
      item: "SF-0002",
      version: "",
      steps: [step("WB", "WB-1", "20", "2.4"), step("MD", "MD-1", "30", "0.12")],
      materials: [
        { item: "SF-0001", step: "0" },
        { item: "RM-0004", step: "1" },
      ],
    });
    expect(r).toMatchObject({ ok: true, code: "SF-0002", changed: 5 });
    expect(r.version).toMatch(/^[0-9]+$/);

    const opened = await openRouting(db, "SF-0002");
    if (!opened.ok) throw new Error(opened.message);
    const s = opened.sheet;
    expect(s.version).toBe(r.version);
    expect(s.hasBom).toBe(true);
    expect(s.steps.map((x) => x.seq)).toEqual([10, 20]);
    expect(s.steps.map((x) => x.runSec)).toEqual(["2.400", "0.120"]);
    expect(s.steps[0]).toMatchObject({
      processCode: "WB",
      processName: "와이어 본딩",
      processActive: true,
      workCenterCode: "WB-1",
      workCenterName: "와이어 본딩 1라인",
      workCenterActive: true,
      setupMin: 20,
      note: "",
    });
    expect(s.materials.map((m) => [m.code, m.seq, m.inBom])).toEqual([
      ["SF-0001", 10, true],
      ["RM-0003", null, true],
      ["RM-0004", 20, true],
    ]);

    expect(await changes("SF-0002")).toEqual([
      { kind: "ROUTING_ADD", seq: undefined, material: undefined, before: {}, after: {} },
      {
        kind: "STEP_ADD",
        seq: 10,
        material: undefined,
        before: {},
        after: {
          seq: "10",
          process: "WB 와이어 본딩",
          workCenter: "WB-1 와이어 본딩 1라인",
          setupMin: "20",
          runSec: "2.400",
          note: "",
        },
      },
      {
        kind: "STEP_ADD",
        seq: 20,
        material: undefined,
        before: {},
        after: {
          seq: "20",
          process: "MD 몰딩",
          workCenter: "MD-1 몰딩 1호기",
          setupMin: "30",
          runSec: "0.120",
          note: "",
        },
      },
      { kind: "MAT_ADD", seq: undefined, material: "SF-0001", before: {}, after: { step: "10 WB 와이어 본딩" } },
      { kind: "MAT_ADD", seq: undefined, material: "RM-0004", before: {}, after: { step: "20 MD 몰딩" } },
    ]);
    const h = await routingHistory(db, "SF-0002");
    expect(h.total).toBe(5);
    expect(h.entries[0].savedAt).toMatch(/^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}$/);
    expect(new Set(h.entries.map((e) => e.saveKey)).size).toBe(1);
    expect(h.entries.find((e) => e.material)?.material).toEqual({ code: "SF-0001", name: expect.any(String) });
  });

  it("아무것도 바꾸지 않은 저장은 버전 · 이력이 그대로이고 changed 0", async () => {
    const first = await saved(threeSteps());
    const again = await saved(await valuesOf("SF-0002"));
    expect(again).toEqual({ ok: true, code: "SF-0002", version: first.version, changed: 0 });
    const opened = await openRouting(db, "SF-0002");
    expect(opened.ok && opened.sheet.version).toBe(first.version);
    expect((await routingHistory(db, "SF-0002")).total).toBe(6);

    // 붙이지 않은 자재를 빼고 보내도(첫 공정에서 듦) 바뀐 것이 없다.
    const values = await valuesOf("SF-0002");
    values.materials = values.materials.filter((m) => m.step !== "");
    expect(await saved(values)).toMatchObject({ version: first.version, changed: 0 });
  });

  it("줄을 옮기면 순번이 다시 매겨지고 STEP_EDIT 의 seq 가 바뀐다 — 자재는 공정을 따라가 MAT_MOVE 가 없다", async () => {
    await saved(threeSteps());
    const before = (await routingHistory(db, "SF-0002")).total;
    const values = await valuesOf("SF-0002");
    // 다이 본딩(10)과 와이어 본딩(20)을 맞바꾼다 — SF-0001 은 다이 본딩을 따라 둘째 줄로.
    values.steps = [values.steps[1], values.steps[0], values.steps[2]];
    values.materials = values.materials.map((m) => (m.item === "SF-0001" ? { ...m, step: "1" } : m));
    const r = await saved(values);
    expect(r.changed).toBe(2);

    const all = await changes("SF-0002");
    expect(all.slice(before)).toEqual([
      { kind: "STEP_EDIT", seq: 10, material: undefined, before: { seq: "20" }, after: { seq: "10" } },
      { kind: "STEP_EDIT", seq: 20, material: undefined, before: { seq: "10" }, after: { seq: "20" } },
    ]);
    const opened = await openRouting(db, "SF-0002");
    if (!opened.ok) throw new Error(opened.message);
    expect(opened.sheet.steps.map((x) => `${x.seq} ${x.processCode}`)).toEqual(["10 WB", "20 DA", "30 MD"]);
    expect(opened.sheet.materials.find((m) => m.code === "SF-0001")?.seq).toBe(20);
  });

  it("공정을 바꾼 줄은 STEP_EDIT(process · workCenter), 옛 줄을 지우면 STEP_DEL 과 그 줄 자재의 MAT_DEL", async () => {
    await saved(threeSteps());
    const before = (await routingHistory(db, "SF-0002")).total;
    const values = await valuesOf("SF-0002");
    values.steps = [values.steps[0], { ...values.steps[1], process: "DA", workCenter: "DA-2" }];
    values.materials = values.materials.map((m) => (m.item === "RM-0004" ? { ...m, step: "" } : m));
    const r = await saved(values);
    expect(r.changed).toBe(3);
    expect((await changes("SF-0002")).slice(before)).toEqual([
      {
        kind: "STEP_EDIT",
        seq: 20,
        material: undefined,
        before: { process: "WB 와이어 본딩", workCenter: "WB-1 와이어 본딩 1라인" },
        after: { process: "DA 다이 본딩", workCenter: "DA-2 다이 본딩 2라인" },
      },
      {
        kind: "STEP_DEL",
        seq: 30,
        material: undefined,
        before: {
          seq: "30",
          process: "MD 몰딩",
          workCenter: "MD-1 몰딩 1호기",
          setupMin: "30",
          runSec: "0.120",
          note: "",
        },
        after: {},
      },
      { kind: "MAT_DEL", seq: undefined, material: "RM-0004", before: { step: "30 MD 몰딩" }, after: {} },
    ]);
  });

  it("다른 공정의 작업장은 줄 칸 workCenter 에 거절", async () => {
    const r = await rejected({
      item: "SF-0002",
      version: "",
      steps: [step("WB", "WB-1", "0", "1"), step("DA", "WB-1", "0", "1")],
      materials: [],
    });
    expect(r.errors.steps).toEqual({
      1: { workCenter: "그 공정의 작업장이 아닙니다 — 이 공정의 작업장에서 고르세요" },
    });
    expect(r.formError).toBeUndefined();

    const unknown = await rejected({
      item: "SF-0002",
      version: "",
      steps: [step("ZZ", "ZZ-1", "0", "1")],
      materials: [],
    });
    expect(unknown.errors.steps).toEqual({
      0: { process: "없는 공정입니다 — 목록에서 고르세요", workCenter: "없는 작업장입니다 — 목록에서 고르세요" },
    });
  });

  it("「사용 안 함」 공정 · 작업장 — 새로 넣으면 거절, 저장된 라우팅에 있던 것은 그대로 저장된다", async () => {
    await saved(threeSteps());
    await setActive(processes, "MD", false);
    await setActive(workCenters, "DA-1", false);

    // 다른 품목의 새 라우팅에는 넣지 못한다.
    const r = await rejected({
      item: "FG-0001",
      version: "",
      steps: [step("MD", "MD-1", "0", "1"), step("DA", "DA-1", "0", "1"), step("DA", "DA-2", "0", "1")],
      materials: [],
    });
    expect(r.errors.steps).toEqual({
      0: { process: "「사용 안 함」인 공정입니다 — 다른 공정을 고르세요" },
      1: { workCenter: "「사용 안 함」인 작업장입니다 — 다른 작업장을 고르세요" },
    });

    // 이미 쓰던 라우팅은 고쳐 저장된다 — 줄을 더해 같은 공정 · 작업장을 한 번 더 써도.
    const values = await valuesOf("SF-0002");
    values.steps[0].setupMin = "15";
    values.steps.push(step("MD", "MD-1", "5", "0.5"), step("DA", "DA-1", "5", "0.5"));
    expect((await saved(values)).ok).toBe(true);

    const opened = await openRouting(db, "SF-0002");
    if (!opened.ok) throw new Error(opened.message);
    expect(
      opened.sheet.steps.map((x) => [x.processCode, x.processActive, x.workCenterCode, x.workCenterActive]),
    ).toEqual([
      ["DA", true, "DA-1", false],
      ["WB", true, "WB-1", true],
      ["MD", false, "MD-1", true],
      ["MD", false, "MD-1", true],
      ["DA", true, "DA-1", false],
    ]);
    const options = await routingFormOptions(db);
    expect(options.processes.map((p) => p.code)).not.toContain("MD");
    expect(options.processes.find((p) => p.code === "DA")?.workCenters.map((w) => w.code)).toEqual(["DA-2"]);
  });

  it("BOM 에 없는 자재는 거절, BOM 에서 빠진 붙은 자재는 「BOM 에 없음」으로 열리고 그대로 저장 · 뗄 수 있다", async () => {
    const r = await rejected({
      item: "SF-0002",
      version: "",
      steps: [step("DA", "DA-1", "0", "1")],
      materials: [
        { item: "RM-0001", step: "0" },
        { item: "RM-9999", step: "0" },
      ],
    });
    expect(r.errors.materials).toEqual({ 0: "이 품목의 BOM 에 없는 자재입니다", 1: "없는 품목입니다" });

    await saved(threeSteps());
    // SF-0002 의 BOM 에서 RM-0004 줄을 뺀다.
    const bom = await openBomSheet(db, "SF-0002");
    if (!bom.ok) throw new Error(bom.message);
    const bomSaved = await saveBom(db, {
      parent: "SF-0002",
      baseQty: bom.sheet.baseQty,
      version: bom.sheet.version ?? "",
      lines: bom.sheet.lines
        .filter((l) => l.childCode !== "RM-0004")
        .map((l) => ({
          child: l.childCode,
          qty: l.qty,
          lossRate: l.lossRate,
          validFrom: l.validFrom,
          validTo: l.validTo,
          note: l.note,
        })),
    });
    expect(bomSaved.ok).toBe(true);

    const opened = await openRouting(db, "SF-0002");
    if (!opened.ok) throw new Error(opened.message);
    expect(opened.sheet.materials.map((m) => [m.code, m.seq, m.inBom])).toEqual([
      ["SF-0001", 10, true],
      ["RM-0003", null, true],
      ["RM-0004", 30, false],
    ]);

    // 그대로 저장 — 바뀐 것이 없다.
    const same = await saved(await valuesOf("SF-0002"));
    expect(same.changed).toBe(0);
    // 다른 줄로 옮겨도 저장된다.
    const moved = await valuesOf("SF-0002");
    moved.materials = moved.materials.map((m) => (m.item === "RM-0004" ? { ...m, step: "1" } : m));
    const before = (await routingHistory(db, "SF-0002")).total;
    await saved(moved);
    expect((await changes("SF-0002")).slice(before)).toEqual([
      {
        kind: "MAT_MOVE",
        seq: undefined,
        material: "RM-0004",
        before: { step: "30 MD 몰딩" },
        after: { step: "20 WB 와이어 본딩" },
      },
    ]);
    // 떼면 MAT_DEL — 그 뒤로는 다시 붙이지 못한다.
    const detached = await valuesOf("SF-0002");
    detached.materials = detached.materials.map((m) => (m.item === "RM-0004" ? { ...m, step: "" } : m));
    const at = (await routingHistory(db, "SF-0002")).total;
    await saved(detached);
    expect((await changes("SF-0002")).slice(at)).toEqual([
      { kind: "MAT_DEL", seq: undefined, material: "RM-0004", before: { step: "20 WB 와이어 본딩" }, after: {} },
    ]);
    const again = await valuesOf("SF-0002");
    expect(again.materials.map((m) => m.item)).toEqual(["SF-0001", "RM-0003"]);
    again.materials.push({ item: "RM-0004", step: "0" });
    const refused = await rejected(again);
    expect(refused.errors.materials).toEqual({ 2: "이 품목의 BOM 에 없는 자재입니다" });
  });

  it("버전이 다르면 STALE, 남이 지운 뒤 저장도 STALE, 새 라우팅을 두 번 만들면 뒤의 것이 STALE", async () => {
    await saved(threeSteps());
    const opened = await valuesOf("SF-0002");
    const other = await valuesOf("SF-0002");
    other.steps[0].note = "남이 먼저";
    await saved(other);
    opened.steps[0].note = "나중";
    const stale = await rejected(opened);
    expect(stale.formError).toBe(STALE);
    expect(stale.errors).toEqual({ steps: {}, materials: {} });
    // 바꾼 것이 없어도 옛 버전이면 STALE.
    expect((await rejected({ ...opened, steps: other.steps })).formError).toBe(STALE);
    // 꼴이 틀린 버전도 STALE.
    expect((await rejected({ ...opened, version: "abc" })).formError).toBe(STALE);

    // 남이 지운 뒤의 저장.
    const now = await valuesOf("SF-0002");
    expect(await deleteRouting(db, "SF-0002", now.version!)).toEqual({ ok: true, code: "SF-0002" });
    expect((await rejected(now)).formError).toBe(STALE);

    // 새 라우팅을 둘이 함께 만든다 — 뒤의 것은 STALE.
    const fresh: RoutingValues = { item: "FG-0001", version: "", steps: [step("MK", "MK-1", "0", "1")], materials: [] };
    await saved(fresh);
    expect((await rejected({ ...fresh, steps: [step("FT", "FT-1", "0", "1")] })).formError).toBe(STALE);
    // 동시에 — 잠금 아래 한 쪽만 선다.
    const both = await Promise.all([
      saveRouting(db, { item: "FG-0002", version: "", steps: [step("MK", "MK-1", "0", "1")], materials: [] }),
      saveRouting(db, { item: "FG-0002", version: "", steps: [step("FT", "FT-1", "0", "1")], materials: [] }),
    ]);
    expect(both.filter((r) => r.ok)).toHaveLength(1);
    expect(both.find((r) => !r.ok)).toMatchObject({ formError: STALE });

    // 지우기도 버전이 다르면 STALE.
    const fg = await valuesOf("FG-0001");
    expect(await deleteRouting(db, "FG-0001", "1")).toEqual({ ok: false, formError: STALE });
    expect(await deleteRouting(db, "FG-0001", "abc")).toEqual({ ok: false, formError: STALE });
    expect(await deleteRouting(db, "SF-0002", fg.version!)).toEqual({ ok: false, notFound: true });
  });

  it("원자재 · 「사용 안 함」 품목(라우팅 없음)은 열지 · 만들지 못한다", async () => {
    expect(await openRouting(db, "RM-0001")).toEqual({ ok: false, message: "라우팅은 반제품 · 완제품에만 있습니다" });
    expect(await openRouting(db, "SF-9999")).toEqual({ ok: false, message: "없는 품목입니다" });
    expect(await openRouting(db, "아무거나")).toEqual({ ok: false, message: "없는 품목입니다" });
    const rm = await rejected({ item: "RM-0001", version: "", steps: [step("DA", "DA-1", "0", "1")], materials: [] });
    expect(rm.errors.item).toBe("라우팅은 반제품 · 완제품에만 있습니다");
    const none = await rejected({ item: "SF-9999", version: "", steps: [step("DA", "DA-1", "0", "1")], materials: [] });
    expect(none.errors.item).toBe("없는 품목입니다");

    await saved(threeSteps());
    await db
      .update(items)
      .set({ active: false })
      .where(inArray(items.code, ["SF-0001", "SF-0002"]));
    expect(await openRouting(db, "SF-0001")).toEqual({
      ok: false,
      message: "「사용 안 함」 품목이라 새 라우팅을 만들지 못합니다",
    });
    const off = await rejected({ item: "SF-0001", version: "", steps: [step("DA", "DA-1", "0", "1")], materials: [] });
    expect(off.errors.item).toBe("「사용 안 함」 품목이라 새 라우팅을 만들지 못합니다");
    // 라우팅이 있는 「사용 안 함」 품목은 열고 고칠 수 있다.
    const values = await valuesOf("SF-0002");
    values.steps[0].note = "고침";
    expect((await saved(values)).changed).toBe(1);
    expect((await routingFormOptions(db)).newItems.map((i) => i.code)).toEqual(["FG-0001", "FG-0002"]);
  });

  it("지우기 — ROUTING_DEL · STEP_DEL · MAT_DEL 이 남고, 다시 열면 새 라우팅이며 이력은 남아 있다", async () => {
    await saved(threeSteps());
    const v = await valuesOf("SF-0002");
    expect(await deleteRouting(db, "SF-0002", v.version!)).toEqual({ ok: true, code: "SF-0002" });
    expect(await db.select().from(routingSteps)).toEqual([]);
    expect(await db.select().from(routingMaterials)).toEqual([]);
    const all = await changes("SF-0002");
    expect(all.slice(6).map((c) => [c.kind, c.seq, c.material])).toEqual([
      ["ROUTING_DEL", undefined, undefined],
      ["STEP_DEL", 10, undefined],
      ["STEP_DEL", 20, undefined],
      ["STEP_DEL", 30, undefined],
      ["MAT_DEL", undefined, "SF-0001"],
      ["MAT_DEL", undefined, "RM-0004"],
    ]);
    expect(all[7].before).toEqual({
      seq: "10",
      process: "DA 다이 본딩",
      workCenter: "DA-1 다이 본딩 1라인",
      setupMin: "10",
      runSec: "1.000",
      note: "",
    });
    expect(all[10].before).toEqual({ step: "10 DA 다이 본딩" });

    const opened = await openRouting(db, "SF-0002");
    if (!opened.ok) throw new Error(opened.message);
    expect(opened.sheet.version).toBeNull();
    expect(opened.sheet.steps).toEqual([]);
    expect(opened.sheet.materials.map((m) => [m.code, m.seq, m.inBom])).toEqual([
      ["SF-0001", null, true],
      ["RM-0003", null, true],
      ["RM-0004", null, true],
    ]);
    const h = await routingHistory(db, "SF-0002");
    expect(h.total).toBe(12);
    // 최근 저장부터 — 지움이 맨 앞.
    expect(h.entries[0].kind).toBe("ROUTING_DEL");
    expect(await deleteRouting(db, "SF-0002", v.version!)).toEqual({ ok: false, notFound: true });
  });

  it("공정 줄 상한 — 다른 라우팅 줄이 5,000 이면 formError limitMessage", async () => {
    // 품목 100 개(원자재 RM-0001 을 본뜬) 마다 라우팅 하나 · 공정 줄 50 — 5,000 줄.
    const [base] = await db
      .select({
        itemType: items.itemType,
        procurement: items.procurement,
        unit: items.unit,
        defaultInWarehouseId: items.defaultInWarehouseId,
        defaultOutWarehouseId: items.defaultOutWarehouseId,
      })
      .from(items)
      .where(eq(items.code, "RM-0001"));
    const made = await db
      .insert(items)
      .values(Array.from({ length: 100 }, (_, k) => ({ ...base, code: `RM-${1000 + k}`, name: `채움 ${k}` })))
      .returning({ id: items.id });
    const heads = await db
      .insert(routings)
      .values(made.map((i) => ({ itemId: i.id })))
      .returning({ id: routings.id });
    await db.execute(sql`
      insert into routing_steps (routing_id, seq, process_id, work_center_id, setup_min, run_ms)
      select r.id, g * 10, wc.process_id, wc.id, 0, 0
      from routings r cross join generate_series(1, 50) g
      cross join (select id, process_id from work_centers order by id limit 1) wc
      where r.id in (${sql.join(
        heads.map((h) => h.id),
        sql`, `,
      )})`);
    expect((await db.select().from(routingSteps)).length).toBe(ROUTING_STEP_LIMIT);

    const r = await rejected({ item: "SF-0002", version: "", steps: [step("DA", "DA-1", "0", "1")], materials: [] });
    expect(r.formError).toBe(limitMessage("라우팅 공정 줄", ROUTING_STEP_LIMIT));
  });
});

describe("라우팅 목록", () => {
  const none = { q: "", process: "", workCenter: "" };
  beforeEach(async () => {
    await resetToSample(db, TODAY);
  });

  it("목록은 품목코드 차례 — 공정 MD 로 거르면 SF-0002 · FG-0002, 작업장 DA-2 로 거르면 FG-0002", async () => {
    const all = await listRoutings(db, none);
    expect(all.map((r) => r.code)).toEqual(["FG-0001", "FG-0002", "SF-0001", "SF-0002"]);
    expect((await listRoutings(db, { ...none, process: "MD" })).map((r) => r.code)).toEqual(["FG-0002", "SF-0002"]);
    expect((await listRoutings(db, { ...none, workCenter: "DA-2" })).map((r) => r.code)).toEqual(["FG-0002"]);
  });

  it("공정 흐름은 순번 차례, 줄 수 · 준비시간 합 · 개당 시간 합을 든다", async () => {
    const rows = await listRoutings(db, none);
    const sf1 = rows.find((r) => r.code === "SF-0001")!;
    expect(sf1.flow).toEqual(["BG", "SAW", "DA"]);
    expect(sf1.steps).toBe(3);
    expect(rows.find((r) => r.code === "FG-0002")!.flow).toEqual(["BG", "SAW", "DA", "WB", "MD", "MK", "FT"]);
    const steps = await db
      .select({ setup: routingSteps.setupMin, run: routingSteps.runMs })
      .from(routingSteps)
      .innerJoin(routings, eq(routings.id, routingSteps.routingId))
      .innerJoin(items, eq(items.id, routings.itemId))
      .where(eq(items.code, "SF-0001"));
    const sums = { setup: steps.reduce((a, x) => a + x.setup, 0), run: steps.reduce((a, x) => a + x.run, 0) };
    expect(sf1.setupMin).toBe(sums.setup);
    expect(sf1.runSec).toBe(`${Math.trunc(sums.run / 1000)}.${String(sums.run % 1000).padStart(3, "0")}`);
  });

  it("q 는 품명으로도 찾는다", async () => {
    const [it0] = await db.select({ name: items.name }).from(items).where(eq(items.code, "FG-0001"));
    const rows = await listRoutings(db, { ...none, q: it0.name.slice(0, 3) });
    expect(rows.map((r) => r.code)).toContain("FG-0001");
    expect((await listRoutings(db, { ...none, q: "sf-0002" })).map((r) => r.code)).toEqual(["SF-0002"]);
  });

  it("꼴 틀린 공정 · 작업장 값은 거르지 않고 알린다", () => {
    const { filter, notices } = parseRoutingFilter({ process: "bad code!", workCenter: "x y", q: " 가 " });
    expect(filter).toEqual({ q: "가", process: "", workCenter: "" });
    expect(notices).toEqual([
      { field: "process", message: "받지 않는 공정 값이라 거르지 않았습니다" },
      { field: "workCenter", message: "받지 않는 작업장 값이라 거르지 않았습니다" },
    ]);
    expect(parseRoutingFilter({ process: "MD", workCenter: "DA-2" })).toEqual({
      filter: { q: "", process: "MD", workCenter: "DA-2" },
      notices: [],
    });
  });
});
