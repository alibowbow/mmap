"use client";

import { useId, useMemo } from "react";
import { ViewportPortal, useViewport, useStore } from "@xyflow/react";
import { AnalogMark } from "@/components/canvas/AnalogMark";
import { inkBounds, inkItems, PAPER_COLORS, texturePath } from "@/lib/ink";
import type { InkData } from "@/types/mindmap";

// PaperLayer/InkLayer in the editor subscribe to the editable workspace.
// These display-only layers receive the shared ink explicitly instead.
export function SharedInk({ ink }: { ink: InkData }) {
  const viewport = useViewport();
  const canvasWidth = useStore((s) => s.width), canvasHeight = useStore((s) => s.height);
  const patternId = `shared-paper-${useId().replace(/:/g, "")}`;
  const bounds = useMemo(() => inkBounds(ink), [ink]);
  const items = useMemo(() => inkItems(ink), [ink]);
  const grain = useMemo(() => texturePath(ink.paper?.seed ?? 1, true), [ink.paper?.seed]);
  const x = -viewport.x / viewport.zoom - 100, y = -viewport.y / viewport.zoom - 100;
  const width = canvasWidth / viewport.zoom + 200, height = canvasHeight / viewport.zoom + 200;
  return <ViewportPortal>
    {ink.paper && ink.paper.kind !== "none" && <svg data-ink-paper width={width} height={height} viewBox={`${x} ${y} ${width} ${height}`} aria-hidden style={{ position: "absolute", left: x, top: y, pointerEvents: "none", zIndex: -1 }}>
      <defs><pattern id={patternId} width="24" height="24" patternUnits="userSpaceOnUse"><path d={grain} stroke="#6f5d42" strokeWidth=".7" strokeLinecap="round" opacity={ink.paper.texture * .32} /></pattern></defs>
      <rect x={x} y={y} width={width} height={height} fill={PAPER_COLORS[ink.paper.kind]} />
      <rect x={x} y={y} width={width} height={height} fill={`url(#${patternId})`} />
    </svg>}
    {bounds && <svg data-ink-layer aria-label="공유된 손그림" role="img" width={Math.max(1, bounds.width)} height={Math.max(1, bounds.height)} viewBox={`${bounds.x} ${bounds.y} ${Math.max(1, bounds.width)} ${Math.max(1, bounds.height)}`} style={{ position: "absolute", left: bounds.x, top: bounds.y, pointerEvents: "none", overflow: "visible", zIndex: 20 }}>
      {items.map((item) => <AnalogMark key={item.id} item={item} />)}
    </svg>}
  </ViewportPortal>;
}
