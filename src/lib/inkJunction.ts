import type { InkData, InkPoint, InkStroke } from "@/types/mindmap";
import {
  branchGeometry,
  hasBranchStyle,
  inversePoint,
  itemBounds,
  itemCenter,
  MAX_STROKE_POINTS,
  renderPoints,
  transformPoint,
} from "./ink";
import { isErasedAt, visibleStrokeSegmentIntervals } from "./inkEditing";

type Point = { x: number; y: number };
type Bounds = { x: number; y: number; width: number; height: number };
export type InkJunction = {
  point: Point;
  tangent: Point;
  /** Actual painted diameter in world units, including the parent's scale. */
  width: number;
  parentId: string;
};

type Bounded = { bounds: Bounds };
type Tree<T extends Bounded> = {
  bounds: Bounds;
  entries?: T[];
  left?: Tree<T>;
  right?: Tree<T>;
};
type Parent = Bounded & { stroke: InkStroke; order: number };
type Segment = Bounded & { a: number; b: number };
type Geometry = {
  points: Point[];
  radii: number[];
  segments: Segment[];
  tree?: Tree<Segment>;
};

// Immutable document/stroke identity is also used by the existing renderer.
// Indexing once makes proximity previews independent of unrelated long strokes.
const documents = new WeakMap<InkData, Tree<Parent> | null>();
const geometries = new WeakMap<InkStroke, Geometry>();
const finitePoint = (p: Point) => Number.isFinite(p.x) && Number.isFinite(p.y);
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const unit = (v: Point, fallback: Point = { x: 1, y: 0 }): Point => {
  const length = Math.hypot(v.x, v.y);
  return length > 1e-9 ? { x: v.x / length, y: v.y / length } : fallback;
};
const intersects = (a: Bounds, b: Bounds) =>
  a.x <= b.x + b.width &&
  a.x + a.width >= b.x &&
  a.y <= b.y + b.height &&
  a.y + a.height >= b.y;

function tree<T extends Bounded>(entries: T[]): Tree<T> | null {
  if (!entries.length) return null;
  const x = Math.min(...entries.map((e) => e.bounds.x)),
    y = Math.min(...entries.map((e) => e.bounds.y)),
    right = Math.max(...entries.map((e) => e.bounds.x + e.bounds.width)),
    bottom = Math.max(...entries.map((e) => e.bounds.y + e.bounds.height)),
    bounds = { x, y, width: right - x, height: bottom - y };
  if (entries.length <= 12) return { bounds, entries };
  const axis = bounds.width >= bounds.height ? "x" : "y",
    extent = axis === "x" ? "width" : "height",
    sorted = [...entries].sort(
      (a, b) =>
        a.bounds[axis] + a.bounds[extent] / 2 -
        (b.bounds[axis] + b.bounds[extent] / 2),
    ),
    mid = sorted.length >>> 1;
  return {
    bounds,
    left: tree(sorted.slice(0, mid))!,
    right: tree(sorted.slice(mid))!,
  };
}

function query<T extends Bounded>(node: Tree<T> | null | undefined, rect: Bounds, result: T[]) {
  if (!node || !intersects(node.bounds, rect)) return;
  if (node.entries) {
    for (const entry of node.entries)
      if (intersects(entry.bounds, rect)) result.push(entry);
  } else {
    query(node.left, rect, result);
    query(node.right, rect, result);
  }
}

function documentIndex(ink: InkData) {
  if (documents.has(ink)) return documents.get(ink)!;
  const order = new Map((ink.order ?? []).map((id, i) => [id, i]));
  const parents: Parent[] = [];
  ink.strokes.forEach((stroke, i) => {
    if (
      (stroke.brush !== "brush" && stroke.brush !== "branch") ||
      !stroke.points.length ||
      stroke.opacity === 0
    ) return;
    parents.push({ stroke, order: order.get(stroke.id) ?? i, bounds: itemBounds(stroke) });
  });
  const index = tree(parents);
  documents.set(ink, index);
  return index;
}

