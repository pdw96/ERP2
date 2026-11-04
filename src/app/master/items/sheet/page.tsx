import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { SheetGrid } from "@/components/sheet-grid";
import { unitOptions } from "@/db/items";
import { withDb } from "@/db/request";
import { itemSheetColumns } from "@/lib/sheet-columns";
import { saveItemSheetAction } from "../actions";

export const metadata: Metadata = { title: "품목 시트형 등록 — ERP2" };

// 기준정보 › 품목 › 시트형 등록(성공 기준 11) — 여러 품목을 시트에 넣거나 엑셀에서 붙여넣어 한 번에 등록한다.
export default function ItemSheetPage() {
  return (
    <section className="max-w-6xl">
      <p className="text-sm text-muted">
        <Link href="/master" className="underline-offset-4 hover:underline">
          기준정보
        </Link>{" "}
        ›{" "}
        <Link href="/master/items" className="underline-offset-4 hover:underline">
          품목
        </Link>{" "}
        › 시트형 등록
      </p>
      <h1 className="mt-1 text-3xl leading-tight font-semibold">품목 시트형 등록</h1>
      <p className="mt-1 text-muted">
        여러 품목을 한 번에 등록합니다. 맞는 줄은 저장되어 코드가 줄 차례로 붙고, 틀린 줄은 시트에 남습니다.
      </p>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <ItemSheet />
      </Suspense>
    </section>
  );
}

async function ItemSheet() {
  await connection();
  let units;
  try {
    units = await withDb((db) => unitOptions(db));
  } catch (error) {
    return <LoadFailed what="입력 화면" error={error} />;
  }
  return (
    <SheetGrid columns={itemSheetColumns(units)} action={saveItemSheetAction} what="품목" listHref="/master/items" />
  );
}
