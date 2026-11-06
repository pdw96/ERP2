import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { SavedNotice } from "@/components/saved-notice";
import { listNumberRules } from "@/db/number-rules";
import { withDb } from "@/db/request";
import { RULE_CODE } from "@/lib/number-rule-fields";
import { koreaToday } from "@/lib/today";
import { Crumbs } from "./crumbs";
import { NumberRuleTable } from "./number-rule-list";

export const metadata: Metadata = { title: "번호 규칙 — ERP2" };

// 시스템 관리 › 번호 규칙 — LOT 번호의 규칙 목록(ADR 0016). 50개 안이라 「사용 안 함」까지 늘 보인다.
export default function NumberRulesPage({ searchParams }: PageProps<"/system/number-rules">) {
  return (
    <section className="max-w-5xl">
      <Crumbs />
      <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl leading-tight font-semibold">번호 규칙</h1>
          <p className="mt-1 text-muted">
            반제품 · 완제품을 입고할 때 LOT 를 비우면 이 규칙으로 번호가 붙습니다. 유형마다 기본 규칙이 하나이고,
            품목에서 다른 규칙을 고를 수 있습니다.
          </p>
        </div>
        <Link
          href="/system/number-rules/new"
          className="rounded bg-machine px-5 py-2.5 font-semibold text-white hover:bg-machine-deep"
        >
          새 규칙 등록
        </Link>
      </div>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <Rules searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function Rules({ searchParams }: Pick<PageProps<"/system/number-rules">, "searchParams">) {
  const params = await searchParams;
  await connection();
  const savedCode = typeof params.saved === "string" && RULE_CODE.test(params.saved) ? params.saved : undefined;
  let rules;
  try {
    rules = await withDb(listNumberRules);
  } catch (error) {
    return <LoadFailed error={error} what="번호 규칙" />;
  }
  const saved = savedCode ? rules.find((r) => r.code === savedCode) : undefined;
  return (
    <>
      {saved && (
        <SavedNotice code={saved.code} name={saved.name} active={saved.active} shown listHref="/system/number-rules" />
      )}
      <NumberRuleTable rules={rules} today={koreaToday()} savedCode={saved?.code} />
    </>
  );
}
