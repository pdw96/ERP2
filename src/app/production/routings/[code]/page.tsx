import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { openRouting, routingFormOptions, routingHistory } from "@/db/routings";
import { withDb } from "@/db/request";
import { itemTypeName } from "@/lib/master-codes";
import { RoutingForm } from "../routing-form";
import { RoutingHistory } from "../routing-history";

export const metadata: Metadata = { title: "라우팅 — ERP2" };

// 생산 › 생산 기준정보 › 라우팅 › 한 품목의 라우팅(메뉴 「라우팅」). 주소는 반제품 · 완제품의 품목코드다 — 라우팅이 없으면 새 라우팅이 열린다.
// 공정 줄과 투입 자재를 고쳐 저장하고, 아래에 그 품목의 고친 이력이 보인다(지운 라우팅의 이력도).
export default function RoutingEditPage({ params, searchParams }: PageProps<"/production/routings/[code]">) {
  return (
    <section>
      <p className="text-sm text-muted">
        <Link href="/production" className="underline-offset-4 hover:underline">
          생산
        </Link>{" "}
        › 생산 기준정보 ›{" "}
        <Link href="/production/routings" className="underline-offset-4 hover:underline">
          라우팅
        </Link>
      </p>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <Edit params={params} searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function Edit({ params, searchParams }: PageProps<"/production/routings/[code]">) {
  const { code } = await params;
  const savedParam = (await searchParams).saved;
  // 저장 뒤 주소에 실린 남긴 이력 줄 수 — 0 이면 바뀐 것이 없었다. 숫자가 아니면 알림을 내지 않는다.
  const saved = typeof savedParam === "string" && /^[0-9]{1,4}$/.test(savedParam) ? Number(savedParam) : undefined;
  await connection();
  let data;
  try {
    data = await withDb(async (db) => ({
      opened: await openRouting(db, code),
      options: await routingFormOptions(db),
      history: await routingHistory(db, code),
    }));
  } catch (error) {
    return <LoadFailed error={error} what="라우팅" />;
  }
  const { opened, options, history } = data;
  if (!opened.ok)
    return (
      <>
        <h1 className="mt-1 text-3xl leading-tight font-semibold">라우팅</h1>
        <p role="alert" className="mt-6 max-w-3xl border-l-4 border-red-700 bg-white px-5 py-3 font-semibold">
          <span className="font-mono">{code}</span> — {opened.message}
        </p>
        <p className="mt-4">
          <Link href="/production/routings" className="underline underline-offset-4">
            라우팅 목록으로
          </Link>
        </p>
      </>
    );
  const { sheet } = opened;
  return (
    <>
      <h1 className="mt-1 text-3xl leading-tight font-semibold">
        <span className="font-mono">{sheet.item.code}</span> {sheet.item.name}
      </h1>
      <p className="mt-1 text-muted">
        {sheet.version ? "라우팅" : "새 라우팅"} · {sheet.item.spec || "규격 없음"} ·{" "}
        {itemTypeName(sheet.item.itemType)}
        {!sheet.item.active && " · 사용 안 함"}
      </p>
      {saved !== undefined && sheet.version && (
        <p role="status" className="mt-6 max-w-3xl border-l-4 border-safety bg-white px-5 py-3">
          {saved === 0 ? "바뀐 것이 없어 그대로 두었습니다." : `저장했습니다 — 공정 ${sheet.steps.length}줄.`}
        </p>
      )}
      {/* 열 때마다 화면의 값을 새로 — 바뀐 것 없는 저장은 버전이 그대로라 버전을 열쇠로 쓰지 못한다. */}
      <RoutingForm key={randomUUID()} sheet={sheet} processes={options.processes} />
      <RoutingHistory history={history} />
    </>
  );
}
