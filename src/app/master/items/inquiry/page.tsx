import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { allItemClasses, listItems, parseItemFilter } from "@/db/items";
import { withDb } from "@/db/request";
import { InquiryTable } from "@/components/inquiry-table";
import { LoadFailed } from "@/components/load-failed";
import { ItemSearch, narrowed } from "../item-list";
import { itemInquiryColumns } from "./item-inquiry";

export const metadata: Metadata = { title: "품목 조회 — ERP2" };

// 기준정보 › 품목 조회(성공 기준 14, ADR 0013) — 모든 칸을 넓은 표로 보는, 고칠 수 없는 화면.
// 찾기는 글 칸 전체(코드 · 품명 · 규격 · 비고)를 보고, 거르기는 품목 등록과 같다. 코드를 누르면 품목 등록의 수정 화면으로 간다.
export default function ItemInquiryPage({ searchParams }: PageProps<"/master/items/inquiry">) {
  return (
    <section>
      <p className="text-sm text-muted">
        <Link href="/master" className="underline-offset-4 hover:underline">
          기준정보
        </Link>{" "}
        › 품목 조회
      </p>
      <h1 className="mt-1 text-3xl leading-tight font-semibold">품목 조회</h1>
      <p className="mt-1 max-w-3xl text-muted">
        품목의 모든 칸을 봅니다. 여기서는 고치지 않습니다 — 코드를 누르면{" "}
        <Link href="/master/items" className="underline underline-offset-4 hover:text-ink">
          품목 등록
        </Link>
        의 수정 화면으로 갑니다.
      </p>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <Results searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function Results({ searchParams }: Pick<PageProps<"/master/items/inquiry">, "searchParams">) {
  const params = await searchParams;
  await connection();

  // 분류의 거르기는 공통코드에 있는 값만 받으므로 분류 값을 먼저 읽는다.
  let data;
  try {
    data = await withDb(async (db) => {
      const classes = await allItemClasses(db);
      const { filter, notices } = parseItemFilter(params, classes);
      return { classes, filter, notices, rows: await listItems(db, filter, "allText") };
    });
  } catch (error) {
    return <LoadFailed error={error} what="품목 조회" />;
  }
  const { filter, notices, classes } = data;

  return (
    <>
      <div className="max-w-6xl">
        <ItemSearch
          filter={filter}
          notices={notices}
          classes={classes}
          action="/master/items/inquiry"
          scope="allText"
        />
      </div>
      <InquiryTable
        rows={data.rows}
        columns={itemInquiryColumns(classes)}
        what="품목"
        nameLabel="품명"
        editHref={(code) => `/master/items/${code}`}
        includeInactive={filter.includeInactive}
        narrowed={narrowed(filter)}
      />
    </>
  );
}
