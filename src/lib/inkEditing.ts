import type { InkErasure, InkPoint, InkStroke } from "@/types/mindmap";
import {
  branchGeometry,
  hasBranchStyle,
  identityTransform,
  inversePoint,
  isStroke,
  itemBounds,
  itemCenter,
  itemHit,
  rawItemBounds,
  renderPoints,
  transformPoint,
  type InkItem,
} from "@/lib/ink";

type Point = { x: number; y: number };
type Interval = [number, number];
const EPSILON = 1e-9;
const finitePoint = (p: Point) => Number.isFinite(p.x) && Number.isFinite(p.y);
const withPressure = (p: Point): InkPoint => ({ ...p, pressure: 1 });
const interpolate = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
const localPoint = (s: InkStroke, p: Point): Point =>
  s.transform ? inversePoint(withPressure(p), s.transform, itemCenter(s)) : p;
const worldPoint = (s: InkItem, p: Point): Point =>
  s.transform ? transformPoint(p, s.transform, itemCenter(s)) : p;

function mergeIntervals(intervals: Interval[]): Interval[] {
  intervals.sort((a, b) => a[0] - b[0]);
  const result: Interval[] = [];
  for (const [start, end] of intervals) {
    if (start > end + EPSILON) continue;
    const last = result[result.length - 1];
    if (last && start <= last[1] + EPSILON) last[1] = Math.max(last[1], end);
    else result.push([start, end]);
  }
  return result;
}
function subtractIntervals(source: Interval[], hidden: Interval[]): Interval[] {
  const result: Interval[] = [];
  for (const [start, end] of source) {
    let cursor = start;
    for (const [from, to] of hidden) {
      if (to < cursor - EPSILON) continue;
      if (from > end + EPSILON) break;
      if (from > cursor + EPSILON) result.push([cursor, Math.min(from, end)]);
      cursor = Math.max(cursor, to);
      if (cursor >= end - EPSILON) break;
    }
    if (cursor < end - EPSILON) result.push([cursor, end]);
    // A stationary query is represented by the full parameter interval [0,1],
    // so this also distinguishes a visible dot from an erased dot.
  }
  return result;
}
function circleInterval(a: Point, b: Point, c: Point, radius: number): Interval[] {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    x = a.x - c.x,
    y = a.y - c.y,
    square = dx * dx + dy * dy,
    constant = x * x + y * y - radius * radius;
  if (square < EPSILON) return constant <= EPSILON ? [[0, 1]] : [];
  const linear = 2 * (x * dx + y * dy),
    discriminant = linear * linear - 4 * square * constant;
  if (discriminant < -EPSILON) return [];
  const root = Math.sqrt(Math.max(0, discriminant)),
    start = Math.max(0, (-linear - root) / (2 * square)),
    end = Math.min(1, (-linear + root) / (2 * square));
  return start <= end + EPSILON ? [[start, end]] : [];
}
function clipLinear(
  interval: Interval,
  origin: number,
  delta: number,
  minimum: number,
  maximum: number,
): Interval | undefined {
  if (Math.abs(delta) < EPSILON)
    return origin >= minimum - EPSILON && origin <= maximum + EPSILON
      ? interval
      : undefined;
  const t1 = (minimum - origin) / delta,
    t2 = (maximum - origin) / delta,
    start = Math.max(interval[0], Math.min(t1, t2)),
    end = Math.min(interval[1], Math.max(t1, t2));
  return start <= end + EPSILON ? [start, end] : undefined;
}
// Exact line/capsule clipping, including sparse input samples and fast diagonal
// gestures. No pointer-frequency-dependent circle sampling is required.
function capsuleIntervals(
  a: Point,
  b: Point,
  from: Point,
  to: Point,
  radius: number,
): Interval[] {
  if (radius < 0) return [];
  const dx = to.x - from.x,
    dy = to.y - from.y,
    square = dx * dx + dy * dy;
  if (square < EPSILON) return circleInterval(a, b, from, radius);
  const qx = b.x - a.x,
    qy = b.y - a.y,
    x = a.x - from.x,
    y = a.y - from.y;
  let strip = clipLinear([0, 1], x * dx + y * dy, qx * dx + qy * dy, 0, square);
  if (strip)
    strip = clipLinear(
      strip,
      x * dy - y * dx,
      qx * dy - qy * dx,
      -radius * Math.sqrt(square),
      radius * Math.sqrt(square),
    );
  return mergeIntervals([
    ...circleInterval(a, b, from, radius),
    ...circleInterval(a, b, to, radius),
    ...(strip ? [strip] : []),
  ]);
}
function erasedIntervals(
  erasures: InkErasure[] | undefined,
  a: Point,
  b: Point,
  radiusAdjustment = 0,
): Interval[] {
  const intervals: Interval[] = [];
  const left = Math.min(a.x, b.x),
    top = Math.min(a.y, b.y),
    right = Math.max(a.x, b.x),
    bottom = Math.max(a.y, b.y);
  for (const erasure of erasures ?? []) {
    const radius = erasure.radius + radiusAdjustment;
    if (radius < 0) continue;
    for (let i = 0; i < erasure.points.length; i++) {
      const from = erasure.points[Math.max(0, i - 1)],
        to = erasure.points[i];
      if (
        Math.max(from.x, to.x) + radius < left ||
        Math.min(from.x, to.x) - radius > right ||
        Math.max(from.y, to.y) + radius < top ||
        Math.min(from.y, to.y) - radius > bottom
      ) continue;
      intervals.push(...capsuleIntervals(a, b, from, to, radius));
    }
  }
  return mergeIntervals(intervals);
}

