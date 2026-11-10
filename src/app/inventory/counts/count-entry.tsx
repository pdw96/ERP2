"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { inputClass } from "@/components/form-parts";
import type { CountItemOption, CountSheet, CountWarehouse } from "@/db/stock-counts";
import { saveCountAction, type CountFormState } from "./actions";
import { ConfirmPanel } from "./confirm-panel";
import { CountForm } from "./count-form";

// 재고 실사의 입력 — 창고를 고르면(주소의 ?warehouse=) 그 창고의 작성 중 실사나 장부를 불러온 새 실사가 열린다(저자 판정 — 메뉴의 첫 화면은 바로 입력).
// 저장하면 같은 화면에 남아 저장한 실사 번호를 보이고, 입력은 새 번호 · 버전으로 다시 열린다. 「확정…」은 먼저 저장하고 확정 화면을 연다.
export function CountEntry({
  options,
  picked,
  sheet,
  openError,
}: {
  options: { warehouses: CountWarehouse[]; items: CountItemOption[] };
  picked: string;
  sheet: CountSheet | null;
  openError: string | null;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<CountFormState, FormData>(saveCountAction, null);
  // 확정 화면 — 받은 결과가 바뀔 때 한 번 연다. 「돌아가 고치기」로 닫는다.
  const [seen, setSeen] = useState(state);
  const [panelOpen, setPanelOpen] = useState(false);
  if (state !== seen) {
    setSeen(state);
    setPanelOpen(!!(state?.ok && (state.preview || state.previewError)));
  }
  const saved = state?.ok && state.code === sheet?.code ? state : null;

  return (
    <>
      <div className="mt-6 max-w-sm">
        <label htmlFor="f-warehouse" className="block font-semibold">
          창고 <span className="text-sm font-normal text-muted">고르면 그 창고의 실사가 열립니다</span>
        </label>
        <select
          id="f-warehouse"
          value={picked}
          onChange={(ev) =>
            router.push(ev.target.value ? `/inventory/counts?warehouse=${ev.target.value}` : "/inventory/counts")
          }
          className={`${inputClass(false)} mt-1`}
        >
          <option value="">창고를 고르세요</option>
          {options.warehouses.map((w) => (
            <option key={w.code} value={w.code}>
              {w.code} {w.name}
              {w.isDefect ? " (불량)" : ""}
            </option>
          ))}
        </select>
      </div>

      {openError && (
        <p role="alert" className="mt-4 max-w-3xl border-l-4 border-red-700 bg-white px-5 py-3 font-semibold">
          {openError}
        </p>
      )}

      {saved && !panelOpen && (
        <div role="status" className="mt-6 max-w-3xl border-l-4 border-safety bg-white px-5 py-3">
          <p>
            <Link
              href={`/inventory/counts/${saved.code}`}
              className="font-mono font-semibold underline underline-offset-4"
            >
              {saved.code}
            </Link>{" "}
            를 작성 중으로 저장했습니다 — 재고는 아직 그대로입니다. 다 넣으면 「확정…」을 누르세요.
          </p>
        </div>
      )}

      {sheet && panelOpen && state?.ok && (
        <ConfirmPanel preview={state.preview} previewError={state.previewError} onBack={() => setPanelOpen(false)} />
      )}

      {sheet && (
        <div className={panelOpen ? "hidden" : undefined}>
          <CountForm
            key={`${sheet.warehouse.code}-${sheet.code ?? "new"}-${sheet.version ?? ""}`}
            sheet={sheet}
            items={options.items}
            state={state}
            formAction={formAction}
            pending={pending}
          />
        </div>
      )}
    </>
  );
}
