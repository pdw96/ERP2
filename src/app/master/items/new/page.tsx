import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { itemClassOptions, previewCodes, unitOptions } from "@/db/items";
import { withDb } from "@/db/request";
import { createItemAction } from "../actions";
import { ItemForm } from "../item-form";

export const metadata: Metadata = { title: "새 품목 등록 — ERP2" };

export default function NewItemPage() {
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
        › 새 품목
      </p>
      <h1 className="mt-1 text-3xl leading-tight font-semibold">새 품목 등록</h1>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <NewItemForm />
      </Suspense>
    </section>
  );
}

// 처음 칸 — 계획 정보는 0(없음)에서 시작한다. 유형을 고르면 조달구분 · 검사 대상이 붙는다.
const BLANK = {
  name: "",
  spec: "",
  unit: "",
  leadTimeDays: "0",
  safetyStock: "0",
  minLot: "0",
  lotMultiple: "0",
  cls1: "",
  cls2: "",
  cls3: "",
  note: "",
};

async function NewItemForm() {
  await connection();
  let data;
  try {
    data = await withDb(async (db) => ({
      units: await unitOptions(db),
      classes: await itemClassOptions(db),
      codes: await previewCodes(db),
    }));
  } catch (error) {
    return <LoadFailed what="입력 화면" error={error} />;
  }
  return (
    <ItemForm
      mode="create"
      action={createItemAction}
      units={data.units}
      classes={data.classes}
      previewCodes={data.codes}
      initial={BLANK}
    />
  );
}
