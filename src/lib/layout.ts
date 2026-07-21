import {
  LAYOUT_GAP_X,
  LAYOUT_GAP_Y,
  NODE_HEIGHT,
  NODE_WIDTH,
} from "@/lib/constants";
import { getChildrenMap, getRootNode } from "@/lib/tree";
import type { LayoutMode, MindMapNode } from "@/types/mindmap";

type Point = { x: number; y: number };
type PosMap = Record<string, Point>;
type Size = { width: number; height: number };

// Keep a little more breathing room than the old fixed-height layout. Actual
// node dimensions (description, tags, checklist, font size, etc.) are used
// below, so these values are true gaps rather than guesses at card size.
const SIBLING_GAP = Math.max(LAYOUT_GAP_Y, 28);
const LEVEL_GAP = Math.max(LAYOUT_GAP_X, 48);
const RADIAL_CLEARANCE = 28;
const RADIAL_MAX_PASSES = 18;

function finiteDimension(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

// React Flow writes the rendered size to `measured`. Newly created/imported
// nodes may not have been measured yet, so the stable design size is the
// fallback. This is what makes a manual auto-arrange fix tall cards too.
function sizeOf(node: MindMapNode): Size {
  return {
    width: finiteDimension(node.measured?.width ?? node.width, NODE_WIDTH),
    height: finiteDimension(node.measured?.height ?? node.height, NODE_HEIGHT),
  };
}

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
  pos: Point,
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

function visibleDepthMetrics(
  childrenMap: Map<string, MindMapNode[]>,
  nodeMap: Map<string, MindMapNode>,
  rootId: string
): { widths: number[]; heights: number[] } {
  const widths: number[] = [];
  const heights: number[] = [];
  const stack: Array<{ id: string; depth: number }> = [
    { id: rootId, depth: 0 },
  ];
  const seen = new Set<string>();
  while (stack.length) {
    const { id, depth } = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = nodeMap.get(id);
    if (!node) continue;
    const size = sizeOf(node);
    widths[depth] = Math.max(widths[depth] ?? 0, size.width);
    heights[depth] = Math.max(heights[depth] ?? 0, size.height);
    for (const child of visibleChildren(childrenMap, node)) {
      stack.push({ id: child.id, depth: depth + 1 });
    }
  }
  return { widths, heights };
}

function horizontalX(depth: number, direction: 1 | -1, widths: number[]) {
  let x = 0;
  if (direction === 1) {
    for (let level = 0; level < depth; level += 1) {
      x += (widths[level] ?? NODE_WIDTH) + LEVEL_GAP;
    }
  } else {
    // On the left, each column's right edge must stay LEVEL_GAP away from the
    // previous column, hence the width of the destination column is used.
    for (let level = 1; level <= depth; level += 1) {
      x -= (widths[level] ?? NODE_WIDTH) + LEVEL_GAP;
    }
  }
  return x;
}

// ── Horizontal tidy tree (used for right & bidirectional) ──────────────────
function createHorizontalPlacer(
  childrenMap: Map<string, MindMapNode[]>,
  nodeMap: Map<string, MindMapNode>,
  widths: number[],
  positions: PosMap
) {
  const heightCache = new Map<string, number>();

  const subtreeHeight = (nodeId: string): number => {
    const cached = heightCache.get(nodeId);
    if (cached !== undefined) return cached;
    const node = nodeMap.get(nodeId);
    if (!node) return NODE_HEIGHT;
    const own = sizeOf(node).height;
    const kids = visibleChildren(childrenMap, node);
    const childrenHeight = kids.length
      ? kids.reduce((sum, child) => sum + subtreeHeight(child.id), 0) +
        SIBLING_GAP * (kids.length - 1)
      : 0;
    const result = Math.max(own, childrenHeight);
    heightCache.set(nodeId, result);
    return result;
  };

  const place = (
    nodeId: string,
    depth: number,
    blockTop: number,
    direction: 1 | -1
  ): number => {
    const node = nodeMap.get(nodeId);
    if (!node) return blockTop;
    const own = sizeOf(node);
    const blockHeight = subtreeHeight(nodeId);
    const kids = visibleChildren(childrenMap, node);
    let y = blockTop + (blockHeight - own.height) / 2;

    if (kids.length) {
      const groupHeight =
        kids.reduce((sum, child) => sum + subtreeHeight(child.id), 0) +
        SIBLING_GAP * (kids.length - 1);
      let childTop = blockTop + (blockHeight - groupHeight) / 2;
      const childCenters: number[] = [];
      for (const child of kids) {
        place(child.id, depth + 1, childTop, direction);
        const childPos = positions[child.id];
        childCenters.push(childPos.y + sizeOf(child).height / 2);
        childTop += subtreeHeight(child.id) + SIBLING_GAP;
      }
      y =
        (childCenters[0] + childCenters[childCenters.length - 1]) / 2 -
        own.height / 2;
    }

    const pos = { x: horizontalX(depth, direction, widths), y };
    positions[nodeId] = pos;
    if (node.data.collapsed) stackHidden(childrenMap, nodeId, pos, positions);
    return y + own.height / 2;
  };

  return { place, subtreeHeight };
}

export function layoutRightTree(
  nodes: MindMapNode[],
  rootId?: string
): MindMapNode[] {
  const root = rootId ? nodes.find((n) => n.id === rootId) : getRootNode(nodes);
  if (!root) return nodes;
  const childrenMap = getChildrenMap(nodes);
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const { widths } = visibleDepthMetrics(childrenMap, nodeMap, root.id);
  const positions: PosMap = {};
  const placer = createHorizontalPlacer(
    childrenMap,
    nodeMap,
    widths,
    positions
  );
  placer.place(root.id, 0, 0, 1);
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
    (acc, child) => acc + countVisibleLeaves(childrenMap, nodeMap, child.id),
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
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const { widths } = visibleDepthMetrics(childrenMap, nodeMap, root.id);
  const positions: PosMap = { [root.id]: { x: 0, y: 0 } };
  const topKids = visibleChildren(childrenMap, root);

  // Honour an explicit `side` per first-level branch; auto-distribute the rest
  // to the lighter side so the map stays balanced left/right.
  const rightKids: MindMapNode[] = [];
  const leftKids: MindMapNode[] = [];
  let rightLeaves = 0;
  let leftLeaves = 0;
  const autoKids: MindMapNode[] = [];
  for (const child of topKids) {
    const leaves = countVisibleLeaves(childrenMap, nodeMap, child.id);
    if (child.data.side === "left") {
      leftKids.push(child);
      leftLeaves += leaves;
    } else if (child.data.side === "right") {
      rightKids.push(child);
      rightLeaves += leaves;
    } else {
      autoKids.push(child);
    }
  }
  for (const child of autoKids) {
    const leaves = countVisibleLeaves(childrenMap, nodeMap, child.id);
    if (rightLeaves <= leftLeaves) {
      rightKids.push(child);
      rightLeaves += leaves;
    } else {
      leftKids.push(child);
      leftLeaves += leaves;
    }
  }

  const placer = createHorizontalPlacer(
    childrenMap,
    nodeMap,
    widths,
    positions
  );
  const rootCenterY = sizeOf(root).height / 2;

  const placeSide = (kids: MindMapNode[], direction: 1 | -1) => {
    if (!kids.length) return;
    const groupHeight =
      kids.reduce((sum, child) => sum + placer.subtreeHeight(child.id), 0) +
      SIBLING_GAP * (kids.length - 1);
    let top = rootCenterY - groupHeight / 2;
    for (const child of kids) {
      placer.place(child.id, 1, top, direction);
      top += placer.subtreeHeight(child.id) + SIBLING_GAP;
    }
  };

  placeSide(rightKids, 1);
  placeSide(leftKids, -1);
  if (root.data.collapsed) {
    stackHidden(childrenMap, root.id, positions[root.id], positions);
  }
  return applyPositions(nodes, positions, root.id);
}

// ── Vertical tidy tree ─────────────────────────────────────────────────────
export function layoutVerticalTree(
  nodes: MindMapNode[],
  rootId?: string
): MindMapNode[] {
  const root = rootId ? nodes.find((n) => n.id === rootId) : getRootNode(nodes);
  if (!root) return nodes;
  const childrenMap = getChildrenMap(nodes);
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const { heights } = visibleDepthMetrics(childrenMap, nodeMap, root.id);
  const positions: PosMap = {};
  const widthCache = new Map<string, number>();

  const yForDepth = (depth: number) => {
    let y = 0;
    for (let level = 0; level < depth; level += 1) {
      y += (heights[level] ?? NODE_HEIGHT) + LEVEL_GAP;
    }
    return y;
  };

  const subtreeWidth = (nodeId: string): number => {
    const cached = widthCache.get(nodeId);
    if (cached !== undefined) return cached;
    const node = nodeMap.get(nodeId);
    if (!node) return NODE_WIDTH;
    const own = sizeOf(node).width;
    const kids = visibleChildren(childrenMap, node);
    const childrenWidth = kids.length
      ? kids.reduce((sum, child) => sum + subtreeWidth(child.id), 0) +
        SIBLING_GAP * (kids.length - 1)
      : 0;
    const result = Math.max(own, childrenWidth);
    widthCache.set(nodeId, result);
    return result;
  };

  const place = (nodeId: string, depth: number, blockLeft: number) => {
    const node = nodeMap.get(nodeId);
    if (!node) return;
    const own = sizeOf(node);
    const blockWidth = subtreeWidth(nodeId);
    const kids = visibleChildren(childrenMap, node);
    let x = blockLeft + (blockWidth - own.width) / 2;

    if (kids.length) {
      const groupWidth =
        kids.reduce((sum, child) => sum + subtreeWidth(child.id), 0) +
        SIBLING_GAP * (kids.length - 1);
      let childLeft = blockLeft + (blockWidth - groupWidth) / 2;
      const childCenters: number[] = [];
      for (const child of kids) {
        place(child.id, depth + 1, childLeft);
        childCenters.push(
          positions[child.id].x + sizeOf(child).width / 2
        );
        childLeft += subtreeWidth(child.id) + SIBLING_GAP;
      }
      x =
        (childCenters[0] + childCenters[childCenters.length - 1]) / 2 -
        own.width / 2;
    }

    const pos = { x, y: yForDepth(depth) };
    positions[nodeId] = pos;
    if (node.data.collapsed) stackHidden(childrenMap, nodeId, pos, positions);
  };

  place(root.id, 0, 0);
  return applyPositions(nodes, positions, root.id);
}

// ── Radial tidy tree ───────────────────────────────────────────────────────
function boxesOverlap(
  a: MindMapNode,
  b: MindMapNode,
  positions: PosMap,
  gap: number
) {
  const ap = positions[a.id];
  const bp = positions[b.id];
  if (!ap || !bp) return false;
  const as = sizeOf(a);
  const bs = sizeOf(b);
  return (
    ap.x < bp.x + bs.width + gap &&
    ap.x + as.width + gap > bp.x &&
    ap.y < bp.y + bs.height + gap &&
    ap.y + as.height + gap > bp.y
  );
}

function hasOverlap(
  visible: MindMapNode[],
  positions: PosMap,
  gap = RADIAL_CLEARANCE
) {
  // Spatial buckets keep this close to O(n) for large maps. A pair can share
  // multiple cells, so candidate indexes are de-duplicated per node.
  let cellSize = 64;
  for (const node of visible) {
    const size = sizeOf(node);
    cellSize = Math.max(cellSize, size.width + gap, size.height + gap);
  }
  const cells = new Map<string, number[]>();
  for (let index = 0; index < visible.length; index += 1) {
    const node = visible[index];
    const pos = positions[node.id];
    if (!pos) continue;
    const size = sizeOf(node);
    const minCellX = Math.floor((pos.x - gap) / cellSize);
    const maxCellX = Math.floor((pos.x + size.width + gap) / cellSize);
    const minCellY = Math.floor((pos.y - gap) / cellSize);
    const maxCellY = Math.floor((pos.y + size.height + gap) / cellSize);
    const candidates = new Set<number>();

    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
        const key = `${cellX}:${cellY}`;
        for (const otherIndex of cells.get(key) ?? []) {
          candidates.add(otherIndex);
        }
      }
    }
    for (const otherIndex of candidates) {
      if (boxesOverlap(node, visible[otherIndex], positions, gap)) return true;
    }

    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
        const key = `${cellX}:${cellY}`;
        const bucket = cells.get(key);
        if (bucket) bucket.push(index);
        else cells.set(key, [index]);
      }
    }
  }
  return false;
}

