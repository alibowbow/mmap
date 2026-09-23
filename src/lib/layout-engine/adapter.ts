import type { Edge, MindMapNode, MindMapRelation } from "@/types/mindmap";
import { branchHalfWidth } from "../branchWidth";
import { defaultPorts } from "./ports";
import {
  DEFAULT_OPTIONS,
  type EngineEdge,
  type EngineNode,
  type EnginePort,
  type LayoutInput,
  type LayoutMode,
  type LayoutResult,
  type RequestStamp,
} from "./types";

// The same unscaled fallback is used for layout, drag hit tests and camera.
export function nodeSize(
  n: Pick<MindMapNode, "measured" | "width" | "height">,
) {
  const valid = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v) && v > 0;
  return {
    width: valid(n.measured?.width)
      ? n.measured.width
      : valid(n.width)
        ? n.width
        : 232,
    height: valid(n.measured?.height)
      ? n.measured.height
      : valid(n.height)
        ? n.height
        : 76,
  };
}
export const nodeRect = (n: MindMapNode) => ({ ...n.position, ...nodeSize(n) });
export const EMPTY_STAMP: RequestStamp = {
  documentId: "seed",
  documentEpoch: 0,
  contentRevision: 0,
  geometryRevision: 0,
  requestGeneration: 0,
  transactionId: null,
};
export interface AdapterOptions {
  mode: LayoutMode;
  stamp?: RequestStamp;
  edges?: readonly Edge[];
  relations?: readonly MindMapRelation[];
  edgeStyle?: string;
  edgeWidth?: number;
  nodeStyle?: string;
  ports?: ReadonlyMap<string, readonly EnginePort[]>;
  labels?: ReadonlyMap<string, { width: number; height: number }>;
}
export function adaptInput(
  nodes: readonly MindMapNode[],
  options: AdapterOptions,
  request: Partial<LayoutInput> = {},
): LayoutInput {
  const ns: EngineNode[] = nodes.map((n, i) => {
    const size = nodeSize(n);
    return {
      id: n.id,
      parentId: n.data.parentId ?? null,
      isRoot: n.data.isRoot,
      ...n.position,
      ...size,
      collapsed: !!n.data.collapsed,
      side: n.data.side,
      effectiveMode: n.data.layoutMode,
      stableOrder: i,
      sizeSource:
        n.measured?.width && n.measured?.height
          ? "measured"
          : n.width && n.height
            ? "cached"
            : "estimated",
      ports:
        options.ports?.get(n.id) ??
        defaultPorts(
          size.width,
          size.height,
          (n.data.style ?? options.nodeStyle) === "line",
        ),
    };
  });
  // Mode hints apply to a whole subtree. Resolve inherited hints once.
  const byId = new Map(ns.map((n) => [n.id, n])),
    resolved = new Map<string, LayoutMode>();
  for (const n of ns) {
    if (resolved.has(n.id)) continue;
    const path: EngineNode[] = [],
      seen = new Set<string>();
    let cur: EngineNode | undefined = n,
      mode = options.mode;
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (cur.effectiveMode) {
        mode = cur.effectiveMode;
        break;
      }
      if (resolved.has(cur.id)) {
        mode = resolved.get(cur.id)!;
        break;
      }
      path.push(cur);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    for (const p of path) resolved.set(p.id, mode);
    resolved.set(n.id, n.effectiveMode ?? mode);
  }
  const style = ["curved", "step", "straight", "taper"].includes(
    options.edgeStyle ?? "",
  )
    ? (options.edgeStyle as EngineEdge["style"])
    : "curved";
  const width = options.edgeWidth ?? 2;
  // Depth per node, for depth-graded organic branches (see branchWidth.ts).
  const parentOf = new Map(nodes.map((n) => [n.id, n.data.parentId ?? null]));
  const depthMemo = new Map<string, number>();
  const depthOf = (id: string): number => {
    let d = 0,
      cur = parentOf.get(id) ?? null;
    const seen = new Set<string>([id]);
    while (cur && !seen.has(cur)) {
      const known = depthMemo.get(cur);
      if (known !== undefined) {
        d += known + 1;
        break;
      }
      seen.add(cur);
      d++;
      cur = parentOf.get(cur) ?? null;
    }
    depthMemo.set(id, d);
    return d;
  };
  const edges: EngineEdge[] = (
    options.edges ??
    nodes
      .filter((n) => n.data.parentId)
      .map((n) => ({
        id: `e_${n.data.parentId}_${n.id}`,
        source: n.data.parentId!,
        target: n.id,
      }))
  ).map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    kind: "tree",
    style,
    // Taper: thick near the centre, thinning outward, and ending exactly at
    // the thickness of the child's underline so the branch flows into it.
    halfWidth:
      style === "taper"
        ? branchHalfWidth(depthOf(e.source), width)
        : width / 2,
    ...(style === "taper"
      ? { taperEnd: branchHalfWidth(depthOf(e.source) + 1, width) }
      : {}),
    arrowLength: 0,
    arrowHalfWidth: 0,
  }));
  for (const r of options.relations ?? [])
    edges.push({
      id: r.id,
      source: r.source,
      target: r.target,
      kind: "relation",
      style: "curved",
      halfWidth: 1.25,
      arrowLength: 12,
      arrowHalfWidth: 6,
      labelSize:
        options.labels?.get(r.id) ??
        (r.label
          ? {
              width: Math.min(
                280,
                24 +
                  [...r.label].reduce(
                    (s, c) => s + (c.charCodeAt(0) > 255 ? 11 : 6),
                    0,
                  ),
              ),
              height: 28,
            }
          : undefined),
    });
  return {
    stamp: options.stamp ?? EMPTY_STAMP,
    mode: options.mode,
    strategy: "full",
    nodes: ns.map((n) => ({ ...n, effectiveMode: resolved.get(n.id) })),
    edges,
    changedNodeIds: [],
    changedEdgeIds: [],
    affectedParentIds: [],
    previousObstacleRects: [],
    fixedNodeIds: [],
    expansionBoundaryIds: [],
    options: {
      ...DEFAULT_OPTIONS,
      maxCandidateChecks: Math.min(
        24_000_000,
        Math.max(
          DEFAULT_OPTIONS.maxCandidateChecks,
          nodes.length * nodes.length * 2,
        ),
      ),
    },
    ...request,
  };
}
export function applyPositionPatch(
  nodes: MindMapNode[],
  result: LayoutResult,
): MindMapNode[] {
  if (
    result.status === "invalid" ||
    result.status === "cancelled" ||
    !result.positions.length
  )
    return nodes;
  const byId = new Map(result.positions.map((p) => [p.id, p]));
  return nodes.map((n) => {
    const p = byId.get(n.id);
    return p ? { ...n, position: { x: p.x, y: p.y } } : n;
  });
}
