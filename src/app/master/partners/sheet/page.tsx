import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { SheetGrid } from "@/components/sheet-grid";
import { countryOptions } from "@/db/partners";
import { withDb } from "@/db/request";
import { PARTNER_SHEET_ERROR_LABELS, partnerSheetColumns } from "@/lib/sheet-columns";
import { savePartnerSheetAction } from "../actions";

export const metadata: Metadata = { title: "거래처 시트형 등록 — ERP2" };

// 기준정보 › 거래처 등록 › 시트형 등록(성공 기준 11) — 여러 거래처를 시트에 넣거나 엑셀에서 붙여넣어 한 번에 등록한다.
export default function PartnerSheetPage() {
  return (
    <section className="max-w-6xl">
      <p className="text-sm text-muted">
        <Link href="/master" className="underline-offset-4 hover:underline">
          기준정보
        </Link>{" "}
        ›{" "}
        <Link href="/master/partners" className="underline-offset-4 hover:underline">
          거래처 등록
        </Link>{" "}
        › 시트형 등록
      </p>
      <h1 className="mt-1 text-3xl leading-tight font-semibold">거래처 시트형 등록</h1>
      <p className="mt-1 text-muted">
        여러 거래처를 한 번에 등록합니다. 맞는 줄은 저장되어 코드가 줄 차례로 붙고, 틀린 줄은 시트에 남습니다.
      </p>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <PartnerSheet />
      </Suspense>
    </section>
  );
}

async function PartnerSheet() {
  await connection();
  let countries;
  try {
    countries = await withDb((db) => countryOptions(db));
  } catch (error) {
    return <LoadFailed what="입력 화면" error={error} />;
  }
  return (
    <SheetGrid
      columns={partnerSheetColumns(countries)}
      errorLabels={PARTNER_SHEET_ERROR_LABELS}
      action={savePartnerSheetAction}
      what="거래처"
      listHref="/master/partners"
    />
  );
}
