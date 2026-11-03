// 배포 빌드의 첫 단계(package.json 의 build) — 마이그레이션을 적용하고, 빈 DB 면 샘플 데이터를 넣는다(ADR 0005).
// 실패하면 0 이 아닌 값으로 끝나 빌드가 멈춘다. 그러면 배포가 나가지 않고 데모는 앞 배포에 남는다.
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { connect } from "../src/db/client";
import { prepareDatabase, isPooled } from "../src/db/deploy";
import { describeFailure } from "../src/db/status";

async function main(): Promise<number> {
  // 연결 풀을 거치지 않는 직결 주소가 있으면 그것을 쓴다(Vercel 의 Neon 연동이 함께 넣어 준다).
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) {
    if (process.env.VERCEL) {
      console.error("DB 준비 실패: DATABASE_URL 이 없다 — Vercel 환경변수를 확인한다(docs/deploy.md)");
      return 1;
    }
    console.log("DB 준비 건너뜀: DATABASE_URL 이 없다(내 컴퓨터의 빌드)");
    return 0;
  }

  const { db, close } = connect(url);
  try {
    await prepareDatabase(db, {
      migrate: () => migrate(db, { migrationsFolder: "drizzle" }),
      lock: !isPooled(url),
      log: (line) => console.log(line),
    });
    return 0;
  } catch (error) {
    // 접속 정보는 남기지 않는다 — 실패 줄의 꼴은 상태 화면과 같다(docs/deploy.md).
    console.error(`DB 준비 실패: ${describeFailure(error)}`);
    return 1;
  } finally {
    await close();
  }
}

main().then((code) => {
  process.exitCode = code;
});
