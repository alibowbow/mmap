"use client";
import {
  BaseEdge,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  type EdgeProps,
} from "@xyflow/react";
import { useMindMapStore } from "@/store/mindMapStore";
import { pathData, polygonData, distance } from "@/lib/layout-engine/geometry";
import type { EdgeRoute } from "@/lib/layout-engine/types";

export function MindMapEdge(props: EdgeProps) {
  const {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    markerEnd,
    style,
    selected,
    data,
  } = props;
  const edgeStyle = useMindMapStore((s) => s.edgeStyle),
    animated = useMindMapStore((s) => s.edgeAnimated),
    line = useMindMapStore((s) => s.edgeLine);
  const raw = data?.route as EdgeRoute | undefined;
  const first = raw?.segments[0],
    last = raw?.segments[raw.segments.length - 1];
  const route =
    first &&
    last &&
    distance(first.from, { x: sourceX, y: sourceY }) < 1 &&
    distance(last.to, { x: targetX, y: targetY }) < 1
      ? raw
      : undefined;
  const params = {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  };
  // During a drag/measurement, current endpoints remain attached. This muted
  // provisional path is explicitly unverified and never reported as safe.
  const path = route
    ? pathData(route.segments)
    : edgeStyle === "straight"
      ? getStraightPath(params)[0]
      : edgeStyle === "step"
        ? getSmoothStepPath(params)[0]
        : getBezierPath({ ...params, curvature: 0.35 })[0];
  const state = route?.status ?? "unverified",
    width = (style?.strokeWidth as number) ?? 2;
  const dashLen = width * 3.2,
    gapLen = width * 2.4,
    dotGap = width * 2.6;
  const dash =
    line === "dashed"
      ? `${dashLen} ${gapLen}`
      : line === "dotted"
        ? `0.1 ${dotGap}`
        : undefined;
  const cycle =
    line === "dashed"
      ? dashLen + gapLen
      : line === "dotted"
        ? 0.1 + dotGap
        : 12;
  const fill = selected
    ? "rgb(var(--brand))"
    : ((style?.stroke as string) ?? "rgb(var(--ink-faint))");
  const taper = edgeStyle === "taper" && route?.ribbon?.length;
  return (
    <g data-route-state={state} opacity={state === "ok" ? 1 : 0.5}>
      {state !== "ok" && (
        <title>
          {state === "blocked"
            ? "현재 직선 또는 포트 조건에서 노드와 겹치는 경로"
            : "연결선 계산 중"}
        </title>
      )}
      {taper ? (
        <>
          <path
            d={polygonData(route!.ribbon!)}
            stroke="none"
            style={{ fill }}
          />
          {animated && (
            <path
              d={path}
              className="mf-edge-flow"
              style={{
                fill: "none",
                stroke: "rgb(var(--surface-raised) / .85)",
                strokeWidth: Math.max(1.5, width * 0.7),
                strokeLinecap: "round",
              }}
            />
          )}
          <BaseEdge
            path={path}
            markerEnd={markerEnd}
            style={{ ...style, stroke: "transparent" }}
          />
        </>
      ) : (
        <BaseEdge
          path={path}
          markerEnd={markerEnd}
          className={animated ? "mf-edge-flow" : undefined}
          style={{
            ...style,
            strokeLinecap: "round",
            ...(dash ? { strokeDasharray: dash } : {}),
            ...(animated
              ? ({ "--mf-dash-cycle": `${cycle}px` } as React.CSSProperties)
              : {}),
          }}
        />
      )}
    </g>
  );
}