/** Positive tolerance expands a mask in world units; negative tolerance shrinks it. */
export function isErasedAt(s: InkStroke, p: Point, tolerance = 0): boolean {
  if (!finitePoint(p) || !Number.isFinite(tolerance) || !s.erasures?.length) return false;
  const local = localPoint(s, p);
  return erasedIntervals(s.erasures, local, local, tolerance / (s.transform?.scale ?? 1)).length > 0;
}

/** Visible t intervals of a world-space line, useful for snapping past an erased hole. */
export function visibleStrokeSegmentIntervals(
  s: InkStroke,
  worldA: Point,
  worldB: Point,
): Interval[] {
  if (!finitePoint(worldA) || !finitePoint(worldB)) return [];
  return subtractIntervals(
    [[0, 1]],
    erasedIntervals(s.erasures, localPoint(s, worldA), localPoint(s, worldB)),
  );
}

type EditingGeometry = { points: InkPoint[]; radii: number[] };
const geometryCache = new WeakMap<InkStroke, EditingGeometry>();
function strokeGeometry(s: InkStroke): EditingGeometry {
  const cached = geometryCache.get(s);
  if (cached) return cached;
  if (hasBranchStyle(s)) {
    const geometry = branchGeometry(s);
    geometryCache.set(s, geometry);
    return geometry;
  }
  const points = renderPoints(s);
  const geometry = {
    points,
    radii: points.map((p, i) => {
      const t = points.length > 1 ? i / (points.length - 1) : 0.5;
      const radius = s.width * (0.35 + 0.65 * p.pressure) / 2;
      if (s.brush === "branch") return radius * (1 - (s.taper ?? 0.88) * Math.pow(t, 0.7));
      if (s.brush === "brush")
        return radius * (1 - (s.taper ?? 0.72) + (s.taper ?? 0.72) * Math.pow(Math.sin(Math.PI * t), 0.6));
      return s.brush === "marker" || s.brush === "highlighter" ? s.width / 2 : radius;
    }),
  };
  geometryCache.set(s, geometry);
  return geometry;
}

