"use client";

import {
  BaseEdge,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  type EdgeProps,
} from "@xyflow/react";

import { useMindMapStore } from "@/store/mindMapStore";

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
    [path] = getBezierPath({ ...params, curvature: 0.35 });
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
