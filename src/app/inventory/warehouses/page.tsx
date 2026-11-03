import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { withDb } from "@/db/request";
import { getWarehouse, listWarehouses, parseWarehouseFilter, WAREHOUSE_CODE } from "@/db/warehouses";
import { SavedNotice, WarehouseList, WarehouseSearch } from "./warehouse-list";

export const metadata: Metadata = { title: "창고 — ERP2" };

// 재고 › 재고 기준정보 › 창고 — 목록. 찾기는 주소에 남아 그대로 링크로 건넬 수 있다.
export default function WarehousesPage({ searchParams }: PageProps<"/inventory/warehouses">) {
  return (
    <section className="max-w-4xl">
      <p className="text-sm text-muted">
        <Link href="/inventory" className="underline-offset-4 hover:underline">
          재고
        </Link>{" "}
        › 재고 기준정보 › 창고
      </p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl leading-tight font-semibold">창고</h1>
          <p className="mt-1 text-muted">재고를 두는 곳. 코드는 등록할 때 차례로 붙습니다.</p>
        </div>
        <Link
          href="/inventory/warehouses/new"
          className="rounded bg-machine px-5 py-2.5 font-semibold text-white hover:bg-machine-deep"
        >
          새 창고 등록
        </Link>
      </div>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <Results searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function Results({ searchParams }: Pick<PageProps<"/inventory/warehouses">, "searchParams">) {
  const params = await searchParams;
  await connection();
  const { filter, notices } = parseWarehouseFilter(params);
  const savedCode = typeof params.saved === "string" && WAREHOUSE_CODE.test(params.saved) ? params.saved : undefined;

  let data;
  try {
    data = await withDb(async (db) => ({
      rows: await listWarehouses(db, filter),
      saved: savedCode ? await getWarehouse(db, savedCode) : undefined,
    }));
  } catch (error) {
    return <LoadFailed error={error} what="창고 목록" />;
  }

  return (
    <>
      {data.saved && <SavedNotice warehouse={data.saved} shown={data.rows.some((r) => r.id === data.saved!.id)} />}
      <WarehouseSearch filter={filter} notices={notices} />
      <WarehouseList rows={data.rows} filter={filter} savedCode={data.saved?.code} />
    </>
  );
}
