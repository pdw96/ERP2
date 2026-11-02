import { MermaidDiagram } from "@/components/mermaid-diagram";
import { DATA_MODEL } from "@/content/diagrams";

export default function DesignModelPage() {
  return (
    <>
      <h2 className="text-xl font-semibold">데이터 모델</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        테이블과 그 관계입니다. 칸이 있는 다섯은 조각 「기준정보」가 만드는 테이블이고, 「(예정)」은 뒤 조각이 더할
        테이블입니다.
      </p>
      <div className="mt-4 border border-rule bg-white p-4">
        <MermaidDiagram source={DATA_MODEL} title="테이블과 그 관계" />
      </div>
    </>
  );
}
