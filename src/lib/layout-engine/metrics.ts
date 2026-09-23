import { boundsOf, distance, flatten, overlaps } from "./geometry";
import {
  drain,
  type Work,
  type EdgeRoute,
  type EngineNode,
  type LayoutMetrics,
  type Point,
} from "./types";
export function* measureSteps(
  original: readonly EngineNode[],
  current: readonly EngineNode[],
  routes: readonly EdgeRoute[],
  changedIds: readonly string[],
): Work<LayoutMetrics> {
  const changed = new Set(changedIds),
    displacements: number[] = [];
  let moved = 0;
  for (let i = 0; i < current.length; i++) {
    const d = distance(original[i], current[i]);
    if (d > 0.001) moved++;
    if (!changed.has(current[i].id)) displacements.push(d);
    if ((i & 127) === 0) yield;
  }
  displacements.sort((a, b) => a - b);
  const percentile = (q: number) =>
    displacements[Math.max(0, Math.ceil(displacements.length * q) - 1)] ?? 0;
  const b = boundsOf(current),
    labels = routes.flatMap((r) => (r.labelBounds ? [r.labelBounds] : []));
  let length = 0,
    bends = 0,
    labelOverlaps = 0;
  for (const r of routes) {
    yield;
    const ps = flatten(r.segments).points;
    for (let i = 1; i < ps.length; i++) {
      length += distance(ps[i - 1], ps[i]);
    }
    // Count actual corners and rounded routing elbows, not every sample on a
    // smooth Bezier. A direct single Bezier has no routing elbow.
    for (let i = 0; i < r.segments.length; i++) {
      const s = r.segments[i],
        next = r.segments[i + 1];
      if (s.kind === "cubic") {
        if (r.segments.length > 1) bends++;
        continue;
      }
      if (next?.kind !== "line") continue;
      const a: Point = { x: s.to.x - s.from.x, y: s.to.y - s.from.y };
      const b: Point = {
        x: next.to.x - next.from.x,
        y: next.to.y - next.from.y,
      };
      if (Math.abs(a.x * b.y - a.y * b.x) > 1e-5) bends++;
    }
  }
  for (let i = 0; i < labels.length; i++) {
    for (const n of current) {
      if (overlaps(labels[i], n)) labelOverlaps++;
      yield;
    }
    for (let j = i + 1; j < labels.length; j++)
      if (overlaps(labels[i], labels[j])) labelOverlaps++;
  }
  return {
    candidateChecks: 0,
    routeExpansions: 0,
    passes: 0,
    reusedRoutes: 0,
    nodeOverlaps: 0,
    blockedRoutes: routes.filter((r) => r.status !== "ok").length,
    estimatedNodes: current.filter((n) => n.sizeSource === "estimated").length,
    movedRatio: current.length ? moved / current.length : 0,
    displacementMedian: percentile(0.5),
    displacementP95: percentile(0.95),
    displacementMax: percentile(1),
    area: b ? b.width * b.height : 0,
    aspectRatio: b ? b.width / Math.max(1, b.height) : 0,
    routeLength: length,
    bends,
    labelOverlaps,
  };
}

export const measure = (
  original: readonly EngineNode[],
  current: readonly EngineNode[],
  routes: readonly EdgeRoute[],
  changedIds: readonly string[],
) => drain(measureSteps(original, current, routes, changedIds));
