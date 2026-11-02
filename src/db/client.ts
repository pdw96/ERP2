import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// DB 접속은 환경변수 DATABASE_URL 하나로만 받는다. 값은 레포에 두지 않는다(Vercel 환경변수).
export function connect(url: string) {
  const client = postgres(url, { max: 1, connect_timeout: 5, idle_timeout: 20, prepare: false, ssl: tlsFor(url) });
  return { db: drizzle(client), close: () => client.end({ timeout: 1 }) };
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// 내 컴퓨터의 DB 말고는 암호화하고 인증서까지 확인한다 — URL 의 sslmode 에 기대지 않는다.
export function tlsFor(url: string): "verify-full" | false {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname) ? false : "verify-full";
  } catch {
    return "verify-full";
  }
}
