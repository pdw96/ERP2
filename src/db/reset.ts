import { asc, count, eq, inArray, sql } from "drizzle-orm";
import type { ItemType } from "@/lib/master-codes";
import { koreaToday } from "@/lib/today";
import { addWeeks, mondayOf } from "@/lib/weeks";
import {
  SAMPLE_BOMS,
  SAMPLE_CODE_GROUPS,
  SAMPLE_CODES,
  SAMPLE_DEFECT_TYPES,
  SAMPLE_COUNTS,
  SAMPLE_DEFAULT_WAREHOUSES,
  SAMPLE_ITEMS,
  SAMPLE_MOVES,
  SAMPLE_NUMBER_RULES,
  SAMPLE_PARTNERS,
  SAMPLE_PROCESSES,
  SAMPLE_ROUTINGS,
  SAMPLE_MPS_FIXED,
  SAMPLE_SALES_PLANS,
  SAMPLE_SALES_PLAN_CONFIRMED_THROUGH,
  SAMPLE_UNIT_SPECS,
  SAMPLE_WAREHOUSES,
  SAMPLE_WORK_CENTERS,
} from "./sample";
import {
  bomChanges,
  bomLines,
  boms,
  codeGroups,
  codes,
  defectTypeProcesses,
  defectTypes,
  items,
  mpsChanges,
  mpsFixed,
  mrpGross,
  mrpPegs,
  mrpPlannedOrders,
  mrpRunItems,
  mrpRuns,
  mrpSettingChanges,
  mrpSettings,
  numberRules,
  numberRuleSeqs,
  partners,
  processes,
  routingChanges,
  routingMaterials,
  routings,
  routingSteps,
  salesPlanChanges,
  salesPlans,
  stockBalances,
  stockCountLines,
  stockCounts,
  stockMoveLines,
  stockMoves,
  unitSpecs,
  warehouses,
  workCenters,
} from "./schema";
import { lockBom, saveBom } from "./boms";
import { lockMrp, runMrpIn } from "./mrp";
import { lockRouting, saveRouting } from "./routings";
import { lockSalesPlans } from "./sales-plans";
import { cancelMove, lockStock, saveMove } from "./stock";
import { confirmCount, openCountSheet, saveCount } from "./stock-counts";
import type { Db } from "./types";

/** 되돌림이 비우고 다시 채우는 테이블 — 테이블을 더하는 조각은 여기에도 더한다(시험이 스키마와 견준다). */
export const RESET_TABLES = [
  // mrp_runs 를 맨 앞에 — 읽기가 mrp_runs 를 먼저 잠그므로 TRUNCATE 도 같은 차례로 잠가 서로 기다려 얽히지 않는다.
  "mrp_runs",
  "mrp_pegs",
  "mrp_gross",
  "mrp_planned_orders",
  "mrp_run_items",
  "mrp_setting_changes",
  "mrp_settings",
  "mps_changes",
  "mps_fixed",
  "sales_plan_changes",
  "sales_plans",
  "routing_changes",
  "routing_materials",
  "routing_steps",
  "routings",
  "bom_changes",
  "bom_lines",
  "boms",
  "stock_count_lines",
  "stock_counts",
  "stock_balances",
  "stock_move_lines",
  "stock_moves",
  "items",
  "number_rule_seqs",
  "number_rules",
  "warehouses",
  "defect_type_processes",
  "defect_types",
  "work_centers",
  "processes",
  "partners",
  "unit_specs",
  "codes",
  "code_groups",
] as const;

export type ResetCounts = Record<(typeof RESET_TABLES)[number], number>;

