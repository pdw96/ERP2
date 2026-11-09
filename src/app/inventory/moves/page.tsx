import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { withDb } from "@/db/request";
import { listRecentMoves } from "@/db/stock";
import { MoveList } from "./move-list";

export const metadata: Metadata = { title: "수불 등록 — ERP2" };

// 재고 › 수불관리 › 수불 등록 — 최근 전표와 「새 수불 등록」. 거르기 · 기간으로 보는 것은 메뉴 「수불 이력」(PR D)이 든다.
export default function MovesPage() {
  return (
    <section className="max-w-5xl">
      <p className="text-sm text-muted">
        <Link href="/inventory" className="underline-offset-4 hover:underline">
          재고
        </Link>{" "}
        › 수불관리 › 수불 등록
      </p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl leading-tight font-semibold">수불 등록</h1>
          <p className="mt-1 text-muted">
            입고 · 출고 · 이동 · 조정을 전표로 남깁니다. 저장하면 바로 재고에 반영되고, 고치거나 지우지 않고 「취소」만
            합니다.
          </p>
        </div>
        <Link
          href="/inventory/moves/new"
          className="rounded bg-machine px-5 py-2.5 font-semibold text-white hover:bg-machine-deep"
        >
          새 수불 등록
        </Link>
      </div>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <Recent />
      </Suspense>
    </section>
  );
}

async function Recent() {
  await connection();
  let rows;
  try {
    rows = await withDb((db) => listRecentMoves(db, 20));
  } catch (error) {
    return <LoadFailed error={error} what="수불 전표" />;
  }
  return <MoveList rows={rows} />;
}
