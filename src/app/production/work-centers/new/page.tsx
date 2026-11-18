import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { withDb } from "@/db/request";
import { listProcessOptions } from "@/db/work-centers";
import { createWorkCenterAction } from "../actions";
import { WorkCenterForm } from "../work-center-form";

export const metadata: Metadata = { title: "새 작업장 등록 — ERP2" };

export default function NewWorkCenterPage() {
  return (
    <section>
      <p className="text-sm text-muted">
        <Link href="/production" className="underline-offset-4 hover:underline">
          생산
        </Link>{" "}
        › 생산 기준정보 ›{" "}
        <Link href="/production/work-centers" className="underline-offset-4 hover:underline">
          작업장 등록
        </Link>{" "}
        › 새 작업장
      </p>
      <h1 className="mt-1 text-3xl leading-tight font-semibold">새 작업장 등록</h1>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <NewWorkCenter />
      </Suspense>
    </section>
  );
}

// 공정 고르기에 쓸 공정 목록을 읽어 넘긴다.
async function NewWorkCenter() {
  await connection();
  let processes;
  try {
    processes = await withDb((db) => listProcessOptions(db));
  } catch (error) {
    return <LoadFailed what="공정 목록" error={error} />;
  }
  return <WorkCenterForm mode="create" action={createWorkCenterAction} initial={{}} processes={processes} />;
}