// 테이블을 샘플 데이터로 되돌린다(ADR 0004). 한 트랜잭션이라 중간에 실패하면 아무것도 바뀌지 않는다.
// 번호(id)도 1 부터 다시 센다. 코드 번호는 테이블의 가장 큰 번호 + 1 이라 샘플의 다음 번호부터 붙는다.
// 번호 규칙의 일련(number_rule_seqs)은 비우고, 샘플 수불이 LOT 를 저절로 붙이며 채운다.
// 샘플 수불은 재고 계산의 저장(src/db/stock.ts)을 불러 넣는다 — 날짜는 today(한국 시각의 오늘)에서 센다(설계 「2026-11-09 — PR C 를 열기 전에 정한 것」).
export async function resetToSample(db: Db, today: string = koreaToday()): Promise<ResetCounts> {
  return db.transaction(async (tx) => {
    // 재고의 잠금을 먼저 쥔다 — 수불 저장과 같은 차례(잠금 → 표). 비운 뒤 잠금을 기다리면 잠금을 쥔 채 표를 읽으려는 저장과
    // 서로 기다려 한쪽이 교착(40P01)으로 되돌아간다(PR C 리뷰 1회차).
    await lockStock(tx);
    await lockBom(tx);
    // 라우팅도 같다 — 샘플 라우팅을 넣는 saveRouting 이 비운 뒤 이 잠금을 다시 쥐므로(같은 트랜잭션이라 겹쳐 쥐어도 된다) 먼저 쥔다(PR #58 Codex 리뷰).
    await lockRouting(tx);
    // 판매계획도 같다 — 판매계획을 고치는 저장이 쥐는 잠금이라, 비우기 전에 쥐어 저장과 같은 차례(재고 → BOM → 라우팅 → 판매계획)를 지킨다.
    await lockSalesPlans(tx);
    // MRP 도 같다 — 완성일 기준 요일 저장 · MRP 실행이 쥐는 잠금이라, 비우기 전에 쥐어 그들과 같은 차례(… → 판매계획 → MRP)를 지킨다.
    // MRP 실행은 이 잠금 하나만 쥐고(앞의 잠금들을 쥐지 않는다) 표를 읽으므로 서로 기다려 막히지 않는다.
    await lockMrp(tx);
    await tx.execute(sql.raw(`truncate table ${RESET_TABLES.map((t) => `"${t}"`).join(", ")} restart identity`));
    await tx.insert(codeGroups).values(SAMPLE_CODE_GROUPS);
    await tx.insert(codes).values(SAMPLE_CODES);
    await tx.insert(unitSpecs).values(SAMPLE_UNIT_SPECS);
    const placed = await tx
      .insert(warehouses)
      .values(SAMPLE_WAREHOUSES)
      .returning({ id: warehouses.id, code: warehouses.code });
    const steps = await tx
      .insert(processes)
      .values(SAMPLE_PROCESSES)
      .returning({ id: processes.id, code: processes.code });
    await tx.insert(workCenters).values(
      SAMPLE_WORK_CENTERS.map(({ processCode, ...w }) => ({
        ...w,
        processId: steps.find((p) => p.code === processCode)!.id,
      })),
    );
    // 불량 유형 — 발생 공정은 코드로 가리켜 id 로 이어 넣는다(비면 공통).
    const defects = await tx
      .insert(defectTypes)
      .values(SAMPLE_DEFECT_TYPES.map((d) => ({ code: d.code, name: d.name, cls: d.cls, note: d.note })))
      .returning({ id: defectTypes.id, code: defectTypes.code });
    await tx.insert(defectTypeProcesses).values(
      SAMPLE_DEFECT_TYPES.flatMap((d) =>
        d.processCodes.map((processCode) => ({
          defectTypeId: defects.find((x) => x.code === d.code)!.id,
          processId: steps.find((p) => p.code === processCode)!.id,
        })),
      ),
    );
    await tx.insert(numberRules).values(SAMPLE_NUMBER_RULES);
    await tx.insert(partners).values(SAMPLE_PARTNERS);
    const idOf = (code: string) => placed.find((w) => w.code === code)!.id;
    await tx.insert(items).values(
      SAMPLE_ITEMS.map((i) => {
        const at = SAMPLE_DEFAULT_WAREHOUSES[i.itemType as ItemType];
        return { ...i, defaultInWarehouseId: idOf(at.in), defaultOutWarehouseId: idOf(at.out) };
      }),
    );
    await insertSampleMoves(tx, today);
    await insertSampleCounts(tx, today);
    await insertSampleBoms(tx, today);
    await insertSampleRoutings(tx);
    await insertSampleSalesPlans(tx, today);
    await insertSampleMps(tx, today);
    // MRP 설정은 줄 하나(id 1) — 처음 값(월요일)으로 다시 넣는다. 설정 이력은 비워 둔다.
    await tx.insert(mrpSettings).values({ id: 1 });
    // 샘플을 다 넣은 뒤 MRP 를 한 번 실행한다 — 데모에 계획오더가 늘 있다(그날 일련 001 부터). 상한에 걸릴 샘플이 아니므로 거절이면 던진다.
    const mrp = await runMrpIn(tx, new Date(), today);
    if (!mrp.ok) throw new Error(`샘플 MRP 실행 실패: ${mrp.formError}`);
    const n = async (
      t:
        | typeof stockMoves
        | typeof stockMoveLines
        | typeof stockBalances
        | typeof numberRuleSeqs
        | typeof stockCounts
        | typeof stockCountLines
        | typeof boms
        | typeof bomLines
        | typeof bomChanges
        | typeof defectTypeProcesses
        | typeof routings
        | typeof routingSteps
        | typeof routingMaterials
        | typeof routingChanges
        | typeof salesPlans
        | typeof salesPlanChanges
        | typeof mpsFixed
        | typeof mpsChanges
        | typeof mrpGross
        | typeof mrpPegs
        | typeof mrpPlannedOrders
        | typeof mrpRunItems
        | typeof mrpRuns
        | typeof mrpSettingChanges
        | typeof mrpSettings,
    ) => (await tx.select({ n: count() }).from(t))[0].n;
    return {
      mrp_gross: await n(mrpGross),
      mrp_pegs: await n(mrpPegs),
      mrp_planned_orders: await n(mrpPlannedOrders),
      mrp_run_items: await n(mrpRunItems),
      mrp_runs: await n(mrpRuns),
      mrp_setting_changes: await n(mrpSettingChanges),
      mrp_settings: await n(mrpSettings),
      mps_changes: await n(mpsChanges),
      mps_fixed: await n(mpsFixed),
      sales_plan_changes: await n(salesPlanChanges),
      sales_plans: await n(salesPlans),
      routing_changes: await n(routingChanges),
      routing_materials: await n(routingMaterials),
      routing_steps: await n(routingSteps),
      routings: await n(routings),
      bom_changes: await n(bomChanges),
      bom_lines: await n(bomLines),
      boms: await n(boms),
      stock_count_lines: await n(stockCountLines),
      stock_counts: await n(stockCounts),
      stock_balances: await n(stockBalances),
      stock_move_lines: await n(stockMoveLines),
      stock_moves: await n(stockMoves),
      items: SAMPLE_ITEMS.length,
      number_rule_seqs: await n(numberRuleSeqs),
      number_rules: SAMPLE_NUMBER_RULES.length,
      warehouses: SAMPLE_WAREHOUSES.length,
      work_centers: SAMPLE_WORK_CENTERS.length,
      defect_types: SAMPLE_DEFECT_TYPES.length,
      defect_type_processes: await n(defectTypeProcesses),
      processes: SAMPLE_PROCESSES.length,
      partners: SAMPLE_PARTNERS.length,
      unit_specs: SAMPLE_UNIT_SPECS.length,
      codes: SAMPLE_CODES.length,
      code_groups: SAMPLE_CODE_GROUPS.length,
    };
  });
}

