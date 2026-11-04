import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { getCode, getCodeGroup } from "@/db/codes";
import { withDb } from "@/db/request";
import { isAlwaysActive } from "@/lib/master-codes";
import { updateCodeAction } from "../../actions";
import { CodeForm } from "../../code-form";
import { Crumbs } from "../../crumbs";

export const metadata: Metadata = { title: "공통코드 수정 — ERP2" };

// 시스템 관리 › 공통코드 › 한 묶음 › 한 값의 수정. 주소는 묶음 · 값의 코드다 — 코드는 바뀌지 않는다.
// 사용자 코드 묶음에만 있다 — 시스템 코드 묶음이면 없는 화면이다.
export default function EditCodePage({ params }: PageProps<"/system/codes/[group]/[code]">) {
  return (
    <section>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <EditCode params={params} />
      </Suspense>
    </section>
  );
}

async function EditCode({ params }: Pick<PageProps<"/system/codes/[group]/[code]">, "params">) {
  const { group: rawGroup, code: rawCode } = await params;
  await connection();
  let data;
  try {
    data = await withDb(async (db) => {
      const group = await getCodeGroup(db, decodeURIComponent(rawGroup));
      const code = group && (await getCode(db, group.code, decodeURIComponent(rawCode)));
      return group && code && { group, code };
    });
  } catch (error) {
    return <LoadFailed what="공통코드" error={error} />;
  }
  if (!data || data.group.isSystem) notFound();
  const { group, code } = data;
  return (
    <>
      <Crumbs group={group} last="수정" />
      <h1 className="mt-1 text-3xl leading-tight font-semibold wrap-anywhere">
        <span className="font-mono">{code.code}</span> {code.name}
      </h1>
      <CodeForm
        mode="edit"
        group={{ code: group.code, name: group.name }}
        code={code.code}
        alwaysActive={isAlwaysActive(group.code, code.code)}
        action={updateCodeAction.bind(null, group.code, code.code)}
        initial={{ name: code.name, sortOrder: String(code.sortOrder), active: code.active ? "Y" : "N" }}
      />
    </>
  );
}
