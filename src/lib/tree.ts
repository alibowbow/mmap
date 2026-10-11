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

// A view-only forest from the actual parent relationships. Missing parents are
// roots. A cycle has no natural root, so ignore the parent link of its smallest
// id for traversal only. This is deterministic and never changes document data.
function viewForest(nodes: MindMapNode[]) {
  const byId = getNodeMap(nodes);
  const parents = new Map<string, string | null>();
  for (const node of nodes) {
    const parent = node.data.parentId;
    parents.set(node.id, parent && byId.has(parent) ? parent : null);
  }
  const complete = new Set<string>();
  for (const node of nodes) {
    const path: string[] = [], at = new Map<string, number>();
    let id: string | null = node.id;
    while (id !== null && !complete.has(id)) {
      const cycleStart = at.get(id);
      if (cycleStart !== undefined) {
        const root = path.slice(cycleStart).reduce((a, b) => a < b ? a : b);
        parents.set(root, null);
        break;
      }
      at.set(id, path.length);
      path.push(id);
      id = parents.get(id) ?? null;
    }
    for (const visited of path) complete.add(visited);
  }
  const children = new Map<string, MindMapNode[]>(), roots: MindMapNode[] = [];
  for (const node of nodes) {
    const parent = parents.get(node.id);
    if (parent === null) roots.push(node);
    else {
      const siblings = children.get(parent!) ?? [];
      siblings.push(node);
      children.set(parent!, siblings);
    }
  }
  return { roots, children };
}

// Depth of every node (each root = 0), including forests and malformed cycles.
export function computeDepths(nodes: MindMapNode[]): Map<string, number> {
  const { roots, children } = viewForest(nodes), depths = new Map<string, number>();
  const stack = roots.map(node => ({ node, depth: 0 }));
  while (stack.length) {
    const { node, depth } = stack.pop()!;
    depths.set(node.id, depth);
    for (const child of children.get(node.id) ?? []) stack.push({ node: child, depth: depth + 1 });
  }
  return depths;
}

// Reset the complete collapse state, rather than preserving hidden ancestors.
// Leaves do not need a collapse flag. null means expand every level.
export function nodesExpandedToDepth(nodes: MindMapNode[], depth: number | null): MindMapNode[] {
  const depths = computeDepths(nodes), children = getChildrenMap(nodes);
  let changed = false;
  const next = nodes.map(node => {
    const collapsed = depth !== null && (depths.get(node.id) ?? 0) >= depth && !!children.get(node.id)?.length;
    if (!!node.data.collapsed === collapsed) return node;
    changed = true;
    return { ...node, data: { ...node.data, collapsed } };
  });
  return changed ? next : nodes;
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
  const { roots, children } = viewForest(nodes), hidden = new Set<string>();
  const stack = roots.map(n => ({ n, hide: false }));
  while (stack.length) {
    const { n, hide } = stack.pop()!;
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
  const { roots, children } = viewForest(nodes);
  const stack = roots.reverse().map(node => ({ node, depth: 0 }));
  while (stack.length) {
    const { node, depth } = stack.pop()!;
    visitor(node, depth);
    const kids = children.get(node.id) ?? [];
    for (let i = kids.length - 1; i >= 0; i--) stack.push({ node: kids[i], depth: depth + 1 });
  }
}
