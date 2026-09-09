import { finite } from "./geometry";
import type { EngineNode, LayoutDiagnostic, LayoutInput, Work } from "./types";
export interface Graph {
  byId: Map<string, number>;
  parent: number[];
  children: number[][];
  root: number;
  depth: number[];
  preorder: number[];
  postorder: number[];
  hidden: Set<number>;
  collapsedOwner: number[];
  tin: number[];
  tout: number[];
}
export function* buildGraph(
  input: LayoutInput,
): Work<{ graph: Graph; diagnostics: LayoutDiagnostic[] }> {
  const ns = input.nodes,
    diagnostics: LayoutDiagnostic[] = [];
  const error = (
    message: string,
    ids: string[] = [],
    code: LayoutDiagnostic["code"] = "INVALID_GRAPH",
  ) =>
    diagnostics.push({
      code,
      nodeIds: ids,
      edgeIds: [],
      message,
      severity: "error",
    });
  const g: Graph = {
    byId: new Map(),
    parent: [],
    children: ns.map(() => []),
    root: -1,
    depth: [],
    preorder: [],
    postorder: [],
    hidden: new Set(),
    collapsedOwner: [],
    tin: [],
    tout: [],
  };
  const o = input.options;
  for (const [key, v] of Object.entries(o))
    if (typeof v === "number" && (!finite(v) || v < 0))
      error(`Invalid option: ${key}`, [], "INVALID_OPTIONS");
  if (!o.maxCoordinateAbs || !o.maxPasses || !o.curveTolerance)
    error(
      "Positive coordinate/pass/tolerance limits required",
      [],
      "INVALID_OPTIONS",
    );
  if (
    !["right-tree", "bidirectional", "vertical", "radial"].includes(input.mode)
  )
    error("Unknown layout mode", [], "INVALID_OPTIONS");
  for (let i = 0; i < ns.length; i++) {
    const n = ns[i];
    if (!n.id || g.byId.has(n.id)) error("Duplicate or empty node id", [n.id]);
    g.byId.set(n.id, i);
    if (
      ![n.x, n.y, n.width, n.height].every(finite) ||
      n.width <= 0 ||
      n.height <= 0 ||
      Math.max(Math.abs(n.x), Math.abs(n.y), n.width, n.height) >
        o.maxCoordinateAbs
    )
      error("Non-finite or out-of-range geometry", [n.id], "INVALID_GEOMETRY");
    if (
      !finite(n.stableOrder) ||
      n.ports.some(
        (p) =>
          !p.handleId ||
          !["left", "right", "top", "bottom"].includes(p.face) ||
          ![p.offset.x, p.offset.y].every(
            (v) => finite(v) && Math.abs(v) <= o.maxCoordinateAbs,
          ),
      )
    )
      error("Invalid port", [n.id], "INVALID_GEOMETRY");
    if ((i & 255) === 0) yield;
  }
  const roots: number[] = [];
  for (let i = 0; i < ns.length; i++) {
    const n = ns[i],
      p = n.parentId === null ? -1 : g.byId.get(n.parentId);
    if (p === undefined || p === i) error("Missing or self parent", [n.id]);
    if (n.isRoot && n.parentId !== null)
      error("Contradictory root flag", [n.id]);
    g.parent[i] = p ?? -1;
    if (n.parentId === null) roots.push(i);
    else if (p !== undefined && p !== i) g.children[p].push(i);
    if ((i & 255) === 0) yield;
  }
  if (ns.length && roots.length !== 1)
    error(
      "Exactly one root is required",
      roots.map((i) => ns[i].id),
    );
  g.root = roots[0] ?? -1;
  for (const kids of g.children)
    kids.sort((a, b) => ns[a].stableOrder - ns[b].stableOrder || a - b);
  // DFS colors detects cycles even in disconnected components. No recursion.
  const color = new Uint8Array(ns.length);
  for (let start = 0; start < ns.length; start++) {
    if (color[start]) continue;
    const stack: [number, boolean][] = [[start, false]];
    while (stack.length) {
      const [i, done] = stack.pop()!;
      if (done) {
        color[i] = 2;
        continue;
      }
      if (color[i] === 1) {
        error("Parent cycle", [ns[i].id]);
        continue;
      }
      if (color[i] === 2) continue;
      color[i] = 1;
      stack.push([i, true]);
      for (const c of g.children[i]) stack.push([c, false]);
      if ((stack.length & 127) === 0) yield;
    }
  }
  if (!diagnostics.length && g.root >= 0) {
    const stack: [number, number, number, boolean][] = [[g.root, 0, -1, false]];
    while (stack.length) {
      const [i, d, owner, done] = stack.pop()!;
      if (done) {
        g.postorder.push(i);
        g.tout[i] = g.preorder.length;
        continue;
      }
      g.depth[i] = d;
      g.collapsedOwner[i] = owner;
      g.tin[i] = g.preorder.length;
      g.preorder.push(i);
      if (owner >= 0) g.hidden.add(i);
      stack.push([i, d, owner, true]);
      const next = owner >= 0 ? owner : ns[i].collapsed ? i : -1;
      for (let k = g.children[i].length - 1; k >= 0; k--)
        stack.push([g.children[i][k], d + 1, next, false]);
      if ((g.preorder.length & 255) === 0) yield;
    }
  }
  const edgeIds = new Set<string>();
  for (const e of input.edges) {
    if (
      edgeIds.has(e.id) ||
      !g.byId.has(e.source) ||
      !g.byId.has(e.target) ||
      (e.kind === "tree" && ns[g.byId.get(e.target)!].parentId !== e.source)
    )
      diagnostics.push({
        code: "INVALID_EDGE",
        nodeIds: [],
        edgeIds: [e.id],
        message: "Duplicate edge id or invalid endpoint/tree edge",
        severity: "error",
      });
    if (
      ![e.halfWidth, e.arrowLength, e.arrowHalfWidth].every(
        (v) => finite(v) && v >= 0 && v <= o.maxCoordinateAbs,
      )
    )
      error("Invalid edge envelope", [], "INVALID_GEOMETRY");
    if (
      e.labelSize &&
      ![e.labelSize.width, e.labelSize.height].every(
        (v) => finite(v) && v > 0 && v <= o.maxCoordinateAbs,
      )
    )
      error("Invalid label bounds", [], "INVALID_GEOMETRY");
    edgeIds.add(e.id);
    if ((edgeIds.size & 255) === 0) yield;
  }
  if (input.strategy === "subtree" && !g.byId.has(input.subtreeRootId ?? ""))
    error("Missing subtree root");
  return { graph: g, diagnostics };
}
export function subtree(g: Graph, i: number): number[] {
  return g.preorder.slice(g.tin[i], g.tout[i]);
}
export function visibleChildren(
  g: Graph,
  ns: readonly EngineNode[],
  i: number,
): number[] {
  return ns[i].collapsed ? [] : g.children[i].filter((j) => !g.hidden.has(j));
}
