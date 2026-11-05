import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import {
  countryNames,
  getPartner,
  listPartners,
  parsePartnerFilter,
  partnersSharingBizNo,
  PARTNER_CODE,
} from "@/db/partners";
import { withDb } from "@/db/request";
import { PartnerList, PartnerSearch, SavedNotice } from "./partner-list";

export const metadata: Metadata = { title: "거래처 등록 — ERP2" };

// 기준정보 › 거래처 등록 — 고칠 거래처를 찾는 목록과 한 건 · 시트형 등록의 입구. 모든 칸은 「거래처 조회」가 보인다(ADR 0013).
// 찾기 · 거르기는 주소에 남아 그대로 링크로 건넬 수 있다.
export default function PartnersPage({ searchParams }: PageProps<"/master/partners">) {
  return (
    <section className="max-w-5xl">
      <p className="text-sm text-muted">
        <Link href="/master" className="underline-offset-4 hover:underline">
          기준정보
        </Link>{" "}
        › 거래처 등록
      </p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl leading-tight font-semibold">거래처 등록</h1>
          <p className="mt-1 text-muted">
            매입처 · 매출처. 한 거래처가 둘 다일 수 있습니다. 모든 열은{" "}
            <Link href="/master/partners/inquiry" className="underline underline-offset-4 hover:text-ink">
              거래처 조회
            </Link>
            에서 봅니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/master/partners/sheet"
            className="rounded border border-machine bg-white px-5 py-2.5 font-semibold hover:bg-floor"
          >
            시트형 등록
          </Link>
          <Link
            href="/master/partners/new"
            className="rounded bg-machine px-5 py-2.5 font-semibold text-white hover:bg-machine-deep"
          >
            새 거래처 등록
          </Link>
        </div>
      </div>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <Results searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function Results({ searchParams }: Pick<PageProps<"/master/partners">, "searchParams">) {
  const params = await searchParams;
  await connection();
  const { filter, notices } = parsePartnerFilter(params);
  const savedCode = typeof params.saved === "string" && PARTNER_CODE.test(params.saved) ? params.saved : undefined;

  let data;
  try {
    data = await withDb(async (db) => {
      const saved = savedCode ? await getPartner(db, savedCode) : undefined;
      return {
        rows: await listPartners(db, filter),
        countries: await countryNames(db),
        saved,
        sharedBizNo: saved ? await partnersSharingBizNo(db, saved) : [],
      };
    });
  } catch (error) {
    return <LoadFailed error={error} what="거래처 목록" />;
  }

  return (
    <>
      {data.saved && (
        <SavedNotice
          partner={data.saved}
          shown={data.rows.some((r) => r.id === data.saved!.id)}
          sharedBizNo={data.sharedBizNo}
        />
      )}
      <PartnerSearch filter={filter} notices={notices} />
      <PartnerList countries={data.countries} rows={data.rows} filter={filter} savedCode={data.saved?.code} />
    </>
  );
}
