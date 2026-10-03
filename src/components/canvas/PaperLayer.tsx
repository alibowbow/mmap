"use client";
import { useViewport, ViewportPortal, useStore } from "@xyflow/react";
import { PAPER_COLORS, texturePath } from "@/lib/ink";
import { useMindMapStore } from "@/store/mindMapStore";
export function PaperLayer() {
  const paper = useMindMapStore((s) => s.ink.paper);
  const v = useViewport(),
    w = useStore((s) => s.width),
    h = useStore((s) => s.height);
  if (!paper || paper.kind === "none") return null;
  const x = -v.x / v.zoom - 100,
    y = -v.y / v.zoom - 100,
    width = w / v.zoom + 200,
    height = h / v.zoom + 200;
  return (
    <ViewportPortal>
      <svg
        data-ink-paper
        width={width}
        height={height}
        viewBox={`${x} ${y} ${width} ${height}`}
        style={{
          position: "absolute",
          left: x,
          top: y,
          pointerEvents: "none",
          zIndex: -1,
        }}
      >
        <defs>
          <pattern
            id="studio-paper-grain"
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <path
              d={texturePath(paper.seed, true)}
              stroke="#6f5d42"
              strokeWidth=".7"
              strokeLinecap="round"
              opacity={paper.texture * 0.32}
            />
          </pattern>
        </defs>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill={PAPER_COLORS[paper.kind]}
        />
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill="url(#studio-paper-grain)"
        />
      </svg>
    </ViewportPortal>
  );
}
