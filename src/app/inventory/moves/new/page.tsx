import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { withDb } from "@/db/request";
import { moveFormOptions } from "@/db/stock";
import { koreaToday } from "@/lib/today";
import { MoveForm } from "../move-form";

export const metadata: Metadata = { title: "새 수불 등록 — ERP2" };

export default function NewMovePage() {
  return (
    <section>
      <p className="text-sm text-muted">
        <Link href="/inventory" className="underline-offset-4 hover:underline">
          재고
        </Link>{" "}
        › 수불관리 ›{" "}
        <Link href="/inventory/moves" className="underline-offset-4 hover:underline">
          수불 등록
        </Link>{" "}
        › 새 전표
      </p>
      <h1 className="mt-1 text-3xl leading-tight font-semibold">새 수불 등록</h1>
      <p className="mt-1 text-muted">전표 번호는 저장할 때 일자의 다음 번호로 붙습니다 — IV-YYYYMMDD-NNN.</p>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <NewMove />
      </Suspense>
    </section>
  );
}

async function NewMove() {
  await connection();
  let options;
  try {
    options = await withDb(moveFormOptions);
  } catch (error) {
    return <LoadFailed what="입력 화면" error={error} />;
  }
  return <MoveForm options={options} today={koreaToday()} />;
}
