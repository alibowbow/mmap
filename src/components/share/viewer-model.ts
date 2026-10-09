import type { Edge, Node } from "@xyflow/react";
import type { SharedCloudDocument } from "@/lib/cloud/contracts";
import { appearanceFrom } from "@/lib/appearance";
import { BRANCH_AUTO_PALETTE, NODE_TYPE_CONFIG } from "@/lib/constants";
import { computeDepths, getChildrenMap, getHiddenNodeIds } from "@/lib/tree";
import type { MindMapNodeData } from "@/types/mindmap";

export type ViewerNodeData = MindMapNodeData & {
  _viewerColor: string;
  _viewerMatch: boolean;
};
export type ViewerNode = Node<ViewerNodeData>;

// The capability is accepted only from the fragment, never the query string.
// Do not echo it in errors, telemetry, document titles, or browser storage.
export function tokenFromFragment(fragment: string): string | null {
  return /^#token=([A-Za-z0-9_-]{43})$/.exec(fragment)?.[1] ?? null;
}

export function initialCollapsed(document: SharedCloudDocument): Set<string> {
  return new Set(document.nodes.filter((n) => n.data.collapsed).map((n) => n.id));
}

export function matchingNodeIds(document: SharedCloudDocument, query: string): string[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return [];
  return document.nodes.filter(({ data }) =>
    [data.label, data.description, ...(data.tags ?? []), ...(data.checklist ?? []).map((c) => c.text)]
      .some((text) => text?.toLocaleLowerCase().includes(q)),
  ).map((n) => n.id);
}

// Search can reveal a hidden result, but never changes the saved collapse flags.
export function revealAncestors(
  document: SharedCloudDocument,
  collapsed: ReadonlySet<string>,
  id: string,
): Set<string> {
  const next = new Set(collapsed);
  const byId = new Map(document.nodes.map((n) => [n.id, n]));
  const visited = new Set<string>();
  let parentId = byId.get(id)?.data.parentId;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    next.delete(parentId);
    parentId = byId.get(parentId)?.data.parentId;
  }
  return next;
}

export function viewerProjection(
  document: SharedCloudDocument,
  collapsed: ReadonlySet<string>,
  query: string,
): { nodes: ViewerNode[]; edges: Edge[] } {
  const appearance = appearanceFrom(document.appearance);
  const local = document.nodes.map((n) => ({
    ...n,
    data: { ...n.data, collapsed: collapsed.has(n.id) },
  }));
  const hidden = getHiddenNodeIds(local);
  const depths = computeDepths(local);
  const children = getChildrenMap(local);
  const matched = new Set(matchingNodeIds(document, query));
  const positions = new Map(local.map((n) => [n.id, n.position]));
  const colors = new Map<string, string>();
  const root = local.find((n) => n.data.isRoot || !n.data.parentId);
  if (appearance.rainbowBranches && root) {
    (children.get(root.id) ?? []).forEach((branch, index) => {
      const stack = [branch];
      const color = BRANCH_AUTO_PALETTE[index % BRANCH_AUTO_PALETTE.length];
      while (stack.length) {
        const node = stack.pop()!;
        if (colors.has(node.id)) continue;
        colors.set(node.id, color);
        stack.push(...(children.get(node.id) ?? []));
      }
    });
  }
  const nodes: ViewerNode[] = local.map((n) => ({
    // Deliberately do not spread saved ReactFlow runtime/style/selection data.
    id: n.id,
    type: "sharedNode",
    position: { ...n.position },
    draggable: false,
    connectable: false,
    selectable: false,
    deletable: false,
    // ReactFlow disables pointer events on fully non-editable nodes by
    // default. Keep their read-only collapse/details/link controls reachable.
    style: { pointerEvents: "auto" },
    hidden: hidden.has(n.id),
    ariaLabel: `노드: ${n.data.label || "내용 없음"}`,
    data: {
      ...n.data,
      _depth: depths.get(n.id) ?? 0,
      _childCount: children.get(n.id)?.length ?? 0,
      _viewerColor: n.data.color ?? colors.get(n.id) ?? NODE_TYPE_CONFIG[n.data.type]?.color ?? "#64748b",
      _viewerMatch: matched.has(n.id),
    },
  }));
  const nodeColor = new Map(nodes.map((n) => [n.id, n.data._viewerColor]));
  const handles = (source: string, target: string, relation = false) => {
    const s = positions.get(source)!;
    const t = positions.get(target)!;
    const dx = t.x - s.x, dy = t.y - s.y;
    const vertical = relation || document.layoutMode === "radial"
      ? Math.abs(dy) > Math.abs(dx)
      : document.layoutMode === "vertical";
    const sourceFace = vertical ? (dy < 0 ? "top" : "bottom") : (dx < 0 ? "left" : "right");
    const targetFace = vertical ? (dy < 0 ? "bottom" : "top") : (dx < 0 ? "right" : "left");
    return { sourceHandle: `${sourceFace}-source`, targetHandle: `${targetFace}-target` };
  };
  const edges: Edge[] = document.edges
    .filter((e) => positions.has(e.source) && positions.has(e.target))
    .map((e) => ({
      id: `tree:${e.id}`,
      source: e.source,
      target: e.target,
      type: "sharedEdge",
      ...handles(e.source, e.target),
      selectable: false,
      deletable: false,
      focusable: false,
      reconnectable: false,
      hidden: hidden.has(e.source) || hidden.has(e.target),
      style: {
        strokeWidth: appearance.edgeWidth,
        stroke: appearance.edgeColorMode === "node" ? nodeColor.get(e.target) : "rgb(var(--ink-faint) / .6)",
      },
      data: { depth: depths.get(e.source) ?? 0 },
    }));
  for (const relation of document.relations ?? []) {
    if (!positions.has(relation.source) || !positions.has(relation.target)) continue;
    edges.push({
      id: `relation:${relation.id}`,
      source: relation.source,
      target: relation.target,
      type: "sharedEdge",
      ...handles(relation.source, relation.target, true),
      hidden: hidden.has(relation.source) || hidden.has(relation.target),
      selectable: false,
      deletable: false,
      focusable: false,
      reconnectable: false,
      zIndex: 5,
      data: { relation: true, label: relation.label },
    });
  }
  return { nodes, edges };
}

// External navigation must neither execute content nor leak a capability as a
// referrer. The anchor also uses noreferrer/noopener and referrerPolicy.
export function safeViewerHref(value: string | undefined): string | undefined {
  if (!value) return;
  const cleaned = Array.from(value).filter((ch) => ch.charCodeAt(0) > 31).join("").trim();
  return /^(https?:|mailto:)/i.test(cleaned) ? cleaned : undefined;
}
