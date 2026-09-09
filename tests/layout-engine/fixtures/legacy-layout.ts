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
const RADIAL_CLEARANCE = 12;
const RADIAL_LEVEL_GAP = 16;
const RADIAL_MAX_ASPECT = 2.2;
const RADIAL_MIN_ASPECT = 1.15;
const RADIAL_PIXEL_EPSILON = 0.25;
const RADIAL_SCALE_EPSILON = 1e-6;

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
  const seen = new Set<string>([nodeId]);
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur.id)) continue;
    seen.add(cur.id);
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
type RadialMeta = { depth: number; angle: number };
type Interval = { start: number; end: number };

// Return the scale interval where one axis overlaps a fixed inner card. The
// current ring's center coordinate is `coefficient * scale`.
function overlapInterval(
  coefficient: number,
  fixedCenter: number,
  clearance: number
): Interval | null {
  if (Math.abs(coefficient) < 1e-9) {
    return Math.abs(fixedCenter) < clearance
      ? { start: Number.NEGATIVE_INFINITY, end: Number.POSITIVE_INFINITY }
      : null;
  }
  const first = (fixedCenter - clearance) / coefficient;
  const second = (fixedCenter + clearance) / coefficient;
  return {
    start: Math.min(first, second),
    end: Math.max(first, second),
  };
}

