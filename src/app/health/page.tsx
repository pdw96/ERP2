import { connection } from "next/server";
import { Suspense } from "react";
import { DbStatusView } from "@/components/db-status-view";
import { checkDatabase } from "@/db/status";

export const metadata = { title: "시스템 상태 — ERP2" };

export default function HealthPage() {
  return (
    <section className="max-w-2xl">
      <h1 className="text-3xl leading-tight font-semibold">시스템 상태</h1>
      <p className="mt-2 text-muted">데모가 DB에 연결되어 있는지 확인합니다. 열 때마다 새로 확인합니다.</p>
      <h2 className="mt-8 text-lg font-semibold">DB</h2>
      <div className="mt-2">
        <Suspense fallback={<p className="text-muted">확인 중입니다.</p>}>
          <DatabaseStatus />
        </Suspense>
      </div>
    </section>
  );
}

async function DatabaseStatus() {
  // 빌드 때가 아니라 요청이 올 때마다 확인한다.
  await connection();
  return <DbStatusView status={await checkDatabase(process.env.DATABASE_URL)} />;
}