function visibleHit(s: InkStroke, worldA: Point, worldB: Point, worldPad: number, queryMasks: boolean): boolean {
  if (!finitePoint(worldA) || !finitePoint(worldB) || !Number.isFinite(worldPad) || worldPad < 0) return false;
  if (!itemHit(s, withPressure(worldA), withPressure(worldB), worldPad)) return false;
  if (!s.erasures?.length) return true;
  const a = localPoint(s, worldA),
    b = localPoint(s, worldB),
    pad = worldPad / (s.transform?.scale ?? 1),
    hiddenQuery = queryMasks ? erasedIntervals(s.erasures, a, b) : [],
    geometry = strokeGeometry(s);
  if (queryMasks && !subtractIntervals([[0, 1]], hiddenQuery).length) return false;
  for (let i = 0; i < geometry.points.length; i++) {
    const p = geometry.points[Math.max(0, i - 1)],
      q = geometry.points[i],
      radius = Math.max(geometry.radii[Math.max(0, i - 1)], geometry.radii[i]);
    if (!capsuleIntervals(a, b, p, q, radius + pad).length) continue;
    // Shrinking each mask by the ribbon radius only removes portions whose
    // entire ink cross-section is covered. Partially erased edges remain usable.
    const remaining = subtractIntervals([[0, 1]], erasedIntervals(s.erasures, p, q, -radius));
    for (const [from, to] of remaining) {
      const hit = capsuleIntervals(a, b, interpolate(p, q, from), interpolate(p, q, to), radius + pad);
      if (subtractIntervals(hit, hiddenQuery).length) return true;
    }
  }
  return false;
}

/** Hit-testing follows the rendered curve and ignores clicks wholly inside holes. */
export function strokeVisibleHit(s: InkStroke, a: Point, b = a, pad = 0): boolean {
  return visibleHit(s, a, b, pad, true);
}

/** Adds one local-space capsule path. Original samples, pressure and style are untouched. */
export function appendStrokeErasure(s: InkStroke, worldPath: Point[], worldRadius: number): InkStroke {
  if (!worldPath.length || !worldPath.every(finitePoint) || !Number.isFinite(worldRadius) || worldRadius <= 0) return s;
  const bounds = itemBounds(s);
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const p of worldPath) {
    left = Math.min(left, p.x); top = Math.min(top, p.y);
    right = Math.max(right, p.x); bottom = Math.max(bottom, p.y);
  }
  if (
    right + worldRadius < bounds.x || left - worldRadius > bounds.x + bounds.width ||
    bottom + worldRadius < bounds.y || top - worldRadius > bounds.y + bounds.height
  ) return s;
  const points: Point[] = [];
  for (const p of worldPath) {
    const local = localPoint(s, p), last = points[points.length - 1];
    if (!last || Math.hypot(local.x - last.x, local.y - last.y) > EPSILON)
      points.push({ x: local.x, y: local.y });
  }
  const radius = worldRadius / (s.transform?.scale ?? 1);
  // A repeated pass wholly within an existing mask changes no pixels and does
  // not consume history or the bounded mask budget.
  const alreadyCovered = points.every((p, i) =>
    !subtractIntervals([[0, 1]], erasedIntervals(s.erasures, points[Math.max(0, i - 1)], p, -radius)).length,
  );
  if (alreadyCovered) return s;
  let touched = false;
  for (let i = 0; i < worldPath.length && !touched; i++)
    touched = visibleHit(s, worldPath[Math.max(0, i - 1)], worldPath[i], worldRadius, false);
  return touched ? { ...s, erasures: [...(s.erasures ?? []), { points, radius }] } : s;
}

