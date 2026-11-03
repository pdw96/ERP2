import { createHash, timingSafeEqual } from "node:crypto";
import { describeCounts } from "./deploy";
import type { ResetCounts } from "./reset";
import { describeFailure } from "./status";

// 매일 밤 되돌림의 입구(ADR 0004). Vercel Cron 은 `Authorization: Bearer <CRON_SECRET>` 을 붙여 부른다.
// 비밀값이 설정되지 않았거나 요청의 것이 틀리면 DB 에 닿지 않고 거절한다.

export type ResetEnv = { cronSecret: string | undefined; databaseUrl: string | undefined };

export async function handleResetRequest(
  authorization: string | null,
  env: ResetEnv,
  reset: (databaseUrl: string) => Promise<ResetCounts>,
): Promise<Response> {
  if (!env.cronSecret || !authorization || !sameSecret(authorization, `Bearer ${env.cronSecret}`)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!env.databaseUrl) {
    console.error("되돌림 실패: DATABASE_URL 이 없다");
    return Response.json({ ok: false, error: "database-unset" }, { status: 503 });
  }
  try {
    const counts = await reset(env.databaseUrl);
    console.log(`되돌림 완료: ${describeCounts(counts)}`);
    return Response.json({ ok: true, counts });
  } catch (error) {
    console.error(`되돌림 실패: ${describeFailure(error)}`);
    return Response.json({ ok: false, error: "reset-failed" }, { status: 500 });
  }
}

// 길이가 달라도 걸리는 시간이 같게, 해시를 견준다.
function sameSecret(given: string, expected: string): boolean {
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(given), digest(expected));
}
