import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { getProcess } from "@/db/processes";
import { withDb } from "@/db/request";
import { updateProcessAction } from "../actions";
import { ProcessForm } from "../process-form";

export const metadata: Metadata = { title: "공정 수정 — ERP2" };

// 생산 › 생산 기준정보 › 공정 등록 › 한 공정의 수정. 주소는 공정 코드다 — 코드는 바뀌지 않는다.
export default function EditProcessPage({ params }: PageProps<"/production/processes/[code]">) {
  return (
    <section>
      <p className="text-sm text-muted">
        <Link href="/production" className="underline-offset-4 hover:underline">
          생산
        </Link>{" "}
        › 생산 기준정보 ›{" "}
        <Link href="/production/processes" className="underline-offset-4 hover:underline">
          공정 등록
        </Link>{" "}
        › 수정
      </p>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <EditProcess params={params} />
      </Suspense>
    </section>
  );
}

async function EditProcess({ params }: Pick<PageProps<"/production/processes/[code]">, "params">) {
  const { code } = await params;
  await connection();
  // 퍼센트 부호가 깨진 주소(%E0 등)는 DB 를 부르기 전에 없는 공정으로 본다 — 불러오기 실패 화면이 아니다.
  let decoded: string;
  try {
    decoded = decodeURIComponent(code);
  } catch (error) {
    if (error instanceof URIError) notFound();
    throw error;
  }
  let process;
  try {
    // 꼴이 틀린 코드는 getProcess 가 없는 공정으로 돌려준다.
    process = await withDb((db) => getProcess(db, decoded));
  } catch (error) {
    return <LoadFailed what="공정" error={error} />;
  }
  if (!process) notFound();
  return (
    <>
      <h1 className="mt-1 text-3xl leading-tight font-semibold wrap-anywhere">
        <span className="font-mono">{process.code}</span> {process.name}
      </h1>
      <ProcessForm
        mode="edit"
        code={process.code}
        version={process.version}
        action={updateProcessAction.bind(null, process.code)}
        initial={{ name: process.name, note: process.note, active: process.active ? "Y" : "N" }}
      />
    </>
  );
}
