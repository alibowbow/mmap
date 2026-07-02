import {
  LAYOUT_GAP_X,
  LAYOUT_GAP_Y,
  NODE_HEIGHT,
  NODE_WIDTH,
} from "@/lib/constants";
import { getChildrenMap, getRootNode } from "@/lib/tree";
import type { LayoutMode, MindMapNode } from "@/types/mindmap";

type PosMap = Record<string, { x: number; y: number }>;

const ROW = NODE_HEIGHT + LAYOUT_GAP_Y;
const COL = NODE_WIDTH + LAYOUT_GAP_X;

// Visible children only (collapsed parents render as leaves).
function visibleChildren(
  childrenMap: Map<string, MindMapNode[]>,
  node: MindMapNode
): MindMapNode[] {
  if (node.data.collapsed) return [];
  return childrenMap.get(node.id) ?? [];
}

// Place every descendant of a collapsed node at the parent's position so
// hidden nodes never affect spacing.
function stackHidden(
  childrenMap: Map<string, MindMapNode[]>,
  nodeId: string,
  pos: { x: number; y: number },
  positions: PosMap
) {
  const stack = [...(childrenMap.get(nodeId) ?? [])];
  while (stack.length) {
    const cur = stack.pop()!;
    positions[cur.id] = { ...pos };
    const kids = childrenMap.get(cur.id);
    if (kids) stack.push(...kids);
  }
}

// ── Horizontal tidy tree (used for right & bidirectional) ────────────────────
function horizontalLayout(
  nodes: MindMapNode[],
  rootId: string,
  direction: 1 | -1,
  origin: { x: number; y: number },
  positions: PosMap
): { minY: number; maxY: number } {
  const childrenMap = getChildrenMap(nodes);
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  let cursorY = origin.y;
  let minY = Infinity;
  let maxY = -Infinity;

  const place = (nodeId: string, depth: number): number => {
    const node = nodeMap.get(nodeId);
    if (!node) return cursorY;
    const x = origin.x + direction * depth * COL;
    const kids = visibleChildren(childrenMap, node);
    let y: number;
    if (kids.length === 0) {
      y = cursorY;
      cursorY += ROW;
      if (node.data.collapsed) stackHidden(childrenMap, nodeId, { x, y }, positions);
    } else {
      const childYs = kids.map((k) => place(k.id, depth + 1));
      y = (childYs[0] + childYs[childYs.length - 1]) / 2;
    }
    positions[nodeId] = { x, y };
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    return y;
  };

  place(rootId, 0);
  return { minY, maxY };
}

export function layoutRightTree(
  nodes: MindMapNode[],
  rootId?: string
): MindMapNode[] {
  const root = rootId ? nodes.find((n) => n.id === rootId) : getRootNode(nodes);
  if (!root) return nodes;
  const positions: PosMap = {};
  horizontalLayout(nodes, root.id, 1, { x: 0, y: 0 }, positions);
  return applyPositions(nodes, positions, root.id);
}

// Count visible leaves of a subtree (for balancing the two sides).
function countVisibleLeaves(
  childrenMap: Map<string, MindMapNode[]>,
  nodeMap: Map<string, MindMapNode>,
  nodeId: string
): number {
  const node = nodeMap.get(nodeId);
  if (!node) return 1;
  const kids = visibleChildren(childrenMap, node);
  if (kids.length === 0) return 1;
  return kids.reduce(
    (acc, k) => acc + countVisibleLeaves(childrenMap, nodeMap, k.id),
    0
  );
}

export function layoutBidirectionalTree(
  nodes: MindMapNode[],
  rootId?: string
): MindMapNode[] {
  const root = rootId ? nodes.find((n) => n.id === rootId) : getRootNode(nodes);
  if (!root) return nodes;
  const childrenMap = getChildrenMap(nodes);
  const positions: PosMap = {};
  const topKids = visibleChildren(childrenMap, root);
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Honour an explicit `side` per first-level branch; auto-distribute the rest
  // to the lighter side so the map stays balanced left/right.
  const rightKids: MindMapNode[] = [];
  const leftKids: MindMapNode[] = [];
  let rightLeaves = 0;
  let leftLeaves = 0;
  const autoKids: MindMapNode[] = [];
  for (const k of topKids) {
    const leaves = countVisibleLeaves(childrenMap, nodeMap, k.id);
    if (k.data.side === "left") {
      leftKids.push(k);
      leftLeaves += leaves;
    } else if (k.data.side === "right") {
      rightKids.push(k);
      rightLeaves += leaves;
    } else {
      autoKids.push(k);
    }
  }
  for (const k of autoKids) {
    const leaves = countVisibleLeaves(childrenMap, nodeMap, k.id);
    if (rightLeaves <= leftLeaves) {
      rightKids.push(k);
      rightLeaves += leaves;
    } else {
      leftKids.push(k);
      leftLeaves += leaves;
    }
  }

  let cursorRight = 0;
  let cursorLeft = 0;

  const placeSide = (nodeId: string, depth: number, dir: 1 | -1): number => {
    const node = nodeMap.get(nodeId);
    if (!node) return 0;
    const x = dir * depth * COL;
    const kids = visibleChildren(childrenMap, node);
    let y: number;
    if (kids.length === 0) {
      y = dir === 1 ? cursorRight : cursorLeft;
      if (dir === 1) cursorRight += ROW;
      else cursorLeft += ROW;
      if (node.data.collapsed) stackHidden(childrenMap, nodeId, { x, y }, positions);
    } else {
      const ys = kids.map((k) => placeSide(k.id, depth + 1, dir));
      y = (ys[0] + ys[ys.length - 1]) / 2;
    }
    positions[nodeId] = { x, y };
    return y;
  };

  const rightYs = rightKids.map((k) => placeSide(k.id, 1, 1));
  const leftYs = leftKids.map((k) => placeSide(k.id, 1, -1));
  const all = [...rightYs, ...leftYs];
  const rootY = all.length ? (Math.min(...all) + Math.max(...all)) / 2 : 0;
  positions[root.id] = { x: 0, y: rootY };

  return applyPositions(nodes, positions, root.id);
}

