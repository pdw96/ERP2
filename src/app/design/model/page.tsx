import { MermaidDiagram } from "@/components/mermaid-diagram";
import { ModuleMap } from "@/components/module-map";
import { CURRENT_SLICE, DATA_MODEL, MODULE_FLOWS, MODULE_MAP } from "@/content/diagrams";

export default function DesignModelPage() {
  return (
    <>
      <h2 className="text-xl font-semibold">모듈별 전체 지도</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        모듈마다 어떤 테이블이 생기고, 어느 조각이 그것을 만드는지 보입니다. 품목 · 거래처 · 공통코드는 모든 모듈이
        씁니다. 예정 테이블의 이름과 관계는 그 조각을 시작할 때 다시 정합니다.
      </p>
      <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm" aria-label="표시의 뜻">
        <li className="flex items-center gap-2">
          <span aria-hidden className="inline-block size-4 border-2 border-ink bg-safety" />{" "}
          {`지금 짓는 조각(「${CURRENT_SLICE}」)이 만듦`}
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="inline-block size-4 border border-dashed border-muted bg-white" /> 예정 — 「」는
          만들 조각
        </li>
      </ul>
      <div className="mt-4">
        <ModuleMap modules={MODULE_MAP} flows={MODULE_FLOWS} current={CURRENT_SLICE} />
      </div>

      <h2 className="mt-12 text-xl font-semibold">이 조각의 테이블</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        조각 「{CURRENT_SLICE}」가 지금까지 만든 테이블과 그 열, 그리고 그것이 가리키는 테이블입니다. UK 는 겹치지 않는
        코드, FK 는 다른 테이블을 가리키는 열입니다. 앞 조각의 테이블은 위의 지도에서 봅니다.
      </p>
      <div className="mt-4 border border-rule bg-white p-4">
        <MermaidDiagram source={DATA_MODEL} title={`조각 「${CURRENT_SLICE}」의 테이블과 그 열`} />
      </div>
    </>
  );
}
