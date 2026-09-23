"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { BRANCH_AUTO_PALETTE } from "@/lib/constants";
import type { MindMapDocument, MindMapNode } from "@/types/mindmap";

// Map "cover art" for the home screen. The real canvas layout is usually a
// tall column (right-tree) that shrinks to illegibility in a wide card, so
// the preview composes its own overview instead: central topic in the middle,
// first-level branches balanced left/right with readable coloured chips, and
// their sub-topics as small words on thinning branches (or tidy "text line"
// bars when space is tight). Every map looks different — its own labels,
// branch count, shape and colours — in the app's visual language.
// Purely derived: never alters the document's layout, viewport or state.

type Item = { node: MindMapNode; leaves: number; kids: MindMapNode[] };

function textWidth(text: string, size: number): number {
  let w = 0;
  for (const ch of text) w += /[ᄀ-ￜ]/.test(ch) ? size * 0.96 : size * 0.56;
  return w;
}
function fit(text: string, size: number, max: number): string {
  if (max <= size) return "";
  if (textWidth(text, size) <= max) return text;
  const chars = Array.from(text);
  while (chars.length > 1 && textWidth(chars.join("") + "…", size) > max) chars.pop();
  return chars.join("") + "…";
}
const rgba = (c: string, a: number) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return c;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
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
  // composition fills any aspect ratio (wide desktop banner, phone card…).
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
  const width = size.w,
    height = size.h;
  const u = Math.min(1.45, height / 156); // size unit: 156px-tall card = 1

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
    const items: Item[] = (kids.get(root.id) ?? []).map((node) => {
      const k = node.data.collapsed ? [] : (kids.get(node.id) ?? []);
      return { node, kids: k, leaves: Math.max(1, k.length) };
    });
    // Balance branches between the two sides by weight, keeping order and
    // honouring an explicit side where the user set one.
    const right: Item[] = [],
      left: Item[] = [];
    let wr = 0,
      wl = 0;
    for (const it of items) {
      const side = it.node.data.side;
      if (side === "left" || (side !== "right" && wl < wr)) {
        left.push(it);
        wl += it.leaves;
      } else {
        right.push(it);
        wr += it.leaves;
      }
    }
    // Colour per first-level branch in document order (same as the canvas).
    const colorOf = new Map<string, string>();
    items.forEach((it, i) =>
      colorOf.set(
        it.node.id,
        it.node.data.color ?? BRANCH_AUTO_PALETTE[i % BRANCH_AUTO_PALETTE.length],
      ),
    );
    return { root, right, left, colorOf };
  }, [document.nodes]);

  if (!tree) return <div ref={boxRef} className="h-full w-full" />;

  const cx = width / 2,
    cy = height / 2;
  const rootColor = tree.root.data.color ?? color;
  const rootFont = 13.5 * u;
  const rootLabel = fit(
    (tree.root.data.label || document.title).trim(),
    rootFont,
    width * 0.2,
  );
  const rootW = Math.max(64 * u, textWidth(rootLabel, rootFont) + 28 * u);
  const rootH = 30 * u;
  const chipFont = 11.5 * u,
    chipH = 21 * u,
    subFont = 9.6 * u;
  // Horizontal spacing grows with the available width so wide banners are
  // filled by the composition rather than leaving it stranded in the middle.
  const gapRoot = Math.max(34 * u, width * 0.055),
    gapSub = Math.max(22 * u, width * 0.03);
  const chipMaxW = width * 0.17;
  const padY = 12 * u;

  const { colorOf } = tree;

  type Drawn = {
    key: string;
    branch: string;
    stroke: string;
    width: number;
    chip?: { x: number; y: number; w: number; label: string; color: string };
    sub?: { x: number; y: number; label: string; anchor: "start" | "end"; color: string; bar: number };
  };
  const drawn: Drawn[] = [];

  const placeSide = (items: Item[], dir: 1 | -1) => {
    if (!items.length) return;
    const weight = items.reduce((s, it) => s + it.leaves, 0);
    const avail = height - padY * 2;
    const slot = avail / weight;
    let y = cy - avail / 2;
    const startX = cx + dir * (rootW / 2 - 6 * u);
    for (const it of items) {
      const h = slot * it.leaves;
      const my = y + h / 2;
      const c = colorOf.get(it.node.id)!;
      const label = fit((it.node.data.label || "").trim() || "·", chipFont, chipMaxW - 16 * u);
      const w = Math.min(chipMaxW, Math.max(34 * u, textWidth(label, chipFont) + 18 * u));
      const nearX = cx + dir * (rootW / 2 + gapRoot);
      const chipX = nearX + (dir * w) / 2;
      const m = gapRoot * 0.7;
      drawn.push({
        key: it.node.id,
        branch: `M ${startX} ${cy} C ${startX + dir * m} ${cy}, ${nearX - dir * m} ${my}, ${nearX} ${my}`,
        stroke: c,
        width: 4.6 * u,
        chip: { x: chipX, y: my, w, label, color: c },
      });
      // Sub-topics: words on thin branches fanning out beyond the chip.
      const outer = nearX + dir * w;
      const room = (dir > 0 ? width - 8 * u - (outer + gapSub) : outer - gapSub - 8 * u);
      const n = it.kids.length;
      it.kids.forEach((k, j) => {
        const sy = n === 1 ? my : y + (h * (j + 0.5)) / n;
        const tx = outer + dir * gapSub;
        const legible = h / n >= 12 * u && room > 26 * u;
        const text = legible ? fit((k.data.label || "").trim() || "·", subFont, room) : "";
        const bar = Math.min(room, Math.max(12 * u, textWidth(k.data.label || "··", subFont) * 0.8));
        const kc = k.data.color ?? c;
        const mm = gapSub * 0.7;
        drawn.push({
          key: k.id,
          branch: `M ${outer} ${my} C ${outer + dir * mm} ${my}, ${tx - dir * mm} ${sy}, ${tx} ${sy}`,
          stroke: kc,
          width: 1.7 * u,
          sub: { x: tx + dir * 3 * u, y: sy, label: text, anchor: dir > 0 ? "start" : "end", color: kc, bar },
        });
      });
      y += h;
    }
  };
  placeSide(tree.right, 1);
  placeSide(tree.left, -1);

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
          <stop offset="0%" stopColor={rootColor} stopOpacity="0.22" />
          <stop offset="100%" stopColor={rootColor} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`root-${gid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={rootColor} />
          <stop offset="100%" stopColor={rgba(rootColor, 0.8)} />
        </linearGradient>
        <filter id={`lift-${gid}`} x="-30%" y="-50%" width="160%" height="220%">
          <feDropShadow dx="0" dy={1.5 * u} stdDeviation={2 * u} floodColor="#0f172a" floodOpacity="0.14" />
        </filter>
      </defs>

      {/* Soft light behind the centre gives the composition a focal point. */}
      <ellipse cx={cx} cy={cy} rx={rootW * 1.5} ry={rootH * 2.6} fill={`url(#glow-${gid})`} />

      {/* Branches: thick from the centre, thin to the sub-topics. */}
      {drawn.map((d) => (
        <path
          key={`b-${d.key}`}
          d={d.branch}
          fill="none"
          stroke={d.stroke}
          strokeOpacity={d.chip ? 0.95 : 0.7}
          strokeWidth={d.width}
          strokeLinecap="round"
        />
      ))}

      {/* Sub-topics */}
      {drawn.map((d) =>
        d.sub ? (
          d.sub.label ? (
            <text
              key={`s-${d.key}`}
              x={d.sub.x}
              y={d.sub.y + subFont * 0.35}
              textAnchor={d.sub.anchor}
              fontSize={subFont}
              fill="rgb(var(--ink-soft))"
            >
              {d.sub.label}
            </text>
          ) : (
            <rect
              key={`s-${d.key}`}
              x={d.sub.anchor === "start" ? d.sub.x : d.sub.x - d.sub.bar}
              y={d.sub.y - 1.6 * u}
              width={d.sub.bar}
              height={3.2 * u}
              rx={1.6 * u}
              fill={rgba(d.sub.color, 0.45)}
            />
          )
        ) : null,
      )}

      {/* First-level chips */}
      {drawn.map((d) =>
        d.chip ? (
          <g key={`c-${d.key}`}>
            <rect
              x={d.chip.x - d.chip.w / 2}
              y={d.chip.y - chipH / 2}
              width={d.chip.w}
              height={chipH}
              rx={chipH / 2}
              fill="rgb(var(--surface-raised))"
              stroke={d.chip.color}
              strokeWidth={1.4 * u}
              filter={`url(#lift-${gid})`}
            />
            <rect
              x={d.chip.x - d.chip.w / 2}
              y={d.chip.y - chipH / 2}
              width={d.chip.w}
              height={chipH}
              rx={chipH / 2}
              fill={rgba(d.chip.color, 0.13)}
            />
            <text
              x={d.chip.x}
              y={d.chip.y + chipFont * 0.36}
              textAnchor="middle"
              fontSize={chipFont}
              fontWeight={600}
              fill="rgb(var(--ink))"
            >
              {d.chip.label}
            </text>
          </g>
        ) : null,
      )}

      {/* Central topic */}
      <rect
        x={cx - rootW / 2}
        y={cy - rootH / 2}
        width={rootW}
        height={rootH}
        rx={rootH / 2}
        fill={`url(#root-${gid})`}
        filter={`url(#lift-${gid})`}
      />
      <text
        x={cx}
        y={cy + rootFont * 0.36}
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
