import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { withDb } from "@/db/request";
import { getWarehouse } from "@/db/warehouses";
import { updateWarehouseAction } from "../actions";
import { WarehouseForm } from "../warehouse-form";

export const metadata: Metadata = { title: "창고 수정 — ERP2" };

// 재고 › 재고 기준정보 › 창고 › 한 창고의 수정. 주소는 창고 코드다 — 코드는 바뀌지 않는다.
export default function EditWarehousePage({ params }: PageProps<"/inventory/warehouses/[code]">) {
  return (
    <section>
      <p className="text-sm text-muted">
        <Link href="/inventory" className="underline-offset-4 hover:underline">
          재고
        </Link>{" "}
        › 재고 기준정보 ›{" "}
        <Link href="/inventory/warehouses" className="underline-offset-4 hover:underline">
          창고
        </Link>{" "}
        › 수정
      </p>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <EditWarehouse params={params} />
      </Suspense>
    </section>
  );
}

async function EditWarehouse({ params }: Pick<PageProps<"/inventory/warehouses/[code]">, "params">) {
  const { code } = await params;
  await connection();
  let warehouse;
  try {
    warehouse = await withDb((db) => getWarehouse(db, decodeURIComponent(code)));
  } catch (error) {
    return <LoadFailed what="창고" error={error} />;
  }
  if (!warehouse) notFound();
  return (
    <>
      <h1 className="mt-1 text-3xl leading-tight font-semibold wrap-anywhere">
        <span className="font-mono">{warehouse.code}</span> {warehouse.name}
      </h1>
      <WarehouseForm
        mode="edit"
        code={warehouse.code}
        action={updateWarehouseAction.bind(null, warehouse.code)}
        initial={{ name: warehouse.name, active: warehouse.active ? "Y" : "N" }}
      />
    </>
  );
}
