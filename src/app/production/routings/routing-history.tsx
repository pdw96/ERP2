import { ROUTING_HISTORY_SHOWN, type RoutingChangeEntry, type RoutingChangeKind } from "@/db/routings";

// 한 품목의 라우팅 고친 이력(메뉴 「라우팅」) — 최근 저장부터, 저장마다 묶어 일시는 그 저장의 첫 줄에만. 일 하나가 한 줄이다. 지운 라우팅의 이력도 보인다.
// 누가 고쳤는지는 아직 남지 않는다 — 로그인이 생긴 뒤(BOM 과 같다). 읽기만 한다.

const KIND: Record<RoutingChangeKind, string> = {
  ROUTING_ADD: "라우팅 등록",
  ROUTING_DEL: "라우팅 지움",
  STEP_ADD: "공정 더함",
  STEP_DEL: "공정 뺌",
  STEP_EDIT: "공정 고침",
  MAT_ADD: "자재 붙임",
  MAT_MOVE: "자재 옮김",
  MAT_DEL: "자재 뗌",
};

const FIELD: Record<string, string> = {
  seq: "순번",
  process: "공정",
  workCenter: "작업장",
  setupMin: "준비시간(분)",
  runSec: "개당 시간(초)",
  note: "비고",
  step: "투입 공정",
};

const shown = (value: string | undefined) => (value === undefined ? "" : value === "" ? "(없음)" : value);

/**
 * 공정 더함 · 뺌은 그 줄의 칸을 한 줄로(순번은 대상 칸에 있어 빼고, 빈 비고도 뺀다). 공정 고침 · 자재 옮김은 바뀐 칸마다 「칸 전 → 후」.
 * 자재 붙임 · 뗌은 붙은 공정, 라우팅 등록 · 지움은 내용이 없다(그 저장의 다른 줄이 보인다).
 */
function detail(e: RoutingChangeEntry): string {
  if (e.kind === "ROUTING_ADD" || e.kind === "ROUTING_DEL") return "";
  // 칸은 화면의 칸 차례로 — 저장된 값(jsonb)은 칸 차례를 지키지 않는다.
  const ordered = (keys: Iterable<string>) => {
    const set = new Set(keys);
    return [...Object.keys(FIELD).filter((k) => set.has(k)), ...[...set].filter((k) => !(k in FIELD))];
  };
  if (e.kind === "STEP_ADD" || e.kind === "STEP_DEL" || e.kind === "MAT_ADD" || e.kind === "MAT_DEL") {
    const v = e.kind === "STEP_ADD" || e.kind === "MAT_ADD" ? e.after : e.before;
    return ordered(Object.keys(v))
      .filter((k) => k !== "seq" && v[k] !== "")
      .map((k) => `${FIELD[k] ?? k} ${v[k]}`)
      .join(" · ");
  }
  return ordered([...Object.keys(e.before), ...Object.keys(e.after)])
    .map((k) => `${FIELD[k] ?? k} ${shown(e.before[k])} → ${shown(e.after[k])}`)
    .join(" · ");
}

export function RoutingHistory({ history }: { history: { total: number; entries: RoutingChangeEntry[] } }) {
  return (
    <section className="mt-10 border-t border-rule pt-4" aria-labelledby="routing-history">
      <h2 id="routing-history" className="font-semibold">
        고친 이력
      </h2>
      <p className="text-sm text-muted">
        이 품목의 라우팅을 저장 · 지울 때마다 바뀐 것이 남습니다(최근 것부터). 누가 고쳤는지는 로그인이 생긴 뒤
        남깁니다.
      </p>
      {history.total > ROUTING_HISTORY_SHOWN && (
        <p className="mt-1 text-sm">
          최근 {ROUTING_HISTORY_SHOWN}줄만 보입니다(전체 {history.total.toLocaleString("ko-KR")}줄)
        </p>
      )}
      {history.entries.length === 0 ? (
        <p className="mt-3 border border-dashed border-rule px-5 py-6 text-center text-sm text-muted">
          고친 이력이 없습니다
        </p>
      ) : (
        <div
          className="relative mt-3 overflow-x-auto border-x border-rule bg-white"
          tabIndex={0}
          role="region"
          aria-label="고친 이력 표"
        >
          <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
            <caption className="sr-only">라우팅 고친 이력 — 일시 · 구분 · 대상 · 내용</caption>
            <thead className="border-b-2 border-machine">
              <tr>
                <th scope="col" className="w-36 px-2 py-2">
                  일시
                </th>
                <th scope="col" className="w-24 px-2 py-2">
                  구분
                </th>
                <th scope="col" className="w-56 px-2 py-2">
                  대상
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
                      {e.material ? (
                        <>
                          <span className="font-mono">{e.material.code}</span> {e.material.name}
                        </>
                      ) : (
                        e.seq !== undefined && <span className="text-muted">순번 {e.seq}</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 wrap-anywhere">{detail(e)}</td>
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
