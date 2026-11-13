import { BOM_HISTORY_SHOWN, type BomChangeEntry, type BomChangeKind } from "@/db/boms";

// 한 품목의 BOM 고친 이력(조각 「BOM」 성공 기준 16, ADR 0028 의 3) — 최근 저장부터. 한 저장의 줄은 같은 일시다. 지운 BOM 의 이력도 보인다.
// 누가 고쳤는지는 아직 남지 않는다 — 로그인이 생기는 조각 「인사」 뒤(ADR 0028 의 4). 읽기만 한다.

const KIND: Record<BomChangeKind, string> = {
  BOM_ADD: "BOM 등록",
  BOM_DEL: "BOM 지움",
  BASE: "기준수량 고침",
  LINE_ADD: "줄 더함",
  LINE_DEL: "줄 뺌",
  LINE_EDIT: "줄 고침",
};

const FIELD: Record<string, string> = {
  baseQty: "기준수량",
  qty: "소요량",
  lossRate: "로스율",
  validFrom: "적용 시작일",
  validTo: "적용 종료일",
  note: "비고",
};

/** 칸 하나의 값 — 빈 값은 「(없음)」, 종료일이 비면 「계속」, 로스율은 %, 수량은 단위를 붙인다. */
function shown(field: string, value: string | undefined, unit: string): string {
  if (value === undefined) return "";
  if (field === "validTo" && value === "") return "계속";
  if (value === "") return "(없음)";
  if (field === "lossRate") return `${value}%`;
  if (field === "qty" || field === "baseQty") return `${value} ${unit}`;
  return value;
}

/**
 * 줄 더함 · 뺌은 그 줄의 칸을 한 줄로, 고침은 바뀐 칸마다 「전 → 후」. 수량의 단위는 이력에 남은 그때의 단위다(`unit` — PR C 리뷰 1회차). 그것이 없는 줄만
 * 지금 품목의 단위로 보인다.
 */
function detail(e: BomChangeEntry, parentUnit: string): string {
  const now = e.child?.unit ?? parentUnit;
  const unitBefore = e.before.unit ?? now;
  const unitAfter = e.after.unit ?? now;
  if (e.kind === "LINE_ADD" || e.kind === "LINE_DEL") {
    const v = e.kind === "LINE_ADD" ? e.after : e.before;
    const unit = e.kind === "LINE_ADD" ? unitAfter : unitBefore;
    const period = `${v.validFrom ?? ""} ~ ${v.validTo || ""}`.trim();
    return [
      `소요량 ${shown("qty", v.qty, unit)}`,
      `로스율 ${shown("lossRate", v.lossRate, unit)}`,
      period,
      v.note ? `비고 ${v.note}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }
  const keys = [...new Set([...Object.keys(e.before), ...Object.keys(e.after)])].filter((k) => k !== "unit");
  return keys
    .map((k) => {
      const [b, a] = [shown(k, e.before[k], unitBefore), shown(k, e.after[k], unitAfter)];
      return e.kind === "BOM_ADD" || e.kind === "BOM_DEL"
        ? `${FIELD[k] ?? k} ${b || a}`
        : `${FIELD[k] ?? k} ${b} → ${a}`;
    })
    .join(" · ");
}

export function BomHistory({ history, unit }: { history: { total: number; entries: BomChangeEntry[] }; unit: string }) {
  return (
    <section className="mt-10 border-t border-rule pt-4" aria-labelledby="bom-history">
      <h2 id="bom-history" className="font-semibold">
        고친 이력
      </h2>
      <p className="text-sm text-muted">
        이 품목의 BOM 을 저장 · 지울 때마다 바뀐 것이 남습니다(최근 것부터
        {history.total > BOM_HISTORY_SHOWN
          ? `, ${history.total.toLocaleString("ko-KR")}줄 가운데 ${BOM_HISTORY_SHOWN}줄`
          : ""}
        ). 누가 고쳤는지는 로그인이 생긴 뒤 남깁니다.
      </p>
      {history.entries.length === 0 ? (
        <p className="mt-3 border border-dashed border-rule px-5 py-6 text-center text-sm text-muted">
          아직 고친 이력이 없습니다.
        </p>
      ) : (
        <div
          className="relative mt-3 overflow-x-auto border-x border-rule bg-white"
          tabIndex={0}
          role="region"
          aria-label="고친 이력 표"
        >
          <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
            <caption className="sr-only">BOM 고친 이력 — 일시 · 구분 · 자품목 · 내용</caption>
            <thead className="border-b-2 border-machine">
              <tr>
                <th scope="col" className="w-36 px-2 py-2">
                  일시
                </th>
                <th scope="col" className="w-28 px-2 py-2">
                  구분
                </th>
                <th scope="col" className="w-56 px-2 py-2">
                  자품목
                </th>
                <th scope="col" className="px-2 py-2">
                  내용
                </th>
              </tr>
            </thead>
            <tbody>
              {history.entries.map((e, i) => {
                const first = i === 0 || history.entries[i - 1].saveKey !== e.saveKey;
                return (
                  <tr key={e.id} className={`align-top ${first ? "border-t border-rule" : ""}`}>
                    <td className="px-2 py-1.5 whitespace-nowrap tabular-nums text-muted">{first ? e.savedAt : ""}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{KIND[e.kind]}</td>
                    <td className="px-2 py-1.5">
                      {e.child && (
                        <>
                          <span className="mr-1 text-muted">줄 {e.lineNo}</span>
                          <span className="font-mono">{e.child.code}</span> {e.child.name}
                        </>
                      )}
                    </td>
                    <td className="px-2 py-1.5 wrap-anywhere">{detail(e, unit)}</td>
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
