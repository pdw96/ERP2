import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { listCodeGroups } from "@/db/codes";
import { withDb } from "@/db/request";
import { GroupTable } from "./code-list";
import { Crumbs } from "./crumbs";

export const metadata: Metadata = { title: "공통코드 — ERP2" };

// 시스템 관리 › 공통코드 — 묶음(Major) 목록. 묶음을 고르면 그 값(Minor)이 보인다.
export default function CodeGroupsPage() {
  return (
    <section className="max-w-4xl">
      <Crumbs />
      <h1 className="mt-1 text-3xl leading-tight font-semibold">공통코드</h1>
      <p className="mt-1 text-muted">
        화면에서 고르는 목록의 값입니다. 묶음을 고르면 그 값이 보입니다 — 사용자 코드는 값을 더하고 고칠 수 있고, 시스템
        코드는 프로그램이 기대는 값이라 보이기만 합니다.
      </p>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <Groups />
      </Suspense>
    </section>
  );
}

async function Groups() {
  await connection();
  let groups;
  try {
    groups = await withDb(listCodeGroups);
  } catch (error) {
    return <LoadFailed error={error} what="공통코드 묶음" />;
  }
  return <GroupTable groups={groups} />;
}
