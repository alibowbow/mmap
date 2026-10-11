"use client";

import { useId, type CSSProperties } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, getSmoothStepPath, getStraightPath, Position, useInternalNode, type EdgeProps, type InternalNode } from "@xyflow/react";
import { buzanBranch, type BranchBox } from "@/lib/buzanBranch";
import { branchHalfWidth } from "@/lib/branchWidth";
import { flatten, pathData, polygonData, ribbon } from "@/lib/layout-engine/geometry";
import type { PathSegment } from "@/lib/layout-engine/types";
import { useViewer } from "./ViewerContext";
import type { ViewerNodeData } from "./viewer-model";

function box(node: InternalNode | undefined): BranchBox | null {
  if (!node?.measured.width || !node.measured.height) return null;
  const data = node.data as ViewerNodeData;
  return { ...node.internals.positionAbsolute, width: node.measured.width, height: node.measured.height, depth: data._depth ?? 0, isRoot: !!data.isRoot || data.type === "root" };
}
const direction = (face: Position) => face === Position.Left ? { x: -1, y: 0 } : face === Position.Right ? { x: 1, y: 0 } : face === Position.Top ? { x: 0, y: -1 } : { x: 0, y: 1 };

export function SharedEdge(props: EdgeProps) {
  const { appearance } = useViewer();
  const sourceNode = useInternalNode(props.source), targetNode = useInternalNode(props.target);
  const markerId = `shared-arrow-${useId().replace(/:/g, "")}`;
  const relation = !!props.data?.relation;
  const params = { sourceX: props.sourceX, sourceY: props.sourceY, targetX: props.targetX, targetY: props.targetY, sourcePosition: props.sourcePosition, targetPosition: props.targetPosition };
  const [bezier, labelX, labelY] = getBezierPath({ ...params, curvature: .35 });
  let path = !relation && appearance.edgeStyle === "straight" ? getStraightPath(params)[0]
    : !relation && appearance.edgeStyle === "step" ? getSmoothStepPath(params)[0] : bezier;
  const color = relation ? "rgb(var(--brand))" : (props.style?.stroke ?? "rgb(var(--ink-faint) / .6)");
  const width = relation ? 1.5 : appearance.edgeWidth;
  const dash = relation ? "5 5" : appearance.edgeLine === "dashed" ? `${width * 3.2} ${width * 2.4}` : appearance.edgeLine === "dotted" ? `0.1 ${width * 2.6}` : undefined;
  const cycle = appearance.edgeLine === "dashed" ? width * 5.6 : appearance.edgeLine === "dotted" ? .1 + width * 2.6 : 12;
  let outlines: string[] = [];
  if (!relation && appearance.edgeStyle === "taper") {
    const sBox = box(sourceNode), tBox = box(targetNode);
    if (appearance.nodeStyle === "line" && sBox && tBox) {
      const branch = buzanBranch(sBox, tBox, width, (targetNode?.data._childCount ?? 0) === 0);
      outlines = branch.outlines;
      path = branch.center;
    } else {
      const a = { x: props.sourceX, y: props.sourceY }, b = { x: props.targetX, y: props.targetY };
      const sd = direction(props.sourcePosition), td = direction(props.targetPosition);
      const reach = Math.max(25, Math.hypot(b.x - a.x, b.y - a.y) * .35);
      const segment: PathSegment = { kind: "cubic", from: a, to: b, c1: { x: a.x + sd.x * reach, y: a.y + sd.y * reach }, c2: { x: b.x + td.x * reach, y: b.y + td.y * reach } };
      path = pathData([segment]);
      const depth = Number(props.data?.depth ?? 0);
      outlines = [polygonData(ribbon(flatten([segment]).points, branchHalfWidth(depth, width), branchHalfWidth(depth + 1, width)))];
    }
  }
  return <>
    {relation && <defs><marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="rgb(var(--brand))" /></marker></defs>}
    {outlines.map((outline, i) => <path key={i} d={outline} data-shared-taper fill={color as string} stroke={color as string} strokeWidth={.5} />)}
    <BaseEdge
      path={path}
      markerEnd={relation ? `url(#${markerId})` : undefined}
      interactionWidth={0}
      className={!relation && appearance.edgeAnimated ? "mf-edge-flow" : undefined}
      style={{ stroke: outlines.length ? (appearance.edgeAnimated ? "rgb(var(--surface-raised) / .8)" : "transparent") : color, strokeWidth: width, strokeLinecap: "round", ...(dash ? { strokeDasharray: dash } : {}), "--mf-dash-cycle": `${cycle}px` } as CSSProperties}
    />
    {relation && typeof props.data?.label === "string" && props.data.label && <EdgeLabelRenderer><div className="shared-relation-label" style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>{props.data.label}</div></EdgeLabelRenderer>}
  </>;
}
