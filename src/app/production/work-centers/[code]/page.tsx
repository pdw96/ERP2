import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { withDb } from "@/db/request";
import { getWorkCenter } from "@/db/work-centers";
import { WORK_CENTER_CODE } from "@/lib/work-center-input";
import { updateWorkCenterAction } from "../actions";
import { WorkCenterForm } from "../work-center-form";

export const metadata: Metadata = { title: "작업장 수정 — ERP2" };

// 생산 › 생산 기준정보 › 작업장 등록 › 한 작업장의 수정. 주소는 작업장 코드다 — 코드는 바뀌지 않는다.
export default function EditWorkCenterPage({ params }: PageProps<"/production/work-centers/[code]">) {
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
        › 수정
      </p>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <EditWorkCenter params={params} />
      </Suspense>
    </section>
  );
}

async function EditWorkCenter({ params }: Pick<PageProps<"/production/work-centers/[code]">, "params">) {
  const { code } = await params;
  await connection();
  // 퍼센트 부호가 깨진 주소(%E0 등)는 DB 를 부르기 전에 없는 작업장으로 본다 — 불러오기 실패 화면이 아니다.
  let decoded: string;
  try {
    decoded = decodeURIComponent(code);
  } catch (error) {
    if (error instanceof URIError) notFound();
    throw error;
  }
  // 꼴이 틀린 코드는 DB 를 부르기 전에 없는 작업장으로 본다.
  if (!WORK_CENTER_CODE.test(decoded)) notFound();
  let workCenter;
  try {
    workCenter = await withDb((db) => getWorkCenter(db, decoded));
  } catch (error) {
    return <LoadFailed what="작업장" error={error} />;
  }
  if (!workCenter) notFound();
  return (
    <>
      <h1 className="mt-1 text-3xl leading-tight font-semibold wrap-anywhere">
        <span className="font-mono">{workCenter.code}</span> {workCenter.name}
      </h1>
      <WorkCenterForm
        mode="edit"
        code={workCenter.code}
        process={{ code: workCenter.processCode, name: workCenter.processName }}
        version={workCenter.version}
        action={updateWorkCenterAction.bind(null, workCenter.code)}
        initial={{ name: workCenter.name, note: workCenter.note, active: workCenter.active ? "Y" : "N" }}
      />
    </>
  );
}
