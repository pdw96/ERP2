import { defineConfig } from "drizzle-kit";

// 마이그레이션 SQL 을 만드는 설정 — `npx drizzle-kit generate` 가 src/db/schema.ts 를 읽어 drizzle/ 에 쓴다.
// 적용은 배포 빌드가 한다(scripts/migrate.ts, ADR 0005). 이 설정으로 DB 에 접속하지 않는다.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