function pointInPolygon(p: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i],
      cross = (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x);
    if (Math.abs(cross) < EPSILON && p.x >= Math.min(a.x, b.x) - EPSILON && p.x <= Math.max(a.x, b.x) + EPSILON && p.y >= Math.min(a.y, b.y) - EPSILON && p.y <= Math.max(a.y, b.y) + EPSILON) return true;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function segmentInsidePolygon(a: Point, b: Point, polygon: Point[]): boolean {
  if (!pointInPolygon(a, polygon) || !pointInPolygon(b, polygon)) return false;
  const splits = [0, 1], dx = b.x - a.x, dy = b.y - a.y;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i], q = polygon[(i + 1) % polygon.length],
      ex = q.x - p.x, ey = q.y - p.y,
      determinant = dx * ey - dy * ex;
    if (Math.abs(determinant) < EPSILON) continue;
    const x = p.x - a.x, y = p.y - a.y,
      t = (x * ey - y * ex) / determinant,
      u = (x * dy - y * dx) / determinant;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) splits.push(t);
  }
  splits.sort((x, y) => x - y);
  return splits.every((t, i) => !i || pointInPolygon(interpolate(a, b, (splits[i - 1] + t) / 2), polygon));
}
function strokeBoundary(s: InkStroke): [Point, Point][] {
  const { points, radii } = strokeGeometry(s),
    left: Point[] = [], right: Point[] = [], segments: [Point, Point][] = [];
  points.forEach((p, i) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)],
      dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1,
      x = -dy / length * radii[i], y = dx / length * radii[i];
    left.push({ x: p.x + x, y: p.y + y });
    right.push({ x: p.x - x, y: p.y - y });
    if (i) segments.push([left[i - 1], left[i]], [right[i - 1], right[i]], [points[i - 1], p]);
  });
  if (!points.length) return [];
  for (const i of points.length === 1 ? [0] : [0, points.length - 1]) {
    if (points.length > 1 && (s.brush === "marker" || s.brush === "highlighter")) {
      segments.push([left[i], right[i]]);
      continue;
    }
    const p = points[i], r = radii[i];
    for (let j = 0; j < 16; j++) {
      const from = j * Math.PI / 8, to = (j + 1) * Math.PI / 8;
      segments.push([
        { x: p.x + Math.cos(from) * r, y: p.y + Math.sin(from) * r },
        { x: p.x + Math.cos(to) * r, y: p.y + Math.sin(to) * r },
      ]);
    }
  }
  return segments;
}

/** Selects fully enclosed ink; a concave lasso cannot select a crossing segment. */
export function selectInkInPolygon(items: InkItem[], polygon: Point[]): string[] {
  if (polygon.length < 3 || !polygon.every(finitePoint)) return [];
  const area = polygon.reduce((sum, p, i) => {
    const q = polygon[(i + 1) % polygon.length];
    return sum + p.x * q.y - p.y * q.x;
  }, 0);
  if (Math.abs(area) < EPSILON) return [];
  const left = Math.min(...polygon.map((p) => p.x)), right = Math.max(...polygon.map((p) => p.x)),
    top = Math.min(...polygon.map((p) => p.y)), bottom = Math.max(...polygon.map((p) => p.y));
  return items.filter((item) => {
    const bounds = itemBounds(item);
    if (bounds.x > right || bounds.x + bounds.width < left || bounds.y > bottom || bounds.y + bounds.height < top) return false;
    if (!isStroke(item)) {
      const b = rawItemBounds(item), corners = [
        { x: b.x, y: b.y }, { x: b.x + b.width, y: b.y },
        { x: b.x + b.width, y: b.y + b.height }, { x: b.x, y: b.y + b.height },
      ].map((p) => worldPoint(item, p));
      return corners.every((p, i) => segmentInsidePolygon(p, corners[(i + 1) % corners.length], polygon));
    }
    let anyVisible = false;
    for (const [a, b] of strokeBoundary(item)) {
      const from = worldPoint(item, a), to = worldPoint(item, b);
      for (const [start, end] of visibleStrokeSegmentIntervals(item, from, to)) {
        anyVisible = true;
        if (!segmentInsidePolygon(interpolate(from, to, start), interpolate(from, to, end), polygon)) return false;
      }
    }
    return anyVisible;
  }).map((item) => item.id);
}

/** Immutable group translation keeps samples and masks in their original local space. */
export function translateInkItems(items: InkItem[], ids: string[], dx: number, dy: number): InkItem[] {
  if ((!dx && !dy) || !Number.isFinite(dx) || !Number.isFinite(dy) || !ids.length) return items;
  const selected = new Set(ids);
  let changed = false;
  const result = items.map((item) => {
    if (!selected.has(item.id)) return item;
    changed = true;
    const transform = item.transform ?? identityTransform();
    return { ...item, transform: { ...transform, x: transform.x + dx, y: transform.y + dy } };
  });
  return changed ? result : items;
}
