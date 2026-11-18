import type { Metadata } from "next";
import Link from "next/link";
import { createProcessAction } from "../actions";
import { ProcessForm } from "../process-form";

export const metadata: Metadata = { title: "새 공정 등록 — ERP2" };

export default function NewProcessPage() {
  return (
    <section>
      <p className="text-sm text-muted">
        <Link href="/production" className="underline-offset-4 hover:underline">
          생산
        </Link>{" "}
        › 생산 기준정보 ›{" "}
        <Link href="/production/processes" className="underline-offset-4 hover:underline">
          공정 등록
        </Link>{" "}
        › 새 공정
      </p>
      <h1 className="mt-1 text-3xl leading-tight font-semibold">새 공정 등록</h1>
      <ProcessForm mode="create" action={createProcessAction} initial={{}} />
    </section>
  );
}