/** 날짜(YYYY-MM-DD)에서 며칠 앞. */
export function daysBefore(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10);
}

/**
 * 샘플 수불을 차례로 저장한다 — 틀리면 던져 되돌림 전체를 되돌린다(샘플이 규칙에 어긋난 것이라 고쳐야 한다).
 * LOT 의 `@<품목 코드>` 는 그 품목이 앞의 샘플에서 저절로 받은 첫 LOT 다(격리 이동이 쓴다).
 */
async function insertSampleMoves(tx: Db, today: string) {
  for (const m of SAMPLE_MOVES) {
    const moveDate = daysBefore(today, m.daysAgo);
    const lines = [];
    for (const l of m.lines) {
      if (!l.lot?.startsWith("@")) {
        lines.push(l);
        continue;
      }
      const [first] = await tx
        .select({ lot: stockMoveLines.lot })
        .from(stockMoveLines)
        .innerJoin(items, eq(items.id, stockMoveLines.itemId))
        .where(eq(items.code, l.lot.slice(1)))
        .orderBy(asc(stockMoveLines.id))
        .limit(1);
      lines.push({ ...l, lot: first?.lot ?? "" });
    }
    const saved = await saveMove(
      tx,
      { moveDate, moveType: m.moveType, reason: m.reason ?? "", note: m.note ?? "", lines },
      today,
    );
    if (!saved.ok)
      throw new Error(`샘플 수불 저장 실패(${m.daysAgo}일 전 ${m.moveType}): ${JSON.stringify(saved.errors)}`);
    if (m.cancel) {
      const cancel = await cancelMove(tx, saved.code, moveDate);
      if (!cancel.ok) throw new Error(`샘플 수불 취소 실패: ${saved.code}`);
    }
  }
}

