import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { first } from "@/db/master-shared";
import { withDb } from "@/db/request";
import { openSalesPlan, parseSalesPlanFilter, salesPlanOptions } from "@/db/sales-plans";
import { koreaToday } from "@/lib/today";
import { mondayOf, pageStartOf } from "@/lib/weeks";
import { confirmNotice } from "../notice";
import { SalesPlanConfirmGrid } from "../sales-plan-confirm-grid";

export const metadata: Metadata = { title: "판매계획 확정 — ERP2" };

// 영업 › 영업 계획 › 판매계획 확정 — 「판매계획 등록」에서 저장한(미확정) 칸을 줄째 골라 확정하거나 확정을 푼다(13주씩).
// 표는 등록과 같은 데이터를 글자로만 보이고, 품목 합계는 확정한 칸만 더한다.
// 주소 ?from= 은 쪽의 첫 주(이번 주에서 13주씩), ?customer= · ?item= 은 거르기, ?confirmed= · ?unconfirmed= 는 확정 · 확정 취소 뒤
// 바꾼 칸 수다.
export default function SalesPlanConfirmPage({ searchParams }: PageProps<"/sales/plans/confirm">) {
  return (
    <section>
      <p className="text-sm text-muted">
        <Link href="/sales" className="underline-offset-4 hover:underline">
          영업
        </Link>{" "}
        › 영업 계획 › 판매계획 확정
      </p>
      <h1 className="mt-1 text-3xl leading-tight font-semibold">판매계획 확정</h1>
      <p className="mt-1 max-w-3xl text-muted">
        줄을 골라 [확정]하면 그 칸이 MPS 수요가 됩니다. 확정한 칸은 [확정 취소]해야 「판매계획 등록」에서 고칠 수
        있습니다. 지난 주는 바꾸지 못합니다.
      </p>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <Confirm searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function Confirm({ searchParams }: Pick<PageProps<"/sales/plans/confirm">, "searchParams">) {
  const params = await searchParams;
  // 확정 · 확정 취소 뒤 주소에 실린 바꾼 칸 수의 알림.
  const notice = confirmNotice(params);
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
    }));
  } catch (error) {
    return <LoadFailed error={error} what="판매계획" />;
  }
  const { sheet, options } = data;
  const back = { from, customer: filter.customer ?? "", item: filter.item ?? "" };

  return (
    <>
      {notice && (
        <p role="status" className="mt-6 max-w-3xl border-l-4 border-safety bg-white px-5 py-3">
          {notice}
        </p>
      )}
      {/* 열 때마다 화면의 값을 새로 — 확정 뒤 같은 주소로 돌아와도 고른 줄 · 거절의 까닭이 남지 않게. */}
      <SalesPlanConfirmGrid key={randomUUID()} sheet={sheet} options={options} back={back} />
    </>
  );
}
