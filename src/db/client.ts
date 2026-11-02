import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// DB 접속은 환경변수 DATABASE_URL 하나로만 받는다. 값은 레포에 두지 않는다(Vercel 환경변수).
export function connect(url: string) {
  const client = postgres(url, { max: 1, connect_timeout: 5, idle_timeout: 20, prepare: false });
  return { db: drizzle(client), close: () => client.end({ timeout: 1 }) };
}
