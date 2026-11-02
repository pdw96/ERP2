import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ModuleMap } from "@/components/module-map";
import { CURRENT_SLICE, MODULE_FLOWS, MODULE_MAP } from "@/content/diagrams";

describe("ModuleMap", () => {
  it("모듈마다 카드 하나, 카드 안에 그 모듈의 테이블과 만들 조각을 보인다", () => {
    render(<ModuleMap modules={MODULE_MAP} flows={MODULE_FLOWS} current={CURRENT_SLICE} />);
    const cards = within(screen.getByRole("list", { name: "모듈별 테이블" })).getAllByRole("heading", { level: 3 });
    expect(cards.map((h) => h.textContent)).toEqual(MODULE_MAP.map((m) => m.module));
    const wo = document.querySelector('[data-table="wo"]')!;
    expect(wo).toHaveTextContent("작업지시");
    expect(wo).toHaveTextContent("「작업지시」");
  });

  it("지금 짓는 조각의 테이블만 따로 표시한다", () => {
    render(<ModuleMap modules={MODULE_MAP} flows={MODULE_FLOWS} current="기준정보" />);
    const marked = [...document.querySelectorAll("[data-current]")].map((el) => el.getAttribute("data-table"));
    expect(marked.sort()).toEqual(["code_groups", "codes", "items", "partners", "warehouses"]);
  });

  it("흐름을 화살표 줄로 보인다", () => {
    render(<ModuleMap modules={MODULE_MAP} flows={[["plo", "wo", "result"]]} current="기준정보" />);
    expect(screen.getByRole("list", { name: "모듈 사이의 주요 흐름" }).textContent).toContain(
      "계획오더→작업지시→생산실적",
    );
  });

  it("지도에 없는 테이블을 가리키는 흐름은 그리지 않고 까닭을 알린다", () => {
    expect(() => render(<ModuleMap modules={MODULE_MAP} flows={[["plo", "zzz"]]} current="기준정보" />)).toThrow(
      "흐름이 지도에 없는 테이블 zzz 를 가리킨다",
    );
  });
});
