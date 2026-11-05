import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { SheetGrid } from "@/components/sheet-grid";
import { SheetLoadFilters } from "@/components/sheet-load-filters";
import { PARTNER_ROLES, allCountries } from "@/db/partners";
import { withDb } from "@/db/request";
import { PARTNER_SHEET_ERROR_LABELS, partnerSheetColumns } from "@/lib/sheet-columns";
import { loadPartnerSheetAction, savePartnerSheetAction } from "../actions";

export const metadata: Metadata = { title: "거래처 시트형 등록 — ERP2" };

// 기준정보 › 거래처 등록 › 시트형 등록(성공 기준 11 · 15) — 여러 거래처를 시트에 넣거나 엑셀에서 붙여넣어 한 번에 등록하고,
// 기존 거래처를 불러와 한 번에 고친다(PR J).
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
        여러 거래처를 한 번에 등록하거나 고칩니다. 맞는 줄은 저장되어 새 줄에는 코드가 줄 차례로 붙고, 틀린 줄은 시트에
        남습니다.
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
    countries = await withDb((db) => allCountries(db));
  } catch (error) {
    return <LoadFailed what="입력 화면" error={error} />;
  }
  return (
    <SheetGrid
      columns={partnerSheetColumns(countries.filter((c) => c.active))}
      errorLabels={PARTNER_SHEET_ERROR_LABELS}
      action={savePartnerSheetAction}
      what="거래처"
      listHref="/master/partners"
      load={{
        action: loadPartnerSheetAction,
        filters: (
          <SheetLoadFilters
            placeholder="코드 · 거래처명"
            selects={[
              { name: "role", label: "구분", options: PARTNER_ROLES },
              { name: "country", label: "국가", options: countries },
            ]}
          />
        ),
      }}
    />
  );
}
