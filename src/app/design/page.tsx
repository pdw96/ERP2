import { MermaidDiagram } from "@/components/mermaid-diagram";
import { Swimlane } from "@/components/swimlane";
import { OVERVIEW, SWIMLANE } from "@/content/diagrams";

export default function DesignFlowPage() {
  return (
    <>
      <h2 className="text-xl font-semibold">업무 흐름</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        부서마다 세로 칸을 나눴습니다. 주문부터 월 마감까지 한 줄기로 따라가고, 칸을 건너는 화살표가 부서 사이의
        이관입니다.
      </p>
      <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm" aria-label="모양의 뜻">
        <li className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-4 w-8 rounded-full bg-ink" /> 시작 · 끝
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-4 w-8 rounded-sm border border-machine-line bg-white" /> 작업
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="inline-block size-4 rotate-45 border border-[#b08a10] bg-[#fff8dc]" /> 판단(예 /
          아니오)
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="inline-block w-8 border-t-2 border-dashed border-machine-line" /> 담당자 지정
        </li>
      </ul>

      <div className="mt-4 overflow-x-auto border border-rule bg-white">
        <Swimlane data={SWIMLANE} title="부서별 업무 흐름 — 주문부터 월 마감까지" />
      </div>

      <h2 className="mt-12 text-xl font-semibold">Overview</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted">부서 사이에 무엇이 오가는지 간추린 그림입니다.</p>
      <div className="mt-4 border border-rule bg-white p-4">
        <MermaidDiagram source={OVERVIEW} title="부서 사이에 오가는 것" />
      </div>
    </>
  );
}
