import { sql } from "drizzle-orm";
import { SAMPLE_CODE_GROUPS, SAMPLE_CODES, SAMPLE_ITEMS, SAMPLE_PARTNERS, SAMPLE_WAREHOUSES } from "./sample";
import { codeGroups, codes, items, partners, warehouses } from "./schema";
import type { Db } from "./types";

/** 되돌림이 비우고 다시 채우는 테이블 — 테이블을 더하는 조각은 여기에도 더한다(시험이 스키마와 견준다). */
export const RESET_TABLES = ["items", "warehouses", "partners", "codes", "code_groups"] as const;

export type ResetCounts = Record<(typeof RESET_TABLES)[number], number>;

// 다섯 테이블을 샘플 데이터로 되돌린다(ADR 0004). 한 트랜잭션이라 중간에 실패하면 아무것도 바뀌지 않는다.
// 번호(id)도 1 부터 다시 센다. 코드 번호는 테이블의 가장 큰 번호 + 1 이라 샘플의 다음 번호부터 붙는다.
export async function resetToSample(db: Db): Promise<ResetCounts> {
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`truncate table ${RESET_TABLES.map((t) => `"${t}"`).join(", ")} restart identity`));
    await tx.insert(codeGroups).values(SAMPLE_CODE_GROUPS);
    await tx.insert(codes).values(SAMPLE_CODES);
    await tx.insert(warehouses).values(SAMPLE_WAREHOUSES);
    await tx.insert(partners).values(SAMPLE_PARTNERS);
    await tx.insert(items).values(SAMPLE_ITEMS);
  });
  return {
    items: SAMPLE_ITEMS.length,
    warehouses: SAMPLE_WAREHOUSES.length,
    partners: SAMPLE_PARTNERS.length,
    codes: SAMPLE_CODES.length,
    code_groups: SAMPLE_CODE_GROUPS.length,
  };
}
