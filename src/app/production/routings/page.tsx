import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import {
  dropUnknownRoutingFilter,
  listRoutings,
  parseRoutingFilter,
  routingFilterOptions,
  routingFormOptions,
} from "@/db/routings";
import { withDb } from "@/db/request";
import { ITEM_CODE } from "@/lib/bom-input";
import { itemTypeName } from "@/lib/master-codes";
import { RoutingList, RoutingSearch } from "./routing-list";

export const metadata: Metadata = { title: "라우팅 — ERP2" };

// 생산 › 생산 기준정보 › 라우팅 — 라우팅이 있는 반제품 · 완제품의 목록과 새 라우팅의 입구(주소 ?item= 로 옮겨 간다).
export default function RoutingsPage({ searchParams }: PageProps<"/production/routings">) {
  return (
    <section className="max-w-6xl">
      <p className="text-sm text-muted">
        <Link href="/production" className="underline-offset-4 hover:underline">
          생산
        </Link>{" "}
        › 생산 기준정보 › 라우팅
      </p>
      <h1 className="mt-1 text-3xl leading-tight font-semibold">라우팅</h1>
      <p className="mt-1 max-w-3xl text-muted">
        반제품 · 완제품을 만드는 공정의 순서와 작업장입니다. 준비시간은 작업지시마다 한 번, 개당 작업시간은 한 개당
        초입니다. 투입 자재는 붙인 공정에서 출고하고, 붙이지 않은 자재는 첫 공정에서 출고합니다.
      </p>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <Results searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function Results({ searchParams }: Pick<PageProps<"/production/routings">, "searchParams">) {
  const params = await searchParams;
  const item = typeof params.item === "string" ? params.item.trim() : "";
  if (ITEM_CODE.test(item)) redirect(`/production/routings/${item}`);
  const deleted = typeof params.deleted === "string" && ITEM_CODE.test(params.deleted) ? params.deleted : undefined;
  await connection();
  const parsed = parseRoutingFilter(params);
  let data;
  try {
    data = await withDb(async (db) => {
      const filterOptions = await routingFilterOptions(db);
      // 꼴은 맞지만 없는 공정 · 작업장 값은 거르지 않고 알린다(찾기 칸의 「모든 …」과 맞게).
      const { filter, notices } = dropUnknownRoutingFilter(parsed.filter, parsed.notices, filterOptions);
      return {
        filter,
        notices,
        filterOptions,
        rows: await listRoutings(db, filter),
        options: await routingFormOptions(db),
      };
    });
  } catch (error) {
    return <LoadFailed error={error} what="라우팅 목록" />;
  }
  const { filter, notices, filterOptions, rows, options } = data;

  return (
    <>
      {deleted && (
        <p role="status" className="mt-6 max-w-3xl border-l-4 border-safety bg-white px-5 py-3">
          <span className="font-mono font-semibold">{deleted}</span> 의 라우팅을 지웠습니다.
        </p>
      )}
      <form
        action="/production/routings"
        className="mt-6 grid gap-3 border-y border-rule bg-white px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
      >
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">새 라우팅 — 품목</span>
          <select
            name="item"
            required
            defaultValue=""
            className="w-full min-w-0 rounded border border-rule px-3 py-2 text-base"
          >
            <option value="">라우팅이 없는 반제품 · 완제품을 고르세요</option>
            {options.newItems.map((p) => (
              <option key={p.code} value={p.code}>
                {p.code} {p.name} ({itemTypeName(p.itemType)})
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={options.newItems.length === 0}
          className="rounded bg-machine px-5 py-2.5 font-semibold text-white hover:bg-machine-deep disabled:opacity-60"
        >
          열기
        </button>
        {options.newItems.length === 0 && (
          <p className="text-sm text-muted sm:col-span-2">
            「사용」인 반제품 · 완제품은 모두 라우팅이 있습니다 — 아래에서 골라 고치세요.
          </p>
        )}
      </form>
      <RoutingSearch filter={filter} notices={notices} processes={filterOptions} />
      <RoutingList rows={rows} filter={filter} />
    </>
  );
}
