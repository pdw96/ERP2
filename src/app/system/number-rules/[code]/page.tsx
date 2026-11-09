import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { getNumberRule } from "@/db/number-rules";
import { withDb } from "@/db/request";
import { koreaToday } from "@/lib/today";
import { updateNumberRuleAction } from "../actions";
import { Crumbs } from "../crumbs";
import { NumberRuleForm } from "../number-rule-form";

export const metadata: Metadata = { title: "번호 규칙 수정 — ERP2" };

// 시스템 관리 › 번호 규칙 › 한 규칙의 수정. 주소는 규칙 코드다 — 코드는 바뀌지 않는다.
export default function EditNumberRulePage({ params }: PageProps<"/system/number-rules/[code]">) {
  return (
    <section>
      <Crumbs here="수정" />
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <EditRule params={params} />
      </Suspense>
    </section>
  );
}

async function EditRule({ params }: Pick<PageProps<"/system/number-rules/[code]">, "params">) {
  const { code } = await params;
  await connection();
  let rule;
  try {
    rule = await withDb((db) => getNumberRule(db, decodeURIComponent(code)));
  } catch (error) {
    return <LoadFailed what="번호 규칙" error={error} />;
  }
  if (!rule) notFound();
  return (
    <>
      <h1 className="mt-1 text-3xl leading-tight font-semibold wrap-anywhere">
        <span className="font-mono">{rule.code}</span> {rule.name}
      </h1>
      <NumberRuleForm
        mode="edit"
        code={rule.code}
        version={rule.version}
        defaultFor={rule.defaultFor}
        action={updateNumberRuleAction.bind(null, rule.code)}
        today={koreaToday()}
        initial={{
          name: rule.name,
          prefix: rule.prefix,
          separator: rule.separator,
          dateFormat: rule.dateFormat,
          seqDigits: String(rule.seqDigits),
          defaultFor: rule.defaultFor ?? "",
          active: rule.active ? "Y" : "N",
        }}
      />
    </>
  );
}
