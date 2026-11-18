import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { getDefectType, listClsOptions } from "@/db/defect-types";
import { withDb } from "@/db/request";
import { listProcessOptions } from "@/db/work-centers";
import { DEFECT_TYPE_CODE } from "@/lib/defect-type-input";
import { updateDefectTypeAction } from "../actions";
import { DefectTypeForm } from "../defect-type-form";

export const metadata: Metadata = { title: "불량 유형 수정 — ERP2" };

// 품질 › 품질 기준정보 › 불량 유형 › 한 불량 유형의 수정. 주소는 불량유형코드다 — 코드는 바뀌지 않는다.
export default function EditDefectTypePage({ params }: PageProps<"/quality/defect-types/[code]">) {
  return (
    <section>
      <p className="text-sm text-muted">
        <Link href="/quality" className="underline-offset-4 hover:underline">
          품질
        </Link>{" "}
        › 품질 기준정보 ›{" "}
        <Link href="/quality/defect-types" className="underline-offset-4 hover:underline">
          불량 유형
        </Link>{" "}
        › 수정
      </p>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <EditDefectType params={params} />
      </Suspense>
    </section>
  );
}

async function EditDefectType({ params }: Pick<PageProps<"/quality/defect-types/[code]">, "params">) {
  const { code } = await params;
  await connection();
  // 퍼센트 부호가 깨진 주소(%E0 등)는 DB 를 부르기 전에 없는 불량 유형으로 본다 — 불러오기 실패 화면이 아니다.
  let decoded: string;
  try {
    decoded = decodeURIComponent(code);
  } catch (error) {
    if (error instanceof URIError) notFound();
    throw error;
  }
  // 꼴이 틀린 코드는 DB 를 부르기 전에 없는 불량 유형으로 본다.
  if (!DEFECT_TYPE_CODE.test(decoded)) notFound();
  let loaded;
  try {
    loaded = await withDb(async (db) => ({
      defectType: await getDefectType(db, decoded),
      classes: await listClsOptions(db),
      processes: await listProcessOptions(db),
    }));
  } catch (error) {
    return <LoadFailed what="불량 유형" error={error} />;
  }
  const { defectType, classes, processes } = loaded;
  if (!defectType) notFound();
  return (
    <>
      <h1 className="mt-1 text-3xl leading-tight font-semibold wrap-anywhere">
        <span className="font-mono">{defectType.code}</span> {defectType.name}
      </h1>
      <DefectTypeForm
        mode="edit"
        code={defectType.code}
        version={defectType.version}
        action={updateDefectTypeAction.bind(null, defectType.code)}
        classes={classes}
        processes={processes}
        initial={{
          name: defectType.name,
          cls: defectType.cls,
          processes: defectType.processes.map((p) => p.code),
          note: defectType.note,
          active: defectType.active ? "Y" : "N",
        }}
      />
    </>
  );
}
