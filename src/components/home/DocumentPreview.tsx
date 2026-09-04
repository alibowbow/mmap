"use client";
import { useMemo } from "react";
import type { MindMapDocument, MindMapNode } from "@/types/mindmap";

function nodeCenter(node: MindMapNode) {
  return {
    x: node.position.x + (node.measured?.width ?? node.width ?? 150) / 2,
    y: node.position.y + (node.measured?.height ?? node.height ?? 48) / 2,
  };
}

export function DocumentPreview({
  document,
  color,
}: {
  document: MindMapDocument;
  color: string;
}) {
  const geometry = useMemo(() => {
    const nodes = document.nodes.slice(0, 30);
    if (!nodes.length) return { points: [], links: [] };

    const centers = nodes.map((node) => ({ id: node.id, ...nodeCenter(node) }));
    const byId = new Map(centers.map((point) => [point.id, point]));
    const minX = Math.min(...centers.map((point) => point.x));
    const maxX = Math.max(...centers.map((point) => point.x));
    const minY = Math.min(...centers.map((point) => point.y));
    const maxY = Math.max(...centers.map((point) => point.y));
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const scale = (point: { x: number; y: number }) => ({
      x: 10 + ((point.x - minX) / spanX) * 140,
      y: 8 + ((point.y - minY) / spanY) * 58,
    });
    const points = nodes.map((node) => ({
      id: node.id,
      isRoot: Boolean(node.data.isRoot),
      ...scale(byId.get(node.id)!),
    }));
    const scaledById = new Map(points.map((point) => [point.id, point]));
    const links = nodes.flatMap((node) => {
      if (!node.data.parentId) return [];
      const source = scaledById.get(node.data.parentId);
      const target = scaledById.get(node.id);
      return source && target ? [{ source, target }] : [];
    });
    return { points, links };
  }, [document]);

  return (
    <svg
      viewBox="0 0 160 74"
      className="h-14 w-28 shrink-0 overflow-visible sm:w-32"
      aria-hidden="true"
      style={{ color }}
    >
      {geometry.links.map(({ source, target }, index) => {
        const middle = source.x + (target.x - source.x) * 0.55;
        return (
          <path
            key={`${source.id}-${target.id}-${index}`}
            d={`M ${source.x} ${source.y} C ${middle} ${source.y}, ${middle} ${target.y}, ${target.x} ${target.y}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            opacity="0.72"
          />
        );
      })}
      {geometry.points.map((point) =>
        point.isRoot ? (
          <rect
            key={point.id}
            x={point.x - 6}
            y={point.y - 3.5}
            width="12"
            height="7"
            rx="2.5"
            fill="rgb(var(--surface-raised))"
            stroke="currentColor"
            strokeWidth="1.8"
          />
        ) : (
          <circle
            key={point.id}
            cx={point.x}
            cy={point.y}
            r="2.1"
            fill="rgb(var(--surface-raised))"
            stroke="currentColor"
            strokeWidth="1.4"
          />
        )
      )}
    </svg>
  );
}

