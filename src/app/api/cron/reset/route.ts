import { connect } from "@/db/client";
import { resetToSample } from "@/db/reset";
import { handleResetRequest } from "@/db/reset-request";

// 매일 밤 한 번 Vercel Cron 이 부른다(vercel.json) — 다섯 테이블을 샘플 데이터로 되돌린다(ADR 0004).
// 요청의 머리글을 읽으므로 빌드 때 미리 만들지 않고 부를 때마다 돈다.
export async function GET(request: Request) {
  return handleResetRequest(
    request.headers.get("authorization"),
    { cronSecret: process.env.CRON_SECRET, databaseUrl: process.env.DATABASE_URL },
    async (url) => {
      const { db, close } = connect(url);
      try {
        return await resetToSample(db);
      } finally {
        await close();
      }
    },
  );
}
