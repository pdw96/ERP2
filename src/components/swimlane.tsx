import type { Swimlane as SwimlaneData } from "@/content/diagrams";
import { HEADER, layoutSwimlane } from "@/lib/swimlane";

// 부서마다 세로 칸을 나눈 순서도. 서버에서 SVG 로 그려 보내므로 그리는 도구를 내려받지 않는다.
// 넓이는 칸 수 × 칸 너비 그대로 — 좁은 화면에서는 옆으로 밀어 본다.
const INK = "#1c2321";
const LINE = "#456356";

export function Swimlane({ data, title }: { data: SwimlaneData; title: string }) {
  const layout = layoutSwimlane(data);
  return (
    <svg
      role="img"
      aria-labelledby="swimlane-title"
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      width={layout.width}
      height={layout.height}
      className="block max-w-none"
      style={{ fontFamily: "var(--font-sans)" }}
    >
      <title id="swimlane-title">{title}</title>
      <defs>
        <marker
          id="swim-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" fill={LINE} />
        </marker>
      </defs>

      {layout.lanes.map((lane, i) => (
        <g key={lane.name}>
          <rect
            x={lane.x}
            y={0}
            width={layout.width / layout.lanes.length}
            height={layout.height}
            fill={i % 2 ? "#f4f5f2" : "#fafbf9"}
            stroke="#d3d8d3"
          />
          <rect x={lane.x} y={0} width={layout.width / layout.lanes.length} height={HEADER} fill="#2f4a40" />
          <text
            x={lane.x + layout.width / layout.lanes.length / 2}
            y={26}
            textAnchor="middle"
            fontSize={16}
            fontWeight={600}
            fill="#ffffff"
          >
            {lane.name}
          </text>
        </g>
      ))}

      {layout.edges.map((e, i) => (
        <g key={i}>
          <polyline
            points={e.points.map((p) => p.join(",")).join(" ")}
            fill="none"
            stroke={LINE}
            strokeWidth={1.6}
            strokeDasharray={e.dashed ? "5 4" : undefined}
            markerEnd="url(#swim-arrow)"
          />
          {e.label && (
            <text
              x={e.labelX}
              y={e.labelY}
              fontSize={12}
              fill={LINE}
              textAnchor={e.anchor}
              paintOrder="stroke"
              stroke="#ffffff"
              strokeWidth={4}
            >
              {e.label}
            </text>
          )}
        </g>
      ))}

      {layout.nodes.map((n) => {
        const lines = n.text.split("\n");
        const color = n.kind === "ends" ? "#ffffff" : INK;
        return (
          <g key={n.id} data-step={n.id}>
            {n.kind === "ask" ? (
              <polygon
                points={`${n.cx},${n.cy - n.h / 2} ${n.cx + n.w / 2},${n.cy} ${n.cx},${n.cy + n.h / 2} ${n.cx - n.w / 2},${n.cy}`}
                fill="#fff8dc"
                stroke="#b08a10"
                strokeWidth={1.4}
              />
            ) : (
              <rect
                x={n.cx - n.w / 2}
                y={n.cy - n.h / 2}
                width={n.w}
                height={n.h}
                rx={n.kind === "ends" ? n.h / 2 : 4}
                fill={n.kind === "ends" ? INK : "#ffffff"}
                stroke={LINE}
                strokeWidth={1.4}
              />
            )}
            {lines.map((line, i) => (
              <text
                key={i}
                x={n.cx}
                y={n.cy + (i - (lines.length - 1) / 2) * 16 + 5}
                textAnchor="middle"
                fontSize={n.kind === "ask" ? 12.5 : 14}
                fill={color}
              >
                {line}
              </text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}
