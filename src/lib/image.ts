import { getNodesBounds, getViewportForBounds } from "@xyflow/react";
import { toPng, toSvg } from "html-to-image";

import { getHiddenNodeIds } from "@/lib/tree";
import type { MindMapNode } from "@/types/mindmap";

export type ImageFormat = "png" | "svg";

const MIN_DIM = 480;
const MAX_DIM = 4096;
const MARGIN = 120; // px of breathing room around the graph

// Read the current canvas background color from CSS custom properties so the
// exported image matches the active (light/dark) theme.
function themeBackground(): string {
  if (typeof document === "undefined") return "#ffffff";
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--surface-base")
    .trim();
  if (!raw) return "#ffffff";
  const [r, g, b] = raw.split(/\s+/).map(Number);
  if ([r, g, b].some((n) => Number.isNaN(n))) return "#ffffff";
  return `rgb(${r}, ${g}, ${b})`;
}

// Render the visible graph to a PNG/SVG data URL by capturing the React Flow
// viewport DOM node and re-projecting it to fit the whole map.
export async function renderCanvasImage(
  nodes: MindMapNode[],
  format: ImageFormat
): Promise<string> {
  const viewportEl = document.querySelector<HTMLElement>(
    ".react-flow__viewport"
  );
  if (!viewportEl) throw new Error("캔버스를 찾을 수 없습니다.");

  // Only visible nodes contribute to the bounds (collapsed subtrees are hidden).
  const hidden = getHiddenNodeIds(nodes);
  const visible = nodes.filter((n) => !hidden.has(n.id));
  if (visible.length === 0) throw new Error("내보낼 노드가 없습니다.");

  const bounds = getNodesBounds(visible);
  const imageWidth = Math.min(
    MAX_DIM,
    Math.max(MIN_DIM, Math.round(bounds.width + MARGIN * 2))
  );
  const imageHeight = Math.min(
    MAX_DIM,
    Math.max(MIN_DIM, Math.round(bounds.height + MARGIN * 2))
  );
  const vp = getViewportForBounds(
    bounds,
    imageWidth,
    imageHeight,
    0.2,
    2,
    0.1
  );

  const options = {
    backgroundColor: themeBackground(),
    width: imageWidth,
    height: imageHeight,
    pixelRatio: format === "png" ? 2 : 1,
    cacheBust: true,
    // Exclude controls/minimap/panels that live outside the viewport node;
    // capturing the viewport alone already isolates just the nodes + edges.
    style: {
      width: `${imageWidth}px`,
      height: `${imageHeight}px`,
      transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`,
    },
  };

  return format === "png"
    ? toPng(viewportEl, options)
    : toSvg(viewportEl, options);
}
