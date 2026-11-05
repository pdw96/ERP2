import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { baseUnitOptions, getCodeGroup, nextSortOrder } from "@/db/codes";
import { withDb } from "@/db/request";
import { UNIT_GROUP } from "@/lib/code-fields";
import { createCodeAction } from "../../actions";
import { CodeForm } from "../../code-form";
import { Crumbs } from "../../crumbs";

export const metadata: Metadata = { title: "새 값 추가 — ERP2" };

// 시스템 관리 › 공통코드 › 한 묶음 › 새 값. 사용자 코드 묶음에만 있다 — 시스템 코드 묶음이면 없는 화면이다.
export default function NewCodePage({ params }: PageProps<"/system/codes/[group]/new">) {
  return (
    <section>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <NewCode params={params} />
      </Suspense>
    </section>
  );
}

async function NewCode({ params }: Pick<PageProps<"/system/codes/[group]/new">, "params">) {
  const { group: raw } = await params;
  await connection();
  let data;
  try {
    data = await withDb(async (db) => {
      const group = await getCodeGroup(db, decodeURIComponent(raw));
      return (
        group && {
          group,
          sortOrder: await nextSortOrder(db, group.code),
          bases: group.code === UNIT_GROUP ? await baseUnitOptions(db) : undefined,
        }
      );
    });
  } catch (error) {
    return <LoadFailed what="입력 화면" error={error} />;
  }
  if (!data || data.group.isSystem) notFound();
  const { group, sortOrder, bases } = data;
  return (
    <>
      <Crumbs group={group} last="새 값" />
      <h1 className="mt-1 text-3xl leading-tight font-semibold wrap-anywhere">{group.name} — 새 값 추가</h1>
      <CodeForm
        mode="create"
        group={{ code: group.code, name: group.name }}
        action={createCodeAction.bind(null, group.code)}
        initial={{ code: "", name: "", sortOrder: String(sortOrder), baseUnit: "", factor: "", decimals: "0" }}
        unit={bases ? { mode: "create", bases } : undefined}
      />
    </>
  );
}
