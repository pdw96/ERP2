import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { koreaToday } from "@/lib/today";
import { createNumberRuleAction } from "../actions";
import { Crumbs } from "../crumbs";
import { NumberRuleForm } from "../number-rule-form";

export const metadata: Metadata = { title: "새 번호 규칙 — ERP2" };

// 처음 칸 — 구분자 붙임표 · 날짜 YYMMDD · 일련 3자리(샘플 규칙과 같은 꼴), 기본으로 쓰는 유형은 없음.
const BLANK = { code: "", name: "", prefix: "", separator: "-", dateFormat: "YYMMDD", seqDigits: "3", defaultFor: "" };

export default function NewNumberRulePage() {
  return (
    <section>
      <Crumbs here="새 규칙" />
      <h1 className="mt-1 text-3xl leading-tight font-semibold">새 번호 규칙</h1>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <NewForm />
      </Suspense>
    </section>
  );
}

async function NewForm() {
  await connection();
  return <NumberRuleForm mode="create" action={createNumberRuleAction} initial={BLANK} today={koreaToday()} />;
}
