import { inflate, union } from "./geometry";
import { SpatialIndex } from "./spatial-index";
import type {
  EdgeRoute,
  EngineEdge,
  EngineNode,
  LayoutInput,
  Work,
} from "./types";
// Cache belongs to a document epoch. Old/new obstacle unions invalidate paths
// through non-incident nodes, including newly opened detour corridors.
export class RouteCache {
  private session = "";
  private nodes = new Map<string, EngineNode>();
  private routes = new Map<string, { signature: string; route: EdgeRoute }>();
  private pathIndex = new SpatialIndex<EdgeRoute["bounds"] & { id: string }>();
  private invalid = new Set<string>();
  *prepare(input: LayoutInput, visible: readonly EngineNode[]): Work<void> {
    const session = `${input.stamp.documentId}:${input.stamp.documentEpoch}`;
    if (session !== this.session) {
      this.session = session;
      this.nodes.clear();
      this.routes.clear();
      this.pathIndex = new SpatialIndex();
    }
    const next = new Map(visible.map((n) => [n.id, n]));
    this.invalid.clear();
    for (const id of new Set([...next.keys(), ...this.nodes.keys()])) {
      yield;
      const a = this.nodes.get(id),
        b = next.get(id);
      if (
        a &&
        b &&
        a.x === b.x &&
        a.y === b.y &&
        a.width === b.width &&
        a.height === b.height &&
        JSON.stringify(a.ports) === JSON.stringify(b.ports)
      )
        continue;
      const r = a && b ? union(a, b) : (a ?? b)!;
      for (const p of this.pathIndex.query(inflate(r, 64)))
        this.invalid.add(p.id);
    }
    this.nodes = next;
    const ids = new Set(input.edges.map((e) => e.id));
    for (const id of this.routes.keys())
      if (!ids.has(id)) {
        this.routes.delete(id);
        this.pathIndex.delete(id);
      }
  }
  signature(input: LayoutInput, e: EngineEdge, s: EngineNode, t: EngineNode) {
    return JSON.stringify([
      input.mode,
      input.options,
      e,
      s.x,
      s.y,
      s.width,
      s.height,
      s.ports,
      s.effectiveMode,
      t.x,
      t.y,
      t.width,
      t.height,
      t.ports,
    ]);
  }
  get(id: string, signature: string) {
    const cached = this.routes.get(id);
    return !this.invalid.has(id) && cached?.signature === signature
      ? cached.route
      : undefined;
  }
  set(id: string, signature: string, route: EdgeRoute) {
    this.routes.set(id, { signature, route });
    this.pathIndex.set(id, { ...route.bounds, id });
  }
}
