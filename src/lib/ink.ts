import type {
  InkData,
  InkPoint,
  InkSettings,
  InkStroke,
} from "@/types/mindmap";

export const EMPTY_INK: InkData = { version: 1, strokes: [] };
export const DEFAULT_INK_SETTINGS: InkSettings = { color: "#2563eb", width: 4 };
export const MAX_INK_POINTS = 250_000;
export const MAX_STROKE_POINTS = 12_000;
export const MAX_INK_STROKES = 5_000;
export const inkColor = (v: unknown): v is string =>
  typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
export const inkWidth = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 32;
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

// Reject the entire import on bad/future ink; never silently discard drawings.
export function validateInk(
  raw: unknown,
): { ok: true; ink: InkData } | { ok: false; error: string } {
  if (raw === undefined) return { ok: true, ink: EMPTY_INK };
  if (!object(raw) || raw.version !== 1 || !Array.isArray(raw.strokes))
    return { ok: false, error: "잉크 버전 또는 획 형식이 올바르지 않습니다." };
  if (raw.strokes.length > MAX_INK_STROKES)
    return { ok: false, error: "잉크는 5,000획 이하로 가져오세요." };
  const ids = new Set<string>();
  const strokes: InkStroke[] = [];
  let count = 0;
  for (const s of raw.strokes) {
    if (
      !object(s) ||
      typeof s.id !== "string" ||
      !s.id ||
      ids.has(s.id) ||
      !inkColor(s.color) ||
      !inkWidth(s.width) ||
      !Array.isArray(s.points) ||
      !s.points.length ||
      s.points.length > MAX_STROKE_POINTS
    )
      return { ok: false, error: "잉크의 id·색·굵기·좌표를 확인하세요." };
    ids.add(s.id);
    count += s.points.length;
    if (count > MAX_INK_POINTS)
      return {
        ok: false,
        error: "잉크 좌표는 문서당 250,000개 이하로 가져오세요.",
      };
    const points: InkPoint[] = [];
    for (const p of s.points) {
      if (
        !object(p) ||
        ![p.x, p.y].every(
          (n) =>
            typeof n === "number" &&
            Number.isFinite(n) &&
            Math.abs(n) <= 1_000_000,
        ) ||
        typeof p.pressure !== "number" ||
        !Number.isFinite(p.pressure) ||
        p.pressure < 0 ||
        p.pressure > 1
      )
        return {
          ok: false,
          error: "잉크 좌표 또는 필압 값이 올바르지 않습니다.",
        };
      points.push({ x: p.x as number, y: p.y as number, pressure: p.pressure });
    }
    strokes.push({ id: s.id, color: s.color, width: s.width, points });
  }
  return { ok: true, ink: { version: 1, strokes } };
}
export type InkBounds = { x: number; y: number; width: number; height: number };
const boundsCache = new WeakMap<InkStroke, InkBounds>();
export function strokeBounds(s: InkStroke): InkBounds {
  const cached = boundsCache.get(s);
  if (cached) return cached;
  let x = Infinity,
    y = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const p of s.points) {
    x = Math.min(x, p.x);
    y = Math.min(y, p.y);
    right = Math.max(right, p.x);
    bottom = Math.max(bottom, p.y);
  }
  const pad = s.width / 2 + 1;
  const result = {
    x: x - pad,
    y: y - pad,
    width: right - x + pad * 2,
    height: bottom - y + pad * 2,
  };
  boundsCache.set(s, result);
  return result;
}
export function inkBounds(ink: InkData): InkBounds | undefined {
  if (!ink.strokes.length) return;
  let x = Infinity,
    y = Infinity,
    r = -Infinity,
    b = -Infinity;
  for (const s of ink.strokes) {
    const rect = strokeBounds(s);
    x = Math.min(x, rect.x);
    y = Math.min(y, rect.y);
    r = Math.max(r, rect.x + rect.width);
    b = Math.max(b, rect.y + rect.height);
  }
  return { x, y, width: r - x, height: b - y };
}
const radius = (p: InkPoint, width: number) =>
  (width * (0.35 + 0.65 * p.pressure)) / 2;
const fmt = (n: number) => Math.round(n * 100) / 100;
const pathCache = new WeakMap<InkStroke, string>();
// One filled SVG path per stroke (variable pressure, round ends). Shared by
// display and export, so no raster overlay or separate coordinate transform.
export function strokePath(s: InkStroke): string {
  const cached = pathCache.get(s);
  if (cached) return cached;
  const ps = s.points;
  if (!ps.length) return "";
  const left: string[] = [],
    right: string[] = [];
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i],
      a = ps[Math.max(0, i - 1)],
      b = ps[Math.min(ps.length - 1, i + 1)];
    const dx = b.x - a.x,
      dy = b.y - a.y,
      len = Math.hypot(dx, dy) || 1,
      r = radius(p, s.width);
    left.push(`${fmt(p.x - (dy / len) * r)},${fmt(p.y + (dx / len) * r)}`);
    right.push(`${fmt(p.x + (dy / len) * r)},${fmt(p.y - (dx / len) * r)}`);
  }
  const dot = (p: InkPoint) => {
    const r = fmt(radius(p, s.width));
    return `M${fmt(p.x - r)},${fmt(p.y)}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0Z`;
  };
  const d =
    (ps.length > 1 ? `M${left.join("L")}L${right.reverse().join("L")}Z` : "") +
    dot(ps[0]) +
    (ps.length > 1 ? dot(ps[ps.length - 1]) : "");
  pathCache.set(s, d);
  return d;
}
function segmentDistance(p: InkPoint, a: InkPoint, b: InkPoint) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    square = dx * dx + dy * dy;
  const t = square
    ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / square))
    : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
// Swept eraser geometry: fast motion crossing a line still hits it. Whole
// strokes are removed as one undoable gesture; node geometry is never queried.
export function strokeHit(
  s: InkStroke,
  a: InkPoint,
  b: InkPoint,
  eraserRadius: number,
): boolean {
  const rect = strokeBounds(s),
    pad = eraserRadius;
  if (
    Math.max(a.x, b.x) + pad < rect.x ||
    Math.min(a.x, b.x) - pad > rect.x + rect.width ||
    Math.max(a.y, b.y) + pad < rect.y ||
    Math.min(a.y, b.y) - pad > rect.y + rect.height
  )
    return false;
  const cross = (p: InkPoint, q: InkPoint, r: InkPoint) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  for (let i = 0; i < s.points.length; i++) {
    const p = s.points[i],
      q = s.points[Math.max(0, i - 1)],
      r = eraserRadius + s.width / 2;
    if (
      Math.min(
        segmentDistance(p, a, b),
        segmentDistance(a, q, p),
        segmentDistance(b, q, p),
      ) <= r
    )
      return true;
    if (
      cross(a, b, q) * cross(a, b, p) < 0 &&
      cross(q, p, a) * cross(q, p, b) < 0
    )
      return true;
  }
  return false;
}
// Screen-space sampling tolerance retains corners/pressure changes without
// storing identical high-frequency pointer events.
export function appendInkPoint(
  points: InkPoint[],
  p: InkPoint,
  zoom: number,
  force = false,
): boolean {
  const prev = points[points.length - 1];
  if (points.length >= MAX_STROKE_POINTS) return false;
  if (
    !force &&
    prev &&
    Math.hypot(p.x - prev.x, p.y - prev.y) * zoom < 0.8 &&
    Math.abs(p.pressure - prev.pressure) < 0.04
  )
    return false;
  points.push({
    x: fmt(p.x),
    y: fmt(p.y),
    pressure: Math.round(p.pressure * 100) / 100,
  });
  return true;
}
