import { sql } from "drizzle-orm";
import { connect } from "./client";

export type DbStatus = { state: "connected"; now: Date } | { state: "unset" } | { state: "unreachable" };

// DB 의 현재 시각을 묻는다. 시험에서는 이 자리에 가짜를 끼운다.
export type Probe = (url: string) => Promise<Date>;

export const probeDatabase: Probe = async (url) => {
  const { db, close } = connect(url);
  try {
    const rows = await db.execute<{ now: Date | string }>(sql`select now() as now`);
    return new Date(rows[0].now);
  } finally {
    await close();
  }
};

function errorCode(error: unknown): string {
  const e = error as { code?: unknown; name?: unknown; cause?: { code?: unknown } };
  for (const c of [e?.code, e?.cause?.code, e?.name]) if (typeof c === "string" && c) return c;
  return "unknown";
}

export async function checkDatabase(url: string | undefined, probe: Probe = probeDatabase): Promise<DbStatus> {
  if (!url) return { state: "unset" };
  try {
    return { state: "connected", now: await probe(url) };
  } catch (error) {
    // 접속 문자열이 새지 않게 오류의 종류(코드)만 남긴다. Drizzle 은 드라이버 오류를 cause 에 감싼다.
    console.error(`DB 연결 실패: ${errorCode(error)}`);
    return { state: "unreachable" };
  }
}
