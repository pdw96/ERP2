import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { SheetGrid } from "@/components/sheet-grid";
import { SheetLoadFilters } from "@/components/sheet-load-filters";
import { allItemClasses, itemClassOptions, unitOptions } from "@/db/items";
import { withDb } from "@/db/request";
import { ITEM_CLASSES } from "@/lib/item-fields";
import { ITEM_TYPES, PROC_TYPES } from "@/lib/master-codes";
import { itemSheetColumns } from "@/lib/sheet-columns";
import { loadItemSheetAction, saveItemSheetAction } from "../actions";

export const metadata: Metadata = { title: "품목 시트형 등록 — ERP2" };

// 기준정보 › 품목 등록 › 시트형 등록(성공 기준 11 · 15) — 여러 품목을 시트에 넣거나 엑셀에서 붙여넣어 한 번에 등록하고,
// 기존 품목을 불러와 한 번에 고친다(PR J).
export default function ItemSheetPage() {
  return (
    <section className="max-w-6xl">
      <p className="text-sm text-muted">
        <Link href="/master" className="underline-offset-4 hover:underline">
          기준정보
        </Link>{" "}
        ›{" "}
        <Link href="/master/items" className="underline-offset-4 hover:underline">
          품목 등록
        </Link>{" "}
        › 시트형 등록
      </p>
      <h1 className="mt-1 text-3xl leading-tight font-semibold">품목 시트형 등록</h1>
      <p className="mt-1 text-muted">
        여러 품목을 한 번에 등록하거나 고칩니다. 맞는 줄은 저장되어 새 줄에는 코드가 줄 차례로 붙고, 틀린 줄은 시트에
        남습니다.
      </p>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <ItemSheet />
      </Suspense>
    </section>
  );
}

async function ItemSheet() {
  await connection();
  let data;
  try {
    data = await withDb(async (db) => ({
      units: await unitOptions(db),
      classes: await itemClassOptions(db),
      allClasses: await allItemClasses(db),
    }));
  } catch (error) {
    return <LoadFailed what="입력 화면" error={error} />;
  }
  return (
    <SheetGrid
      columns={itemSheetColumns(data.units, data.classes)}
      action={saveItemSheetAction}
      what="품목"
      listHref="/master/items"
      load={{
        action: loadItemSheetAction,
        filters: (
          <SheetLoadFilters
            placeholder="코드 · 품명"
            selects={[
              { name: "type", label: "유형", options: ITEM_TYPES },
              { name: "proc", label: "조달구분", options: PROC_TYPES },
              ...ITEM_CLASSES.map(({ field, label }) => ({ name: field, label, options: data.allClasses[field] })),
            ]}
          />
        ),
      }}
    />
  );
}
