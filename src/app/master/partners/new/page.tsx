import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { countryOptions, previewPartnerCode } from "@/db/partners";
import { withDb } from "@/db/request";
import { createPartnerAction } from "../actions";
import { PartnerForm } from "../partner-form";

export const metadata: Metadata = { title: "새 거래처 등록 — ERP2" };

export default function NewPartnerPage() {
  return (
    <section>
      <p className="text-sm text-muted">
        <Link href="/master" className="underline-offset-4 hover:underline">
          기준정보
        </Link>{" "}
        ›{" "}
        <Link href="/master/partners" className="underline-offset-4 hover:underline">
          거래처
        </Link>{" "}
        › 새 거래처
      </p>
      <h1 className="mt-1 text-3xl leading-tight font-semibold">새 거래처 등록</h1>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <NewPartnerForm />
      </Suspense>
    </section>
  );
}

async function NewPartnerForm() {
  await connection();
  let data;
  try {
    data = await withDb(async (db) => ({
      previewCode: await previewPartnerCode(db),
      countries: await countryOptions(db),
    }));
  } catch (error) {
    return <LoadFailed what="입력 화면" error={error} />;
  }
  return (
    <PartnerForm
      mode="create"
      action={createPartnerAction}
      previewCode={data.previewCode}
      countries={data.countries}
      initial={{ name: "", country: "KR", bizNo: "", foreignBizNo: "" }}
    />
  );
}
