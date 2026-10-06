import type { InkPoint, InkStroke } from "@/types/mindmap";
import { inversePoint, itemCenter, renderPoints, transformPoint } from "./ink";

type Point = { x: number; y: number };
export type StrokeEditHandle = {
  id: "start" | "middle" | "end";
  point: Point;
  fraction: number;
};

const finitePoint = (p: Point) =>
  [p.x, p.y].every((v) => Number.isFinite(v) && Math.abs(v) <= 1_000_000);

// Erasures are in local coordinates. Reshaping them independently would reveal
// ink that the user already removed, so those strokes keep their shape intact.
function editable(s: InkStroke) {
  const masks = (s as InkStroke & { erasures?: unknown[] }).erasures;
  return (
    (s.brush === "brush" || s.brush === "branch") &&
    s.points.length >= 2 &&
    !masks?.length
  );
}

function arcDistances(points: readonly InkPoint[]) {
  let total = 0;
  const distances = points.map((p, i) => {
    if (i) total += Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y);
    return total;
  });
  return { distances, total };
}

function arcPoint(points: readonly InkPoint[], fraction: number): InkPoint {
  if (fraction <= 0) return points[0];
  if (fraction >= 1) return points[points.length - 1];
  const { distances, total } = arcDistances(points);
  if (!total) return points[0];
  const target = total * fraction;
  let i = 1;
  while (i < points.length - 1 && distances[i] < target) i++;
  const a = points[i - 1], b = points[i];
  const span = distances[i] - distances[i - 1];
  const t = span ? (target - distances[i - 1]) / span : 0;
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    pressure: a.pressure + (b.pressure - a.pressure) * t,
  };
}

function sourcePoints(s: InkStroke) {
  // Freehand handles are shape anchors on the stored gesture. Branch handles
  // follow the existing parametric centreline rather than ignored input points.
  return s.brush === "branch" ? renderPoints(s) : s.points;
}

export function strokeEditHandles(s: InkStroke): StrokeEditHandle[] {
  if (!editable(s)) return [];
  const source = sourcePoints(s);
  const center = itemCenter(s);
  return ([
    ["start", 0],
    ["middle", 0.5],
    ["end", 1],
  ] as const).map(([id, fraction]) => {
    const p = arcPoint(source, fraction);
    return {
      id,
      fraction,
      point: s.transform ? transformPoint(p, s.transform, center) : { x: p.x, y: p.y },
    };
  });
}

function keepTransformOrigin(s: InkStroke, changed: InkStroke): InkStroke {
  if (!s.transform) return changed;
  // Bounds are the renderer's rotation/scale origin. A shape edit changes that
  // origin; compensate translation so the old affine mapping stays exact.
  const before = itemCenter(s), after = itemCenter(changed);
  const dx = after.x - before.x, dy = after.y - before.y;
  const angle = (s.transform.rotation * Math.PI) / 180;
  const cos = Math.cos(angle) * s.transform.scale;
  const sin = Math.sin(angle) * s.transform.scale;
  return {
    ...changed,
    transform: {
      ...s.transform,
      x: s.transform.x + dx * cos - dy * sin - dx,
      y: s.transform.y + dx * sin + dy * cos - dy,
    },
  };
}

export function deformStrokeAt(
  s: InkStroke,
  fraction: number,
  worldPoint: Point,
): InkStroke {
  if (!editable(s) || !Number.isFinite(fraction) || !finitePoint(worldPoint)) return s;
  const f = Math.max(0, Math.min(1, fraction));
  const target = s.transform
    ? inversePoint({ ...worldPoint, pressure: 1 }, s.transform, itemCenter(s))
    : worldPoint;
  if (!finitePoint(target)) return s;
  const anchor = arcPoint(sourcePoints(s), f);
  const dx = target.x - anchor.x, dy = target.y - anchor.y;
  if (Math.abs(dx) + Math.abs(dy) < 1e-9) return s;

  if (s.brush === "branch") {
    // Keep the branch renderer and its taper/pigment contract. The middle knob
    // adjusts the normal bend only; endpoint knobs set the original endpoints.
    const points = s.points.map((p) => ({ ...p }));
    if (f <= 0 || f >= 1) {
      const i = f <= 0 ? 0 : points.length - 1;
      points[i] = { ...points[i], x: target.x, y: target.y };
      return keepTransformOrigin(s, { ...s, points });
    }
    const a = points[0], b = points[points.length - 1];
    const vx = b.x - a.x, vy = b.y - a.y;
    const square = vx * vx + vy * vy;
    if (square < 1e-12) return s;
    // At the central knob the bend displacement is 0.5 * curve * (-dy, dx).
    const curve = Math.max(-1, Math.min(1,
      2 * ((target.x - (a.x + b.x) / 2) * -vy +
        (target.y - (a.y + b.y) / 2) * vx) / square,
    ));
    if (Math.abs(curve - (s.curve ?? 0.25)) < 1e-9) return s;
    return keepTransformOrigin(s, { ...s, curve });
  }

  // Sparse brush gestures need interior samples to form an editable curve.
  // Original endpoints and every original pressure value are retained.
  const source = s.points.length === 2
    ? [s.points[0], arcPoint(s.points, 0.25), arcPoint(s.points, 0.5),
      arcPoint(s.points, 0.75), s.points[1]]
    : s.points;
  const { distances, total } = arcDistances(source);
  if (total < 1e-12) return s;
  const weight = (t: number) => {
    if (f === 0) return Math.pow(1 - t, 2);
    if (f === 1) return t * t;
    // Cubic smoothstep on both sides gives zero motion at each endpoint and a
    // smooth, sample-density-independent maximum at the chosen arc position.
    const q = t <= f ? t / f : (1 - t) / (1 - f);
    return q * q * (3 - 2 * q);
  };
  const points = source.map((p, i) => {
    const w = weight(distances[i] / total);
    return { ...p, x: p.x + dx * w, y: p.y + dy * w };
  });
  if (points.some((p) => !finitePoint(p))) return s;
  return keepTransformOrigin(s, { ...s, points });
}
