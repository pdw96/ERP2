import type { SwimNode, Swimlane } from "@/content/diagrams";

// 스윔레인의 데이터를 검사하고, 칸 너비 · 줄 높이로 자리를 정해 꺾인 선의 점을 낸다.
// 그리기(SVG)는 src/components/swimlane.tsx 가 한다.

export const LANE_WIDTH = 210;
export const ROW_HEIGHT = 82;
export const HEADER = 40;
const TOP = 56;
const BOTTOM = 20;
const SIZE = { ends: [150, 44], step: [150, 44], ask: [150, 64] } as const;

type Point = readonly [number, number];
export type PlacedNode = SwimNode & { cx: number; cy: number; w: number; h: number };
export type PlacedEdge = {
  points: Point[];
  label?: string;
  labelX: number;
  labelY: number;
  anchor: "start" | "end";
  dashed: boolean;
};
export type SwimLayout = {
  width: number;
  height: number;
  lanes: { name: string; x: number }[];
  nodes: PlacedNode[];
  edges: PlacedEdge[];
};

/** 데이터가 그릴 수 있는 꼴인지 본다 — 틀린 곳마다 한 줄. 비면 맞다. */
export function validateSwimlane(d: Swimlane): string[] {
  const errors: string[] = [];
  const lanes = new Set(d.lanes);
  const ids = new Set<string>();
  const spots = new Map<string, string>();
  for (const n of d.nodes) {
    if (ids.has(n.id)) errors.push(`단계 이름 ${n.id} 가 겹친다`);
    ids.add(n.id);
    if (!lanes.has(n.lane)) errors.push(`단계 ${n.id} 의 칸 「${n.lane}」이 칸 목록에 없다`);
    if (!Number.isInteger(n.row) || n.row < 0) errors.push(`단계 ${n.id} 의 줄 ${n.row} 가 0 이상의 정수가 아니다`);
    if (!n.text.trim()) errors.push(`단계 ${n.id} 의 글이 비었다`);
    const spot = `${n.lane}#${n.row}`;
    const other = spots.get(spot);
    if (other) errors.push(`단계 ${other} 와 ${n.id} 가 「${n.lane}」 칸 ${n.row} 줄에 겹친다`);
    spots.set(spot, n.id);
  }
  for (const e of d.edges) {
    if (!ids.has(e.from)) errors.push(`화살표 ${e.from} → ${e.to} 의 앞 단계 ${e.from} 가 없다`);
    if (!ids.has(e.to)) errors.push(`화살표 ${e.from} → ${e.to} 의 뒤 단계 ${e.to} 가 없다`);
    if (e.from === e.to) errors.push(`화살표 ${e.from} → ${e.to} 가 제자리로 돈다`);
  }
  return errors;
}

export function layoutSwimlane(d: Swimlane): SwimLayout {
  const errors = validateSwimlane(d);
  if (errors.length) throw new Error(`스윔레인 데이터가 틀렸다 — ${errors.join(" / ")}`);

  const laneIndex = new Map(d.lanes.map((l, i) => [l, i]));
  const laneX = (lane: string) => laneIndex.get(lane)! * LANE_WIDTH;
  const rows = Math.max(...d.nodes.map((n) => n.row)) + 1;
  const width = LANE_WIDTH * d.lanes.length;
  const height = TOP + rows * ROW_HEIGHT + BOTTOM;

  const N = new Map<string, PlacedNode>();
  for (const n of d.nodes) {
    const [w, h] = SIZE[n.kind];
    N.set(n.id, { ...n, cx: laneX(n.lane) + LANE_WIDTH / 2, cy: TOP + n.row * ROW_HEIGHT + ROW_HEIGHT / 2, w, h });
  }
  const port = (n: PlacedNode, side: "t" | "b" | "l" | "r"): Point =>
    side === "b"
      ? [n.cx, n.cy + n.h / 2]
      : side === "t"
        ? [n.cx, n.cy - n.h / 2]
        : side === "r"
          ? [n.cx + n.w / 2, n.cy]
          : [n.cx - n.w / 2, n.cy];

  const edges: PlacedEdge[] = d.edges.map((e) => {
    const s = N.get(e.from)!;
    const t = N.get(e.to)!;
    let pts: Point[];
    let lx: number;
    let ly: number;
    if (t.row === s.row) {
      // 같은 줄 — 옆으로
      const right = t.cx > s.cx;
      const p = port(s, right ? "r" : "l");
      const q = port(t, right ? "l" : "r");
      pts = [p, q];
      lx = (p[0] + q[0]) / 2;
      ly = p[1] - 7;
    } else if (t.row > s.row && t.lane === s.lane) {
      // 같은 칸 아래로 — 사이에 다른 단계가 있으면 칸 가장자리로 돌아간다(기본 왼쪽)
      const between = [...N.values()].some((m) => m.lane === s.lane && m.row > s.row && m.row < t.row);
      const p = port(s, "b");
      if (!between) {
        pts = [p, port(t, "t")];
      } else {
        const right = e.route === "r";
        const x = laneX(s.lane) + (right ? LANE_WIDTH - 14 : 14);
        const q = port(t, right ? "r" : "l");
        pts = [p, [p[0], p[1] + 10], [x, p[1] + 10], [x, q[1]], q];
      }
      lx = p[0] + 8;
      ly = p[1] + 16;
    } else if (t.row > s.row && !e.route) {
      // 다른 칸 아래로 — 옆으로 나가 꺾어 내려간다
      const dir = t.cx > s.cx ? 1 : -1;
      const p = port(s, dir > 0 ? "r" : "l");
      const q = port(t, "t");
      pts = [p, [q[0], p[1]], q];
      lx = p[0] + dir * 30;
      ly = p[1] - 7;
    } else if (e.route === "bl") {
      // 아래로 내려가 옆으로 들어간다
      const p = port(s, "b");
      const q = port(t, t.cx > s.cx ? "l" : "r");
      pts = [p, [p[0], q[1]], q];
      lx = p[0] + 8;
      ly = p[1] + 16;
    } else if (e.route === "lb") {
      // 왼쪽으로 나가 위 단계의 아래로 들어간다
      const p = port(s, "l");
      const q = port(t, "b");
      const x = laneX(s.lane) + 26;
      pts = [p, [x, p[1]], [x, q[1] + 16], [q[0], q[1] + 16], q];
      lx = x + 4;
      ly = p[1] - 8;
    } else {
      // 위로 되돌아간다 — 칸 가장자리로 돈다
      const cross = t.lane !== s.lane;
      const side = e.route === "r" ? "r" : cross ? (t.cx > s.cx ? "r" : "l") : "l";
      const p = port(s, side);
      const q = port(t, cross ? (side === "r" ? "l" : "r") : side);
      const x = laneX(s.lane) + (side === "r" ? LANE_WIDTH - 18 : cross ? 8 : 26);
      pts = [p, [x, p[1]], [x, q[1]], q];
      if (!cross && side === "l") {
        lx = x - 4;
        ly = (p[1] + q[1]) / 2;
      } else {
        lx = x + (side === "r" ? -4 : 4);
        ly = p[1] - 8;
      }
    }
    return {
      points: pts,
      label: e.label,
      labelX: lx,
      labelY: ly,
      anchor: pts.length > 2 && lx < pts[0][0] ? "end" : "start",
      dashed: e.dashed ?? false,
    };
  });

  return {
    width,
    height,
    lanes: d.lanes.map((name) => ({ name, x: laneX(name) })),
    nodes: [...N.values()],
    edges,
  };
}
