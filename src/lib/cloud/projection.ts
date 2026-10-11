import type { MindMapDocument } from "@/types/mindmap";
import type { SharedCloudDocument } from "./contracts";

/** Shared with the SQL projection: true means a scalar, [shape] means an array.
 * No `true` leaf copies an arbitrary object. Unknown nested properties cannot
 * smuggle snapshots, account data or local document links into the public API.
 */
export type Projection = true | readonly [Projection] | { readonly [key: string]: Projection };
const xy = { x: true, y: true } as const;
const transform = { ...xy, scale: true, rotation: true } as const;
export const SHARED_DOCUMENT_PROJECTION = {
  title: true,
  nodes: [{
    id: true, type: true, position: xy, width: true, height: true,
    measured: { width: true, height: true },
    data: {
      label: true, description: true, parentId: true, collapsed: true,
      isRoot: true, type: true, status: true, color: true, style: true,
      icon: true, emoji: true, side: true, layoutMode: true, tags: [true],
      link: true, checklist: [{ id: true, text: true, checked: true }],
    },
  }],
  edges: [{ id: true, source: true, target: true, type: true, sourceHandle: true, targetHandle: true }],
  relations: [{ id: true, source: true, target: true, label: true }],
  boardMode: true,
  ink: {
    version: true,
    strokes: [{
      id: true, color: true, width: true,
      points: [{ ...xy, pressure: true }],
      brush: true, seed: true, opacity: true, texture: true, taper: true,
      branchStyle: true, materialStyle: true, joinWidth: true, curve: true,
      erasures: [{ radius: true, points: [xy] }], transform,
    }],
    objects: [{ id: true, kind: true, shape: true, text: true, ...xy,
      width: true, height: true, color: true, fill: true, fontSize: true, transform }],
    order: [true], paper: { kind: true, texture: true, seed: true },
  },
  appearance: {
    theme: true, font: true, nodeStyle: true, levelFontSizes: [true],
    edgeStyle: true, edgeAnimated: true, edgeWidth: true, edgeColorMode: true,
    edgeLine: true, nodeTint: true, canvasBg: true, accent: true, rainbowBranches: true,
  },
  layoutMode: true, viewport: { ...xy, zoom: true },
} as const satisfies Projection;

export function projectJson(value: unknown, shape: Projection): unknown {
  if (shape === true) {
    return value === null || ["string", "number", "boolean"].includes(typeof value)
      ? value : undefined;
  }
  if (Array.isArray(shape)) {
    return Array.isArray(value) ? value.map((item) => projectJson(item, shape[0])).filter((item) => item !== undefined) : undefined;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(shape)) {
    if (!Object.hasOwn(input, key)) continue;
    const projected = projectJson(input[key], child);
    if (projected !== undefined) result[key] = projected;
  }
  return result;
}

export function toSharedCloudDocument(document: MindMapDocument): SharedCloudDocument {
  return projectJson(document, SHARED_DOCUMENT_PROJECTION) as SharedCloudDocument;
}
