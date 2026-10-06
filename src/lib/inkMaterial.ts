import type { InkPoint, InkStroke } from "@/types/mindmap";
import {
  branchGeometry,
  hasBranchStyle,
  hashSeed,
  itemCenter,
  renderPoints,
  seeded,
  strokePath,
} from "@/lib/ink";

/** Filled body/pigment, stroked white grain, or a paper-anchored pencil tile.
 * All coordinates stay in the stroke's local world space. Render this inside
 * the same itemTransform group for both the board and exported SVG/PNG.
 * At most three visible paths, plus one compound pencil pattern definition.
 */
export type MaterialPaintPaths = {
  body: string;
  bodyOpacity: number;
  accent?: string;
  accentOpacity?: number;
  grain?: string;
  grainOpacity?: number;
  grainStrokeWidth?: number;
  paperGrain?: {
    path: string;
    size: number;
    opacity: number;
    transform?: string;
  };
};

type MaterialGeometry = {
  points: InkPoint[];
  radii: number[];
  distances: number[];
  length: number;
  pressure: number;
};
const fmt = (n: number) => Math.round(n * 100) / 100;
const pair = (x: number, y: number) => `${fmt(x)},${fmt(y)}`;
const cache = new WeakMap<InkStroke, MaterialPaintPaths>();

function geometry(s: InkStroke): MaterialGeometry {
  const hand = hasBranchStyle(s),
    source = hand ? branchGeometry(s) : undefined,
    points = source?.points ?? renderPoints(s),
    distances = source?.distances ?? [0];
  let weightedPressure = 0;
  for (let i = 1; i < points.length; i++) {
    const length = Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].y - points[i - 1].y,
    );
    if (!source) distances.push(distances[i - 1] + length);
    weightedPressure +=
      length * (points[i - 1].pressure + points[i].pressure) * 0.5;
  }
  const length = distances.at(-1) ?? 0,
    radii =
      source?.radii ??
      points.map((p, i) => {
        const radius = (s.width * (0.35 + 0.65 * p.pressure)) / 2,
          t = points.length > 1 ? i / (points.length - 1) : 0.5;
        if (s.brush === "brush")
          return (
            radius *
            (1 -
              (s.taper ?? 0.72) +
              (s.taper ?? 0.72) * Math.pow(Math.sin(Math.PI * t), 0.6))
          );
        if (s.brush === "branch")
          return radius * (1 - (s.taper ?? 0.88) * Math.pow(t, 0.7));
        return radius;
      });
  return {
    points,
    radii,
    distances,
    length,
    pressure: length ? weightedPressure / length : (points[0]?.pressure ?? 1),
  };
}

function frame(g: MaterialGeometry, i: number) {
  const p = g.points[i],
    a = g.points[Math.max(0, i - 1)],
    b = g.points[Math.min(g.points.length - 1, i + 1)];
  let dx = b.x - a.x,
    dy = b.y - a.y;
  if (!dx && !dy) {
    dx = p.x - a.x || b.x - p.x || 1;
    dy = p.y - a.y || b.y - p.y;
  }
  const length = Math.hypot(dx, dy);
  return { nx: -dy / length, ny: dx / length };
}

function ribbon(
  g: MaterialGeometry,
  width: (p: InkPoint, i: number) => number,
) {
  if (!g.points.length) return "";
  if (g.points.length === 1) {
    const p = g.points[0],
      r = Math.max(0.01, width(p, 0));
    return `M${pair(p.x - r, p.y)}a${fmt(r)},${fmt(r)} 0 1,0 ${fmt(2 * r)},0a${fmt(r)},${fmt(r)} 0 1,0 ${fmt(-2 * r)},0Z`;
  }
  const left: string[] = [],
    right: string[] = [];
  g.points.forEach((p, i) => {
    const { nx, ny } = frame(g, i),
      r = width(p, i);
    left.push(pair(p.x + nx * r, p.y + ny * r));
    right.push(pair(p.x - nx * r, p.y - ny * r));
  });
  return `M${left.join("L")}L${right.reverse().join("L")}Z`;
}

/** A fixed 30-degree elliptical chisel nib. Its support vector changes with
 * stroke direction while its centre remains exactly on the released path.
 * Every support vector is bounded by width/2, matching selection/export bounds.
 */