/**
 * 샘플 재고 실사를 넣는다 — 그 창고의 장부를 불러(openCountSheet) 실물 수량을 채워 저장하고, confirm 이면 확정한다. 화면과 같은 길이라
 * 번호 · 조정 전표 · 잔액이 맞는다. 틀리면 던져 되돌림 전체를 되돌린다.
 */
async function insertSampleCounts(tx: Db, today: string) {
  for (const c of SAMPLE_COUNTS) {
    const date = daysBefore(today, c.daysAgo);
    const opened = await openCountSheet(tx, c.warehouse);
    if (!opened.ok) throw new Error(`샘플 실사를 열지 못했다(${c.warehouse}): ${opened.message}`);
    const lines = opened.sheet.lines.map((l) => {
      const hit = c.counted[`${l.itemCode}|${l.lot}`] ?? c.counted[l.itemCode];
      return {
        item: l.itemCode,
        lot: l.lot,
        status: l.status,
        counted: hit ?? (c.rest === "book" ? l.book : ""),
      };
    });
    const saved = await saveCount(tx, { warehouse: c.warehouse, baseline: String(opened.sheet.baseline), lines }, date);
    if (!saved.ok)
      throw new Error(`샘플 실사 저장 실패(${c.warehouse}): ${JSON.stringify([saved.errors, saved.formError])}`);
    if (c.confirm) {
      const done = await confirmCount(tx, saved.code, saved.version, date);
      if (!done.ok) throw new Error(`샘플 실사 확정 실패: ${saved.code}`);
    }
  }
}

/** 샘플 BOM 을 넣는다 — BOM 저장(src/db/boms.ts)을 불러 화면과 같은 검사를 지난다. 틀리면 던져 되돌림 전체를 되돌린다. */
async function insertSampleBoms(tx: Db, today: string) {
  for (const b of SAMPLE_BOMS) {
    const saved = await saveBom(tx, {
      parent: b.parent,
      baseQty: b.baseQty,
      lines: b.lines.map((l) => ({
        child: l.child,
        qty: l.qty,
        lossRate: l.lossRate,
        validFrom: daysBefore(today, l.from),
        validTo: l.to === undefined ? "" : daysBefore(today, l.to),
        note: l.note ?? "",
      })),
    });
    if (!saved.ok)
      throw new Error(`샘플 BOM 저장 실패(${b.parent}): ${JSON.stringify([saved.errors, saved.formError])}`);
  }
}

