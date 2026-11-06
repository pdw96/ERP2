import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { withDb } from "@/db/request";
import { previewWarehouseCode } from "@/db/warehouses";
import { createWarehouseAction } from "../actions";
import { WarehouseForm } from "../warehouse-form";

export const metadata: Metadata = { title: "새 창고 등록 — ERP2" };

export default function NewWarehousePage() {
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
        › 새 창고
      </p>
      <h1 className="mt-1 text-3xl leading-tight font-semibold">새 창고 등록</h1>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <NewWarehouseForm />
      </Suspense>
    </section>
  );
}

async function NewWarehouseForm() {
  await connection();
  let previewCode;
  try {
    previewCode = await withDb(previewWarehouseCode);
  } catch (error) {
    return <LoadFailed what="입력 화면" error={error} />;
  }
  return (
    <WarehouseForm
      mode="create"
      action={createWarehouseAction}
      previewCode={previewCode}
      initial={{ name: "", isDefect: "off" }}
    />
  );
}
