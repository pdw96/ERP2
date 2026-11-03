import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { getCodeGroup, listCodeGroups, listCodes } from "@/db/codes";
import { withDb } from "@/db/request";
import { MINOR_CODE } from "@/lib/code-fields";
import { CodeTable, GroupPicker, Kind, SavedNotice } from "../code-list";
import { Crumbs } from "../crumbs";

export const metadata: Metadata = { title: "공통코드 — ERP2" };

// 시스템 관리 › 공통코드 › 한 묶음의 값. 주소는 묶음 코드다(예: /system/codes/UNIT) — 그대로 링크로 건넬 수 있다.
export default function CodeGroupPage({ params, searchParams }: PageProps<"/system/codes/[group]">) {
  return (
    <section className="max-w-4xl">
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <Group params={params} searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function Group({ params, searchParams }: PageProps<"/system/codes/[group]">) {
  const { group: raw } = await params;
  const query = await searchParams;
  await connection();
  const code = decodeURIComponent(raw);
  const savedCode = typeof query.saved === "string" && MINOR_CODE.test(query.saved) ? query.saved : undefined;

  let data;
  try {
    data = await withDb(async (db) => {
      const group = await getCodeGroup(db, code);
      if (!group) return undefined;
      return { group, groups: await listCodeGroups(db), rows: await listCodes(db, group.code) };
    });
  } catch (error) {
    return (
      <>
        <Crumbs />
        <LoadFailed error={error} what="공통코드" />
      </>
    );
  }
  if (!data) notFound();
  const { group, groups, rows } = data;
  const saved = savedCode ? rows.find((r) => r.code === savedCode) : undefined;

  return (
    <>
      <Crumbs group={group} />
      <GroupPicker groups={groups} current={group.code} />
      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl leading-tight font-semibold wrap-anywhere">
            <span className="font-mono">{group.code}</span> {group.name}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-muted">
            <Kind system={group.isSystem} />
            {group.isSystem
              ? "프로그램이 기대는 값이라 보이기만 합니다. 바꾸려면 프로그램과 함께 고칩니다."
              : "값을 더하고, 이름 · 정렬 순서 · 사용 여부를 고칩니다. 코드는 바뀌지 않고 지우지 않습니다."}
          </p>
        </div>
        {!group.isSystem && (
          <Link
            href={`/system/codes/${group.code}/new`}
            className="rounded bg-machine px-5 py-2.5 font-semibold text-white hover:bg-machine-deep"
          >
            새 값 추가
          </Link>
        )}
      </div>
      {saved && <SavedNotice code={saved} />}
      <CodeTable group={group} rows={rows} savedCode={saved?.code} />
    </>
  );
}
