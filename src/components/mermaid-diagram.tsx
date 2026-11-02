"use client";

import { useEffect, useId, useRef, useState } from "react";

// Mermaid 글을 브라우저에서 그린다. 그리는 도구는 이 부품이 화면에 올 때만 내려받는다(ADR 0006).
// 그림은 제 넓이 그대로 두고, 좁은 화면에서는 옆으로 밀어 본다.
export function MermaidDiagram({ source, title }: { source: string; title: string }) {
  const box = useRef<HTMLDivElement>(null);
  const id = `mermaid-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          fontFamily: '"IBM Plex Sans KR", sans-serif',
          themeVariables: {
            primaryColor: "#ffffff",
            primaryBorderColor: "#2f4a40",
            primaryTextColor: "#1c2321",
            lineColor: "#456356",
            fontSize: "16px",
            tertiaryColor: "#f4f5f2",
            clusterBkg: "#f4f5f2",
            clusterBorder: "#d3d8d3",
            edgeLabelBackground: "#ffffff",
          },
          flowchart: { htmlLabels: true, curve: "basis" },
          er: { layoutDirection: "LR" },
        });
        // 글꼴이 다 내려온 뒤에 재야 글자 상자가 맞는다.
        await document.fonts?.ready;
        const { svg } = await mermaid.render(id, source);
        if (cancelled || !box.current) return;
        box.current.innerHTML = svg;
        const el = box.current.querySelector("svg");
        const natural = el?.viewBox.baseVal?.width;
        if (el && natural) {
          el.style.maxWidth = "none";
          el.setAttribute("width", String(Math.ceil(natural)));
          el.removeAttribute("height");
        }
        setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, source]);

  return (
    <figure className="mermaid-diagram">
      <figcaption className="sr-only">{title}</figcaption>
      {state === "loading" && <p className="text-sm text-muted">그림을 그리는 중입니다…</p>}
      {state === "error" && (
        <p role="alert" className="border-l-4 border-safety bg-white px-4 py-3 text-sm">
          그림을 그리지 못했습니다. 화면을 새로 고쳐 보세요.
        </p>
      )}
      <div ref={box} className="overflow-x-auto" aria-hidden={state !== "ready"} />
    </figure>
  );
}
