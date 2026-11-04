import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { allItemClasses, getItem, listItems, parseItemFilter, ITEM_CODE } from "@/db/items";
import { withDb } from "@/db/request";
import { LoadFailed } from "@/components/load-failed";
import { ItemList, ItemSearch, SavedNotice } from "./item-list";

export const metadata: Metadata = { title: "품목 등록 — ERP2" };

// 기준정보 › 품목 등록 — 고칠 품목을 찾는 목록과 한 건 · 시트형 등록의 입구. 모든 칸은 「품목 조회」가 보인다(ADR 0013).
// 찾기 · 거르기는 주소에 남아 그대로 링크로 건넬 수 있다.
export default function ItemsPage({ searchParams }: PageProps<"/master/items">) {
  return (
    <section className="max-w-6xl">
      <p className="text-sm text-muted">
        <Link href="/master" className="underline-offset-4 hover:underline">
          기준정보
        </Link>{" "}
        › 품목 등록
      </p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl leading-tight font-semibold">품목 등록</h1>
          <p className="mt-1 text-muted">
            원자재 · 반제품 · 완제품. 코드는 등록할 때 유형에 따라 붙습니다. 모든 칸은{" "}
            <Link href="/master/items/inquiry" className="underline underline-offset-4 hover:text-ink">
              품목 조회
            </Link>
            에서 봅니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/master/items/sheet"
            className="rounded border border-machine bg-white px-5 py-2.5 font-semibold hover:bg-floor"
          >
            시트형 등록
          </Link>
          <Link
            href="/master/items/new"
            className="rounded bg-machine px-5 py-2.5 font-semibold text-white hover:bg-machine-deep"
          >
            새 품목 등록
          </Link>
        </div>
      </div>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <Results searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function Results({ searchParams }: Pick<PageProps<"/master/items">, "searchParams">) {
  const params = await searchParams;
  await connection();
  const savedCode = typeof params.saved === "string" && ITEM_CODE.test(params.saved) ? params.saved : undefined;

  // 분류의 거르기는 공통코드에 있는 값만 받으므로 분류 값을 먼저 읽는다.
  let data;
  try {
    data = await withDb(async (db) => {
      const classes = await allItemClasses(db);
      const { filter, notices } = parseItemFilter(params, classes);
      return {
        classes,
        filter,
        notices,
        rows: await listItems(db, filter),
        saved: savedCode ? await getItem(db, savedCode) : undefined,
      };
    });
  } catch (error) {
    return <LoadFailed error={error} what="품목 목록" />;
  }
  const { filter, notices, classes } = data;

  return (
    <>
      {data.saved && <SavedNotice item={data.saved} shown={data.rows.some((r) => r.id === data.saved!.id)} />}
      <ItemSearch filter={filter} notices={notices} classes={classes} />
      <ItemList rows={data.rows} filter={filter} savedCode={data.saved?.code} />
    </>
  );
}
