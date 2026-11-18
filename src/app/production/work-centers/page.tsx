import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { withDb } from "@/db/request";
import { getWorkCenter, listProcessOptions, listWorkCenters, parseWorkCenterFilter } from "@/db/work-centers";
import { WORK_CENTER_CODE } from "@/lib/work-center-input";
import { SavedNotice, WorkCenterList, WorkCenterSearch } from "./work-center-list";

export const metadata: Metadata = { title: "작업장 등록 — ERP2" };

// 생산 › 생산 기준정보 › 작업장 등록 — 목록. 찾기는 주소에 남아 그대로 링크로 건넬 수 있다.
export default function WorkCentersPage({ searchParams }: PageProps<"/production/work-centers">) {
  return (
    <section className="max-w-4xl">
      <p className="text-sm text-muted">
        <Link href="/production" className="underline-offset-4 hover:underline">
          생산
        </Link>{" "}
        › 생산 기준정보 › 작업장 등록
      </p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl leading-tight font-semibold">작업장 등록</h1>
          <p className="mt-1 text-muted">
            같은 공정을 하는 설비 · 라인의 묶음. 작업장 하나는 공정 하나를 합니다(예: DA-1 다이 본딩 1라인).
          </p>
        </div>
        <Link
          href="/production/work-centers/new"
          className="rounded bg-machine px-5 py-2.5 font-semibold text-white hover:bg-machine-deep"
        >
          새 작업장 등록
        </Link>
      </div>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <Results searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function Results({ searchParams }: Pick<PageProps<"/production/work-centers">, "searchParams">) {
  const params = await searchParams;
  await connection();
  const { filter, notices } = parseWorkCenterFilter(params);
  const savedCode = typeof params.saved === "string" && WORK_CENTER_CODE.test(params.saved) ? params.saved : undefined;

  let data;
  try {
    data = await withDb(async (db) => ({
      rows: await listWorkCenters(db, filter),
      processes: await listProcessOptions(db),
      saved: savedCode ? await getWorkCenter(db, savedCode) : undefined,
    }));
  } catch (error) {
    return <LoadFailed error={error} what="작업장 목록" />;
  }

  return (
    <>
      {data.saved && <SavedNotice workCenter={data.saved} shown={data.rows.some((r) => r.id === data.saved!.id)} />}
      <WorkCenterSearch filter={filter} notices={notices} processes={data.processes} />
      <WorkCenterList rows={data.rows} filter={filter} savedCode={data.saved?.code} />
    </>
  );
}
