"use client";

import {
  BaseEdge,
  getSmoothStepPath,
  getStraightPath,
  Position,
  type EdgeProps,
} from "@xyflow/react";

import { useMindMapStore } from "@/store/mindMapStore";

// Mind-map style cubic: control points extend along the handle axis, but the
// offset is clamped to the actual gap on that axis. The default bezier bases
// the offset on total distance, so a child far above/below its parent (small
// dx, big dy) gets control points that overshoot and loop into an ugly S.
function mindmapPath(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  sourcePos: Position,
  targetPos: Position
): string {
  const horizontal =
    sourcePos === Position.Left || sourcePos === Position.Right;
  if (horizontal) {
    const gap = Math.abs(tx - sx);
    const k = Math.max(16, Math.min(96, gap * 0.55));
    const c1x = sourcePos === Position.Right ? sx + k : sx - k;
    const c2x = targetPos === Position.Right ? tx + k : tx - k;
    return `M ${sx},${sy} C ${c1x},${sy} ${c2x},${ty} ${tx},${ty}`;
  }
  const gap = Math.abs(ty - sy);
  const k = Math.max(16, Math.min(96, gap * 0.55));
  const c1y = sourcePos === Position.Bottom ? sy + k : sy - k;
  const c2y = targetPos === Position.Bottom ? ty + k : ty - k;
  return `M ${sx},${sy} C ${sx},${c1y} ${tx},${c2y} ${tx},${ty}`;
}

// Edge whose shape (curved / step / straight) and flow animation follow the
// workspace-wide settings.
export function MindMapEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
}: EdgeProps) {
  const edgeStyle = useMindMapStore((s) => s.edgeStyle);
  const edgeAnimated = useMindMapStore((s) => s.edgeAnimated);

  const params = {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  };

  let path: string;
  if (edgeStyle === "step") {
    [path] = getSmoothStepPath({ ...params, borderRadius: 14 });
  } else if (edgeStyle === "straight") {
    [path] = getStraightPath(params);
  } else {
    path = mindmapPath(
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition
    );
  }

  return (
    <BaseEdge
      path={path}
      markerEnd={markerEnd}
      className={edgeAnimated ? "mf-edge-flow" : undefined}
      style={{ ...style, strokeLinecap: "round" }}
    />
  );
}
