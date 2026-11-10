import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { withDb } from "@/db/request";
import { countFormOptions, listRecentCounts, openCountSheet } from "@/db/stock-counts";
import { COUNT_MAX_LINES } from "@/lib/count-input";
import { CountEntry } from "./count-entry";
import { CountList } from "./count-list";

export const metadata: Metadata = { title: "재고 실사 — ERP2" };

// 재고 › 수불관리 › 재고 실사 — 메뉴를 누르면 바로 입력이다(저자 판정, 설계 「2026-11-09 — PR E 를 열기 전에 정한 것」). 창고를 고르면 그 창고의
// 작성 중 실사가, 없으면 장부를 불러온 새 실사가 열리고, 아래에 최근 실사(모든 창고 · 모든 상태)가 보인다. 고른 창고는 주소(?warehouse=)에 남는다.
export default function CountsPage({ searchParams }: PageProps<"/inventory/counts">) {
  return (
    <section>
      <p className="text-sm text-muted">
        <Link href="/inventory" className="underline-offset-4 hover:underline">
          재고
        </Link>{" "}
        › 수불관리 › 재고 실사
      </p>
      <h1 className="mt-1 text-3xl leading-tight font-semibold">재고 실사</h1>
      <p className="mt-1 max-w-3xl text-muted">
        창고 하나의 실물 수량을 세어 장부와 맞춥니다. 창고를 고르면 그 창고의 장부가 줄로 불려 오고, 실물 수량을 넣어
        작성 중으로 저장합니다. 확정하면 확정하는 순간의 장부와의 차이가 조정사유 「실사 차이」의 조정 전표 한 장으로
        남습니다. 실사 번호는 처음 저장한 날의 다음 번호 — PI-YYYYMMDD-NNN. 한 건은 {COUNT_MAX_LINES}줄까지입니다.
      </p>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <Entry searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function Entry({ searchParams }: Pick<PageProps<"/inventory/counts">, "searchParams">) {
  const params = await searchParams;
  const picked = typeof params.warehouse === "string" ? params.warehouse : "";
  await connection();
  let options, recent, opened;
  try {
    [options, recent, opened] = await withDb((db) =>
      Promise.all([countFormOptions(db), listRecentCounts(db), picked ? openCountSheet(db, picked) : null]),
    );
  } catch (error) {
    return <LoadFailed what="입력 화면" error={error} />;
  }
  return (
    <>
      <CountEntry
        options={options}
        picked={picked}
        sheet={opened?.ok ? opened.sheet : null}
        openError={opened && !opened.ok ? opened.message : null}
      />
      <div className="mt-10 max-w-5xl">
        <CountList rows={recent} />
      </div>
    </>
  );
}
