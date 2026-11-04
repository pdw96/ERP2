import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { getItem, itemClassOptions, unitOptions, type Item } from "@/db/items";
import { withDb } from "@/db/request";
import type { ItemValues } from "@/lib/item-input";
import { updateItemAction } from "../actions";
import { ItemForm } from "../item-form";

export const metadata: Metadata = { title: "품목 수정 — ERP2" };

// 기준정보 › 품목 › 한 품목의 수정. 주소는 품목 코드다 — 코드는 바뀌지 않는다.
export default function EditItemPage({ params }: PageProps<"/master/items/[code]">) {
  return (
    <section>
      <p className="text-sm text-muted">
        <Link href="/master" className="underline-offset-4 hover:underline">
          기준정보
        </Link>{" "}
        ›{" "}
        <Link href="/master/items" className="underline-offset-4 hover:underline">
          품목
        </Link>{" "}
        › 수정
      </p>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <EditItem params={params} />
      </Suspense>
    </section>
  );
}

const asValues = (item: Item): ItemValues => ({
  procurement: item.procurement,
  name: item.name,
  spec: item.spec,
  unit: item.unit,
  inspectIn: item.inspectIn ? "on" : "off",
  inspectOut: item.inspectOut ? "on" : "off",
  leadTimeDays: String(item.leadTimeDays),
  safetyStock: String(item.safetyStock),
  minLot: String(item.minLot),
  lotMultiple: String(item.lotMultiple),
  cls1: item.cls1 ?? "",
  cls2: item.cls2 ?? "",
  cls3: item.cls3 ?? "",
  note: item.note,
  active: item.active ? "Y" : "N",
});

async function EditItem({ params }: Pick<PageProps<"/master/items/[code]">, "params">) {
  const { code } = await params;
  await connection();
  let data;
  try {
    data = await withDb(async (db) => {
      const item = await getItem(db, decodeURIComponent(code));
      return item && { item, units: await unitOptions(db, item.unit), classes: await itemClassOptions(db, item) };
    });
  } catch (error) {
    return <LoadFailed what="품목" error={error} />;
  }
  if (!data) notFound();
  const { item, units, classes } = data;
  return (
    <>
      <h1 className="mt-1 text-3xl leading-tight font-semibold wrap-anywhere">
        <span className="font-mono">{item.code}</span> {item.name}
      </h1>
      <ItemForm
        mode="edit"
        code={item.code}
        itemType={item.itemType}
        action={updateItemAction.bind(null, item.code)}
        units={units}
        classes={classes}
        initial={asValues(item)}
      />
    </>
  );
}
