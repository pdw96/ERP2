import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { listClsOptions } from "@/db/defect-types";
import { withDb } from "@/db/request";
import { listProcessOptions } from "@/db/work-centers";
import { createDefectTypeAction } from "../actions";
import { DefectTypeForm } from "../defect-type-form";

export const metadata: Metadata = { title: "새 불량 유형 등록 — ERP2" };

export default function NewDefectTypePage() {
  return (
    <section>
      <p className="text-sm text-muted">
        <Link href="/quality" className="underline-offset-4 hover:underline">
          품질
        </Link>{" "}
        › 품질 기준정보 ›{" "}
        <Link href="/quality/defect-types" className="underline-offset-4 hover:underline">
          불량 유형
        </Link>{" "}
        › 새 불량 유형
      </p>
      <h1 className="mt-1 text-3xl leading-tight font-semibold">새 불량 유형 등록</h1>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <NewDefectType />
      </Suspense>
    </section>
  );
}

// 대분류 · 발생 공정 고르기에 쓸 목록을 읽어 넘긴다.
async function NewDefectType() {
  await connection();
  let options;
  try {
    options = await withDb(async (db) => ({
      classes: await listClsOptions(db),
      processes: await listProcessOptions(db),
    }));
  } catch (error) {
    return <LoadFailed what="대분류 · 공정 목록" error={error} />;
  }
  return <DefectTypeForm mode="create" action={createDefectTypeAction} initial={{}} {...options} />;
}
