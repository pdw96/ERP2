import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { Suspense } from "react";
import { DbStatusView } from "@/components/db-status-view";
import { checkDatabase } from "@/db/status";

export const metadata: Metadata = {
  title: "시스템 상태 — ERP2",
  // 검색 로봇이 드나들며 DB 를 깨우지 않게 한다(무료 계산 시간).
  robots: { index: false, follow: false },
};

export default function HealthPage() {
  return (
    <section className="max-w-2xl">
      <h1 className="text-3xl leading-tight font-semibold">시스템 상태</h1>
      <p className="mt-2 text-muted">데모가 DB에 연결되어 있는지 확인합니다. 결과는 1분마다 새로 확인합니다.</p>
      <h2 className="mt-8 text-lg font-semibold">DB</h2>
      <div className="mt-2">
        <Suspense fallback={<p className="text-muted">확인 중입니다.</p>}>
          <DatabaseStatus />
        </Suspense>
      </div>
      <h2 className="mt-8 text-lg font-semibold">배포 버전</h2>
      <p className="mt-2 text-sm text-muted">{deployedVersion()}</p>
    </section>
  );
}

async function DatabaseStatus() {
  return <DbStatusView status={await cachedDatabaseStatus()} />;
}

// 결과를 재사용한다 — 1분이 지나면 다음 요청 때 새로 묻고, 그 사이 최대 2분 지난 결과를 보일 수 있다(대장 NC-16 · NC-25).
// 수명이 5분보다 짧아 빌드 때 미리 만들지 않고 요청이 올 때 채운다.
async function cachedDatabaseStatus() {
  "use cache";
  cacheLife({ stale: 30, revalidate: 60, expire: 120 });
  return checkDatabase(process.env.DATABASE_URL);
}

// 되돌리기를 화면으로 확인할 수 있게, 지금 떠 있는 배포의 커밋을 보인다(Vercel 이 넣어 주는 값).
function deployedVersion(): string {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  return sha ? `커밋 ${sha.slice(0, 7)}` : "알 수 없음 — 내 컴퓨터에서 돌리는 중";
}
