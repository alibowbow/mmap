import assert from "node:assert/strict";
import type {
  LayoutInput,
  LayoutResult,
} from "../../src/lib/layout-engine/types";
// Deliberately independent of engine geometry/index/metrics.
export function resultNodes(input: LayoutInput, result: LayoutResult) {
  return input.nodes.map((n) => ({
    ...n,
    ...result.positions.find((p) => p.id === n.id),
  }));
}
export function assertNoOverlap(input: LayoutInput, result: LayoutResult) {
  const ns = resultNodes(input, result),
    byId = new Map(ns.map((n) => [n.id, n]));
  const collapsed = new Set<string>();
  for (const n of ns) {
    const seen = new Set<string>();
    let p = n.parentId;
    while (p && !seen.has(p)) {
      seen.add(p);
      const parent = byId.get(p);
      if (parent?.collapsed) {
        collapsed.add(n.id);
        break;
      }
      p = parent?.parentId ?? null;
    }
  }
  for (let i = 0; i < ns.length; i++)
    for (let j = i + 1; j < ns.length; j++) {
      const a = ns[i],
        b = ns[j];
      if (collapsed.has(a.id) || collapsed.has(b.id)) continue;
      assert.ok(
        !(
          Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0.002 &&
          Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0.002
        ),
        `Overlap ${a.id}/${b.id}`,
      );
    }
}
export function assertRoutesClear(input: LayoutInput, result: LayoutResult) {
  const ns = resultNodes(input, result);
  for (const route of result.routes) {
    if (route.status !== "ok") continue;
    const edge = input.edges.find((e) => e.id === route.edgeId)!;
    for (const s of route.segments) {
      for (let k = 0; k <= 300; k++) {
        const t = k / 300,
          u = 1 - t;
        const p =
          s.kind === "line"
            ? {
                x: s.from.x + (s.to.x - s.from.x) * t,
                y: s.from.y + (s.to.y - s.from.y) * t,
              }
            : {
                x:
                  u * u * u * s.from.x +
                  3 * u * u * t * s.c1.x +
                  3 * u * t * t * s.c2.x +
                  t * t * t * s.to.x,
                y:
                  u * u * u * s.from.y +
                  3 * u * u * t * s.c1.y +
                  3 * u * t * t * s.c2.y +
                  t * t * t * s.to.y,
              };
        for (const n of ns) {
          if (n.id === edge.source || n.id === edge.target) continue;
          assert.ok(
            !(
              p.x > n.x - 0.001 &&
              p.x < n.x + n.width + 0.001 &&
              p.y > n.y - 0.001 &&
              p.y < n.y + n.height + 0.001
            ),
            `Route ${edge.id} crosses ${n.id}`,
          );
        }
      }
    }
    for (const p of [...(route.ribbon ?? []), ...(route.arrow ?? [])])
      for (const n of ns) {
        if (n.id === edge.source || n.id === edge.target) continue;
        assert.ok(
          !(
            p.x > n.x &&
            p.x < n.x + n.width &&
            p.y > n.y &&
            p.y < n.y + n.height
          ),
          `Envelope ${edge.id} crosses ${n.id}`,
        );
      }
  }
}
