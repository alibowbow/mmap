import type { PathSegment, Point, Rect } from "./types";

export const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
export const center = (r: Rect): Point => ({
  x: r.x + r.width / 2,
  y: r.y + r.height / 2,
});
export const inflate = (r: Rect, p: number): Rect => ({
  x: r.x - p,
  y: r.y - p,
  width: r.width + 2 * p,
  height: r.height + 2 * p,
});
export function overlaps(a: Rect, b: Rect, epsilon = 0.001): boolean {
  return (
    a.x + a.width > b.x + epsilon &&
    b.x + b.width > a.x + epsilon &&
    a.y + a.height > b.y + epsilon &&
    b.y + b.height > a.y + epsilon
  );
}
export function union(a: Rect | null, b: Rect): Rect {
  if (!a) return { ...b };
  const x = Math.min(a.x, b.x),
    y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}
export function boundsOf(rs: readonly Rect[]): Rect | null {
  let r: Rect | null = null;
  for (const b of rs) r = union(r, b);
  return r;
}
export function pointBounds(ps: readonly Point[]): Rect {
  let x = Infinity,
    y = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const p of ps) {
    x = Math.min(x, p.x);
    y = Math.min(y, p.y);
    right = Math.max(right, p.x);
    bottom = Math.max(bottom, p.y);
  }
  return ps.length
    ? { x, y, width: right - x, height: bottom - y }
    : { x: 0, y: 0, width: 0, height: 0 };
}
export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
// Slab clipping against the open rectangle; tangency is permitted.
export function segmentHitsRect(
  a: Point,
  b: Point,
  r: Rect,
  epsilon = 0.001,
): boolean {
  let low = 0,
    high = 1;
  for (const axis of ["x", "y"] as const) {
    const d = b[axis] - a[axis],
      min = r[axis] + epsilon;
    const max = r[axis] + (axis === "x" ? r.width : r.height) - epsilon;
    if (Math.abs(d) < 1e-12) {
      if (a[axis] <= min || a[axis] >= max) return false;
    } else {
      const u = (min - a[axis]) / d,
        v = (max - a[axis]) / d;
      low = Math.max(low, Math.min(u, v));
      high = Math.min(high, Math.max(u, v));
      if (low >= high) return false;
    }
  }
  return low < high;
}
function pointLineDistance(p: Point, a: Point, b: Point): number {
  const len = distance(a, b);
  if (len < 1e-12) return distance(p, a);
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (len * len),
    ),
  );
  return distance(p, lerp(a, b, t));
}
// Control-hull flatness bounds the entire curve's distance to each chord.
// Depth exhaustion is explicit: callers cannot call these chords verified.
export function flatten(
  segments: readonly PathSegment[],
  tolerance = 0.25,
): { points: Point[]; verified: boolean } {
  const points: Point[] = [];
  let verified = true;
  for (const segment of segments) {
    if (!points.length) points.push(segment.from);
    if (segment.kind === "line") {
      points.push(segment.to);
      continue;
    }
    const stack = [{ s: segment, depth: 0 }];
    while (stack.length) {
      const { s, depth } = stack.pop()!;
      if (
        Math.max(
          pointLineDistance(s.c1, s.from, s.to),
          pointLineDistance(s.c2, s.from, s.to),
        ) <= tolerance
      ) {
        points.push(s.to);
        continue;
      }
      if (depth >= 16) {
        verified = false;
        points.push(s.to);
        continue;
      }
      const a = lerp(s.from, s.c1, 0.5),
        b = lerp(s.c1, s.c2, 0.5),
        c = lerp(s.c2, s.to, 0.5);
      const d = lerp(a, b, 0.5),
        e = lerp(b, c, 0.5),
        m = lerp(d, e, 0.5);
      stack.push(
        {
          s: { kind: "cubic", from: m, c1: e, c2: c, to: s.to },
          depth: depth + 1,
        },
        {
          s: { kind: "cubic", from: s.from, c1: a, c2: d, to: m },
          depth: depth + 1,
        },
      );
    }
  }
  return { points, verified };
}
export function pathData(segments: readonly PathSegment[]): string {
  if (!segments.length) return "";
  const n = (v: number) => Number(v.toFixed(3));
  const p = (v: Point) => `${n(v.x)},${n(v.y)}`;
  return (
    `M ${p(segments[0].from)} ` +
    segments
      .map((s) =>
        s.kind === "line"
          ? `L ${p(s.to)}`
          : `C ${p(s.c1)} ${p(s.c2)} ${p(s.to)}`,
      )
      .join(" ")
  );
}
export const polygonData = (points: readonly Point[]) =>
  points.length ? `M ${points.map((p) => `${p.x},${p.y}`).join(" L ")} Z` : "";
export function lines(points: readonly Point[]): PathSegment[] {
  return points
    .slice(1)
    .map((to, i) => ({ kind: "line", from: points[i], to }));
}
export function rounded(points: readonly Point[], radius = 12): PathSegment[] {
  if (points.length < 3) return lines(points);
  const out: PathSegment[] = [];
  let from = points[0];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i],
      prev = points[i - 1],
      next = points[i + 1];
    const a = distance(prev, p),
      b = distance(p, next);
    if (!a || !b) continue;
    const r = Math.min(radius, a / 2, b / 2),
      entry = lerp(p, prev, r / a),
      exit = lerp(p, next, r / b);
    out.push(
      { kind: "line", from, to: entry },
      {
        kind: "cubic",
        from: entry,
        c1: lerp(entry, p, 2 / 3),
        c2: lerp(exit, p, 2 / 3),
        to: exit,
      },
    );
    from = exit;
  }
  out.push({ kind: "line", from, to: points[points.length - 1] });
  return out;
}
// Bevel joins bound the ribbon by the maximum half-width tube, with no miter spikes.
export function ribbon(
  points: readonly Point[],
  start: number,
  end: number,
): Point[] {
  const ps = points.filter((p, i) => !i || distance(p, points[i - 1]) > 1e-8);
  if (ps.length < 2) return [];
  const lengths = [0];
  for (let i = 1; i < ps.length; i++)
    lengths.push(lengths[i - 1] + distance(ps[i - 1], ps[i]));
  const left: Point[] = [],
    right: Point[] = [];
  for (let i = 0; i < ps.length - 1; i++) {
    const a = ps[i],
      b = ps[i + 1],
      len = distance(a, b),
      nx = -(b.y - a.y) / len,
      ny = (b.x - a.x) / len;
    for (const j of [i, i + 1]) {
      const w =
        start + ((end - start) * lengths[j]) / lengths[lengths.length - 1];
      left.push({ x: ps[j].x + nx * w, y: ps[j].y + ny * w });
      right.push({ x: ps[j].x - nx * w, y: ps[j].y - ny * w });
    }
  }
  return [...left, ...right.reverse()];
}
