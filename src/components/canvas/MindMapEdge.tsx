"use client";

import {
  BaseEdge,
  getSmoothStepPath,
  getStraightPath,
  Position,
  type EdgeProps,
} from "@xyflow/react";

import { useMindMapStore } from "@/store/mindMapStore";

// Control points for the mind-map cubic: they extend along the handle axis,
// with the offset clamped to the actual gap on that axis. The default bezier
// bases the offset on total distance, so a child far above/below its parent
// (small dx, big dy) gets control points that overshoot into an ugly S.
function mindmapControls(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  sourcePos: Position,
  targetPos: Position
): [number, number, number, number, number, number, number, number] {
  const horizontal =
    sourcePos === Position.Left || sourcePos === Position.Right;
  if (horizontal) {
    const gap = Math.abs(tx - sx);
    const k = Math.max(16, Math.min(96, gap * 0.55));
    const c1x = sourcePos === Position.Right ? sx + k : sx - k;
    const c2x = targetPos === Position.Right ? tx + k : tx - k;
    return [sx, sy, c1x, sy, c2x, ty, tx, ty];
  }
  const gap = Math.abs(ty - sy);
  const k = Math.max(16, Math.min(96, gap * 0.55));
  const c1y = sourcePos === Position.Bottom ? sy + k : sy - k;
  const c2y = targetPos === Position.Bottom ? ty + k : ty - k;
  return [sx, sy, sx, c1y, tx, c2y, tx, ty];
}

function controlsToPath(
  c: [number, number, number, number, number, number, number, number]
): string {
  return `M ${c[0]},${c[1]} C ${c[2]},${c[3]} ${c[4]},${c[5]} ${c[6]},${c[7]}`;
}

// Organic tapered ribbon: a filled outline around the cubic, wide at the
// parent narrowing toward the child — the hand-drawn mind-map branch look.
const TAPER_SAMPLES = 28;
function taperRibbonPath(
  c: [number, number, number, number, number, number, number, number],
  wStart: number,
  wEnd: number
): string {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = c;
  const left: string[] = [];
  const right: string[] = [];
  let prevNx = 0;
  let prevNy = -1;
  for (let i = 0; i <= TAPER_SAMPLES; i++) {
    const t = i / TAPER_SAMPLES;
    const mt = 1 - t;
    // Cubic bezier point.
    const px =
      mt * mt * mt * x0 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3;
    const py =
      mt * mt * mt * y0 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3;
    // Derivative → unit normal. Two guards keep the outline sane: a
    // degenerate (zero-length) tangent reuses the previous normal, and a
    // hemisphere check flips normals that reverse >90° between samples —
    // otherwise near-axis-aligned edges produce NaNs or a bowtie polygon.
    const dx =
      3 * mt * mt * (x1 - x0) + 6 * mt * t * (x2 - x1) + 3 * t * t * (x3 - x2);
    const dy =
      3 * mt * mt * (y1 - y0) + 6 * mt * t * (y2 - y1) + 3 * t * t * (y3 - y2);
    const len = Math.hypot(dx, dy);
    let nx = prevNx;
    let ny = prevNy;
    if (len > 1e-3) {
      nx = -dy / len;
      ny = dx / len;
      if (nx * prevNx + ny * prevNy < 0) {
        nx = -nx;
        ny = -ny;
      }
      prevNx = nx;
      prevNy = ny;
    }
    const half = (wStart + (wEnd - wStart) * t) / 2;
    left.push(`${(px + nx * half).toFixed(1)},${(py + ny * half).toFixed(1)}`);
    right.push(`${(px - nx * half).toFixed(1)},${(py - ny * half).toFixed(1)}`);
  }
  return `M ${left[0]} L ${left.slice(1).join(" L ")} L ${right
    .reverse()
    .join(" L ")} Z`;
}

// Edge whose shape (curved / taper / step / straight), line type and flow
// animation follow the workspace-wide settings.
export function MindMapEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  selected,
}: EdgeProps) {
  const edgeStyle = useMindMapStore((s) => s.edgeStyle);
  const edgeAnimated = useMindMapStore((s) => s.edgeAnimated);
  const edgeLine = useMindMapStore((s) => s.edgeLine);

  const params = {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  };

  const width = (style?.strokeWidth as number) ?? 2;

  if (edgeStyle === "taper") {
    const controls = mindmapControls(
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition
    );
    const centerPath = controlsToPath(controls);
    const wStart = Math.min(11, Math.max(5, width * 2.8));
    const wEnd = Math.max(2, width * 0.55); // ≈ the 2px line-node underline
    const ribbon = taperRibbonPath(controls, wStart, wEnd);
    // Solid fills — translucent ribbons would composite darker where sibling
    // branches overlap at the shared parent handle.
    const fill = selected
      ? "rgb(var(--brand))"
      : (style?.stroke as string) ?? "rgb(var(--ink-faint))";
    return (
      <>
        <path d={ribbon} stroke="none" style={{ fill }} />
        {/* Flow animation: a light dashed current inside the ribbon. */}
        {edgeAnimated && (
          <path
            d={centerPath}
            className="mf-edge-flow"
            style={{
              fill: "none",
              stroke: "rgb(var(--surface-raised) / 0.85)",
              strokeWidth: Math.max(1.5, width * 0.7),
              strokeLinecap: "round",
            }}
          />
        )}
        {/* Transparent centerline LAST so the hit-area/marker stay on top.
            stroke must be transparent (not none) — hit-testing uses
            pointer-events: visibleStroke. */}
        <BaseEdge
          path={centerPath}
          markerEnd={markerEnd}
          style={{ ...style, stroke: "transparent" }}
        />
      </>
    );
  }

  let path: string;
  if (edgeStyle === "step") {
    [path] = getSmoothStepPath({ ...params, borderRadius: 14 });
  } else if (edgeStyle === "straight") {
    [path] = getStraightPath(params);
  } else {
    path = controlsToPath(
      mindmapControls(
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition
      )
    );
  }

  // Dash pattern scales with stroke width so 파선/점선 stay readable at any
  // thickness. Inline dasharray wins over .mf-edge-flow's CSS value; the flow
  // animation shifts by --mf-dash-cycle per loop so the pattern never snaps.
  const dashLen = width * 3.2;
  const gapLen = width * 2.4;
  const dotGap = width * 2.6;
  const dash =
    edgeLine === "dashed"
      ? `${dashLen} ${gapLen}`
      : edgeLine === "dotted"
      ? `0.1 ${dotGap}`
      : undefined;
  const dashCycle =
    edgeLine === "dashed"
      ? dashLen + gapLen
      : edgeLine === "dotted"
      ? 0.1 + dotGap
      : 12;

  return (
    <BaseEdge
      path={path}
      markerEnd={markerEnd}
      className={edgeAnimated ? "mf-edge-flow" : undefined}
      style={{
        ...style,
        strokeLinecap: "round",
        ...(dash ? { strokeDasharray: dash } : {}),
        ...(edgeAnimated
          ? ({ "--mf-dash-cycle": `${dashCycle}px` } as React.CSSProperties)
          : {}),
      }}
    />
  );
}
