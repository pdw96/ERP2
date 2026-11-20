import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { first } from "@/db/master-shared";
import { mpsHistory, openMps } from "@/db/mps";
import { withDb } from "@/db/request";
import { koreaToday } from "@/lib/today";
import { mondayOf, pageStartOf } from "@/lib/weeks";
import { MpsGrid } from "./mps-grid";
import { MpsHistory } from "./mps-history";
import { mpsNotice } from "./notice";

export const metadata: Metadata = { title: "MPS — ERP2" };

// 생산 › 생산계획 › MPS — 확정한 판매계획으로 완제품의 주별 생산량을 세우는 표(13주씩)와 고친 이력.
// 주소 ?from= 은 쪽의 첫 주(이번 주에서 13주씩), ?saved= · ?confirmed= · ?unconfirmed= 는 저장 · 확정 · 확정 취소 뒤 바꾼 칸 수다.
export default function MpsPage({ searchParams }: PageProps<"/production/mps">) {
  return (
    <section>
      <p className="text-sm text-muted">
        <Link href="/production" className="underline-offset-4 hover:underline">
          생산
        </Link>{" "}
        › 생산계획 › MPS
      </p>
      <h1 className="mt-1 text-3xl leading-tight font-semibold">MPS</h1>
      <p className="mt-1 max-w-3xl text-muted">
        확정한 판매계획으로 완제품의 주별 생산량을 세웁니다. MPS 칸에 수량을 넣고 저장하면 고정됩니다. 고정하지 않은
        주는 열 때마다 지금의 수요와 재고로 다시 계산합니다.
      </p>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <Sheet searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function Sheet({ searchParams }: Pick<PageProps<"/production/mps">, "searchParams">) {
  const params = await searchParams;
  // 저장 · 확정 · 확정 취소 뒤 주소에 실린 바꾼 칸 수의 알림.
  const notice = mpsNotice(params);
  await connection();
  // 오늘은 한 번만 읽는다 — 쪽의 첫 주와 표의 이번 주가 자정 앞뒤로 갈리지 않게.
  const today = koreaToday();
  const from = pageStartOf(first(params.from), mondayOf(today));
  let data;
  try {
    data = await withDb(async (db) => ({
      sheet: await openMps(db, { from }, today),
      history: await mpsHistory(db),
    }));
  } catch (error) {
    return <LoadFailed error={error} what="MPS" />;
  }
  const { sheet, history } = data;

  return (
    <>
      {notice && (
        <p role="status" className="mt-6 max-w-3xl border-l-4 border-safety bg-white px-5 py-3">
          {notice}
        </p>
      )}
      {/* 열 때마다 화면의 값을 새로 — 저장 · 확정 뒤 같은 주소로 돌아와도 고친 칸 · 고른 품목 · 거절의 까닭이 남지 않게. */}
      <MpsGrid key={randomUUID()} sheet={sheet} back={{ from }} />
      <MpsHistory rows={history.rows} total={history.total} thisWeek={sheet.thisWeek} />
    </>
  );
}
