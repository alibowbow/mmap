"use client";

import { useMemo } from "react";
import type { MindMapDocument } from "@/types/mindmap";

const BRANCH_COLORS = ["#d66b60", "#3e83cb", "#269782", "#ad8537", "#8b6ab4", "#438f9d"];
const shorten = (label: string, max: number) => {
  const chars = Array.from(label);
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : label;
};

// A readable overview of actual first-level branches. This does not alter the
// document's saved layout, viewport, nodes, or collapsed state.
export function DocumentPreview({ document, color }: { document: MindMapDocument; color: string }) {
  const overview = useMemo(() => {
    const root = document.nodes.find((n) => n.data.isRoot) ?? document.nodes[0];
    const branches = root ? document.nodes.filter((n) => n.data.parentId === root.id) : [];
    return { root, branches: branches.slice(0, 6), extra: Math.max(0, branches.length - 6) };
  }, [document.nodes]);

  return (
    <svg viewBox="0 0 600 236" className="mf-map-preview" aria-hidden="true">
      {overview.branches.map((node, index) => {
        const left = index % 2 === 0;
        const sideCount = Math.ceil((overview.branches.length - (left ? 0 : 1)) / 2);
        const row = Math.floor(index / 2);
        const y = 118 + (row - (sideCount - 1) / 2) * 72;
        const x = left ? 100 : 500;
        const stroke = BRANCH_COLORS[index];
        return <g key={node.id}>
          <path d={`M ${left ? 225 : 375} 118 C ${left ? 195 : 405} 118, ${left ? 205 : 395} ${y}, ${left ? 182 : 418} ${y}`} fill="none" stroke={stroke} strokeWidth="2" />
          <rect x={x - 82} y={y - 21} width="164" height="42" rx="10" fill="rgb(var(--surface-raised))" stroke={stroke} strokeOpacity="0.55" />
          <text x={x} y={y + 5} textAnchor="middle" fill="rgb(var(--ink))" fontSize="20" fontWeight="500">{shorten(node.data.label, 7)}</text>
        </g>;
      })}
      <rect x="225" y="88" width="150" height="60" rx="16" fill="rgb(var(--surface-raised))" stroke={color} strokeWidth="2" />
      <text x="300" y="123" textAnchor="middle" fill="rgb(var(--ink))" fontSize="20" fontWeight="700">{shorten(overview.root?.data.label ?? document.title, 7)}</text>
      {overview.extra > 0 && <text x="300" y="180" textAnchor="middle" fill="rgb(var(--ink-soft))" fontSize="13">+{overview.extra} 가지</text>}
    </svg>
  );
}
