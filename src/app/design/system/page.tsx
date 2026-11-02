import { MermaidDiagram } from "@/components/mermaid-diagram";
import { SYSTEM } from "@/content/diagrams";

export default function DesignSystemPage() {
  return (
    <>
      <h2 className="text-xl font-semibold">시스템 구성</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        화면 · 서버 · DB · 자동 검사 · 알림이 어떻게 이어지는지입니다.
      </p>
      <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm" aria-label="색의 뜻">
        <li className="flex items-center gap-2">
          <span aria-hidden className="inline-block size-4 bg-machine" /> 있음
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="inline-block size-4 border border-ink bg-safety" /> 지금 짓는 조각에서 생김
        </li>
      </ul>
      <div className="mt-4 border border-rule bg-white p-4">
        <MermaidDiagram source={SYSTEM} title="시스템 구성" />
      </div>
    </>
  );
}