export function layoutRadialTree(
  nodes: MindMapNode[],
  rootId?: string
): MindMapNode[] {
  const root = rootId ? nodes.find((n) => n.id === rootId) : getRootNode(nodes);
  if (!root) return nodes;
  const childrenMap = getChildrenMap(nodes);
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const { widths, heights } = visibleDepthMetrics(
    childrenMap,
    nodeMap,
    root.id
  );
  const visible: MindMapNode[] = [];
  const visibleByDepth = new Map<number, MindMapNode[]>();
  const visibleStack: Array<{ node: MindMapNode; depth: number }> = [
    { node: root, depth: 0 },
  ];
  const seen = new Set<string>();
  while (visibleStack.length) {
    const { node, depth } = visibleStack.pop()!;
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    visible.push(node);
    const group = visibleByDepth.get(depth) ?? [];
    group.push(node);
    visibleByDepth.set(depth, group);
    for (const child of visibleChildren(childrenMap, node)) {
      visibleStack.push({ node: child, depth: depth + 1 });
    }
  }

  // Each ring starts beyond the actual dimensions of the adjacent rings.
  // Extra horizontal/vertical clearance preserves the familiar ellipse while
  // accounting for cards being much wider than they are tall.
  const ringX = [0];
  const ringY = [0];
  for (let depth = 1; depth < widths.length; depth += 1) {
    ringX[depth] =
      ringX[depth - 1] +
      ((widths[depth - 1] ?? NODE_WIDTH) +
        (widths[depth] ?? NODE_WIDTH)) /
        2 +
      LEVEL_GAP +
      94;
    ringY[depth] =
      ringY[depth - 1] +
      ((heights[depth - 1] ?? NODE_HEIGHT) +
        (heights[depth] ?? NODE_HEIGHT)) /
        2 +
      SIBLING_GAP +
      102;
  }

  // A crowded ring needs enough perimeter for every card on that ring. Start
  // with that analytical lower bound so even a very broad map converges in a
  // handful of collision passes rather than expanding 14% dozens of times.
  const ringScale = ringX.map((radiusX, depth) => {
    if (depth === 0 || radiusX <= 0) return 1;
    const radiusY = ringY[depth] ?? radiusX;
    const perimeter =
      Math.PI *
      (3 * (radiusX + radiusY) -
        Math.sqrt((3 * radiusX + radiusY) * (radiusX + 3 * radiusY)));
    const needed = (visibleByDepth.get(depth) ?? []).reduce((sum, node) => {
      const size = sizeOf(node);
      return sum + Math.hypot(size.width, size.height) + RADIAL_CLEARANCE;
    }, 0);
    return Math.max(1, needed / Math.max(perimeter, 1));
  });

  const leafCache = new Map<string, number>();
  const leafCount = (nodeId: string): number => {
    const cached = leafCache.get(nodeId);
    if (cached !== undefined) return cached;
    const node = nodeMap.get(nodeId);
    if (!node) return 1;
    const kids = visibleChildren(childrenMap, node);
    const count = kids.length
      ? kids.reduce((sum, child) => sum + leafCount(child.id), 0)
      : 1;
    leafCache.set(nodeId, count);
    return count;
  };

  let positions: PosMap = {};
  const placeAtScale = (scale: number) => {
    const next: PosMap = {};
    const place = (
      nodeId: string,
      depth: number,
      startAngle: number,
      endAngle: number
    ) => {
      const node = nodeMap.get(nodeId);
      if (!node) return;
      const own = sizeOf(node);
      const mid = (startAngle + endAngle) / 2;
      const depthScale = ringScale[depth] ?? 1;
      const centerX =
        Math.cos(mid) * (ringX[depth] ?? 0) * depthScale * scale;
      const centerY =
        Math.sin(mid) * (ringY[depth] ?? 0) * depthScale * scale;
      const pos = {
        x: centerX - own.width / 2,
        y: centerY - own.height / 2,
      };
      next[nodeId] = pos;

      const kids = visibleChildren(childrenMap, node);
      if (!kids.length) {
        if (node.data.collapsed) {
          stackHidden(childrenMap, nodeId, pos, next);
        }
        return;
      }
      const total = kids.reduce((sum, child) => sum + leafCount(child.id), 0);
      let cursor = startAngle;
      for (const child of kids) {
        const span = ((endAngle - startAngle) * leafCount(child.id)) / total;
        place(child.id, depth + 1, cursor, cursor + span);
        cursor += span;
      }
    };
    place(root.id, 0, 0, Math.PI * 2);
    return next;
  };

  let scale = 1;
  for (let pass = 0; pass < RADIAL_MAX_PASSES; pass += 1) {
    positions = placeAtScale(scale);
    if (!hasOverlap(visible, positions)) break;
    // Expand the entire set of rings rather than nudging individual cards;
    // branch order and radial symmetry stay intact while collisions disappear.
    scale *= 1.14;
  }

  return applyPositions(nodes, positions, root.id);
}

