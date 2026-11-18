import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { getProcess, listProcesses, parseProcessFilter } from "@/db/processes";
import { withDb } from "@/db/request";
import { PROCESS_CODE } from "@/lib/process-input";
import { ProcessList, ProcessSearch, SavedNotice } from "./process-list";

export const metadata: Metadata = { title: "공정 등록 — ERP2" };

// 생산 › 생산 기준정보 › 공정 등록 — 목록. 찾기는 주소에 남아 그대로 링크로 건넬 수 있다.
export default function ProcessesPage({ searchParams }: PageProps<"/production/processes">) {
  return (
    <section className="max-w-4xl">
      <p className="text-sm text-muted">
        <Link href="/production" className="underline-offset-4 hover:underline">
          생산
        </Link>{" "}
        › 생산 기준정보 › 공정 등록
      </p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl leading-tight font-semibold">공정 등록</h1>
          <p className="mt-1 text-muted">
            제품이 거치는 작업 단계. 코드는 영문 약어로 직접 넣습니다(예: DA 다이 본딩).
          </p>
        </div>
        <Link
          href="/production/processes/new"
          className="rounded bg-machine px-5 py-2.5 font-semibold text-white hover:bg-machine-deep"
        >
          새 공정 등록
        </Link>
      </div>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <Results searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function Results({ searchParams }: Pick<PageProps<"/production/processes">, "searchParams">) {
  const params = await searchParams;
  await connection();
  const { filter, notices } = parseProcessFilter(params);
  const savedCode = typeof params.saved === "string" && PROCESS_CODE.test(params.saved) ? params.saved : undefined;

  let data;
  try {
    data = await withDb(async (db) => ({
      rows: await listProcesses(db, filter),
      saved: savedCode ? await getProcess(db, savedCode) : undefined,
    }));
  } catch (error) {
    return <LoadFailed error={error} what="공정 목록" />;
  }

  return (
    <>
      {data.saved && <SavedNotice process={data.saved} shown={data.rows.some((r) => r.id === data.saved!.id)} />}
      <ProcessSearch filter={filter} notices={notices} />
      <ProcessList rows={data.rows} filter={filter} savedCode={data.saved?.code} />
    </>
  );
}
