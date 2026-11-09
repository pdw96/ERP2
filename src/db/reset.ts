import { asc, count, eq, sql } from "drizzle-orm";
import type { ItemType } from "@/lib/master-codes";
import { koreaToday } from "@/lib/today";
import {
  SAMPLE_CODE_GROUPS,
  SAMPLE_CODES,
  SAMPLE_DEFAULT_WAREHOUSES,
  SAMPLE_ITEMS,
  SAMPLE_MOVES,
  SAMPLE_NUMBER_RULES,
  SAMPLE_PARTNERS,
  SAMPLE_UNIT_SPECS,
  SAMPLE_WAREHOUSES,
} from "./sample";
import {
  codeGroups,
  codes,
  items,
  numberRules,
  numberRuleSeqs,
  partners,
  stockBalances,
  stockMoveLines,
  stockMoves,
  unitSpecs,
  warehouses,
} from "./schema";
import { cancelMove, lockStock, saveMove } from "./stock";
import type { Db } from "./types";

/** 되돌림이 비우고 다시 채우는 테이블 — 테이블을 더하는 조각은 여기에도 더한다(시험이 스키마와 견준다). */
export const RESET_TABLES = [
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
    const n = async (t: typeof stockMoves | typeof stockMoveLines | typeof stockBalances | typeof numberRuleSeqs) =>
      (await tx.select({ n: count() }).from(t))[0].n;
    return {
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