function geometry(stroke: InkStroke): Geometry {
  const cached = geometries.get(stroke);
  if (cached) return cached;
  const hand = hasBranchStyle(stroke) ? branchGeometry(stroke) : null,
    source = hand?.points ?? renderPoints(stroke),
    center = stroke.transform ? itemCenter(stroke) : undefined,
    scale = stroke.transform?.scale ?? 1,
    points = source.map((p) =>
      stroke.transform ? transformPoint(p, stroke.transform, center!) : { x: p.x, y: p.y },
    ),
    radii = hand
      ? hand.radii.map((r) => r * scale)
      : source.map((p, i) => {
          const t = source.length > 1 ? i / (source.length - 1) : 0.5,
            pressureRadius = stroke.width * (0.35 + 0.65 * p.pressure) / 2,
            taper = stroke.taper ?? (stroke.brush === "branch" ? 0.88 : 0.72),
            envelope = stroke.brush === "branch"
              ? 1 - taper * Math.pow(t, 0.7)
              : 1 - taper + taper * Math.pow(Math.sin(Math.PI * t), 0.6);
          return pressureRadius * envelope * scale;
        }),
    segments: Segment[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (distance(a, b) < 1e-9) continue;
    segments.push({
      a: i - 1,
      b: i,
      bounds: {
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        width: Math.abs(a.x - b.x),
        height: Math.abs(a.y - b.y),
      },
    });
  }
  const result = { points, radii, segments, tree: segments.length > 64 ? tree(segments)! : undefined };
  geometries.set(stroke, result);
  return result;
}

/**
 * Find a nearby visible brush/branch centreline. Distances are world units;
 * matching colour wins within that radius, then proximity and topmost order.
 * This is opt-in assistance: it never rewrites the parent or changes old paths.
 */
export function findBranchJunction(
  ink: InkData,
  worldStart: Point,
  maxWorldDistance: number,
  color?: string,
): InkJunction | null {
  if (!finitePoint(worldStart) || !Number.isFinite(maxWorldDistance) || maxWorldDistance < 0) return null;
  const rect = {
      x: worldStart.x - maxWorldDistance,
      y: worldStart.y - maxWorldDistance,
      width: maxWorldDistance * 2,
      height: maxWorldDistance * 2,
    },
    parents: Parent[] = [];
  query(documentIndex(ink), rect, parents);
  let best: InkJunction | null = null,
    bestDistance = Infinity,
    bestMatch = false,
    bestOrder = -Infinity;
  const consider = (parent: Parent, point: Point, tangent: Point, width: number) => {
    const d = distance(point, worldStart),
      matches = !!color && parent.stroke.color.toLowerCase() === color.toLowerCase();
    if (d > maxWorldDistance + 1e-9 || isErasedAt(parent.stroke, point)) return;
    if (
      best &&
      (bestMatch && !matches ||
        bestMatch === matches && (d > bestDistance + 1e-9 ||
          Math.abs(d - bestDistance) <= 1e-9 && parent.order <= bestOrder))
    ) return;
    best = { point, tangent, width, parentId: parent.stroke.id };
    bestDistance = d;
    bestMatch = matches;
    bestOrder = parent.order;
  };
  for (const parent of parents) {
    const g = geometry(parent.stroke), segments: Segment[] = [];
    if (g.tree) query(g.tree, rect, segments);
    else for (const s of g.segments) if (intersects(s.bounds, rect)) segments.push(s);
    if (!g.segments.length && g.points[0])
      consider(parent, g.points[0], { x: 1, y: 0 }, g.radii[0] * 2);
    for (const segment of segments) {
      const a = g.points[segment.a], b = g.points[segment.b],
        dx = b.x - a.x, dy = b.y - a.y,
        square = dx * dx + dy * dy,
        projected = ((worldStart.x - a.x) * dx + (worldStart.y - a.y) * dy) / square,
        tangent = unit({ x: dx, y: dy });
      for (const [lo, hi] of visibleStrokeSegmentIntervals(parent.stroke, a, b)) {
        let t = Math.max(lo, Math.min(hi, projected));
        let point = { x: a.x + dx * t, y: a.y + dy * t };
        // Mask boundaries belong to the erased area. Move a tiny world amount
        // inside the visible interval instead of reconnecting through a hole.
        if (isErasedAt(parent.stroke, point)) {
          const epsilon = Math.min((hi - lo) / 2, 1e-5 / Math.sqrt(square));
          t = Math.max(lo + epsilon, Math.min(hi - epsilon, t));
          point = { x: a.x + dx * t, y: a.y + dy * t };
        }
        const radius = g.radii[segment.a] * (1 - t) + g.radii[segment.b] * t;
        consider(parent, point, tangent, radius * 2);
      }
    }
  }
  return best;
}

