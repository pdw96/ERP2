import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { first } from "@/db/master-shared";
import { withDb } from "@/db/request";
import { openSalesPlan, parseSalesPlanFilter, salesPlanHistory, salesPlanOptions } from "@/db/sales-plans";
import { koreaToday } from "@/lib/today";
import { mondayOf, pageStartOf } from "@/lib/weeks";
import { SalesPlanGrid } from "./sales-plan-grid";
import { SalesPlanHistory } from "./sales-plan-history";
import { planNotice } from "./notice";

export const metadata: Metadata = { title: "판매계획 — ERP2" };

// 영업 › 판매계획 — 완제품의 주별 판매계획을 고객마다 넣는 표(13주씩)와 품목 합계 · 고친 이력.
// 주소 ?from= 은 쪽의 첫 주(이번 주에서 13주씩), ?customer= · ?item= 은 거르기, ?saved= · ?confirmed= · ?unconfirmed= 는
// 저장 · 확정 · 확정 취소 뒤 바꾼 칸 수다.
export default function SalesPlansPage({ searchParams }: PageProps<"/sales/plans">) {
  return (
    <section>
      <p className="text-sm text-muted">
        <Link href="/sales" className="underline-offset-4 hover:underline">
          영업
        </Link>{" "}
        › 판매계획
      </p>
      <h1 className="mt-1 text-3xl leading-tight font-semibold">판매계획</h1>
      <p className="mt-1 max-w-3xl text-muted">
        완제품의 주별 판매계획을 고객마다 넣습니다. 저장하면 미확정, [확정]해야 MPS 수요가 됩니다 — 품목 합계는 확정한
        칸만 더합니다. 지난 주는 고치지 못합니다.
      </p>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <Plan searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function Plan({ searchParams }: Pick<PageProps<"/sales/plans">, "searchParams">) {
  const params = await searchParams;
  // 저장 · 확정 · 확정 취소 뒤 주소에 실린 바꾼 칸 수의 알림.
  const notice = planNotice(params);
  await connection();
  // 오늘은 한 번만 읽는다 — 쪽의 첫 주와 표의 이번 주가 자정 앞뒤로 갈리지 않게.
  const today = koreaToday();
  const from = pageStartOf(first(params.from), mondayOf(today));
  const filter = parseSalesPlanFilter(params);
  let data;
  try {
    data = await withDb(async (db) => ({
      sheet: await openSalesPlan(db, { from, filter }, today),
      options: await salesPlanOptions(db),
      history: await salesPlanHistory(db, filter),
    }));
  } catch (error) {
    return <LoadFailed error={error} what="판매계획" />;
  }
  const { sheet, options, history } = data;
  const back = { from, customer: filter.customer ?? "", item: filter.item ?? "" };

  return (
    <>
      {notice && (
        <p role="status" className="mt-6 max-w-3xl border-l-4 border-safety bg-white px-5 py-3">
          {notice}
        </p>
      )}
      {/* 열 때마다 화면의 값을 새로 — 저장 뒤 같은 주소로 돌아와도 고친 칸 · 새 줄이 남지 않게. */}
      <SalesPlanGrid key={randomUUID()} sheet={sheet} options={options} back={back} />
      <SalesPlanHistory rows={history.rows} total={history.total} thisWeek={sheet.thisWeek} />
    </>
  );
}
