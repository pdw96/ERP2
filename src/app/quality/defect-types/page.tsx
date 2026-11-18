import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import {
  dropUnknownFilters,
  getDefectType,
  listClsOptions,
  listDefectTypes,
  parseDefectTypeFilter,
} from "@/db/defect-types";
import { withDb } from "@/db/request";
import { listProcessOptions } from "@/db/processes";
import { DEFECT_TYPE_CODE } from "@/lib/defect-type-input";
import { DefectTypeList, DefectTypeSearch, SavedNotice } from "./defect-type-list";

export const metadata: Metadata = { title: "불량 유형 — ERP2" };

// 품질 › 품질 기준정보 › 불량 유형 — 목록. 찾기는 주소에 남아 그대로 링크로 건넬 수 있다.
export default function DefectTypesPage({ searchParams }: PageProps<"/quality/defect-types">) {
  return (
    <section className="max-w-4xl">
      <p className="text-sm text-muted">
        <Link href="/quality" className="underline-offset-4 hover:underline">
          품질
        </Link>{" "}
        › 품질 기준정보 › 불량 유형
      </p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl leading-tight font-semibold">불량 유형</h1>
          <p className="mt-1 text-muted">
            검사에서 찾는 불량의 종류. 대분류로 묶고, 어느 공정에서 나는지 붙입니다(비우면 공통 불량).
          </p>
        </div>
        <Link
          href="/quality/defect-types/new"
          className="rounded bg-machine px-5 py-2.5 font-semibold text-white hover:bg-machine-deep"
        >
          새 불량 유형 등록
        </Link>
      </div>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <Results searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function Results({ searchParams }: Pick<PageProps<"/quality/defect-types">, "searchParams">) {
  const params = await searchParams;
  await connection();
  const parsed = parseDefectTypeFilter(params);
  const savedCode = typeof params.saved === "string" && DEFECT_TYPE_CODE.test(params.saved) ? params.saved : undefined;

  let loaded;
  try {
    // 한 번의 연결에서 — 대분류 · 공정 목록을 먼저 읽어 없는 값의 거르기를 풀고, 그 거르기로 목록을 한 번만 읽는다.
    loaded = await withDb(async (db) => {
      const [classes, processes] = await Promise.all([listClsOptions(db), listProcessOptions(db)]);
      const { filter, notices } = dropUnknownFilters(parsed.filter, parsed.notices, { classes, processes });
      const [rows, saved] = await Promise.all([
        listDefectTypes(db, filter),
        savedCode ? getDefectType(db, savedCode) : undefined,
      ]);
      return { rows, classes, processes, saved, filter, notices };
    });
  } catch (error) {
    return <LoadFailed error={error} what="불량 유형 목록" />;
  }

  const { rows, classes, processes, saved, filter, notices } = loaded;
  return (
    <>
      {saved && <SavedNotice defectType={saved} shown={rows.some((r) => r.id === saved.id)} />}
      <DefectTypeSearch filter={filter} notices={notices} classes={classes} processes={processes} />
      <DefectTypeList rows={rows} filter={filter} savedCode={saved?.code} />
    </>
  );
}