/** 샘플 라우팅을 넣는다 — 라우팅 저장(src/db/routings.ts)을 불러 화면과 같은 검사를 지난다(BOM 뒤 — 자재는 BOM 의 자품목이어야 한다). 틀리면 던져 되돌림 전체를 되돌린다. */
async function insertSampleRoutings(tx: Db) {
  for (const r of SAMPLE_ROUTINGS) {
    const saved = await saveRouting(tx, {
      item: r.item,
      version: "",
      steps: r.steps.map((s) => ({
        process: s.process,
        workCenter: s.workCenter,
        setupMin: String(s.setupMin),
        runSec: s.runSec,
        note: s.note ?? "",
      })),
      materials: r.steps.flatMap((s, i) => (s.materials ?? []).map((item) => ({ item, step: String(i) }))),
    });
    if (!saved.ok)
      throw new Error(`샘플 라우팅 저장 실패(${r.item}): ${JSON.stringify([saved.errors, saved.formError])}`);
  }
}

/**
 * 샘플 판매계획을 표에 바로 넣는다(라우팅 뒤). 지난 주 칸이 있어 저장 함수(saveSalesPlan)를 지나지 못한다 — 저장은 지난 주를 막는다.
 * 주는 today(한국 시각의 오늘)가 든 주의 월요일에서 센다. 고객 · 품목이 샘플에 없으면 던져 되돌림 전체를 되돌린다.
 */
async function insertSampleSalesPlans(tx: Db, today: string) {
  const thisWeek = mondayOf(today);
  const confirmedAt = new Date();
  const customers = await tx
    .select({ code: partners.code, id: partners.id })
    .from(partners)
    .where(inArray(partners.code, [...new Set(SAMPLE_SALES_PLANS.map((p) => p.customer))]));
  const goods = await tx
    .select({ code: items.code, id: items.id })
    .from(items)
    .where(inArray(items.code, [...new Set(SAMPLE_SALES_PLANS.map((p) => p.item))]));
  await tx.insert(salesPlans).values(
    SAMPLE_SALES_PLANS.flatMap((p) => {
      const partnerId = customers.find((c) => c.code === p.customer)?.id;
      const itemId = goods.find((g) => g.code === p.item)?.id;
      if (partnerId === undefined || itemId === undefined)
        throw new Error(`샘플 판매계획의 고객 · 품목이 없다: ${p.customer} × ${p.item}`);
      return p.weeks.map((w) => ({
        partnerId,
        itemId,
        weekStart: addWeeks(thisWeek, w.offset),
        qty: Number(w.qty),
        confirmedAt: w.offset <= SAMPLE_SALES_PLAN_CONFIRMED_THROUGH ? confirmedAt : null,
      }));
    }),
  );
}

/**
 * 샘플 MPS 고정 칸을 표에 바로 넣는다(판매계획 뒤). 주는 today(한국 시각의 오늘)가 든 주의 월요일에서 센다.
 * 품목이 샘플에 없으면 던져 되돌림 전체를 되돌린다. 잠금은 이미 쥔 lockSalesPlans 로 충분하다(MPS 쓰기도 그 잠금을 쓴다).
 */
async function insertSampleMps(tx: Db, today: string) {
  const thisWeek = mondayOf(today);
  const fixedAt = new Date();
  const goods = await tx
    .select({ code: items.code, id: items.id })
    .from(items)
    .where(inArray(items.code, [...new Set(SAMPLE_MPS_FIXED.map((f) => f.item))]));
  await tx.insert(mpsFixed).values(
    SAMPLE_MPS_FIXED.map((f) => {
      const itemId = goods.find((g) => g.code === f.item)?.id;
      if (itemId === undefined) throw new Error(`샘플 MPS 고정의 품목이 없다: ${f.item}`);
      return { itemId, weekStart: addWeeks(thisWeek, f.offset), qty: Number(f.qty), fixedAt };
    }),
  );
}
