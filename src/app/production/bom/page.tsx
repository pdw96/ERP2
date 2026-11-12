import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { bomFormOptions, listBoms } from "@/db/boms";
import { withDb } from "@/db/request";
import { ITEM_CODE } from "@/lib/bom-input";
import { itemTypeName } from "@/lib/master-codes";

export const metadata: Metadata = { title: "BOM 등록 — ERP2" };

// 생산 › 생산 기준정보 › BOM 등록(조각 「BOM」 PR A, ADR 0026) — BOM 이 있는 반제품 · 완제품의 목록과 새 BOM 의 입구.
// 품목코드를 누르면 그 BOM 의 머리 · 자품목 줄이 열린다. 새 BOM 은 BOM 이 아직 없는 「사용」 반제품 · 완제품에서 고른다(주소 ?parent= 로 옮겨 간다).
export default function BomPage({ searchParams }: PageProps<"/production/bom">) {
  return (
    <section className="max-w-6xl">
      <p className="text-sm text-muted">
        <Link href="/production" className="underline-offset-4 hover:underline">
          생산
        </Link>{" "}
        › 생산 기준정보 › BOM 등록
      </p>
      <h1 className="mt-1 text-3xl leading-tight font-semibold">BOM 등록</h1>
      <p className="mt-1 max-w-3xl text-muted">
        반제품 · 완제품 하나를 만드는 데 드는 자품목(원자재 · 반제품 · 부자재)과 양입니다. 소요량은 기준수량당 양이고,
        로스율은 공정에서 잃는 비율입니다. 설계변경은 옛 줄에 적용 종료일을, 새 줄에 적용 시작일을 넣어 남깁니다.
        소모품은 BOM 에 넣지 않습니다.
      </p>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <Results searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function Results({ searchParams }: Pick<PageProps<"/production/bom">, "searchParams">) {
  const params = await searchParams;
  const parent = typeof params.parent === "string" ? params.parent.trim() : "";
  if (ITEM_CODE.test(parent)) redirect(`/production/bom/${parent}`);
  const deleted = typeof params.deleted === "string" && ITEM_CODE.test(params.deleted) ? params.deleted : undefined;
  await connection();
  let data;
  try {
    data = await withDb(async (db) => ({ rows: await listBoms(db), options: await bomFormOptions(db) }));
  } catch (error) {
    return <LoadFailed error={error} what="BOM 목록" />;
  }
  const { rows, options } = data;

  return (
    <>
      {deleted && (
        <p role="status" className="mt-6 max-w-3xl border-l-4 border-safety bg-white px-5 py-3">
          <span className="font-mono font-semibold">{deleted}</span> 의 BOM 을 지웠습니다.
        </p>
      )}

      <form
        action="/production/bom"
        className="mt-6 grid gap-3 border-y border-rule bg-white px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
      >
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">새 BOM — 부모 품목</span>
          <select
            name="parent"
            required
            defaultValue=""
            className="w-full min-w-0 rounded border border-rule px-3 py-2 text-base"
          >
            <option value="">BOM 이 없는 반제품 · 완제품을 고르세요</option>
            {options.newParents.map((p) => (
              <option key={p.code} value={p.code}>
                {p.code} {p.name} ({itemTypeName(p.itemType)})
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={options.newParents.length === 0}
          className="rounded bg-machine px-5 py-2.5 font-semibold text-white hover:bg-machine-deep disabled:opacity-60"
        >
          새 BOM 등록
        </button>
        {options.newParents.length === 0 && (
          <p className="text-sm text-muted sm:col-span-2">
            「사용」인 반제품 · 완제품은 모두 BOM 이 있습니다 — 아래에서 골라 고치세요.
          </p>
        )}
      </form>

      {rows.length === 0 ? (
        <p className="mt-6 border border-dashed border-rule px-5 py-8 text-center text-muted">
          아직 BOM 이 없습니다 — 위에서 부모 품목을 골라 등록하세요.
        </p>
      ) : (
        <>
          <p className="mt-6 text-sm text-muted" aria-live="polite">
            BOM {rows.length}개
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse bg-white text-left">
              <caption className="sr-only">BOM 목록</caption>
              <thead className="border-b-2 border-machine text-sm">
                <tr>
                  <th scope="col" className="px-3 py-2">
                    품목코드
                  </th>
                  <th scope="col" className="px-3 py-2">
                    품목명
                  </th>
                  <th scope="col" className="px-3 py-2">
                    유형
                  </th>
                  <th scope="col" className="px-3 py-2 text-right">
                    기준수량
                  </th>
                  <th scope="col" className="px-3 py-2 text-right">
                    자품목 줄
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.code} className={`border-b border-rule align-top ${r.active ? "" : "text-muted"}`}>
                    <td className="px-3 py-2.5 font-mono text-sm whitespace-nowrap">
                      <Link
                        href={`/production/bom/${r.code}`}
                        className="font-semibold text-ink underline underline-offset-4 hover:text-machine"
                      >
                        {r.code}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 wrap-anywhere">
                      <span className="font-semibold">{r.name}</span>
                      {!r.active && (
                        <span className="ml-2 rounded border border-rule px-1.5 py-0.5 text-xs whitespace-nowrap">
                          사용 안 함
                        </span>
                      )}
                      {r.spec && <span className="block text-sm text-muted">{r.spec}</span>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{itemTypeName(r.itemType)}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
                      {r.baseQty} <span className="font-mono text-xs text-muted">{r.unit}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.lines}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
