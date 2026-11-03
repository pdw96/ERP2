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

type ErrorLike = {
  name?: unknown;
  code?: unknown;
  severity?: unknown;
  message?: unknown;
  cause?: unknown;
  table_name?: unknown;
  column_name?: unknown;
  constraint_name?: unknown;
  table?: unknown;
  column?: unknown;
  constraint?: unknown;
};

export type FailureDetail = "message" | "code-only";

// 실패 한 줄 — 원인을 가를 만큼 남기되 접속 정보는 남기지 않는다.
// - DB 서버가 돌려준 오류(SQLSTATE 와 severity 가 있다)는 메시지까지 남긴다. 쿼터 소진 같은 서버 쪽 원인이 보인다.
// - 드라이버 · 네트워크 오류는 코드만 남긴다. 그 메시지에는 접속하려던 주소가 들어간다.
// - 그 밖의 오류(코드의 버그 등)는 이름과 메시지를 남긴다.
// 방문자 데이터에 닿는 경로(되돌림 · 배포 빌드 · 등록)는 "code-only" 로 부른다 — 서버의 메시지에는 행의 값이 실릴 수
// 있어서, 코드 · 등급과 스키마의 이름(테이블 · 칸 · 제약)만 남기고 메시지는 남기지 않는다(대장 NC-6). 메시지는 질의가
// 고정된 상태 확인(/health)만 남긴다.
// Drizzle 은 드라이버 오류를 cause 에 감싸므로 안쪽부터 본다.
export function describeFailure(error: unknown, detail: FailureDetail = "message"): string {
  const outer = (error ?? {}) as ErrorLike;
  const inner = (outer.cause && typeof outer.cause === "object" ? outer.cause : outer) as ErrorLike;
  const code = typeof inner.code === "string" ? inner.code : undefined;
  if (code && /^[0-9A-Z]{5}$/.test(code) && typeof inner.severity === "string") {
    const tail = detail === "message" ? scrub(inner.message) : schemaNames(inner);
    return `DB 질의 실패: ${code} ${inner.severity} ${tail}`.trimEnd();
  }
  if (code) return `DB 연결 실패: ${code}`;
  const name = typeof inner.name === "string" && inner.name ? inner.name : "unknown";
  if (detail === "code-only") return `DB 질의 실패: ${name}`;
  return `DB 질의 실패: ${name} ${scrub(inner.message)}`.trimEnd();
}

// 테이블 · 칸 · 제약의 이름은 스키마가 정한 것이라 방문자의 글자가 아니다.
// postgres 드라이버는 `*_name`, PGlite 는 이름만으로 준다.
function schemaNames(e: ErrorLike): string {
  const pick = (label: string, ...vs: unknown[]) => {
    const v = vs.find((x) => typeof x === "string" && x);
    return v ? `${label}=${v}` : "";
  };
  return [
    pick("table", e.table_name, e.table),
    pick("column", e.column_name, e.column),
    pick("constraint", e.constraint_name, e.constraint),
  ]
    .filter(Boolean)
    .join(" ");
}

function scrub(message: unknown): string {
  return typeof message === "string" ? message.replace(/postgres(?:ql)?:\/\/\S+/g, "[접속 문자열]") : "";
}
