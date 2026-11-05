import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { allCountries, listPartners, parsePartnerFilter } from "@/db/partners";
import { withDb } from "@/db/request";
import { InquiryTable } from "@/components/inquiry-table";
import { LoadFailed } from "@/components/load-failed";
import { PartnerSearch, narrowed } from "../partner-list";
import { partnerInquiryColumns } from "./partner-inquiry";

export const metadata: Metadata = { title: "거래처 조회 — ERP2" };

// 기준정보 › 거래처 조회(성공 기준 14, ADR 0013) — 모든 칸을 넓은 표로 보는, 고칠 수 없는 화면.
// 찾기는 글 칸 전체를 보고, 거르기는 거래처 등록의 구분에 국가를 더한다. 코드를 누르면 거래처 등록의 수정 화면으로 간다.
export default function PartnerInquiryPage({ searchParams }: PageProps<"/master/partners/inquiry">) {
  return (
    <section>
      <p className="text-sm text-muted">
        <Link href="/master" className="underline-offset-4 hover:underline">
          기준정보
        </Link>{" "}
        › 거래처 조회
      </p>
      <h1 className="mt-1 text-3xl leading-tight font-semibold">거래처 조회</h1>
      <p className="mt-1 max-w-3xl text-muted">
        거래처의 모든 열을 봅니다. 여기서는 고치지 않습니다 — 코드를 누르면{" "}
        <Link href="/master/partners" className="underline underline-offset-4 hover:text-ink">
          거래처 등록
        </Link>
        의 수정 화면으로 갑니다.
      </p>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <Results searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function Results({ searchParams }: Pick<PageProps<"/master/partners/inquiry">, "searchParams">) {
  const params = await searchParams;
  await connection();

  // 국가의 거르기는 공통코드에 있는 값만 받으므로 국가를 먼저 읽는다.
  let data;
  try {
    data = await withDb(async (db) => {
      const countries = await allCountries(db);
      const { filter, notices } = parsePartnerFilter(params, countries);
      return { countries, filter, notices, rows: await listPartners(db, filter, "allText") };
    });
  } catch (error) {
    return <LoadFailed error={error} what="거래처 조회" />;
  }
  const { filter, notices, countries } = data;

  return (
    <>
      <div className="max-w-5xl">
        <PartnerSearch
          filter={filter}
          notices={notices}
          action="/master/partners/inquiry"
          scope="allText"
          countries={countries}
        />
      </div>
      <InquiryTable
        rows={data.rows}
        columns={partnerInquiryColumns(countries)}
        what="거래처"
        nameLabel="거래처명"
        editHref={(code) => `/master/partners/${code}`}
        includeInactive={filter.includeInactive}
        narrowed={narrowed(filter)}
      />
    </>
  );
}
