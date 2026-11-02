import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Swimlane } from "@/components/swimlane";
import { SWIMLANE } from "@/content/diagrams";

describe("Swimlane", () => {
  it("칸마다 부서 이름을 머리에 보인다", () => {
    const { container } = render(<Swimlane data={SWIMLANE} title="업무 흐름" />);
    const texts = [...container.querySelectorAll("text")].map((t) => t.textContent);
    for (const lane of SWIMLANE.lanes) expect(texts).toContain(lane);
  });

  it("단계마다 모양을 하나씩 그리고, 판단은 마름모다", () => {
    const { container } = render(<Swimlane data={SWIMLANE} title="업무 흐름" />);
    const steps = container.querySelectorAll("[data-step]");
    expect(steps).toHaveLength(SWIMLANE.nodes.length);
    const asks = SWIMLANE.nodes.filter((n) => n.kind === "ask").map((n) => n.id);
    for (const id of asks) expect(container.querySelector(`[data-step="${id}"] polygon`)).not.toBeNull();
  });

  it("여러 줄 글은 줄마다 나눠 쓰고, 화살표의 표시(예 · 아니오)를 보인다", () => {
    const { container } = render(<Swimlane data={SWIMLANE} title="업무 흐름" />);
    const mps = [...container.querySelectorAll('[data-step="p0"] text')].map((t) => t.textContent);
    expect(mps).toEqual(["MPS 수립", "주별 완제품 계획"]);
    expect(container.querySelectorAll("polyline")).toHaveLength(SWIMLANE.edges.length);
    expect([...container.querySelectorAll("text")].some((t) => t.textContent === "아니오 — 긴급")).toBe(true);
  });

  it("그림의 이름을 읽어 준다", () => {
    render(<Swimlane data={SWIMLANE} title="부서별 업무 흐름" />);
    expect(screen.getByRole("img", { name: "부서별 업무 흐름" })).toBeInTheDocument();
  });
});
