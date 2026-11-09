"use client";

import { useEffect, useState } from "react";
import type { MoveWarehouseOption, WarehouseStockRow } from "@/db/stock";
import { warehouseStockAction } from "./actions";

// 머리에서 고른 창고의 현재고 — 기타출고 · 재고이동 · 재고조정 등록이 그 창고에 무엇이 있는지 조회 메뉴에 가지 않고 보며, 체크해 「줄로 넣기」로
// 품목 · LOT 가 채워진 줄을 만든다(설계 「2026-11-09 — PR F 검토 중 정한 것」). 가용이 아니거나 「사용 안 함」 품목은 보이기만 하고 고르지 못한다.
// 이미 줄에 있는 품목 · LOT 는 「줄에 있음」으로 보인다. 창고를 바꾸거나 저장해 화면이 다시 그려지면 다시 읽는다.

type Load = { warehouse: string; rows: WarehouseStockRow[] | null } | null;

const keyOf = (r: WarehouseStockRow) => `${r.itemCode}|${r.lot}`;

export function StockPanel({
  warehouse,
  inLines,
  onPick,
}: {
  warehouse: MoveWarehouseOption | undefined;
  /** 이미 줄에 있는 「품목코드|LOT」. */
  inLines: Set<string>;
  onPick: (rows: WarehouseStockRow[]) => void;
}) {
  const code = warehouse?.code ?? "";
  const [load, setLoad] = useState<Load>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [find, setFind] = useState("");

  useEffect(() => {
    if (!code) return;
    let live = true;
    warehouseStockAction(code).then((rows) => {
      if (live) setLoad({ warehouse: code, rows });
    });
    return () => {
      live = false;
    };
  }, [code]);

  // 창고가 바뀌면 고른 것과 찾는 글자를 비운다(받은 창고가 바뀔 때 한 번).
  const [seenCode, setSeenCode] = useState(code);
  if (code !== seenCode) {
    setSeenCode(code);
    setChecked(new Set());
    setFind("");
  }

  const title = (
    <h2 className="text-lg font-semibold">{warehouse ? `${warehouse.code} ${warehouse.name} 현재고` : "현재고"}</h2>
  );
  const box = "mt-8 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 border-t-2 border-machine pt-4";

  if (!warehouse)
    return (
      <section className={box} aria-label="현재고">
        {title}
        <p className="border border-dashed border-rule px-5 py-6 text-center text-muted">
          창고를 고르면 그 창고의 현재고가 보이고, 골라서 줄로 넣을 수 있습니다.
        </p>
      </section>
    );

  const rows = load && load.warehouse === code ? load.rows : undefined;
  const q = find.trim().toLowerCase();
  const shown = (rows ?? []).filter((r) => !q || `${r.itemCode} ${r.itemName} ${r.lot}`.toLowerCase().includes(q));
  const pickable = (r: WarehouseStockRow) => r.pickable && !inLines.has(keyOf(r));
  const picked = (rows ?? []).filter((r) => checked.has(keyOf(r)) && pickable(r));

  const toggle = (r: WarehouseStockRow) =>
    setChecked((c) => {
      const next = new Set(c);
      if (next.has(keyOf(r))) next.delete(keyOf(r));
      else next.add(keyOf(r));
      return next;
    });
  const allShown = shown.filter(pickable);
  const allChecked = allShown.length > 0 && allShown.every((r) => checked.has(keyOf(r)));
  const toggleAll = () =>
    setChecked((c) => {
      const next = new Set(c);
      for (const r of allShown) {
        if (allChecked) next.delete(keyOf(r));
        else next.add(keyOf(r));
      }
      return next;
    });

  return (
    <section className={box} aria-label="현재고">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {title}
          <p className="text-sm text-muted">
            {warehouse.isDefect
              ? "불량창고의 재고는 모두 불량입니다 — 재고조정만 받습니다."
              : "가용 재고만 고를 수 있습니다. 체크하고 「줄로 넣기」를 누르면 품목 · LOT 가 채워진 줄이 생깁니다."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="stock-find" className="sr-only">
            현재고에서 찾기
          </label>
          <input
            id="stock-find"
            value={find}
            onChange={(ev) => setFind(ev.target.value)}
            placeholder="품목 · LOT 찾기"
            autoComplete="off"
            className="w-48 rounded border border-rule bg-white px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => {
              onPick(picked);
              setChecked(new Set());
            }}
            disabled={picked.length === 0}
            className="rounded bg-machine px-4 py-2 font-semibold text-white hover:bg-machine-deep disabled:opacity-60"
          >
            줄로 넣기{picked.length ? ` (${picked.length})` : ""}
          </button>
        </div>
      </div>
      {rows === undefined ? (
        <p className="text-muted">불러오는 중입니다.</p>
      ) : rows === null ? (
        <p role="alert" className="text-sm font-semibold text-red-700">
          현재고를 불러오지 못했습니다 — 창고를 다시 고르세요.
        </p>
      ) : (
        <div className="relative max-h-80 overflow-auto border border-rule bg-white">
          <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
            <caption className="sr-only">{`${warehouse.code} 현재고`}</caption>
            <thead className="sticky top-0 border-b-2 border-machine bg-white">
              <tr>
                <th scope="col" className="w-10 px-2 py-2">
                  <input
                    type="checkbox"
                    aria-label="보이는 것 모두 고르기"
                    checked={allChecked}
                    onChange={toggleAll}
                    disabled={allShown.length === 0}
                  />
                </th>
                <th scope="col" className="px-2 py-2">
                  품목코드
                </th>
                <th scope="col" className="px-2 py-2">
                  품명
                </th>
                <th scope="col" className="px-2 py-2">
                  LOT번호
                </th>
                <th scope="col" className="px-2 py-2 text-right">
                  현재고
                </th>
                <th scope="col" className="px-2 py-2">
                  단위
                </th>
                <th scope="col" className="px-2 py-2">
                  <span className="sr-only">상태</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-muted">
                    {rows.length === 0 ? "이 창고에는 재고가 없습니다." : "찾는 품목 · LOT 가 없습니다."}
                  </td>
                </tr>
              )}
              {shown.map((r) => {
                const k = keyOf(r);
                const can = pickable(r);
                const already = inLines.has(k);
                return (
                  <tr key={`${k}|${r.status}`} className={`border-b border-rule ${can ? "" : "text-muted"}`}>
                    <td className="px-2 py-1.5">
                      <input
                        type="checkbox"
                        aria-label={`${r.itemCode} ${r.lot || "LOT 없음"} 고르기`}
                        checked={can && checked.has(k)}
                        onChange={() => toggle(r)}
                        disabled={!can}
                      />
                    </td>
                    <td className="px-2 py-1.5 font-mono whitespace-nowrap">{r.itemCode}</td>
                    <td className="px-2 py-1.5">{r.itemName}</td>
                    <td className="px-2 py-1.5 font-mono whitespace-nowrap">{r.lot || "—"}</td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">{r.qty}</td>
                    <td className="px-2 py-1.5">{r.unit}</td>
                    <td className="px-2 py-1.5 text-xs whitespace-nowrap">
                      {already ? "줄에 있음" : r.status === "QC" ? "검사대기" : !r.pickable ? "사용 안 함" : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