function pointAt(points: InkPoint[], distanceAlong: number) {
  let traveled = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], length = distance(a, b);
    if (length && traveled + length >= distanceAlong) {
      const t = Math.max(0, Math.min(1, (distanceAlong - traveled) / length));
      return {
        point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t,
          pressure: a.pressure + (b.pressure - a.pressure) * t },
        tangent: unit({ x: b.x - a.x, y: b.y - a.y }),
        tail: t < 1 - 1e-9 ? i : i + 1,
      };
    }
    traveled += length;
  }
  return { point: points[points.length - 1], tangent: { x: 1, y: 0 }, tail: points.length };
}

/**
 * Attach only a short authored prefix; every later stored point is preserved.
 * Width metadata lets the renderer merge a small child with a fine parent tip.
 * Pressure, seed, masks and all unrelated style settings remain unchanged.
 */
export function snapBranchStart(stroke: InkStroke, junction: InkJunction): InkStroke {
  if (!stroke.points.length || !finitePoint(junction.point) || !finitePoint(junction.tangent) ||
    !Number.isFinite(junction.width) || junction.width <= 0) return stroke;
  const originalCenter = itemCenter(stroke), scale = stroke.transform?.scale ?? 1,
    start = stroke.transform
      ? inversePoint({ ...junction.point, pressure: stroke.points[0].pressure }, stroke.transform, originalCenter)
      : { ...junction.point, pressure: stroke.points[0].pressure },
    angle = -(stroke.transform?.rotation ?? 0) * Math.PI / 180,
    parentTangent = unit({
      x: junction.tangent.x * Math.cos(angle) - junction.tangent.y * Math.sin(angle),
      y: junction.tangent.x * Math.sin(angle) + junction.tangent.y * Math.cos(angle),
    });
  let points: InkPoint[];
  // The parametric branch tool intentionally derives its whole curve from two
  // endpoints. Inserting samples cannot constrain its prefix, so retain that
  // contract and only move its starting endpoint.
  if (stroke.brush === "branch" || stroke.points.length === 1) {
    points = [start, ...stroke.points.slice(1)];
  } else {
    let total = 0, firstCorner = Infinity, previousDirection: Point | undefined;
    for (let i = 1; i < stroke.points.length; i++) {
      const a = stroke.points[i - 1], b = stroke.points[i], length = distance(a, b);
      if (!length) continue;
      const direction = unit({ x: b.x - a.x, y: b.y - a.y });
      if (previousDirection && firstCorner === Infinity &&
        direction.x * previousDirection.x + direction.y * previousDirection.y < 0.35)
        firstCorner = total;
      previousDirection = direction;
      total += length;
    }
    const span = Math.min(total * 0.35, firstCorner,
      Math.max(8, Math.min(32, stroke.width * 1.25 + distance(start, stroke.points[0]) * 0.5)));
    if (span < 0.1) points = [start, ...stroke.points.slice(1)];
    else {
      const anchor = pointAt(stroke.points, span), end = anchor.point,
        chord = distance(start, end),
        direction = { x: end.x - start.x, y: end.y - start.y },
        sign = parentTangent.x * direction.x + parentTangent.y * direction.y < 0 ? -1 : 1,
        handle = Math.min(12, span * 0.5, chord * 0.35),
        c1 = { x: start.x + parentTangent.x * sign * handle, y: start.y + parentTangent.y * sign * handle },
        c2 = { x: end.x - anchor.tangent.x * handle, y: end.y - anchor.tangent.y * handle },
        tail = stroke.points.slice(anchor.tail),
        count = Math.min(6, MAX_STROKE_POINTS - tail.length);
      points = Array.from({ length: count }, (_, i) => {
        const t = count > 1 ? i / (count - 1) : 0,
          u = 1 - t, pressure = pointAt(stroke.points, span * t).point.pressure;
        if (!i) return start;
        if (i === count - 1) return { ...end };
        return {
          x: u * u * u * start.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * end.x,
          y: u * u * u * start.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * end.y,
          pressure,
        };
      });
      points.push(...tail);
    }
  }
  const result = { ...stroke, points, joinWidth: Math.max(0.1, Math.min(stroke.width, junction.width / scale)) };
  if (stroke.transform) {
    // Moving the prefix also changes the bounds-derived pivot. Compensate the
    // translation so the untouched remainder and any masks stay fixed in world.
    const center = itemCenter(result), dx = originalCenter.x - center.x,
      dy = originalCenter.y - center.y,
      rotation = stroke.transform.rotation * Math.PI / 180;
    result.transform = {
      ...stroke.transform,
      x: stroke.transform.x + dx - scale * (dx * Math.cos(rotation) - dy * Math.sin(rotation)),
      y: stroke.transform.y + dy - scale * (dx * Math.sin(rotation) + dy * Math.cos(rotation)),
    };
  }
  return result;
}
