"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { BRANCH_AUTO_PALETTE } from "@/lib/constants";
import type { MindMapDocument, MindMapNode } from "@/types/mindmap";

// Map "concept art" for the home screen. Not a scaled-down canvas (tall maps
// shrink to illegibility, and blank or grey maps look broken) but an
// illustration of the map's shape: a glowing central topic, organic tapering
// branches radiating around it — one per first-level topic, in the canvas
// palette — twigs and buds for the sub-topics, soft colour washes and a little
// dust. Each map gets its own composition (branch count, weights, labels and a
// seeded variation from its id). Purely derived: never touches document state.

type Pt = { x: number; y: number };
type Branch = { node: MindMapNode; kids: { node: MindMapNode; grand: number }[] };

const MAX_BRANCHES = 12,
  MAX_TWIGS = 7,
  MAX_TWIGLETS = 3;

function textWidth(text: string, size: number): number {
  let w = 0;
  for (const ch of text) w += /[ᄀ-ￜ]/.test(ch) ? size * 0.96 : size * 0.56;
  return w;
}
function fit(text: string, size: number, max: number): string {
  if (!text || max <= size * 1.5) return "";
  if (textWidth(text, size) <= max) return text;
  const chars = Array.from(text);
  while (chars.length > 1 && textWidth(chars.join("") + "…", size) > max) chars.pop();
  return chars.length > 1 ? chars.join("") + "…" : "";
}
function rgba(c: string, a: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return c;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
// Only saturated user colours make it into the art; greys and near-blacks
// (common defaults) fall back to the palette so every preview stays lively.
function vivid(c: string | undefined): string | null {
  const m = c && /^#?([0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  return max > 70 && (max - min) / max > 0.3 ? `#${m[1]}` : null;
}
function seeded(key: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  let s = h >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function cubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, steps = 20): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps,
      m = 1 - t;
    out.push({
      x: m * m * m * p0.x + 3 * m * m * t * p1.x + 3 * m * t * t * p2.x + t * t * t * p3.x,
      y: m * m * m * p0.y + 3 * m * m * t * p1.y + 3 * m * t * t * p2.y + t * t * t * p3.y,
    });
  }
  return out;
}
// Filled outline of a stroke whose half-width tapers from w0 to w1.
function ribbon(pts: Pt[], w0: number, w1: number): string {
  const lens = [0];
  for (let i = 1; i < pts.length; i++)
    lens.push(lens[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const total = lens[lens.length - 1] || 1;
  const a: string[] = [],
    b: string[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[Math.max(0, i - 1)],
      q = pts[Math.min(pts.length - 1, i + 1)];
    const l = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    const nx = -(q.y - p.y) / l,
      ny = (q.x - p.x) / l;
    const w = w0 + (w1 - w0) * (lens[i] / total);
    a.push(`${(pts[i].x + nx * w).toFixed(1)},${(pts[i].y + ny * w).toFixed(1)}`);
    b.push(`${(pts[i].x - nx * w).toFixed(1)},${(pts[i].y - ny * w).toFixed(1)}`);
  }
  return `M ${a.join(" L ")} L ${b.reverse().join(" L ")} Z`;
}
const unit = (x: number, y: number): Pt => {
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
};

export function DocumentPreview({
  document,
  color,
  width: initialWidth = 520,
  height: initialHeight = 156,
}: {
  document: MindMapDocument;
  color: string;
  // Initial viewBox guess; replaced by the container's measured size so the
  // art fills any aspect ratio (wide desktop banner, phone card…).
  width?: number;
  height?: number;
}) {
  const gid = useId().replace(/:/g, "");
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: initialWidth, h: initialHeight });
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width),
        h = Math.round(entry.contentRect.height);
      if (w > 40 && h > 40)
        setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const tree = useMemo(() => {
    const root =
      document.nodes.find((n) => n.data.isRoot) ??
      document.nodes.find((n) => !n.data.parentId);
    if (!root) return null;
    const kids = new Map<string, MindMapNode[]>();
    for (const n of document.nodes)
      if (n.data.parentId) {
        const list = kids.get(n.data.parentId) ?? [];
        list.push(n);
        kids.set(n.data.parentId, list);
      }
    const open = (n: MindMapNode) => (n.data.collapsed ? [] : (kids.get(n.id) ?? []));
    const branches: Branch[] = (kids.get(root.id) ?? []).slice(0, MAX_BRANCHES).map((node) => ({
      node,
      kids: open(node)
        .slice(0, MAX_TWIGS)
        .map((k) => ({ node: k, grand: Math.min(MAX_TWIGLETS, open(k).length) })),
    }));
    return { root, branches };
  }, [document.nodes]);

  const width = size.w,
    height = size.h;
  if (!tree) return <div ref={boxRef} className="h-full w-full" />;

  const rand = seeded(document.id);
  const u = Math.min(1.45, height / 156); // size unit: 156px-tall card = 1
  const C = { x: width / 2, y: height / 2 };
  const RY = height / 2 - 9 * u;
  const RX = Math.min(width / 2 - 10 * u, RY * 3.4);
  const at = (theta: number, r: number): Pt => ({
    x: C.x + Math.cos(theta) * RX * r,
    y: C.y + Math.sin(theta) * RY * r,
  });

  const rootColor = vivid(tree.root.data.color) ?? color;
  const rootFont = 13 * u;
  const rootLabel = fit(
    (tree.root.data.label || "").trim() || document.title.trim() || "중심 주제",
    rootFont,
    Math.max(80 * u, width * 0.26),
  );
  const rootW = Math.max(70 * u, textWidth(rootLabel, rootFont) + 30 * u);
  const rootH = 30 * u;

  // Angular share per branch, weighted by how much grows from it, filled
  // clockwise. Even counts start at the top (branches pair up on both sides);
  // odd counts centre the first branch on the right so none points straight
  // down into the short axis.
  const n = tree.branches.length;
  const weights = tree.branches.map((b) => 1 + b.kids.length * 0.3);
  const total = weights.reduce((s, w) => s + w, 0) || 1;
  let cursor = n % 2 ? -(Math.PI * weights[0]) / total : -Math.PI / 2;

  type Label = { x: number; y: number; text: string; anchor: "start" | "end"; };
  const strokes: { d: string; fill: string; opacity: number }[] = [];
  const leaves: { d: string; rib: string; color: string }[] = [];
  const buds: { x: number; y: number; r: number; color: string; halo: number }[] = [];
  const washes: { x: number; y: number; color: string }[] = [];
  const labels: Label[] = [];
  const grads: { id: string; from: Pt; to: Pt; color: string }[] = [];
  const taken: { x0: number; y0: number; x1: number; y1: number }[] = [
    { x0: C.x - rootW / 2, y0: C.y - rootH / 2, x1: C.x + rootW / 2, y1: C.y + rootH / 2 },
  ];
  const labelFont = 11 * u;
  const thin = n > 8 ? 0.8 : 1;

  tree.branches.forEach((b, i) => {
    const span = (Math.PI * 2 * weights[i]) / total;
    const raw = cursor + span / 2;
    cursor += span;
    // Squash angles toward the horizontal: wide boxes have room sideways.
    const theta = Math.atan2(Math.sin(raw) * 0.82, Math.cos(raw));
    const c = vivid(b.node.data.color) ?? BRANCH_AUTO_PALETTE[i % BRANCH_AUTO_PALETTE.length];
    const curl = (rand() - 0.5) * 0.55;
    const leafy = b.kids.length > 0;
    // Bare branches reach further, at varied lengths, like a growing plant.
    const a1 = leafy ? 0.5 + (rand() - 0.5) * 0.08 : 0.64 + (rand() - 0.5) * 0.26;
    const P1 = at(theta + curl * 0.35, a1);
    // Leave the root from its rim, toward the branch.
    const d0 = unit(P1.x - C.x, P1.y - C.y);
    const rx = rootW / 2 - 3 * u,
      ry = rootH / 2 - 3 * u;
    const t = 1 / Math.sqrt((d0.x * d0.x) / (rx * rx) + (d0.y * d0.y) / (ry * ry));
    const S = { x: C.x + d0.x * t, y: C.y + d0.y * t };
    const L = Math.hypot(P1.x - S.x, P1.y - S.y);
    const out = unit(P1.x - C.x, (P1.y - C.y) * 1.4);
    const bend = { x: out.x * Math.cos(curl) - out.y * Math.sin(curl), y: out.x * Math.sin(curl) + out.y * Math.cos(curl) };
    const pts = cubic(
      S,
      { x: S.x + d0.x * L * 0.45, y: S.y + d0.y * L * 0.2 },
      { x: P1.x - bend.x * L * 0.4, y: P1.y - bend.y * L * 0.4 },
      P1,
    );
    const gidB = `br-${gid}-${i}`;
    grads.push({ id: gidB, from: S, to: P1, color: c });
    strokes.push({ d: ribbon(pts, 5 * u * thin, 1.9 * u), fill: `url(#${gidB})`, opacity: 1 });
    if (i < 5) washes.push({ ...at(theta, 0.62), color: c });

    // Twigs fanning out to the sub-topics, each ending in a bud.
    const m = b.kids.length;
    const window = Math.min(span * 0.8, 1.3);
    b.kids.forEach((k, j) => {
      const phi = theta + (m === 1 ? curl * 0.3 : (j / (m - 1) - 0.5) * window);
      const Q = at(phi, (k.grand ? 0.8 : 0.9) - rand() * 0.07);
      const len = Math.hypot(Q.x - P1.x, Q.y - P1.y);
      const qo = unit(Q.x - C.x, Q.y - C.y);
      const tw = cubic(
        P1,
        { x: P1.x + out.x * len * 0.4, y: P1.y + out.y * len * 0.25 },
        { x: Q.x - qo.x * len * 0.3, y: Q.y - qo.y * len * 0.3 },
        Q,
        14,
      );
      strokes.push({ d: ribbon(tw, 1.7 * u * thin, 0.55 * u), fill: rgba(c, 1), opacity: 0.72 });
      buds.push({ ...Q, r: 2 * u, color: c, halo: 0.16 });
      for (let g = 0; g < k.grand; g++) {
        const psi = Math.atan2(qo.y, qo.x) + (g - (k.grand - 1) / 2) * 0.55;
        const E = { x: Q.x + Math.cos(psi) * 9 * u, y: Q.y + Math.sin(psi) * 9 * u };
        const mid = { x: (Q.x + E.x) / 2 + qo.x * 2 * u, y: (Q.y + E.y) / 2 + qo.y * 2 * u };
        strokes.push({ d: ribbon(cubic(Q, mid, mid, E, 6), 0.75 * u, 0.25 * u), fill: rgba(c, 1), opacity: 0.5 });
        buds.push({ ...E, r: 1.1 * u, color: c, halo: 0 });
      }
    });
    let reachX = 0;
    if (leafy) buds.push({ ...P1, r: 2.7 * u, color: c, halo: 0.2 });
    else {
      // A bare branch ends in a leaf, pointing the way it grows.
      const tail = pts[pts.length - 3];
      const dir = unit(P1.x - tail.x, P1.y - tail.y);
      const Lf = 12 * u,
        wf = 4.2 * u;
      const T = { x: P1.x + dir.x * Lf, y: P1.y + dir.y * Lf };
      const M = { x: P1.x + dir.x * Lf * 0.45, y: P1.y + dir.y * Lf * 0.45 };
      const f = (v: number) => v.toFixed(1);
      leaves.push({
        d: `M ${f(P1.x)} ${f(P1.y)} Q ${f(M.x - dir.y * wf * 1.6)} ${f(M.y + dir.x * wf * 1.6)} ${f(T.x)} ${f(T.y)} Q ${f(M.x + dir.y * wf * 1.6)} ${f(M.y - dir.x * wf * 1.6)} ${f(P1.x)} ${f(P1.y)} Z`,
        rib: `M ${f(P1.x)} ${f(P1.y)} L ${f(P1.x + dir.x * Lf * 0.8)} ${f(P1.y + dir.y * Lf * 0.8)}`,
        color: c,
      });
      reachX = Math.abs(dir.x) * Lf;
    }

    // First-level label beside its joint, kept clear of the others.
    const right = P1.x >= C.x;
    const x = P1.x + (right ? 1 : -1) * (6 * u + reachX);
    const room = right ? width - 6 * u - x : x - 6 * u;
    const text = fit((b.node.data.label || "").trim(), labelFont, Math.min(room, width * 0.24));
    if (text) {
      const y = Math.min(height - 4 * u, Math.max(labelFont + 2 * u, P1.y - 5 * u));
      const w = textWidth(text, labelFont);
      const box = { x0: right ? x : x - w, x1: right ? x + w : x, y0: y - labelFont, y1: y + 3 * u };
      if (!taken.some((r) => box.x0 < r.x1 && box.x1 > r.x0 && box.y0 < r.y1 && box.y1 > r.y0)) {
        taken.push(box);
        labels.push({ x, y, text, anchor: right ? "start" : "end" });
      }
    }
  });

  // Dust: a few faint specks for atmosphere, away from the central topic.
  const dust: { x: number; y: number; r: number; color: string; o: number }[] = [];
  for (let k = 0; k < 16; k++) {
    const p = { x: rand() * width, y: rand() * height };
    const r = (0.6 + rand() * 1.1) * u;
    const col = BRANCH_AUTO_PALETTE[Math.floor(rand() * BRANCH_AUTO_PALETTE.length)];
    const o = 0.18 + rand() * 0.3;
    if (Math.abs(p.x - C.x) < rootW && Math.abs(p.y - C.y) < rootH * 1.4) continue;
    dust.push({ ...p, r, color: col, o });
  }

  const halo = {
    stroke: "rgb(var(--surface-raised))",
    strokeOpacity: 0.85,
    strokeWidth: 3.2 * u,
    strokeLinejoin: "round" as const,
    paintOrder: "stroke" as const,
  };

  return (
    <div ref={boxRef} className="h-full w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mf-map-preview"
        aria-hidden="true"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <radialGradient id={`glow-${gid}`}>
            <stop offset="0%" stopColor={rootColor} stopOpacity="0.28" />
            <stop offset="55%" stopColor={rootColor} stopOpacity="0.08" />
            <stop offset="100%" stopColor={rootColor} stopOpacity="0" />
          </radialGradient>
          {washes.map((w, i) => (
            <radialGradient key={i} id={`wash-${gid}-${i}`}>
              <stop offset="0%" stopColor={w.color} stopOpacity="0.2" />
              <stop offset="100%" stopColor={w.color} stopOpacity="0" />
            </radialGradient>
          ))}
          {grads.map((g) => (
            <linearGradient
              key={g.id}
              id={g.id}
              gradientUnits="userSpaceOnUse"
              x1={g.from.x}
              y1={g.from.y}
              x2={g.to.x}
              y2={g.to.y}
            >
              <stop offset="0%" stopColor={rootColor} stopOpacity="0.85" />
              <stop offset="60%" stopColor={g.color} />
              <stop offset="100%" stopColor={g.color} />
            </linearGradient>
          ))}
          <linearGradient id={`root-${gid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={rootColor} />
            <stop offset="100%" stopColor={rgba(rootColor, 0.78)} />
          </linearGradient>
          <filter id={`lift-${gid}`} x="-40%" y="-80%" width="180%" height="260%">
            <feDropShadow dx="0" dy={2 * u} stdDeviation={3.5 * u} floodColor={rootColor} floodOpacity="0.35" />
          </filter>
        </defs>

        {/* Atmosphere */}
        {washes.map((w, i) => (
          <ellipse key={`w-${i}`} cx={w.x} cy={w.y} rx={RX * 0.5} ry={RY * 0.8} fill={`url(#wash-${gid}-${i})`} />
        ))}
        <ellipse cx={C.x} cy={C.y} rx={Math.max(rootW * 1.6, RX * 0.45)} ry={RY * 0.95} fill={`url(#glow-${gid})`} />
        {dust.map((d, i) => (
          <circle key={`d-${i}`} cx={d.x} cy={d.y} r={d.r} fill={d.color} opacity={d.o} />
        ))}

        {/* Orbits around the central topic */}
        <ellipse cx={C.x} cy={C.y} rx={rootW / 2 + 9 * u} ry={rootH / 2 + 9 * u} fill="none" stroke={rootColor} strokeOpacity={0.16} strokeWidth={u} />
        <ellipse cx={C.x} cy={C.y} rx={rootW / 2 + 20 * u} ry={rootH / 2 + 18 * u} fill="none" stroke={rootColor} strokeOpacity={0.14} strokeWidth={u} strokeDasharray={`${u} ${4 * u}`} strokeLinecap="round" />

        {/* Branches, twigs, leaves and buds */}
        {strokes.map((s, i) => (
          <path key={`s-${i}`} d={s.d} fill={s.fill} opacity={s.opacity} />
        ))}
        {leaves.map((l, i) => (
          <g key={`f-${i}`}>
            <path d={l.d} fill={l.color} opacity={0.9} />
            <path d={l.rib} fill="none" stroke="#fff" strokeOpacity={0.45} strokeWidth={0.7 * u} strokeLinecap="round" />
          </g>
        ))}
        {buds.map((b, i) => (
          <g key={`b-${i}`}>
            {b.halo > 0 && <circle cx={b.x} cy={b.y} r={b.r * 2.3} fill={b.color} opacity={b.halo} />}
            <circle cx={b.x} cy={b.y} r={b.r} fill={b.color} />
          </g>
        ))}

        {labels.map((l, i) => (
          <text
            key={`l-${i}`}
            x={l.x}
            y={l.y}
            textAnchor={l.anchor}
            fontSize={labelFont}
            fontWeight={600}
            style={{ fill: "rgb(var(--ink))", ...halo }}
          >
            {l.text}
          </text>
        ))}

        {/* Central topic */}
        <rect
          x={C.x - rootW / 2}
          y={C.y - rootH / 2}
          width={rootW}
          height={rootH}
          rx={rootH / 2}
          fill={`url(#root-${gid})`}
          filter={`url(#lift-${gid})`}
        />
        <rect
          x={C.x - rootW / 2 + rootH * 0.35}
          y={C.y - rootH / 2 + 2.5 * u}
          width={rootW - rootH * 0.7}
          height={rootH * 0.36}
          rx={rootH * 0.18}
          fill="#fff"
          opacity={0.16}
        />
        <text
          x={C.x}
          y={C.y + rootFont * 0.36}
          textAnchor="middle"
          fontSize={rootFont}
          fontWeight={700}
          fill="#fff"
        >
          {rootLabel}
        </text>
      </svg>
    </div>
  );
}
