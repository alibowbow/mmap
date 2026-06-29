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

  // React Flow's edges <svg> is 0×0 with overflow:visible, so edge paths show
  // on screen but get clipped to nothing by html-to-image. Temporarily give it
  // a real viewBox/size/position that covers the content (keeps it aligned with
  // the absolutely-positioned nodes), then restore afterwards.
  const restoreEdges = expandEdgesSvg(viewportEl, bounds);
  try {
    return await (format === "png"
      ? toPng(viewportEl, options)
      : toSvg(viewportEl, options));
  } finally {
    restoreEdges();
  }
}

// React Flow v12 renders each edge as its own <svg> (default 300×150) inside
// the .react-flow__edges container; edge paths use absolute flow coordinates
// and overflow that tiny box, so html-to-image clips them away. Temporarily
// give every edge <svg> a viewBox/size/position covering the full content
// bounds (1:1, so paths stay aligned with the nodes), then restore.
function expandEdgesSvg(
  viewportEl: HTMLElement,
  bounds: { x: number; y: number; width: number; height: number }
): () => void {
  const svgs = Array.from(
    viewportEl.querySelectorAll<SVGSVGElement>(".react-flow__edges svg")
  );
  if (!svgs.length) return () => {};

  const pad = 400;
  const x = Math.round(bounds.x - pad);
  const y = Math.round(bounds.y - pad);
  const w = Math.round(bounds.width + pad * 2);
  const h = Math.round(bounds.height + pad * 2);

  const restores: Array<() => void> = [];

  // Edge stroke color comes from a CSS class; html-to-image may not inline it,
  // rasterizing the path as stroke:none (invisible). Force an inline stroke.
  const paths = Array.from(
    viewportEl.querySelectorAll<SVGPathElement>(".react-flow__edge-path")
  );
  for (const p of paths) {
    const cs = getComputedStyle(p);
    const prevStroke = p.style.stroke;
    const prevWidth = p.style.strokeWidth;
    p.style.stroke = cs.stroke;
    p.style.strokeWidth = cs.strokeWidth;
    restores.push(() => {
      p.style.stroke = prevStroke;
      p.style.strokeWidth = prevWidth;
    });
  }

  for (const svg of svgs) {
    const prev = {
      width: svg.getAttribute("width"),
      height: svg.getAttribute("height"),
      viewBox: svg.getAttribute("viewBox"),
      cssWidth: svg.style.width,
      cssHeight: svg.style.height,
      left: svg.style.left,
      top: svg.style.top,
      position: svg.style.position,
      overflow: svg.style.overflow,
      transform: svg.style.transform,
    };

    svg.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
    svg.setAttribute("width", `${w}`);
    svg.setAttribute("height", `${h}`);
    svg.style.width = `${w}px`;
    svg.style.height = `${h}px`;
    svg.style.position = "absolute";
    svg.style.left = `${x}px`;
    svg.style.top = `${y}px`;
    svg.style.overflow = "visible";
    svg.style.transform = "none";

    restores.push(() => {
      const setOrRemove = (attr: string, val: string | null) =>
        val === null ? svg.removeAttribute(attr) : svg.setAttribute(attr, val);
      setOrRemove("width", prev.width);
      setOrRemove("height", prev.height);
      setOrRemove("viewBox", prev.viewBox);
      svg.style.width = prev.cssWidth;
      svg.style.height = prev.cssHeight;
      svg.style.left = prev.left;
      svg.style.top = prev.top;
      svg.style.position = prev.position;
      svg.style.overflow = prev.overflow;
      svg.style.transform = prev.transform;
    });
  }

  return () => restores.forEach((r) => r());
}
