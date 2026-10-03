import type {
  InkData,
  InkPoint,
  InkSettings,
  InkStroke,
  InkObject,
  InkTransform,
  PaperSpec,
} from "@/types/mindmap";

export const EMPTY_INK: InkData = { version: 1, strokes: [] };
export const DEFAULT_INK_SETTINGS: InkSettings = { color: "#2563eb", width: 4 };
export const MAX_INK_POINTS = 250_000;
export const MAX_STROKE_POINTS = 12_000;
export const MAX_INK_STROKES = 5_000;
export const inkColor = (v: unknown): v is string =>
  typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
export const inkWidth = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 64;
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

// Reject the entire import on bad/future ink; never silently discard drawings.
export function validateInk(
  raw: unknown,
): { ok: true; ink: InkData } | { ok: false; error: string } {
  if (raw === undefined) return { ok: true, ink: EMPTY_INK };
  if (
    !object(raw) ||
    ![1, 2, 3].includes(raw.version as number) ||
    !Array.isArray(raw.strokes)
  )
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
    if (!validStrokeStyle(s))
      return { ok: false, error: "도구 속성 또는 변환이 올바르지 않습니다." };
    if (s.branchStyle === "hand-v1" && raw.version !== 3)
      return { ok: false, error: "가지 필치는 잉크 v3 형식이 필요합니다." };
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
    strokes.push({
      id: s.id,
      color: s.color,
      width: s.width,
      points,
      ...pickStyle(s),
    });
  }
  const objects: InkObject[] = [];
  if (raw.objects !== undefined) {
    if (!Array.isArray(raw.objects) || raw.objects.length > 1000)
      return { ok: false, error: "그림·라벨은 1,000개 이하로 사용하세요." };
    for (const o of raw.objects) {
      if (!validInkObject(o) || ids.has(o.id))
        return { ok: false, error: "그림·라벨 형식 또는 id를 확인하세요." };
      ids.add(o.id);
      objects.push({
        ...o,
        transform: o.transform ? { ...o.transform } : undefined,
      });
    }
  }
  if (raw.paper !== undefined && !validPaper(raw.paper))
    return { ok: false, error: "종이 설정이 올바르지 않습니다." };
  if (
    raw.order !== undefined &&
    (!Array.isArray(raw.order) ||
      raw.order.length !== ids.size ||
      new Set(raw.order).size !== ids.size ||
      raw.order.some((id) => typeof id !== "string" || !ids.has(id)))
  )
    return { ok: false, error: "그림 순서가 올바르지 않습니다." };
  return {
    ok: true,
    ink: {
      version: raw.version as 1 | 2 | 3,
      strokes,
      ...(raw.objects !== undefined ? { objects } : {}),
      ...(raw.paper !== undefined
        ? { paper: { ...(raw.paper as PaperSpec) } }
        : {}),
      ...(raw.order !== undefined
        ? { order: [...(raw.order as string[])] }
        : {}),
    },
  };
}
export type InkBounds = { x: number; y: number; width: number; height: number };
const boundsCache = new WeakMap<InkStroke, InkBounds>();
export function rawStrokeBounds(s: InkStroke): InkBounds {
  const cached = boundsCache.get(s);
  if (cached) return cached;
  let x = Infinity,
    y = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const p of renderPoints(s)) {
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
  if (!ink.strokes.length && !ink.objects?.length) return;
  let x = Infinity,
    y = Infinity,
    r = -Infinity,
    b = -Infinity;
  for (const s of inkItems(ink)) {
    const rect = itemBounds(s);
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
const pointsCache = new WeakMap<InkStroke, InkPoint[]>();
// One filled SVG path per stroke (variable pressure, round ends). Shared by
// display and export, so no raster overlay or separate coordinate transform.
export function strokePath(s: InkStroke): string {
  const cached = pathCache.get(s);
  if (cached) return cached;
  if (hasBranchStyle(s)) {
    const d = branchPaintPaths(s).outline;
    pathCache.set(s, d);
    return d;
  }
  const ps = renderPoints(s);
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
      r = styledRadius(s, p, i, ps.length);
    left.push(`${fmt(p.x - (dy / len) * r)},${fmt(p.y + (dx / len) * r)}`);
    right.push(`${fmt(p.x + (dy / len) * r)},${fmt(p.y - (dx / len) * r)}`);
  }
  const dot = (p: InkPoint) => {
    const r = fmt(
      styledRadius(s, p, p === ps[0] ? 0 : ps.length - 1, ps.length),
    );
    return `M${fmt(p.x - r)},${fmt(p.y)}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0Z`;
  };
  const d =
    (ps.length > 1 ? `M${left.join("L")}L${right.reverse().join("L")}Z` : "") +
    ((s.brush === "marker" || s.brush === "highlighter") && ps.length > 1
      ? ""
      : dot(ps[0]) + (ps.length > 1 ? dot(ps[ps.length - 1]) : ""));
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
  if (s.transform) {
    const t = s.transform,
      center = itemCenter(s);
    return strokeHit(
      { ...s, transform: undefined },
      inversePoint(a, t, center),
      inversePoint(b, t, center),
      eraserRadius / t.scale,
    );
  }
  const rect = rawStrokeBounds(s),
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

export const BRUSHES = [
  "pencil",
  "pen",
  "marker",
  "highlighter",
  "brush",
  "branch",
] as const;
export const STAMPS = [
  "circle",
  "box",
  "arrow",
  "star",
  "leaf",
  "bulb",
  "heart",
  "book",
  "sun",
  "cloud",
] as const;
export const BRUSH_NAMES = {
  pencil: "색연필",
  pen: "펜",
  marker: "마커",
  highlighter: "형광펜",
  brush: "브러시",
  branch: "유기적 가지",
};
export const BRUSH_WIDTH = {
  pencil: 7,
  pen: 4,
  marker: 20,
  highlighter: 30,
  brush: 24,
  branch: 28,
};
export const PALETTES = {
  정원: ["#246d56", "#61a56a", "#d39b27", "#e0614e", "#7868ad", "#285b85"],
  축제: ["#ed5269", "#f0a12d", "#279c9c", "#3b6ec3", "#9966bc", "#26374a"],
  잉크: ["#25314c", "#496071", "#ae5655", "#bc9a6a", "#777353", "#40344c"],
};
export const PAPER_COLORS = {
  none: "transparent",
  white: "#fffefb",
  cream: "#fcf5e8",
  kraft: "#eadcc4",
};
export const DEFAULT_PAPER: PaperSpec = {
  kind: "cream",
  texture: 0.35,
  seed: 1977,
};
const finite = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1_000_000;
const unit = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
const seedOK = (v: unknown) =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 0xffffffff;
export function validTransform(t: unknown): t is InkTransform {
  return (
    object(t) &&
    finite(t.x) &&
    finite(t.y) &&
    typeof t.scale === "number" &&
    t.scale >= 0.1 &&
    t.scale <= 10 &&
    finite(t.rotation)
  );
}
function validStrokeStyle(s: Record<string, unknown>) {
  return (
    (s.brush === undefined ||
      BRUSHES.includes(s.brush as (typeof BRUSHES)[number])) &&
    (s.seed === undefined || seedOK(s.seed)) &&
    (s.branchStyle === undefined ||
      ["classic", "hand-v1"].includes(s.branchStyle as string)) &&
    [s.opacity, s.texture, s.taper].every((v) => v === undefined || unit(v)) &&
    (s.curve === undefined ||
      (typeof s.curve === "number" && s.curve >= -1 && s.curve <= 1)) &&
    (s.transform === undefined || validTransform(s.transform))
  );
}
function pickStyle(s: Record<string, unknown>): Partial<InkStroke> {
  const result: Record<string, unknown> = {};
  for (const k of [
    "brush",
    "seed",
    "opacity",
    "texture",
    "taper",
    "branchStyle",
    "curve",
    "transform",
  ])
    if (s[k] !== undefined)
      result[k] = k === "transform" ? { ...(s[k] as InkTransform) } : s[k];
  return result;
}
export function validPaper(p: unknown): p is PaperSpec {
  return (
    object(p) &&
    typeof p.kind === "string" &&
    Object.hasOwn(PAPER_COLORS, p.kind) &&
    unit(p.texture) &&
    seedOK(p.seed)
  );
}
export function validInkObject(o: unknown): o is InkObject {
  return (
    object(o) &&
    typeof o.id === "string" &&
    !!o.id &&
    ["stamp", "label"].includes(o.kind as string) &&
    finite(o.x) &&
    finite(o.y) &&
    [o.width, o.height].every(
      (v) => typeof v === "number" && v >= 4 && v <= 4000,
    ) &&
    inkColor(o.color) &&
    typeof o.fill === "boolean" &&
    typeof o.fontSize === "number" &&
    o.fontSize >= 8 &&
    o.fontSize <= 96 &&
    (o.kind === "stamp"
      ? STAMPS.includes(o.shape as (typeof STAMPS)[number])
      : typeof o.text === "string" &&
        o.text.length > 0 &&
        o.text.length <= 80 &&
        !/[\r\n]/.test(o.text)) &&
    (o.transform === undefined || validTransform(o.transform))
  );
}
export function validInkSettings(s: unknown): s is InkSettings {
  return (
    object(s) &&
    inkColor(s.color) &&
    inkWidth(s.width) &&
    validStrokeStyle(s) &&
    (s.shape === undefined ||
      STAMPS.includes(s.shape as (typeof STAMPS)[number])) &&
    (s.text === undefined ||
      (typeof s.text === "string" &&
        s.text.length <= 80 &&
        !/[\r\n]/.test(s.text))) &&
    (s.fontSize === undefined ||
      (typeof s.fontSize === "number" &&
        s.fontSize >= 8 &&
        s.fontSize <= 96)) &&
    (s.fill === undefined || typeof s.fill === "boolean") &&
    (s.recentColors === undefined ||
      (Array.isArray(s.recentColors) &&
        s.recentColors.length <= 8 &&
        s.recentColors.every(inkColor)))
  );
}
export type InkItem = InkStroke | InkObject;
export const isStroke = (s: InkItem): s is InkStroke => "points" in s;
export const identityTransform = (): InkTransform => ({
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
});
export function inkItems(ink: InkData): InkItem[] {
  const items: InkItem[] = [...ink.strokes, ...(ink.objects ?? [])];
  if (!ink.order) return items;
  const map = new Map(items.map((s) => [s.id, s]));
  return ink.order.map((id) => map.get(id)!).filter(Boolean);
}
export function rawItemBounds(s: InkItem): InkBounds {
  if (isStroke(s)) return rawStrokeBounds(s);
  return {
    x: s.x - s.width / 2 - 4,
    y: s.y - s.height / 2 - 4,
    width: s.width + 8,
    height: s.height + 8,
  };
}
export function itemCenter(s: InkItem) {
  const b = rawItemBounds(s);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
export function transformPoint(
  p: { x: number; y: number },
  t: InkTransform,
  c: { x: number; y: number },
) {
  const a = (t.rotation * Math.PI) / 180,
    x = (p.x - c.x) * t.scale,
    y = (p.y - c.y) * t.scale;
  return {
    x: c.x + t.x + x * Math.cos(a) - y * Math.sin(a),
    y: c.y + t.y + x * Math.sin(a) + y * Math.cos(a),
  };
}
export function inversePoint(
  p: InkPoint,
  t: InkTransform,
  c: { x: number; y: number },
): InkPoint {
  const a = (-t.rotation * Math.PI) / 180,
    x = p.x - c.x - t.x,
    y = p.y - c.y - t.y;
  return {
    x: c.x + (x * Math.cos(a) - y * Math.sin(a)) / t.scale,
    y: c.y + (x * Math.sin(a) + y * Math.cos(a)) / t.scale,
    pressure: p.pressure,
  };
}
export function itemTransform(s: InkItem) {
  if (!s.transform) return undefined;
  const c = itemCenter(s),
    t = s.transform;
  return `translate(${c.x + t.x} ${c.y + t.y}) rotate(${t.rotation}) scale(${t.scale}) translate(${-c.x} ${-c.y})`;
}
export function itemBounds(s: InkItem): InkBounds {
  const b = rawItemBounds(s);
  if (!s.transform) return b;
  const ps = [
    { x: b.x, y: b.y },
    { x: b.x + b.width, y: b.y },
    { x: b.x, y: b.y + b.height },
    { x: b.x + b.width, y: b.y + b.height },
  ].map((p) => transformPoint(p, s.transform!, itemCenter(s)));
  const x = Math.min(...ps.map((p) => p.x)),
    y = Math.min(...ps.map((p) => p.y));
  return {
    x,
    y,
    width: Math.max(...ps.map((p) => p.x)) - x,
    height: Math.max(...ps.map((p) => p.y)) - y,
  };
}
export const strokeBounds = (s: InkStroke) => itemBounds(s);
const hitCache = new WeakMap<InkStroke, InkStroke>();
export function itemHit(s: InkItem, a: InkPoint, b = a, r = 0) {
  if (isStroke(s)) {
    if (!s.brush) return strokeHit(s, a, b, r);
    let expanded = hitCache.get(s);
    if (!expanded) {
      expanded = { ...s, points: renderPoints(s), brush: "pen" };
      hitCache.set(s, expanded);
    }
    return strokeHit(expanded, a, b, r);
  }
  const p = s.transform ? inversePoint(a, s.transform, itemCenter(s)) : a,
    q = s.transform ? inversePoint(b, s.transform, itemCenter(s)) : b,
    pad = r / (s.transform?.scale ?? 1),
    bounds = rawItemBounds(s);
  // Liang–Barsky: the swept eraser crosses a transformed object's rectangle.
  let low = 0,
    high = 1;
  const dx = q.x - p.x,
    dy = q.y - p.y;
  for (const [direction, distance] of [
    [-dx, p.x - bounds.x + pad],
    [dx, bounds.x + bounds.width + pad - p.x],
    [-dy, p.y - bounds.y + pad],
    [dy, bounds.y + bounds.height + pad - p.y],
  ]) {
    if (!direction) {
      if (distance < 0) return false;
      continue;
    }
    const t = distance / direction;
    if (direction < 0) low = Math.max(low, t);
    else high = Math.min(high, t);
    if (low > high) return false;
  }
  return true;
}
export function seeded(seed: number) {
  let n = seed >>> 0;
  return () => {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    return n / 4294967296;
  };
}
export function hashSeed(id: string) {
  let n = 2166136261;
  for (const c of id) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}
export function renderPoints(s: InkStroke): InkPoint[] {
  const cached = pointsCache.get(s);
  if (cached) return cached;
  if (s.brush !== "branch" || s.points.length < 2) {
    if (!s.brush || s.points.length < 3) return s.points;
    // Midpoint quadratic smoothing follows the freehand trajectory. Legacy
    // unstyled strokes keep their original rendering. At most 2× samples.
    const ps = s.points,
      result = [ps[0]];
    const mix = (a: InkPoint, b: InkPoint, t: number): InkPoint => ({
      x: a.x * (1 - t) + b.x * t,
      y: a.y * (1 - t) + b.y * t,
      pressure: a.pressure * (1 - t) + b.pressure * t,
    });
    for (let i = 1; i < ps.length - 1; i++) {
      const start = i === 1 ? ps[0] : mix(ps[i - 1], ps[i], 0.5),
        end = mix(ps[i], ps[i + 1], 0.5);
      result.push(mix(mix(start, ps[i], 0.5), mix(ps[i], end, 0.5), 0.5), end);
    }
    result.push(ps[ps.length - 1]);
    pointsCache.set(s, result);
    return result;
  }
  const a = s.points[0],
    b = s.points[s.points.length - 1],
    dx = b.x - a.x,
    dy = b.y - a.y,
    bend = s.curve ?? 0.25;
  const result = Array.from({ length: 65 }, (_, i) => {
    const t = i / 64;
    return {
      x: a.x + dx * t - dy * bend * 2 * t * (1 - t),
      y: a.y + dy * t + dx * bend * 2 * t * (1 - t),
      pressure: a.pressure * (1 - t) + b.pressure * t,
    };
  });
  pointsCache.set(s, result);
  return result;
}
function styledRadius(s: InkStroke, p: InkPoint, i: number, count: number) {
  const t = count > 1 ? i / (count - 1) : 0.5;
  if (s.brush === "branch")
    return radius(p, s.width) * (1 - (s.taper ?? 0.88) * Math.pow(t, 0.7));
  if (s.brush === "brush")
    return (
      radius(p, s.width) *
      (1 -
        (s.taper ?? 0.72) +
        (s.taper ?? 0.72) * Math.pow(Math.sin(Math.PI * t), 0.6))
    );
  if (s.brush === "marker" || s.brush === "highlighter") return s.width / 2;
  return radius(p, s.width);
}
export function texturePath(seed: number, grain = false): string {
  const random = seeded(seed),
    commands: string[] = [];
  for (let i = 0; i < (grain ? 32 : 12); i++) {
    const x = random() * 24,
      y = random() * 24;
    commands.push(
      `M${fmt(x)} ${fmt(y)}l${fmt(grain ? 0.3 : 1 + random() * 3)} ${fmt(grain ? 0 : -1 - random() * 2)}`,
    );
  }
  return commands.join("");
}

export const hasBranchStyle = (s: InkStroke) =>
  s.branchStyle === "hand-v1" && (s.brush === "brush" || s.brush === "branch");
export type BranchGeometry = {
  points: InkPoint[];
  radii: number[];
  distances: number[];
};
const branchCache = new WeakMap<InkStroke, BranchGeometry>();
// Seed affects width and pigment only. Subdivision stays on the released
// smoothed centreline: no random offset, curve fitting or trajectory change.
export function branchGeometry(s: InkStroke): BranchGeometry {
  const cached = branchCache.get(s);
  if (cached) return cached;
  const source = renderPoints(s),
    lengths = source.map((p, i) =>
      i ? Math.hypot(p.x - source[i - 1].x, p.y - source[i - 1].y) : 0,
    );
  const desired = lengths.reduce(
    (n, d) => n + Math.max(0, Math.ceil(d / 4) - 1),
    0,
  );
  const budget = Math.min(1024, source.length * 2 + 64),
    ratio = desired ? Math.min(1, budget / desired) : 1;
  const points: InkPoint[] = [],
    distances: number[] = [];
  let length = 0;
  source.forEach((p, i) => {
    if (i) {
      const a = source[i - 1],
        steps =
          1 + Math.floor(Math.max(0, Math.ceil(lengths[i] / 4) - 1) * ratio);
      for (let j = 1; j < steps; j++) {
        const t = j / steps;
        points.push({
          x: a.x + (p.x - a.x) * t,
          y: a.y + (p.y - a.y) * t,
          pressure: a.pressure + (p.pressure - a.pressure) * t,
        });
        distances.push(length + lengths[i] * t);
      }
      length += lengths[i];
    }
    points.push(p);
    distances.push(length);
  });
  const random = seeded(s.seed ?? hashSeed(s.id)),
    phase = random() * Math.PI * 2,
    wavelength = 36 + random() * 24;
  const texture = s.texture ?? 0.45,
    taper = s.taper ?? 0.94;
  let pressure = points[0]?.pressure ?? 1;
  const radii = points.map((p, i) => {
    const distance = distances[i],
      step = i ? distance - distances[i - 1] : 0;
    // Spatial filtering avoids abrupt pressure steps without moving any point.
    pressure += (p.pressure - pressure) * (1 - Math.exp(-step / 9));
    const t = length ? distance / length : 0;
    const envelope = 1 - taper + taper * Math.pow(Math.max(0, 1 - t), 0.85);
    // Slow, restrained, symmetric edge variation; maximum width stays in bounds.
    const grain =
      1 -
      texture *
        0.024 *
        (0.55 +
          0.3 * Math.sin((distance / wavelength) * 6.283 + phase) +
          0.15 * Math.sin(distance / 13 + phase));
    return Math.max(
      0.06,
      (s.width / 2) * (0.55 + 0.45 * pressure) * envelope * grain,
    );
  });
  const result = { points, radii, distances };
  branchCache.set(s, result);
  return result;
}
const paintCache = new WeakMap<
  InkStroke,
  { outline: string; pigment: string; fibers: string }
>();
export function branchPaintPaths(s: InkStroke) {
  const cached = paintCache.get(s);
  if (cached) return cached;
  const { points: ps, radii } = branchGeometry(s);
  const outline = (factor: number) => {
    const left: string[] = [],
      right: string[] = [];
    ps.forEach((p, i) => {
      const a = ps[Math.max(0, i - 1)],
        b = ps[Math.min(ps.length - 1, i + 1)];
      let dx = b.x - a.x,
        dy = b.y - a.y;
      if (!dx && !dy) {
        dx = p.x - a.x || b.x - p.x;
        dy = p.y - a.y || b.y - p.y;
      }
      const len = Math.hypot(dx, dy) || 1,
        r = radii[i] * factor;
      left.push(`${fmt(p.x - (dy / len) * r)},${fmt(p.y + (dx / len) * r)}`);
      right.push(`${fmt(p.x + (dy / len) * r)},${fmt(p.y - (dx / len) * r)}`);
    });
    const cap = (i: number, aspect: number) => {
      const p = ps[i],
        r = radii[i] * factor,
        a = ps[Math.max(0, i - 1)],
        b = ps[Math.min(ps.length - 1, i + 1)];
      const dx = b.x - a.x,
        dy = b.y - a.y,
        len = Math.hypot(dx, dy) || 1,
        ux = dx / len || (!dy ? 1 : 0),
        uy = dy / len;
      const along = r * aspect,
        angle = (Math.atan2(uy, ux) * 180) / Math.PI;
      return `M${fmt(p.x - ux * along)},${fmt(p.y - uy * along)}a${fmt(along)},${fmt(r)} ${fmt(angle)} 1,0 ${fmt(2 * ux * along)},${fmt(2 * uy * along)}a${fmt(along)},${fmt(r)} ${fmt(angle)} 1,0 ${fmt(-2 * ux * along)},${fmt(-2 * uy * along)}Z`;
    };
    return (
      (ps.length > 1
        ? `M${left.join("L")}L${right.reverse().join("L")}Z`
        : "") +
      (ps.length
        ? cap(0, ps.length > 1 ? 0.42 : 1) +
          (ps.length > 1 ? cap(ps.length - 1, 0.7) : "")
        : "")
    );
  };
  const { distances } = branchGeometry(s),
    length = distances.at(-1) ?? 0;
  const random = seeded((s.seed ?? hashSeed(s.id)) ^ 0x91e10da5),
    fibers: string[] = [];
  // At most 28 short pigment fibres in one compound SVG path. Each follows
  // the same centreline, inside the body, independent of input sample density.
  const count = Math.min(28, Math.ceil(length / 14));
  const at = (distance: number, offset: number) => {
    let lo = 0,
      hi = Math.max(0, ps.length - 1);
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (distances[mid] < distance) lo = mid + 1;
      else hi = mid;
    }
    const i = Math.max(1, lo),
      a = ps[i - 1] ?? ps[0],
      b = ps[i] ?? a,
      span = (distances[i] ?? 0) - (distances[i - 1] ?? 0),
      t = span ? (distance - distances[i - 1]) / span : 0;
    const dx = b.x - a.x,
      dy = b.y - a.y,
      len = Math.hypot(dx, dy) || 1,
      r = (radii[i - 1] ?? 0) * (1 - t) + (radii[i] ?? radii[0] ?? 0) * t;
    return `${fmt(a.x + dx * t - (dy / len) * r * offset)},${fmt(a.y + dy * t + (dx / len) * r * offset)}`;
  };
  for (let i = 0; i < count; i++) {
    const start = (length * (i + random() * 0.6)) / Math.max(1, count),
      end = Math.min(length, start + 9 + random() * 22),
      offset = (random() - 0.5) * 1.2;
    fibers.push(
      "M" +
        Array.from({ length: 7 }, (_, j) =>
          at(start + ((end - start) * j) / 6, offset),
        ).join("L"),
    );
  }
  const result = {
    outline: outline(1),
    pigment: outline(0.76),
    fibers: fibers.join(""),
  };
  paintCache.set(s, result);
  return result;
}
export function pigmentColor(color: string) {
  return (
    "#" +
    [1, 3, 5]
      .map((i) =>
        Math.round(parseInt(color.slice(i, i + 2), 16) * 0.88)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
