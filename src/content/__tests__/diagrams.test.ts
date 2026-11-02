import mermaid from "mermaid";
import { describe, expect, it } from "vitest";
import { CURRENT_SLICE, DATA_MODEL, MODULE_FLOWS, MODULE_MAP, OVERVIEW, SYSTEM } from "@/content/diagrams";

// 그림의 글이 Mermaid 문법에 맞는지 — 틀리면 설계도 화면에 그림 대신 오류가 뜬다.
describe("설계도의 Mermaid 글", () => {
  it.each([
    ["Overview", OVERVIEW, "flowchart-v2"],
    ["이 조각의 테이블", DATA_MODEL, "er"],
    ["시스템 구성", SYSTEM, "flowchart-v2"],
  ])("%s 은 문법에 맞다", async (_name, source, type) => {
    await expect(mermaid.parse(source)).resolves.toMatchObject({ diagramType: type });
  });

  it("틀린 글은 거절한다", async () => {
    await expect(mermaid.parse("flowchart LR\n  A -- --> ")).rejects.toThrow();
  });

  it("이 조각의 테이블 다섯은 상세 그림에 칸과 함께 있다", () => {
    for (const table of ["items", "warehouses", "partners", "code_groups", "codes"]) {
      expect(DATA_MODEL).toContain(` ${table}`);
    }
  });
});

describe("모듈별 전체 지도", () => {
  it("모듈은 마스터플랜 「모듈과 메뉴」의 순서다(원가는 후보만 있어 아직 없다)", () => {
    expect(MODULE_MAP.map((m) => m.module)).toEqual([
      "기준정보",
      "영업",
      "구매",
      "재고",
      "생산",
      "품질",
      "회계",
      "인사",
      "시스템 관리",
    ]);
  });

  it("지금 짓는 조각의 테이블은 상세 그림의 다섯과 같다", () => {
    const mine = MODULE_MAP.flatMap((m) => m.tables).filter((t) => t.slice === CURRENT_SLICE);
    expect(mine.map((t) => t.table).sort()).toEqual(["code_groups", "codes", "items", "partners", "warehouses"]);
  });

  it("테이블 이름(id)은 겹치지 않고, 흐름은 지도에 있는 테이블만 가리킨다", () => {
    const ids = MODULE_MAP.flatMap((m) => m.tables.map((t) => t.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const flow of MODULE_FLOWS) {
      expect(flow.length).toBeGreaterThanOrEqual(2);
      for (const id of flow) expect(ids, id).toContain(id);
    }
  });
});
