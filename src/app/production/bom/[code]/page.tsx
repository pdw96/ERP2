import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { bomFormOptions, bomHistory, openBomSheet } from "@/db/boms";
import { withDb } from "@/db/request";
import { koreaToday } from "@/lib/today";
import { BomForm } from "../bom-form";
import { BomHistory } from "../bom-history";

export const metadata: Metadata = { title: "BOM 등록 — ERP2" };

// 생산 › 생산 기준정보 › BOM 등록 › 한 품목의 BOM(조각 「BOM」 PR A · C). 주소는 부모 품목코드다 — BOM 이 없으면 새 BOM 이 열린다.
// 반제품 줄을 펼쳐 그 BOM 을 함께 넣고(성공 기준 15), 아래에 그 품목의 고친 이력이 보인다(성공 기준 16 — 지운 BOM 의 이력도).
export default function BomEditPage({ params, searchParams }: PageProps<"/production/bom/[code]">) {
  return (
    <section>
      <p className="text-sm text-muted">
        <Link href="/production" className="underline-offset-4 hover:underline">
          생산
        </Link>{" "}
        › 생산 기준정보 ›{" "}
        <Link href="/production/bom" className="underline-offset-4 hover:underline">
          BOM 등록
        </Link>
      </p>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <Edit params={params} searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function Edit({ params, searchParams }: PageProps<"/production/bom/[code]">) {
  const { code } = await params;
  const savedParam = (await searchParams).saved;
  // 저장 뒤 주소에 실린 바뀐 BOM 수 — 숫자가 아니면 알림을 내지 않는다.
  const saved = typeof savedParam === "string" && /^[0-9]{1,2}$/.test(savedParam) ? Number(savedParam) : undefined;
  await connection();
  let data;
  try {
    data = await withDb(async (db) => ({
      opened: await openBomSheet(db, code),
      options: await bomFormOptions(db),
      history: await bomHistory(db, code),
    }));
  } catch (error) {
    return <LoadFailed error={error} what="BOM" />;
  }
  const { opened, options, history } = data;
  if (!opened.ok)
    return (
      <>
        <h1 className="mt-1 text-3xl leading-tight font-semibold">BOM 등록</h1>
        <p role="alert" className="mt-6 max-w-3xl border-l-4 border-red-700 bg-white px-5 py-3 font-semibold">
          <span className="font-mono">{code}</span> — {opened.message}
        </p>
        <p className="mt-4">
          <Link href="/production/bom" className="underline underline-offset-4">
            BOM 목록으로
          </Link>
        </p>
      </>
    );
  const { sheet } = opened;
  return (
    <>
      <h1 className="mt-1 text-3xl leading-tight font-semibold">
        <span className="font-mono">{sheet.parent.code}</span> {sheet.parent.name}
      </h1>
      <p className="mt-1 text-muted">
        {sheet.version ? "BOM" : "새 BOM"} · {sheet.parent.spec || "규격 없음"} · 단위{" "}
        <span className="font-mono">{sheet.parent.unit}</span>
        {!sheet.parent.active && " · 사용 안 함"}
      </p>
      {saved !== undefined && sheet.version && (
        <p role="status" className="mt-6 max-w-3xl border-l-4 border-safety bg-white px-5 py-3">
          {saved === 0
            ? "바뀐 것이 없어 그대로 두었습니다."
            : `저장했습니다 — 바뀐 BOM ${saved}개${saved > 1 ? "(펼친 반제품 BOM 포함)" : ""}, 이 BOM 의 자품목 ${sheet.lines.length}줄.`}
        </p>
      )}
      {/* 열 때마다 화면의 값을 새로 — 펼친 반제품만 고친 저장은 이 BOM 의 버전이 그대로라 버전을 열쇠로 쓰지 못한다. */}
      <BomForm key={randomUUID()} sheet={sheet} childOptions={options.children} today={koreaToday()} />
      <BomHistory history={history} unit={sheet.parent.unit} />
    </>
  );
}
