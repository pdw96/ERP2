import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { Notices } from "@/components/sort-pager";
import { bomInquiry, EXPLODE_DEPTH, EXPLODE_ROWS, type BomInquiryView, type ExplodedLine } from "@/db/boms";
import { withDb } from "@/db/request";
import { parseBomInquiry, type BomInquiryNotice, type BomMode } from "@/lib/bom-input";
import { itemTypeName } from "@/lib/master-codes";
import { koreaToday } from "@/lib/today";

export const metadata: Metadata = { title: "BOM 조회 — ERP2" };

const PATH = "/production/bom/inquiry";

// 생산 › 생산 기준정보 › BOM 조회(조각 「BOM」 PR B, 성공 기준 8 ~ 11, ADR 0026 의 6) — 정전개(제품에서 자재로)와 역전개(자재에서 그것을 쓰는 제품으로)를
// 바꿔 본다. 기준일에 적용되는 줄만 펼친다. 읽기만 한다 — 이 화면에는 BOM 을 바꾸는 단추 · 서버 액션이 없다(설계 ② 「읽기만」).
// 칸 차례 · 단계 표시 · 휴대폰 폭은 설계 「2026-11-12 — PR B 를 열기 전에 정한 것」.
export default function BomInquiryPage({ searchParams }: PageProps<"/production/bom/inquiry">) {
  return (
    <section>
      <p className="text-sm text-muted">
        <Link href="/production" className="underline-offset-4 hover:underline">
          생산
        </Link>{" "}
        › 생산 기준정보 › BOM 조회
      </p>
      <h1 className="mt-1 text-3xl leading-tight font-semibold">BOM 조회</h1>
      <p className="mt-1 max-w-3xl text-muted">
        정전개는 반제품 · 완제품을 만드는 데 드는 자품목을 끝 단계까지, 역전개는 한 품목을 쓰는 반제품 · 완제품을 위로
        끝 단계까지 보입니다. 기준일에 적용되는 줄만 펼칩니다. 필요량 = 윗 단계의 필요량 × 소요량 ÷ 기준수량 × (1 +
        로스율), 자품목 단위의 자릿수로 올려 보입니다.
      </p>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <Results searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function Results({ searchParams }: Pick<PageProps<"/production/bom/inquiry">, "searchParams">) {
  const params = await searchParams;
  await connection();
  const today = koreaToday();
  const { query, notices } = parseBomInquiry(params, today);
  let view: BomInquiryView;
  try {
    view = await withDb((db) => bomInquiry(db, query, notices));
  } catch (error) {
    return <LoadFailed error={error} what="BOM 조회" />;
  }
  return (
    <>
      <ModeTabs mode={view.mode} date={view.date} today={today} />
      <InquiryForm view={view} notices={notices} />
      <Outcome view={view} />
    </>
  );
}

const MODES: { mode: BomMode; label: string }[] = [
  { mode: "down", label: "정전개" },
  { mode: "up", label: "역전개" },
];

/** 정전개 · 역전개를 바꾼다 — 기준일은 그대로, 품목은 고른 뜻이 달라 비운다. */
function ModeTabs({ mode, date, today }: { mode: BomMode; date: string; today: string }) {
  return (
    <nav aria-label="펼치는 쪽" className="mt-6 flex gap-1 border-b-2 border-machine">
      {MODES.map((m) => {
        const q = new URLSearchParams();
        if (m.mode === "up") q.set("mode", "up");
        if (date !== today) q.set("date", date);
        const href = q.size ? `${PATH}?${q}` : PATH;
        const current = m.mode === mode;
        return (
          <Link
            key={m.mode}
            href={href}
            aria-current={current ? "page" : undefined}
            className={`-mb-0.5 rounded-t border-2 px-5 py-2 font-semibold ${
              current
                ? "border-machine border-b-white bg-white text-ink"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {m.label}
          </Link>
        );
      })}
    </nav>
  );
}

function InquiryForm({ view, notices }: { view: BomInquiryView; notices: BomInquiryNotice[] }) {
  const down = view.mode === "down";
  return (
    <Form
      key={JSON.stringify([view.mode, view.item?.code, view.date, view.qty])}
      action={PATH}
      replace
      role="search"
      aria-label={down ? "정전개 고르기" : "역전개 고르기"}
      className={`grid max-w-4xl gap-3 border-b border-rule bg-white px-4 py-4 sm:grid-cols-2 sm:items-end ${
        down ? "lg:grid-cols-[2fr_repeat(2,minmax(0,1fr))]" : "lg:grid-cols-[2fr_minmax(0,1fr)]"
      }`}
    >
      {!down && <input type="hidden" name="mode" value="up" />}
      <label className="grid gap-1 text-sm sm:col-span-2 lg:col-span-1">
        <span className="font-semibold">{down ? "부모 품목" : "자품목"}</span>
        <select
          name="item"
          required
          defaultValue={view.item?.code ?? ""}
          className="w-full min-w-0 rounded border border-rule px-3 py-2 text-base"
        >
          <option value="">
            {down ? "BOM 이 있는 반제품 · 완제품을 고르세요" : "원자재 · 반제품 · 부자재를 고르세요"}
          </option>
          {view.options.map((o) => (
            <option key={o.code} value={o.code}>
              {o.code} {o.name} ({itemTypeName(o.itemType)}){o.active ? "" : " (사용 안 함)"}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-semibold">기준일</span>
        <input
          type="date"
          name="date"
          defaultValue={view.date}
          className="w-full min-w-0 rounded border border-rule px-3 py-2 text-base"
        />
      </label>
      {down && (
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">
            수량{view.item && <span className="ml-1 font-mono font-normal text-muted">{view.item.unit}</span>}
          </span>
          <input
            name="qty"
            inputMode="decimal"
            defaultValue={view.qty ?? ""}
            placeholder="비우면 기준수량"
            className="w-full min-w-0 rounded border border-rule px-3 py-2 text-right text-base tabular-nums"
          />
        </label>
      )}
      <div className="flex items-center gap-3 sm:col-span-full">
        <button type="submit" className="rounded border border-machine px-5 py-2 font-semibold hover:bg-floor">
          펼치기
        </button>
        <Link
          href={down ? PATH : `${PATH}?mode=up`}
          className="text-sm text-muted underline underline-offset-4 hover:text-ink"
        >
          처음대로
        </Link>
      </div>
      <Notices notices={notices} />
    </Form>
  );
}

function Outcome({ view }: { view: BomInquiryView }) {
  const down = view.mode === "down";
  if (!view.item || !view.explosion)
    return (
      <p className="mt-6 max-w-4xl border border-dashed border-rule px-5 py-8 text-center text-muted">
        {down
          ? "부모 품목을 고르고 「펼치기」를 누르면 자품목이 끝 단계까지 보입니다."
          : "자품목을 고르고 「펼치기」를 누르면 그 품목을 쓰는 반제품 · 완제품이 위로 끝 단계까지 보입니다."}
      </p>
    );
  const { item, explosion } = view;
  const levels = explosion.lines.reduce((m, l) => Math.max(m, l.level), 0);
  return (
    <>
      <p className="mt-6 max-w-4xl" aria-live="polite">
        <span className="font-mono font-semibold">{item.code}</span> <span className="font-semibold">{item.name}</span>
        <span className="text-muted">
          {" "}
          ({itemTypeName(item.itemType)}
          {item.active ? "" : " · 사용 안 함"})
        </span>
        <span className="block text-sm text-muted">
          기준일 {view.date}
          {down && (
            <>
              {" "}
              · 기준수량 {view.baseQty} <span className="font-mono">{item.unit}</span> · 펼친 수량{" "}
              <span className="font-semibold text-ink tabular-nums">{view.qty}</span>{" "}
              <span className="font-mono">{item.unit}</span>
            </>
          )}{" "}
          · {levels}단계 · {explosion.lines.length}줄
        </span>
      </p>
      {explosion.depthStopped && (
        <p role="status" className="mt-2 max-w-4xl border-l-4 border-safety bg-white px-5 py-2 text-sm">
          {EXPLODE_DEPTH}단계에서 멈췄습니다 — 그 아래 단계는 보이지 않습니다.
        </p>
      )}
      {explosion.truncated && (
        <p role="status" className="mt-2 max-w-4xl border-l-4 border-safety bg-white px-5 py-2 text-sm">
          줄이 {EXPLODE_ROWS.toLocaleString("ko-KR")}을 넘어 앞 단계부터 {EXPLODE_ROWS.toLocaleString("ko-KR")}줄만
          보입니다.
        </p>
      )}
      {explosion.lines.length === 0 ? (
        <p className="mt-4 max-w-4xl border border-dashed border-rule px-5 py-8 text-center text-muted">
          {down
            ? `기준일 ${view.date} 에 적용되는 자품목 줄이 없습니다.`
            : `기준일 ${view.date} 에 이 품목을 자품목으로 쓰는 BOM 줄이 없습니다.`}
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted md:hidden">표를 옆으로 밀면 다른 열이 보입니다</p>
          <ExplosionTable mode={view.mode} lines={explosion.lines} />
        </>
      )}
    </>
  );
}

// 휴대폰 폭에서 표를 옆으로 밀어도 단계 · 품목(코드 · 이름)이 왼쪽에 남는다(「품목별 재고」와 같은 틀).
const STICKY = "sticky z-10 bg-white";

function ExplosionTable({ mode, lines }: { mode: BomMode; lines: ExplodedLine[] }) {
  const down = mode === "down";
  const num = "px-2 py-2 text-right whitespace-nowrap tabular-nums";
  const unit = (u: string) => <span className="ml-1 font-mono text-xs text-muted">{u}</span>;
  return (
    <div
      className="relative mt-2 overflow-x-auto border-x border-rule bg-white"
      tabIndex={0}
      role="region"
      aria-label={down ? "정전개 표" : "역전개 표"}
    >
      <table className="w-max min-w-full border-collapse text-left text-sm">
        <caption className="sr-only">
          {down
            ? "정전개 — 단계마다 자품목 · 소요량 · 기준수량 · 로스율 · 필요량"
            : "역전개 — 단계마다 그 품목을 쓰는 부모 · 소요량 · 기준수량 · 로스율"}
        </caption>
        <thead>
          <tr className="border-b-2 border-machine">
            <th scope="col" className={`${STICKY} left-0 w-10 px-2 py-2 text-right`}>
              단계
            </th>
            <th scope="col" className={`${STICKY} left-10 px-2 py-2 shadow-[inset_-1px_0_0_var(--color-rule)]`}>
              {down ? "자품목" : "부모 품목"}
            </th>
            <th scope="col" className="px-2 py-2">
              유형
            </th>
            <th scope="col" className="px-2 py-2">
              단위
            </th>
            <th scope="col" className="px-2 py-2 text-right">
              소요량
            </th>
            <th scope="col" className="px-2 py-2 text-right">
              기준수량
            </th>
            <th scope="col" className="px-2 py-2 text-right">
              로스율
            </th>
            {down && (
              <th scope="col" className="px-2 py-2 text-right">
                필요량
              </th>
            )}
            <th scope="col" className="px-2 py-2">
              적용 기간
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.key} className={`border-b border-rule align-top ${l.item.active ? "" : "text-muted"}`}>
              <td className={`${STICKY} left-0 w-10 px-2 py-2 text-right font-mono tabular-nums`}>{l.level}</td>
              <th
                scope="row"
                className={`${STICKY} left-10 max-w-[9.5rem] px-2 py-2 text-left font-normal shadow-[inset_-1px_0_0_var(--color-rule)] sm:max-w-none`}
              >
                {/* 단계마다 들여 쓴다 — 여섯 단계 넘게는 더 들이지 않는다(휴대폰 폭). */}
                <div style={{ paddingLeft: `${Math.min(l.level - 1, 6) * 0.75}rem` }}>
                  <span className="font-mono whitespace-nowrap">{l.item.code}</span>{" "}
                  <span className="wrap-anywhere">{l.item.name}</span>
                  {!l.item.active && (
                    <span className="ml-1 rounded border border-rule px-1.5 py-0.5 text-xs whitespace-nowrap">
                      사용 안 함
                    </span>
                  )}
                  {l.noBom && (
                    <span className="ml-1 rounded border border-safety px-1.5 py-0.5 text-xs whitespace-nowrap">
                      BOM 없음
                    </span>
                  )}
                </div>
              </th>
              <td className="px-2 py-2 whitespace-nowrap">{itemTypeName(l.item.itemType)}</td>
              <td className="px-2 py-2 font-mono whitespace-nowrap">{l.item.unit}</td>
              <td className={num}>
                {l.qty}
                {!down && unit(l.qtyUnit)}
              </td>
              <td className={num}>
                {l.baseQty}
                {down && unit(l.baseUnit)}
              </td>
              <td className={num}>{l.lossRate}%</td>
              {down && <td className={`${num} font-semibold`}>{l.required}</td>}
              <td className="px-2 py-2 whitespace-nowrap tabular-nums">
                {l.validFrom} ~ {l.validTo}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
