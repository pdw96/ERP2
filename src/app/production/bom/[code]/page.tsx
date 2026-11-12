import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { bomFormOptions, openBomSheet } from "@/db/boms";
import { withDb } from "@/db/request";
import { koreaToday } from "@/lib/today";
import { BomForm } from "../bom-form";

export const metadata: Metadata = { title: "BOM 등록 — ERP2" };

// 생산 › 생산 기준정보 › BOM 등록 › 한 품목의 BOM(조각 「BOM」 PR A). 주소는 부모 품목코드다 — BOM 이 없으면 새 BOM 이 열린다.
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
  const saved = (await searchParams).saved === "1";
  await connection();
  let data;
  try {
    data = await withDb(async (db) => ({ opened: await openBomSheet(db, code), options: await bomFormOptions(db) }));
  } catch (error) {
    return <LoadFailed error={error} what="BOM" />;
  }
  const { opened, options } = data;
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
      {saved && sheet.version && (
        <p role="status" className="mt-6 max-w-3xl border-l-4 border-safety bg-white px-5 py-3">
          저장했습니다 — 자품목 {sheet.lines.length}줄.
        </p>
      )}
      <BomForm key={sheet.version ?? "new"} sheet={sheet} childOptions={options.children} today={koreaToday()} />
    </>
  );
}
