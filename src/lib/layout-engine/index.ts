import { boundsOf, union } from "./geometry";
import { buildGraph } from "./graph";
import { countCollisions, solvePositions } from "./incremental";
import { measure, measureSteps } from "./metrics";
import { routeEdge } from "./route-edges";
import { RouteCache } from "./route-cache";
import { SpatialIndex } from "./spatial-index";
import {
  Budget,
  drain,
  type EdgeRoute,
  type EngineNode,
  type LayoutInput,
  type LayoutResult,
  type Work,
} from "./types";

export function cancelledResult(input: LayoutInput): LayoutResult {
  return {
    stamp: input.stamp,
    status: "cancelled",
    terminationReason: "superseded",
    positions: [],
    movedNodeIds: [],
    affectedNodeIds: [],
    routes: [],
    bounds: null,
    diagnostics: [],
    metrics: measure([], [], [], []),
  };
}
export function* solveLayoutSteps(
  input: LayoutInput,
  cache = new RouteCache(),
): Work<LayoutResult> {
  const { graph: g, diagnostics } = yield* buildGraph(input);
  if (diagnostics.length)
    return {
      ...cancelledResult(input),
      status: "invalid",
      terminationReason: "invalid-input",
      diagnostics,
    };
  const budget = new Budget(input.options),
    placement = yield* solvePositions(input, g, budget),
    ns = placement.nodes;
  diagnostics.push(...placement.diagnostics);
  const visible = ns.filter((_, i) => !g.hidden.has(i)),
    nodeIndex = new SpatialIndex<EngineNode>();
  for (const n of visible) {
    nodeIndex.set(n.id, n);
    yield;
  }
  yield* cache.prepare(input, visible);
  const routes: EdgeRoute[] = [];
  let reused = 0;
  for (const e of input.edges) {
    const s = g.byId.get(e.source)!,
      t = g.byId.get(e.target)!;
    if (g.hidden.has(s) || g.hidden.has(t)) continue;
    const signature = cache.signature(input, e, ns[s], ns[t]),
      old = cache.get(e.id, signature);
    let route: EdgeRoute;
    if (old) {
      route = old;
      reused++;
    } else {
      route = yield* routeEdge(input, e, ns[s], ns[t], nodeIndex, budget);
      cache.set(e.id, signature, route);
    }
    routes.push(route);
    if (route.status !== "ok")
      diagnostics.push({
        code: route.status === "blocked" ? "ROUTE_BLOCKED" : "ROUTE_UNVERIFIED",
        nodeIds: [e.source, e.target],
        edgeIds: [e.id],
        severity: "warning",
        message:
          "No verified route within the current style and routing budget",
      });
    yield;
  }
  const metrics = yield* measureSteps(
    input.nodes.filter((_, i) => !g.hidden.has(i)),
    visible,
    routes,
    input.changedNodeIds,
  );
  metrics.nodeOverlaps = yield* countCollisions(ns, g);
  metrics.candidateChecks = budget.checks;
  metrics.routeExpansions = budget.expansions;
  metrics.passes = placement.passes;
  metrics.reusedRoutes = reused;
  if (metrics.estimatedNodes)
    diagnostics.push({
      code: "ESTIMATED_SIZE",
      nodeIds: [],
      edgeIds: [],
      message: `${metrics.estimatedNodes} nodes await measurement`,
      severity: "warning",
    });
  if (metrics.labelOverlaps)
    diagnostics.push({
      code: "LABEL_BLOCKED",
      nodeIds: [],
      edgeIds: [],
      message: "Some labels intersect nodes or other labels",
      severity: "warning",
    });
  if (budget.reason)
    diagnostics.push({
      code: "LIMIT_REACHED",
      nodeIds: [],
      edgeIds: [],
      message: budget.reason,
      severity: "warning",
    });
  const positions = ns.flatMap((n, i) =>
    n.x !== input.nodes[i].x || n.y !== input.nodes[i].y
      ? [{ id: n.id, x: n.x, y: n.y }]
      : [],
  );
  let bounds = boundsOf(visible);
  for (const r of routes) bounds = union(bounds, r.bounds);
  const infeasible = diagnostics.some((d) => d.code === "FIXED_OVERLAP");
  const partial =
    metrics.nodeOverlaps > 0 ||
    metrics.blockedRoutes > 0 ||
    metrics.labelOverlaps > 0 ||
    !!budget.reason;
  return {
    stamp: input.stamp,
    status: infeasible ? "infeasible" : partial ? "partial" : "ok",
    terminationReason: infeasible
      ? "fixed-conflict"
      : (budget.reason ?? (partial ? "constraints-unresolved" : "complete")),
    positions,
    movedNodeIds: positions.map((p) => p.id),
    affectedNodeIds: [...placement.affected].map((i) => ns[i].id),
    routes,
    bounds,
    diagnostics,
    metrics,
  };
}
export const solveLayout = (input: LayoutInput, cache?: RouteCache) =>
  drain(solveLayoutSteps(input, cache));
