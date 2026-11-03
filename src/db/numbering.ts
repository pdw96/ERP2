import { like, sql } from "drizzle-orm";
import { items, partners, warehouses } from "./schema";
import type { Db } from "./types";

// 코드 번호 — 같은 머리의 가장 큰 번호 + 1(설계 「PR B 를 열기 전에 정한 것」).
// 지우는 길이 없어 번호가 비지 않고, 되돌림 뒤에는 샘플의 다음 번호부터 붙는다.
// 두 사람이 같은 번호를 받으면 DB 의 유일 제약이 뒤의 것을 거절한다 — 등록 쪽이 번호를 다시 받아 한 번 더 넣는다.
const SERIES = {
  RM: { table: items, digits: 4 },
  SF: { table: items, digits: 4 },
  FG: { table: items, digits: 4 },
  WH: { table: warehouses, digits: 2 },
  BP: { table: partners, digits: 4 },
} as const;

export type CodePrefix = keyof typeof SERIES;

export async function nextCode(db: Db, prefix: CodePrefix): Promise<string> {
  const { table, digits } = SERIES[prefix];
  const [row] = await db
    .select({
      max: sql<number | string | null>`max(substring(${table.code} from ${sql.raw(String(prefix.length + 2))})::int)`,
    })
    .from(table)
    .where(like(table.code, `${prefix}-%`));
  const next = Number(row?.max ?? 0) + 1;
  return `${prefix}-${String(next).padStart(digits, "0")}`;
}
