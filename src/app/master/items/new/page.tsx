import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { itemClassOptions, previewCodes, stockLists, unitOptions } from "@/db/items";
import { ruleOptions } from "@/db/number-rules";
import { withDb } from "@/db/request";
import { koreaToday } from "@/lib/today";
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
          품목 등록
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

// 처음 칸 — 계획 정보는 0(없음)에서 시작한다. 유형을 고르면 조달구분 · 검사 대상 · LOT 관리가 붙는다.
// LOT 번호 규칙은 유형의 기본, 기본 창고는 없음에서 시작한다.
const BLANK = {
  name: "",
  spec: "",
  unit: "",
  lotRuleCode: "",
  defaultInWarehouse: "",
  defaultOutWarehouse: "",
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
      rules: await ruleOptions(db, koreaToday()),
      stock: await stockLists(db),
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
      rules={data.rules}
      warehouses={data.stock.warehouses}
      previewCodes={data.codes}
      initial={BLANK}
    />
  );
}