export function layoutVerticalTree(
  nodes: MindMapNode[],
  rootId?: string
): MindMapNode[] {
  const root = rootId ? nodes.find((n) => n.id === rootId) : getRootNode(nodes);
  if (!root) return nodes;
  const childrenMap = getChildrenMap(nodes);
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const positions: PosMap = {};
  let cursorX = 0;

  const place = (nodeId: string, depth: number): number => {
    const node = nodeMap.get(nodeId);
    if (!node) return cursorX;
    const y = depth * (NODE_HEIGHT + LAYOUT_GAP_Y * 2);
    const kids = visibleChildren(childrenMap, node);
    let x: number;
    if (kids.length === 0) {
      x = cursorX;
      cursorX += NODE_WIDTH + LAYOUT_GAP_Y;
      if (node.data.collapsed) stackHidden(childrenMap, nodeId, { x, y }, positions);
    } else {
      const xs = kids.map((k) => place(k.id, depth + 1));
      x = (xs[0] + xs[xs.length - 1]) / 2;
    }
    positions[nodeId] = { x, y };
    return x;
  };

  place(root.id, 0);
  return applyPositions(nodes, positions, root.id);
}

export function layoutRadialTree(
  nodes: MindMapNode[],
  rootId?: string
): MindMapNode[] {
  const root = rootId ? nodes.find((n) => n.id === rootId) : getRootNode(nodes);
  if (!root) return nodes;
  const childrenMap = getChildrenMap(nodes);
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const positions: PosMap = {};
  // Elliptical rings: cards are much wider than tall, so the horizontal
  // radius must account for NODE_WIDTH or side branches sit flush against
  // the root (circle radius 240 left only an 8px gap).
  const ringGapX = NODE_WIDTH + 150;
  const ringGapY = NODE_HEIGHT + 130;

  // Count leaves to distribute angular space proportionally.
  const leafCount = (nodeId: string): number => {
    const node = nodeMap.get(nodeId);
    if (!node) return 1;
    const kids = visibleChildren(childrenMap, node);
    if (kids.length === 0) return 1;
    return kids.reduce((acc, k) => acc + leafCount(k.id), 0);
  };

  const place = (
    nodeId: string,
    depth: number,
    startAngle: number,
    endAngle: number
  ) => {
    const node = nodeMap.get(nodeId);
    if (!node) return;
    const mid = (startAngle + endAngle) / 2;
    positions[nodeId] = {
      x: Math.cos(mid) * depth * ringGapX,
      y: Math.sin(mid) * depth * ringGapY,
    };
    const kids = visibleChildren(childrenMap, node);
    if (kids.length === 0) {
      if (node.data.collapsed) {
        stackHidden(childrenMap, nodeId, positions[nodeId], positions);
      }
      return;
    }
    const total = kids.reduce((acc, k) => acc + leafCount(k.id), 0);
    let cursor = startAngle;
    for (const k of kids) {
      const span = ((endAngle - startAngle) * leafCount(k.id)) / total;
      place(k.id, depth + 1, cursor, cursor + span);
      cursor += span;
    }
  };

  place(root.id, 0, 0, Math.PI * 2);
  return applyPositions(nodes, positions, root.id);
}

// Normalize so the root sits near the origin and write positions back.
function applyPositions(
  nodes: MindMapNode[],
  positions: PosMap,
  rootId: string
): MindMapNode[] {
  const rootPos = positions[rootId] ?? { x: 0, y: 0 };
  return nodes.map((n) => {
    const p = positions[n.id];
    if (!p) return n;
    return {
      ...n,
      position: { x: p.x - rootPos.x, y: p.y - rootPos.y },
    };
  });
}

const LAYOUT_FNS: Record<
  LayoutMode,
  (nodes: MindMapNode[], rootId?: string) => MindMapNode[]
> = {
  "right-tree": layoutRightTree,
  bidirectional: layoutBidirectionalTree,
  vertical: layoutVerticalTree,
  radial: layoutRadialTree,
};

export function runLayout(
  nodes: MindMapNode[],
  mode: LayoutMode
): MindMapNode[] {
  return LAYOUT_FNS[mode](nodes);
}

// Lay out only a subtree, anchored at the subtree root's current position.
export function runSubtreeLayout(
  nodes: MindMapNode[],
  rootId: string,
  mode: LayoutMode
): MindMapNode[] {
  const subtreeRoot = nodes.find((n) => n.id === rootId);
  if (!subtreeRoot) return nodes;
  const anchor = subtreeRoot.position;
  const laidOut = LAYOUT_FNS[mode](nodes, rootId);
  const laidMap = new Map(laidOut.map((n) => [n.id, n]));
  // Collect subtree ids
  const childrenMap = getChildrenMap(nodes);
  const subtreeIds = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    subtreeIds.add(id);
    for (const k of childrenMap.get(id) ?? []) stack.push(k.id);
  }
  return nodes.map((n) => {
    if (!subtreeIds.has(n.id)) return n;
    const laid = laidMap.get(n.id);
    if (!laid) return n;
    return {
      ...n,
      position: {
        x: anchor.x + laid.position.x,
        y: anchor.y + laid.position.y,
      },
    };
  });
}
