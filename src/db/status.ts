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

export async function checkDatabase(url: string | undefined, probe: Probe = probeDatabase): Promise<DbStatus> {
  if (!url) return { state: "unset" };
  try {
    return { state: "connected", now: await probe(url) };
  } catch (error) {
    console.error(describeFailure(error));
    return { state: "unreachable" };
  }
}

type ErrorLike = { name?: unknown; code?: unknown; severity?: unknown; message?: unknown; cause?: unknown };

// 실패 한 줄 — 원인을 가를 만큼 남기되 접속 정보는 남기지 않는다.
// - DB 서버가 돌려준 오류(SQLSTATE 와 severity 가 있다)는 메시지까지 남긴다. 쿼터 소진 같은 서버 쪽 원인이 보인다.
// - 드라이버 · 네트워크 오류는 코드만 남긴다. 그 메시지에는 접속하려던 주소가 들어간다.
// - 그 밖의 오류(코드의 버그 등)는 이름과 메시지를 남긴다.
// Drizzle 은 드라이버 오류를 cause 에 감싸므로 안쪽부터 본다.
export function describeFailure(error: unknown): string {
  const outer = (error ?? {}) as ErrorLike;
  const inner = (outer.cause && typeof outer.cause === "object" ? outer.cause : outer) as ErrorLike;
  const code = typeof inner.code === "string" ? inner.code : undefined;
  if (code && /^[0-9A-Z]{5}$/.test(code) && typeof inner.severity === "string") {
    return `DB 질의 실패: ${code} ${inner.severity} ${scrub(inner.message)}`;
  }
  if (code) return `DB 연결 실패: ${code}`;
  const name = typeof inner.name === "string" && inner.name ? inner.name : "unknown";
  return `DB 질의 실패: ${name} ${scrub(inner.message)}`.trimEnd();
}

function scrub(message: unknown): string {
  return typeof message === "string" ? message.replace(/postgres(?:ql)?:\/\/\S+/g, "[접속 문자열]") : "";
}
