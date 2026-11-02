import type { MapModule } from "@/content/diagrams";

// 모듈별 테이블 지도 — 모듈 카드를 격자로 늘어놓고, 아래에 모듈 사이의 주요 흐름을 화살표 줄로 보인다.
// 좁은 화면에서는 카드가 한 줄씩 쌓인다.
export function ModuleMap({
  modules,
  flows,
  current,
}: {
  modules: readonly MapModule[];
  flows: readonly (readonly string[])[];
  current: string;
}) {
  const names = new Map(modules.flatMap((m) => m.tables.map((t) => [t.id, t.name] as const)));
  const nameOf = (id: string) => {
    const name = names.get(id);
    if (!name) throw new Error(`흐름이 지도에 없는 테이블 ${id} 를 가리킨다`);
    return name;
  };

  return (
    <div>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="모듈별 테이블">
        {modules.map((m) => (
          <li key={m.module} className="border border-rule bg-white">
            <h3 className="bg-machine px-4 py-2 font-semibold text-white">{m.module}</h3>
            <ul className="space-y-2 p-4">
              {m.tables.map((t) => {
                const mine = t.slice === current;
                return (
                  <li
                    key={t.id}
                    data-table={t.id}
                    data-current={mine || undefined}
                    className={`flex items-baseline justify-between gap-3 px-3 py-1.5 text-sm ${
                      mine ? "border-2 border-ink bg-safety font-semibold" : "border border-dashed border-muted"
                    }`}
                  >
                    <span>
                      {t.name}
                      {t.table && <span className="ml-2 font-normal text-ink/70">{t.table}</span>}
                    </span>
                    <span className={`shrink-0 text-xs ${mine ? "" : "text-muted"}`}>「{t.slice}」</span>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>

      <h3 className="mt-8 font-semibold">모듈 사이의 주요 흐름</h3>
      <p className="mt-1 text-sm text-muted">앞 테이블의 기록이 뒤 테이블을 만듭니다.</p>
      <ol className="mt-3 space-y-1.5 text-sm" aria-label="모듈 사이의 주요 흐름">
        {flows.map((flow, i) => (
          <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {flow.map((id, j) => (
              <span key={id} className="flex items-center gap-2">
                {j > 0 && (
                  <span aria-hidden className="text-machine-line">
                    →
                  </span>
                )}
                <span className="border border-rule bg-white px-2 py-0.5">{nameOf(id)}</span>
              </span>
            ))}
          </li>
        ))}
      </ol>
    </div>
  );
}
