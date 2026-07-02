import type { Edge, MindMapNode } from "@/types/mindmap";

// ── Tree traversal helpers ───────────────────────────────────────────────────
// We keep parentId on node.data, so the tree can always be reconstructed from
// the node list alone (edges mirror it for React Flow rendering).

export function getNodeMap(nodes: MindMapNode[]): Map<string, MindMapNode> {
  const map = new Map<string, MindMapNode>();
  for (const n of nodes) map.set(n.id, n);
  return map;
}

export function getChildrenMap(
  nodes: MindMapNode[]
): Map<string, MindMapNode[]> {
  const map = new Map<string, MindMapNode[]>();
  for (const n of nodes) {
    const parentId = n.data.parentId ?? null;
    if (!parentId) continue;
    if (!map.has(parentId)) map.set(parentId, []);
    map.get(parentId)!.push(n);
  }
  return map;
}

export function getRootNode(nodes: MindMapNode[]): MindMapNode | undefined {
  return (
    nodes.find((n) => n.data.isRoot || !n.data.parentId) ?? nodes[0]
  );
}

export function getChildren(
  nodes: MindMapNode[],
  parentId: string
): MindMapNode[] {
  return nodes.filter((n) => n.data.parentId === parentId);
}

// Returns the ids of all descendants of a node (excluding the node itself).
export function getDescendantIds(
  nodes: MindMapNode[],
  nodeId: string
): string[] {
  const childrenMap = getChildrenMap(nodes);
  const result: string[] = [];
  const stack = [...(childrenMap.get(nodeId) ?? [])];
  while (stack.length) {
    const current = stack.pop()!;
    result.push(current.id);
    const kids = childrenMap.get(current.id);
    if (kids) stack.push(...kids);
  }
  return result;
}

// Returns the subtree ids including the root of the subtree.
export function getSubtreeIds(nodes: MindMapNode[], nodeId: string): string[] {
  return [nodeId, ...getDescendantIds(nodes, nodeId)];
}

// Depth of every node in one pass (root = 0). Used for per-level sizing.
export function computeDepths(nodes: MindMapNode[]): Map<string, number> {
  const map = getNodeMap(nodes);
  const depths = new Map<string, number>();
  const depthOf = (id: string): number => {
    const cached = depths.get(id);
    if (cached !== undefined) return cached;
    const node = map.get(id);
    const parentId = node?.data.parentId;
    const d = parentId && map.has(parentId) ? depthOf(parentId) + 1 : 0;
    depths.set(id, d);
    return d;
  };
  for (const n of nodes) depthOf(n.id);
  return depths;
}

export function getDepth(nodes: MindMapNode[], nodeId: string): number {
  const map = getNodeMap(nodes);
  let depth = 0;
  let current = map.get(nodeId);
  while (current?.data.parentId) {
    current = map.get(current.data.parentId);
    depth += 1;
    if (depth > 1000) break; // cycle guard
  }
  return depth;
}

// Build edges from the parentId relationships.
export function buildEdgesFromNodes(nodes: MindMapNode[]): Edge[] {
  const edges: Edge[] = [];
  for (const n of nodes) {
    const parentId = n.data.parentId;
    if (!parentId) continue;
    edges.push({
      id: `e_${parentId}_${n.id}`,
      source: parentId,
      target: n.id,
      type: "mindmap",
    });
  }
  return edges;
}

// Determine which nodes are hidden because an ancestor is collapsed.
export function getHiddenNodeIds(nodes: MindMapNode[]): Set<string> {
  const childrenMap = getChildrenMap(nodes);
  const hidden = new Set<string>();
  for (const n of nodes) {
    if (n.data.collapsed) {
      for (const id of collectDescendants(childrenMap, n.id)) hidden.add(id);
    }
  }
  return hidden;
}

function collectDescendants(
  childrenMap: Map<string, MindMapNode[]>,
  nodeId: string
): string[] {
  const out: string[] = [];
  const stack = [...(childrenMap.get(nodeId) ?? [])];
  while (stack.length) {
    const current = stack.pop()!;
    out.push(current.id);
    const kids = childrenMap.get(current.id);
    if (kids) stack.push(...kids);
  }
  return out;
}

// DFS order of currently-visible nodes (presentation navigation/reveal).
export function getVisibleDfsOrder(nodes: MindMapNode[]): string[] {
  const hidden = getHiddenNodeIds(nodes);
  const order: string[] = [];
  walkTree(nodes, (node) => {
    if (!hidden.has(node.id)) order.push(node.id);
  });
  return order;
}

// Count direct children for badge display.
export function countChildren(nodes: MindMapNode[], nodeId: string): number {
  return nodes.reduce(
    (acc, n) => (n.data.parentId === nodeId ? acc + 1 : acc),
    0
  );
}

// Ordered depth-first walk of the tree, used for outline & markdown export.
export function walkTree(
  nodes: MindMapNode[],
  visitor: (node: MindMapNode, depth: number) => void
): void {
  const childrenMap = getChildrenMap(nodes);
  const root = getRootNode(nodes);
  if (!root) return;
  const visit = (node: MindMapNode, depth: number) => {
    visitor(node, depth);
    const kids = childrenMap.get(node.id) ?? [];
    for (const k of kids) visit(k, depth + 1);
  };
  visit(root, 0);
  // Include orphan roots (defensive) that are not under main root.
  for (const n of nodes) {
    if (n.id !== root.id && !n.data.parentId) visit(n, 0);
  }
}
