import { describe, expect, it } from "vitest";
import { SWIMLANE, type Swimlane } from "@/content/diagrams";
import { LANE_WIDTH, layoutSwimlane, validateSwimlane } from "@/lib/swimlane";

const tiny: Swimlane = {
  lanes: ["영업", "생산"],
  nodes: [
    { id: "a", lane: "영업", row: 0, kind: "ends", text: "주문" },
    { id: "b", lane: "생산", row: 1, kind: "step", text: "작업지시" },
  ],
  edges: [{ from: "a", to: "b", label: "넘김" }],
};

describe("validateSwimlane", () => {
  it("설계도의 스윔레인 데이터는 맞는 꼴이다", () => {
    expect(validateSwimlane(SWIMLANE)).toEqual([]);
  });

  it("맞는 꼴의 작은 데이터는 틀린 곳이 없다", () => {
    expect(validateSwimlane(tiny)).toEqual([]);
  });

  it("칸 목록에 없는 칸을 거절한다", () => {
    const d = {
      ...tiny,
      nodes: [...tiny.nodes, { id: "c", lane: "물류", row: 2, kind: "step" as const, text: "배송" }],
    };
    expect(validateSwimlane(d)).toEqual(["단계 c 의 칸 「물류」이 칸 목록에 없다"]);
  });

  it("없는 단계를 가리키는 화살표를 거절한다", () => {
    const d = { ...tiny, edges: [...tiny.edges, { from: "b", to: "z" }] };
    expect(validateSwimlane(d)).toEqual(["화살표 b → z 의 뒤 단계 z 가 없다"]);
  });

  it("두 단계가 한 자리에 겹치면 거절한다", () => {
    const d = {
      ...tiny,
      nodes: [...tiny.nodes, { id: "c", lane: "생산", row: 1, kind: "step" as const, text: "실적" }],
    };
    expect(validateSwimlane(d)).toEqual(["단계 b 와 c 가 「생산」 칸 1 줄에 겹친다"]);
  });

  it("단계 이름이 겹치면 거절한다", () => {
    const d = {
      ...tiny,
      nodes: [...tiny.nodes, { id: "a", lane: "생산", row: 3, kind: "step" as const, text: "실적" }],
    };
    expect(validateSwimlane(d)).toEqual(["단계 이름 a 가 겹친다"]);
  });

  it("음수 · 소수 줄과 빈 글을 거절한다", () => {
    const d: Swimlane = {
      lanes: ["영업"],
      nodes: [
        { id: "a", lane: "영업", row: -1, kind: "step", text: "주문" },
        { id: "b", lane: "영업", row: 1.5, kind: "step", text: " " },
      ],
      edges: [],
    };
    expect(validateSwimlane(d)).toEqual([
      "단계 a 의 줄 -1 가 0 이상의 정수가 아니다",
      "단계 b 의 줄 1.5 가 0 이상의 정수가 아니다",
      "단계 b 의 글이 비었다",
    ]);
  });

  it("제자리로 도는 화살표를 거절한다", () => {
    const d = { ...tiny, edges: [{ from: "a", to: "a" }] };
    expect(validateSwimlane(d)).toEqual(["화살표 a → a 가 제자리로 돈다"]);
  });
});

describe("layoutSwimlane", () => {
  it("틀린 데이터는 그리지 않고 까닭을 알린다", () => {
    const d = { ...tiny, edges: [{ from: "a", to: "z" }] };
    expect(() => layoutSwimlane(d)).toThrow("화살표 a → z 의 뒤 단계 z 가 없다");
  });

  it("단계마다 자기 칸 안에 놓인다", () => {
    const layout = layoutSwimlane(SWIMLANE);
    expect(layout.width).toBe(SWIMLANE.lanes.length * LANE_WIDTH);
    for (const n of layout.nodes) {
      const x = SWIMLANE.lanes.indexOf(n.lane) * LANE_WIDTH;
      expect(n.cx - n.w / 2).toBeGreaterThanOrEqual(x);
      expect(n.cx + n.w / 2).toBeLessThanOrEqual(x + LANE_WIDTH);
      expect(n.cy + n.h / 2).toBeLessThanOrEqual(layout.height);
    }
  });

  it("두 단계의 상자가 서로 겹치지 않는다", () => {
    const { nodes } = layoutSwimlane(SWIMLANE);
    for (const a of nodes)
      for (const b of nodes) {
        if (a.id >= b.id) continue;
        const apart = Math.abs(a.cx - b.cx) >= (a.w + b.w) / 2 || Math.abs(a.cy - b.cy) >= (a.h + b.h) / 2;
        expect(apart, `${a.id} · ${b.id}`).toBe(true);
      }
  });

  it("화살표마다 앞 단계의 가장자리에서 시작해 뒤 단계의 가장자리에서 끝난다", () => {
    const { nodes, edges } = layoutSwimlane(SWIMLANE);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const onEdge = (id: string, [x, y]: readonly [number, number]) => {
      const n = byId.get(id)!;
      return Math.abs(x - n.cx) <= n.w / 2 + 0.01 && Math.abs(y - n.cy) <= n.h / 2 + 0.01;
    };
    edges.forEach((e, i) => {
      const { from, to } = SWIMLANE.edges[i];
      expect(e.points.length).toBeGreaterThanOrEqual(2);
      expect(onEdge(from, e.points[0]), `${from} → ${to} 시작`).toBe(true);
      expect(onEdge(to, e.points.at(-1)!), `${from} → ${to} 끝`).toBe(true);
    });
  });

  it("칸을 건너는 화살표는 옆으로 나가 꺾어 내려간다", () => {
    const { edges } = layoutSwimlane(tiny);
    expect(edges[0].points).toEqual([
      [LANE_WIDTH / 2 + 75, 56 + 41],
      [LANE_WIDTH + LANE_WIDTH / 2, 56 + 41],
      [LANE_WIDTH + LANE_WIDTH / 2, 56 + 82 + 41 - 22],
    ]);
    expect(edges[0].label).toBe("넘김");
  });
});
