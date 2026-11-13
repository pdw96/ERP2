import { asc, count, eq, sql } from "drizzle-orm";
import type { ItemType } from "@/lib/master-codes";
import { koreaToday } from "@/lib/today";
import {
  SAMPLE_BOMS,
  SAMPLE_CODE_GROUPS,
  SAMPLE_CODES,
  SAMPLE_COUNTS,
  SAMPLE_DEFAULT_WAREHOUSES,
  SAMPLE_ITEMS,
  SAMPLE_MOVES,
  SAMPLE_NUMBER_RULES,
  SAMPLE_PARTNERS,
  SAMPLE_UNIT_SPECS,
  SAMPLE_WAREHOUSES,
} from "./sample";
import {
  bomChanges,
  bomLines,
  boms,
  codeGroups,
  codes,
  items,
  numberRules,
  numberRuleSeqs,
  partners,
  stockBalances,
  stockCountLines,
  stockCounts,
  stockMoveLines,
  stockMoves,
  unitSpecs,
  warehouses,
} from "./schema";
import { lockBom, saveBom } from "./boms";
import { cancelMove, lockStock, saveMove } from "./stock";
import { confirmCount, openCountSheet, saveCount } from "./stock-counts";
import type { Db } from "./types";

/** 되돌림이 비우고 다시 채우는 테이블 — 테이블을 더하는 조각은 여기에도 더한다(시험이 스키마와 견준다). */
export const RESET_TABLES = [
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
    await tx.execute(sql.raw(`truncate table ${RESET_TABLES.map((t) => `"${t}"`).join(", ")} restart identity`));
    await tx.insert(codeGroups).values(SAMPLE_CODE_GROUPS);
    await tx.insert(codes).values(SAMPLE_CODES);
    await tx.insert(unitSpecs).values(SAMPLE_UNIT_SPECS);
    const placed = await tx
      .insert(warehouses)
      .values(SAMPLE_WAREHOUSES)
      .returning({ id: warehouses.id, code: warehouses.code });
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
        | typeof bomChanges,
    ) => (await tx.select({ n: count() }).from(t))[0].n;
    return {
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
