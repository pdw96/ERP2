import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MermaidDiagram } from "@/components/mermaid-diagram";

// jsdom 은 글자 크기를 재지 못해 Mermaid 가 실제로 그리지 못한다 — 그리는 도구를 흉내 낸다.
const tool = vi.hoisted(() => ({
  render: vi.fn(),
  initialize: vi.fn(),
}));
vi.mock("mermaid", () => ({ default: tool }));

describe("MermaidDiagram", () => {
  beforeEach(() => {
    tool.render.mockReset();
    tool.initialize.mockReset();
  });

  it("그리는 동안 알리고, 다 그리면 그림을 제 넓이로 넣는다", async () => {
    tool.render.mockResolvedValue({ svg: '<svg viewBox="0 0 900 300" width="100%" style="max-width: 900px"></svg>' });
    const { container } = render(<MermaidDiagram source={"flowchart LR\n A --> B"} title="흐름" />);
    expect(screen.getByText("그림을 그리는 중입니다…")).toBeInTheDocument();

    await waitFor(() => expect(container.querySelector("svg")).not.toBeNull());
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("900");
    expect(svg.style.maxWidth).toBe("none");
    expect(screen.queryByText("그림을 그리는 중입니다…")).not.toBeInTheDocument();
    expect(tool.render).toHaveBeenCalledWith(expect.stringMatching(/^mermaid-/), "flowchart LR\n A --> B");
    expect(tool.initialize).toHaveBeenCalledWith(expect.objectContaining({ securityLevel: "strict" }));
  });

  it("그리지 못하면 그림 대신 알림을 보인다", async () => {
    tool.render.mockRejectedValue(new Error("Parse error"));
    render(<MermaidDiagram source={"flowchart LR\n A -- --> "} title="흐름" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("그림을 그리지 못했습니다");
  });
});