function chiselBody(g: MaterialGeometry, width: number) {
  if (!g.points.length) return "";
  const ux = Math.cos(Math.PI / 6),
    uy = Math.sin(Math.PI / 6),
    major = width / 2,
    minor = width * 0.16,
    left: string[] = [],
    right: string[] = [];
  g.points.forEach((p, i) => {
    const { nx, ny } = frame(g, i),
      along = nx * ux + ny * uy,
      across = -nx * uy + ny * ux,
      normal = Math.hypot(major * along, minor * across),
      hx = (major * major * along * ux - minor * minor * across * uy) / normal,
      hy = (major * major * along * uy + minor * minor * across * ux) / normal;
    left.push(pair(p.x + hx, p.y + hy));
    right.push(pair(p.x - hx, p.y - hy));
  });
  if (g.points.length === 1) {
    const p = g.points[0];
    return `M${pair(p.x - ux * major, p.y - uy * major)}a${fmt(major)},${fmt(minor)} 30 1,0 ${pair(2 * ux * major, 2 * uy * major)}a${fmt(major)},${fmt(minor)} 30 1,0 ${pair(-2 * ux * major, -2 * uy * major)}Z`;
  }
  return `M${left.join("L")}L${right.reverse().join("L")}Z`;
}

function at(
  g: MaterialGeometry,
  distance: number,
  offset: number,
  lineWidth: number,
) {
  let lo = 0,
    hi = Math.max(0, g.points.length - 1);
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (g.distances[mid] < distance) lo = mid + 1;
    else hi = mid;
  }
  const i = Math.max(1, lo),
    a = g.points[i - 1] ?? g.points[0],
    b = g.points[i] ?? a,
    span = (g.distances[i] ?? 0) - (g.distances[i - 1] ?? 0),
    t = span
      ? Math.max(0, Math.min(1, (distance - g.distances[i - 1]) / span))
      : 0,
    dx = b.x - a.x,
    dy = b.y - a.y,
    len = Math.hypot(dx, dy) || 1,
    radius = (g.radii[i - 1] ?? 0) * (1 - t) + (g.radii[i] ?? 0) * t,
    inset = Math.max(0, radius - lineWidth * 0.55);
  if (radius < lineWidth * 0.6) return undefined;
  return pair(
    a.x + dx * t - (dy / len) * inset * offset,
    a.y + dy * t + (dx / len) * inset * offset,
  );
}

function fibers(
  g: MaterialGeometry,
  seed: number,
  marker: boolean,
  lineWidth: number,
) {
  if (!g.length) return "";
  const random = seeded(seed ^ (marker ? 0x766df43b : 0x91e10da5)),
    lines: string[] = [],
    count = Math.min(
      marker ? 12 : 26,
      Math.ceil(g.length / (marker ? 38 : 17)),
    );
  for (let i = 0; i < count; i++) {
    const start = (g.length * (i + random() * 0.45)) / count,
      end = Math.min(
        g.length,
        start + (marker ? 32 : 10) + random() * (marker ? 42 : 22),
      ),
      offset = (random() - 0.5) * (marker ? 0.85 : 1.25);
    const sites = Array.from({ length: marker ? 5 : 7 }, (_, j) =>
      at(g, start + ((end - start) * j) / (marker ? 4 : 6), offset, lineWidth),
    );
    // Omit fibres crossing a tip/junction narrower than the grain pen. This
    // keeps round grain caps inside the paint without a mask or clipPath.
    if (sites.every((p) => p !== undefined)) lines.push("M" + sites.join("L"));
  }
  return lines.join("");
}

