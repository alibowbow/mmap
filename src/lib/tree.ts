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
  const seen = new Set<string>([nodeId]);
  const stack = [...(childrenMap.get(nodeId) ?? [])];
  while (stack.length) {
    const current = stack.pop()!;
    if (seen.has(current.id)) continue;
    seen.add(current.id);
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
  const byId = getNodeMap(nodes), depths = new Map<string, number>();
  for (const n of nodes) {
    if (depths.has(n.id)) continue;
    const path: string[] = [], seen = new Set<string>();
    let current: MindMapNode | undefined = n;
    while (current && !depths.has(current.id) && !seen.has(current.id)) {
      path.push(current.id); seen.add(current.id);
      current = current.data.parentId ? byId.get(current.data.parentId) : undefined;
    }
    let d = current && depths.has(current.id) ? depths.get(current.id)! + 1 : 0;
    for (let i = path.length - 1; i >= 0; i--) depths.set(path[i], d++);
  }
  return depths;
}

export function getDepth(nodes: MindMapNode[], nodeId: string): number {
  return computeDepths(nodes).get(nodeId) ?? 0;
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
  const children = getChildrenMap(nodes), hidden = new Set<string>(), seen = new Set<string>();
  const stack = nodes.filter(n => !n.data.parentId).map(n => ({ n, hide: false }));
  while (stack.length) {
    const { n, hide } = stack.pop()!;
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    if (hide) hidden.add(n.id);
    for (const child of children.get(n.id) ?? []) stack.push({ n: child, hide: hide || !!n.data.collapsed });
  }
  return hidden;
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
  const seen = new Set<string>();
  const stack = [root, ...nodes.filter(n => n.id !== root.id && !n.data.parentId)]
    .reverse().map(node => ({ node, depth: 0 }));
  while (stack.length) {
    const { node, depth } = stack.pop()!;
    if (seen.has(node.id)) continue;
    seen.add(node.id); visitor(node, depth);
    const kids = childrenMap.get(node.id) ?? [];
    for (let i = kids.length - 1; i >= 0; i--) stack.push({ node: kids[i], depth: depth + 1 });
  }
}
