import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

/** 드라이버와 무관한 DB — 데모는 postgres 드라이버, 시험은 PGlite(내 컴퓨터에서 도는 PostgreSQL)를 넣는다. */
export type Db = PgDatabase<PgQueryResultHKT>;