function pencilGrain(seed: number, texture: number) {
  // Grain sites are shared by all pencils and fixed to the page; the stroke's
  // seed changes pigment deposits at those sites, never the stroke centreline.
  const sites = seeded(0x37ae75c1),
    deposits = seeded(seed ^ 0x99f362c3),
    dots: string[] = [],
    centers: { x: number; y: number }[] = [];
  for (let i = 0; i < 24; i++) {
    let x = 0,
      y = 0;
    // Nonaligned page sites with minimum separation avoid visible dotted rows.
    // Keep the full deposit (maximum radius .77) inside the repeating tile.
    for (let attempt = 0; attempt < 64; attempt++) {
      x = 0.82 + sites() * 10.36;
      y = 0.82 + sites() * 10.36;
      if (centers.every((p) => Math.hypot(p.x - x, p.y - y) >= 1.2)) break;
    }
    centers.push({ x, y });
    const r = 0.25 + deposits() * (0.18 + texture * 0.34);
    dots.push(
      `M${pair(x - r, y)}a${fmt(r)},${fmt(r * 0.72)} 0 1,0 ${fmt(2 * r)},0a${fmt(r)},${fmt(r * 0.72)} 0 1,0 ${fmt(-2 * r)},0Z`,
    );
  }
  return dots.join("");
}

/** Cancel the enclosing SVG group transform for a userSpaceOnUse pattern.
 * Moving/rotating ink changes which paper grain it covers, as on real paper.
 */
export function materialPaperTransform(s: InkStroke) {
  if (!s.transform) return undefined;
  const c = itemCenter(s),
    t = s.transform;
  return `translate(${c.x} ${c.y}) scale(${1 / t.scale}) rotate(${-t.rotation}) translate(${-c.x - t.x} ${-c.y - t.y})`;
}

/** Opt-in only: absent/classic styles never touch the released renderer. */
export function materialPaintPaths(
  s: InkStroke,
): MaterialPaintPaths | undefined {
  if (s.materialStyle !== "grain-v1") return undefined;
  const cached = cache.get(s);
  if (cached) return cached;
  const brush = s.brush ?? "pen",
    g = geometry(s),
    feel = s.texture ?? (brush === "pencil" ? 0.7 : 0.45),
    seed = s.seed ?? hashSeed(s.id);
  let result: MaterialPaintPaths = { body: strokePath(s), bodyOpacity: 1 };
  if (brush === "pencil") {
    result = {
      body: result.body,
      bodyOpacity: 0.075 + (1 - feel) * 0.15 + g.pressure * 0.07,
      accent: ribbon(g, (p, i) => g.radii[i] * (0.16 + p.pressure * 0.34)),
      accentOpacity: 0.025 + g.pressure * 0.11,
      paperGrain: {
        path: pencilGrain(seed, feel),
        size: 12,
        opacity: 0.38 + g.pressure * 0.32 + feel * 0.12,
        transform: materialPaperTransform(s),
      },
    };
  } else if (brush === "marker") {
    // Stripe offsets use the narrowest chisel width, so no clipping/masks are
    // needed and stripe geometry stays within every directional nib section.
    g.radii = g.points.map(() => s.width * 0.16);
    const lineWidth = Math.max(0.15, Math.min(0.8, s.width * 0.035));
    result = {
      body: chiselBody(g, s.width),
      bodyOpacity: 0.96,
      grain: fibers(g, seed, true, lineWidth),
      grainOpacity: 0.035 + feel * 0.095,
      grainStrokeWidth: lineWidth,
    };
  } else if (brush === "brush" || brush === "branch") {
    const lineWidth = Math.max(0.15, Math.min(0.65, s.width * 0.022));
    result = {
      body: result.body,
      bodyOpacity: 0.96 - feel * 0.035,
      accent: ribbon(g, (p, i) => {
        // An attached child starts without an extra dark pigment seam. Fade
        // pigment width in across the same short join transition as its body.
        const blend =
          s.joinWidth === undefined
            ? 1
            : Math.min(1, g.distances[i] / Math.max(12, s.width * 1.5));
        return (
          g.radii[i] *
          (0.45 + p.pressure * 0.29) *
          blend *
          blend *
          (3 - 2 * blend)
        );
      }),
      accentOpacity: 0.06 + feel * 0.1 + g.pressure * 0.035,
      grain: fibers(g, seed, false, lineWidth),
      grainOpacity: feel * 0.38,
      grainStrokeWidth: lineWidth,
    };
  }
  // Pen retains a clean contour; highlighter keeps the released wide body and
  // group opacity. They deliberately have no pencil grain or dry-brush fibers.
  cache.set(s, result);
  return result;
}