// Normalize so the root sits near the origin and write positions back.
function applyPositions(
  nodes: MindMapNode[],
  positions: PosMap,
  rootId: string
): MindMapNode[] {
  const rootPos = positions[rootId] ?? { x: 0, y: 0 };
  return nodes.map((node) => {
    const pos = positions[node.id];
    if (!pos) return node;
    return {
      ...node,
      position: { x: pos.x - rootPos.x, y: pos.y - rootPos.y },
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

// Resolve the layout fn by an own-property lookup only, falling back to the
// default tree. Guards against a bad mode (e.g. an unvalidated value or a
// prototype-chain name like "toString") ever producing `undefined(nodes)`.
function layoutFn(mode: LayoutMode) {
  return Object.prototype.hasOwnProperty.call(LAYOUT_FNS, mode)
    ? LAYOUT_FNS[mode]
    : layoutRightTree;
}

export function runLayout(
  nodes: MindMapNode[],
  mode: LayoutMode
): MindMapNode[] {
  return layoutFn(mode)(nodes);
}

// Lay out only a subtree, anchored at the subtree root's current position.
export function runSubtreeLayout(
  nodes: MindMapNode[],
  rootId: string,
  mode: LayoutMode
): MindMapNode[] {
  const subtreeRoot = nodes.find((node) => node.id === rootId);
  if (!subtreeRoot) return nodes;
  const anchor = subtreeRoot.position;
  const laidOut = layoutFn(mode)(nodes, rootId);
  const laidMap = new Map(laidOut.map((node) => [node.id, node]));
  const childrenMap = getChildrenMap(nodes);
  const subtreeIds = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    if (subtreeIds.has(id)) continue;
    subtreeIds.add(id);
    for (const child of childrenMap.get(id) ?? []) stack.push(child.id);
  }
  return nodes.map((node) => {
    if (!subtreeIds.has(node.id)) return node;
    const laid = laidMap.get(node.id);
    if (!laid) return node;
    return {
      ...node,
      position: {
        x: anchor.x + laid.position.x,
        y: anchor.y + laid.position.y,
      },
    };
  });
}
