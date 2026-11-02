import mermaid from "mermaid";
import { describe, expect, it } from "vitest";
import { DATA_MODEL, OVERVIEW, SYSTEM } from "@/content/diagrams";

// 그림의 글이 Mermaid 문법에 맞는지 — 틀리면 설계도 화면에 그림 대신 오류가 뜬다.
describe("설계도의 Mermaid 글", () => {
  it.each([
    ["Overview", OVERVIEW, "flowchart-v2"],
    ["데이터 모델", DATA_MODEL, "er"],
    ["시스템 구성", SYSTEM, "flowchart-v2"],
  ])("%s 은 문법에 맞다", async (_name, source, type) => {
    await expect(mermaid.parse(source)).resolves.toMatchObject({ diagramType: type });
  });

  it("틀린 글은 거절한다", async () => {
    await expect(mermaid.parse("flowchart LR\n  A -- --> ")).rejects.toThrow();
  });

  it("데이터 모델은 조각 「기준정보」의 테이블 다섯을 든다", () => {
    for (const table of ["items", "warehouses", "partners", "code_groups", "codes"]) {
      expect(DATA_MODEL).toContain(` ${table}`);
    }
  });
});
