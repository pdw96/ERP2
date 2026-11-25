import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { first } from "@/db/master-shared";
import {
  mrpSettings,
  openMrpGrid,
  openMrpOrders,
  openMrpPeg,
  parseMrpGridFrom,
  parseMrpOrderQuery,
  parseMrpPegQuery,
} from "@/db/mrp";
import { withDb } from "@/db/request";
import { koreaToday } from "@/lib/today";
import { mondayOf } from "@/lib/weeks";
import { MrpGrid } from "./mrp-grid";
import { MrpOrders } from "./mrp-orders";
import { MrpPeg } from "./mrp-peg";
import { MrpRun } from "./mrp-run";
import { koreaMinute, MrpSettingHistory } from "./mrp-setting-history";
import { mrpNotice } from "./notice";
import { MRP_PATH, mrpGridHref, mrpPegHref, type MrpView } from "./paths";

export const metadata: Metadata = { title: "MRP — ERP2" };

// 생산 › 생산계획 › MRP — [MRP 실행]으로 MPS 를 BOM 으로 펼쳐 낸 계획오더를 보는 화면. 탭 셋: 계획오더 목록(기본) · 품목별 MRP 표(?view=grid) · 페깅(?view=peg).
// 목록은 ?kind= · ?type= · ?late= · ?page=, 표는 ?from=(실행 주에서 13주씩), 페깅은 ?item= · ?order= 를 읽는다. ?ran= · ?setting= 은 실행 · 기준 요일 저장 뒤의 알림이다.
export default function MrpPage({ searchParams }: PageProps<"/production/mrp">) {
  return (
    <section>
      <p className="text-sm text-muted">
        <Link href="/production" className="underline-offset-4 hover:underline">
          생산
        </Link>{" "}
        › 생산계획 › MRP
      </p>
      <h1 className="mt-1 text-3xl leading-tight font-semibold">MRP</h1>
      <p className="mt-1 max-w-3xl text-muted">
        MPS 를 BOM 으로 펼쳐 품목마다 주별 계획오더(만들 것 · 살 것)를 냅니다. [MRP 실행]을 누를 때 계산해 저장하고,
        다음 실행 전까지 그대로 보입니다.
      </p>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <Sheet searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function Sheet({ searchParams }: Pick<PageProps<"/production/mrp">, "searchParams">) {
  const params = await searchParams;
  // 실행 · 기준 요일 저장 뒤 주소에 실린 결과의 알림.
  const notice = mrpNotice(params);
  const viewParam = first(params.view);
  const view: MrpView = viewParam === "grid" || viewParam === "peg" ? viewParam : "list";
  const grid = view === "grid";
  await connection();
  // 오늘은 한 번만 읽는다 — 표의 이번 주와 쪽의 첫 주가 자정 앞뒤로 갈리지 않게.
  const thisWeek = mondayOf(koreaToday());
  let data;
  try {
    data = await withDb(async (db) => {
      const settings = await mrpSettings(db);
      if (view === "peg") {
        const peg = await openMrpPeg(db, parseMrpPegQuery(params));
        return { settings, run: peg.run, shown: { view: "peg" as const, peg } };
      }
      if (grid) {
        const param = first(params.from);
        let sheet = await openMrpGrid(db, parseMrpGridFrom(param, thisWeek));
        // 쪽은 실행 주에서 13주씩이다 — 실행 주가 이번 주가 아니면(지난 주에 실행) 그 실행 주로 쪽을 다시 골라 연다.
        if (sheet.runWeek) {
          const from = parseMrpGridFrom(param, sheet.runWeek);
          if (from !== sheet.weeks[0]) sheet = await openMrpGrid(db, from);
        }
        return { settings, run: sheet.run, shown: { view: "grid" as const, sheet } };
      }
      const query = parseMrpOrderQuery(params);
      const orders = await openMrpOrders(db, query);
      return { settings, run: orders.run, shown: { view: "list" as const, query, orders } };
    });
  } catch (error) {
    return <LoadFailed error={error} what="MRP" />;
  }
  const { settings, run, shown } = data;

  return (
    <>
      {notice && (
        <p role="status" className="mt-6 max-w-3xl border-l-4 border-safety bg-white px-5 py-3">
          {notice}
        </p>
      )}
      {/* 열 때마다 새로 — 실행 · 저장 뒤 같은 주소로 돌아와도 고른 요일 · 거절의 까닭이 남지 않게. */}
      <MrpRun
        key={randomUUID()}
        lastRun={run ? koreaMinute(run.ranAt) : null}
        dueWeekday={settings.dueWeekday}
        view={view}
        from={shown.view === "grid" ? shown.sheet.weeks[0] : undefined}
      />
      <MrpTabs view={view} />
      {shown.view === "grid" ? (
        <MrpGrid grid={shown.sheet} thisWeek={thisWeek} />
      ) : shown.view === "peg" ? (
        <MrpPeg peg={shown.peg} />
      ) : (
        <MrpOrders orders={shown.orders} query={shown.query} />
      )}
      <MrpSettingHistory changes={settings.changes} total={settings.total} />
    </>
  );
}

/** 탭 셋 — 주소의 view 만 바꾼다(거르기 · 쪽 · 고른 계획오더는 버린다). */
function MrpTabs({ view }: { view: MrpView }) {
  const tabs = [
    { href: MRP_PATH, label: "계획오더 목록", active: view === "list" },
    { href: mrpGridHref(), label: "품목별 MRP 표", active: view === "grid" },
    { href: mrpPegHref(), label: "페깅", active: view === "peg" },
  ];
  return (
    <nav aria-label="MRP 보기" className="mt-8 flex gap-1 overflow-x-auto border-b border-rule">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={`-mb-px shrink-0 border-b-4 px-4 py-2 focus-visible:-outline-offset-2 ${
            tab.active ? "border-safety font-semibold" : "border-transparent text-muted hover:text-ink"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