// Pick the nearest scale not covered by any collision interval. This resolves
// every inner-ring collision in one deterministic pass instead of repeatedly
// inflating the whole map by a percentage.
function firstAvailableScale(minScale: number, intervals: Interval[]): number {
  intervals.sort((a, b) => a.start - b.start || a.end - b.end);
  let scale = minScale;
  for (const interval of intervals) {
    if (interval.end <= scale) continue;
    if (interval.start >= scale) break;
    scale = interval.end + RADIAL_SCALE_EPSILON;
  }
  return scale;
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

  const leafCache = new Map<string, number>();
  const leafInProgress = new Set<string>();
  const leafCount = (nodeId: string): number => {
    const cached = leafCache.get(nodeId);
    if (cached !== undefined) return cached;
    if (leafInProgress.has(nodeId)) return 1;
    const node = nodeMap.get(nodeId);
    if (!node) return 1;
    leafInProgress.add(nodeId);
    const kids = visibleChildren(childrenMap, node);
    const count = kids.length
      ? kids.reduce((sum, child) => sum + leafCount(child.id), 0)
      : 1;
    leafInProgress.delete(nodeId);
    leafCache.set(nodeId, count);
    return count;
  };

  // Keep the existing leaf-weighted branch order, but separate angle
  // assignment from radius sizing so each depth can be fitted independently.
  const radialMeta = new Map<string, RadialMeta>();
  const angleAssigned = new Set<string>();
  const assignAngles = (
    nodeId: string,
    depth: number,
    startAngle: number,
    endAngle: number
  ) => {
    const node = nodeMap.get(nodeId);
    if (!node || angleAssigned.has(nodeId)) return;
    angleAssigned.add(nodeId);
    radialMeta.set(nodeId, {
      depth,
      angle: (startAngle + endAngle) / 2,
    });
    const kids = visibleChildren(childrenMap, node);
    if (!kids.length) return;
    const total = kids.reduce((sum, child) => sum + leafCount(child.id), 0);
    let cursor = startAngle;
    for (const child of kids) {
      const span = ((endAngle - startAngle) * leafCount(child.id)) / total;
      assignAngles(child.id, depth + 1, cursor, cursor + span);
      cursor += span;
    }
  };
  assignAngles(root.id, 0, 0, Math.PI * 2);

  const ringX = [0];
  const ringY = [0];
  const centers = new Map<string, Point>([[root.id, { x: 0, y: 0 }]]);

  // Solve rings from the inside out. Nodes on the same ring have centers that
  // scale linearly from the origin, so the exact AABB clearance for each pair
  // is `min(requiredX / deltaX, requiredY / deltaY)`. Only the larger of those
  // pair requirements is needed for the complete ring.
  for (let depth = 1; depth < widths.length; depth += 1) {
    let baseX =
      ringX[depth - 1] +
      ((widths[depth - 1] ?? NODE_WIDTH) +
        (widths[depth] ?? NODE_WIDTH)) /
        2 +
      RADIAL_LEVEL_GAP;
    let baseY =
      ringY[depth - 1] +
      ((heights[depth - 1] ?? NODE_HEIGHT) +
        (heights[depth] ?? NODE_HEIGHT)) /
        2 +
      RADIAL_LEVEL_GAP;

    // Extremely flat ellipses make branches hard to read. These bounds keep
    // the compact result recognisably radial without reintroducing wide gaps.
    if (baseX / baseY > RADIAL_MAX_ASPECT) baseY = baseX / RADIAL_MAX_ASPECT;
    if (baseX / baseY < RADIAL_MIN_ASPECT) baseX = baseY * RADIAL_MIN_ASPECT;

    const group = visibleByDepth.get(depth) ?? [];
    let minScale = 1;
    for (let first = 0; first < group.length; first += 1) {
      const firstMeta = radialMeta.get(group[first].id);
      if (!firstMeta) continue;
      const firstSize = sizeOf(group[first]);
      for (let second = first + 1; second < group.length; second += 1) {
        const secondMeta = radialMeta.get(group[second].id);
        if (!secondMeta) continue;
        const secondSize = sizeOf(group[second]);
        const deltaX =
          baseX *
          Math.abs(Math.cos(firstMeta.angle) - Math.cos(secondMeta.angle));
        const deltaY =
          baseY *
          Math.abs(Math.sin(firstMeta.angle) - Math.sin(secondMeta.angle));
        const requiredX =
          (firstSize.width + secondSize.width) / 2 +
          RADIAL_CLEARANCE +
          RADIAL_PIXEL_EPSILON;
        const requiredY =
          (firstSize.height + secondSize.height) / 2 +
          RADIAL_CLEARANCE +
          RADIAL_PIXEL_EPSILON;
        const scaleX = deltaX > 1e-9 ? requiredX / deltaX : Infinity;
        const scaleY = deltaY > 1e-9 ? requiredY / deltaY : Infinity;
        minScale = Math.max(minScale, Math.min(scaleX, scaleY));
      }
    }

    // A ring can still cross a card on an earlier ring. Each such collision is
    // an interval of forbidden scales; skip their merged union to land at the
    // nearest collision-free radius instead of moving every ring outward.
    const intervals: Interval[] = [];
    for (const node of group) {
      const meta = radialMeta.get(node.id);
      if (!meta) continue;
      const own = sizeOf(node);
      const coefficientX = baseX * Math.cos(meta.angle);
      const coefficientY = baseY * Math.sin(meta.angle);
      for (let innerDepth = 0; innerDepth < depth; innerDepth += 1) {
        for (const inner of visibleByDepth.get(innerDepth) ?? []) {
          const innerCenter = centers.get(inner.id);
          if (!innerCenter) continue;
          const innerSize = sizeOf(inner);
          const intervalX = overlapInterval(
            coefficientX,
            innerCenter.x,
            (own.width + innerSize.width) / 2 +
              RADIAL_CLEARANCE +
              RADIAL_PIXEL_EPSILON
          );
          if (!intervalX) continue;
          const intervalY = overlapInterval(
            coefficientY,
            innerCenter.y,
            (own.height + innerSize.height) / 2 +
              RADIAL_CLEARANCE +
              RADIAL_PIXEL_EPSILON
          );
          if (!intervalY) continue;
          const start = Math.max(intervalX.start, intervalY.start, 0);
          const end = Math.min(intervalX.end, intervalY.end);
          if (start < end && end >= minScale) intervals.push({ start, end });
        }
      }
    }

    const scale = firstAvailableScale(minScale, intervals);
    ringX[depth] = baseX * scale;
    ringY[depth] = baseY * scale;
    for (const node of group) {
      const meta = radialMeta.get(node.id);
      if (!meta) continue;
      centers.set(node.id, {
        x: Math.cos(meta.angle) * ringX[depth],
        y: Math.sin(meta.angle) * ringY[depth],
      });
    }
  }

  const positions: PosMap = {};
  for (const node of visible) {
    const meta = radialMeta.get(node.id);
    if (!meta) continue;
    const own = sizeOf(node);
    const center = centers.get(node.id) ?? { x: 0, y: 0 };
    const pos = {
      x: center.x - own.width / 2,
      y: center.y - own.height / 2,
    };
    positions[node.id] = pos;
    if (node.data.collapsed) stackHidden(childrenMap, node.id, pos, positions);
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
