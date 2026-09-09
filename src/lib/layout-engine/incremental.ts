import { boundsOf, center, distance, inflate, overlaps } from "./geometry";
import { subtree, type Graph } from "./graph";
import { seedLayout } from "./seed-layouts";
import { SpatialIndex } from "./spatial-index";
import {
  Budget,
  type EngineNode,
  type LayoutDiagnostic,
  type LayoutInput,
  type Point,
  type Work,
} from "./types";

export interface Placement {
  nodes: EngineNode[];
  affected: Set<number>;
  fixed: Set<number>;
  diagnostics: LayoutDiagnostic[];
  passes: number;
}
export function* collisionPairs(
  ns: readonly EngineNode[],
  g: Graph,
  limit = 4096,
): Work<[number, number][]> {
  // Sweep independent of the solver's mutable grid, including outside nodes.
  const order = g.preorder
      .filter((i) => !g.hidden.has(i))
      .sort((a, b) => ns[a].x - ns[b].x || a - b),
    pairs: [number, number][] = [];
  let checks = 0;
  for (let a = 0; a < order.length; a++)
    for (let b = a + 1; b < order.length; b++) {
      const i = order[a],
        j = order[b];
      if (ns[j].x >= ns[i].x + ns[i].width) break;
      if (overlaps(ns[i], ns[j])) {
        pairs.push([i, j]);
        if (pairs.length >= limit) return pairs;
      }
      if ((++checks & 255) === 0) yield;
    }
  return pairs;
}

export function* countCollisions(
  ns: readonly EngineNode[],
  g: Graph,
): Work<number> {
  const order = g.preorder
    .filter((i) => !g.hidden.has(i))
    .sort((a, b) => ns[a].x - ns[b].x || a - b);
  let count = 0,
    checks = 0;
  for (let a = 0; a < order.length; a++)
    for (let b = a + 1; b < order.length; b++) {
      const i = order[a],
        j = order[b];
      if (ns[j].x >= ns[i].x + ns[i].width) break;
      if (overlaps(ns[i], ns[j])) count++;
      if ((++checks & 255) === 0) yield;
    }
  return count;
}
export function* solvePositions(
  input: LayoutInput,
  g: Graph,
  budget: Budget,
): Work<Placement> {
  const original = input.nodes,
    ns = original.map((n) => ({ ...n })),
    affected = new Set<number>(),
    fixed = new Set<number>(),
    diagnostics: LayoutDiagnostic[] = [];
  const root =
    input.strategy === "subtree" ? g.byId.get(input.subtreeRootId!)! : g.root;
  for (const id of input.fixedNodeIds) {
    const i = g.byId.get(id);
    if (i !== undefined) fixed.add(i);
  }
  if (root >= 0) fixed.add(root);
  const scope = new Set(
    input.strategy === "subtree" ? subtree(g, root) : g.preorder,
  );
  for (let i = 0; i < ns.length; i++) if (!scope.has(i)) fixed.add(i);
  const boundary = new Set<number>();
  for (const id of input.expansionBoundaryIds) {
    const i = g.byId.get(id);
    if (i !== undefined) for (const j of subtree(g, i)) boundary.add(j);
  }
  const canMove = (i: number) =>
    !fixed.has(i) && scope.has(i) && (!boundary.size || boundary.has(i));
  const addBranch = (i: number) => {
    for (const j of subtree(g, i)) {
      if (canMove(j) && affected.size < input.options.maxInfluenceNodes)
        affected.add(j);
    }
  };
  const changed = new Set(
    input.changedNodeIds
      .map((id) => g.byId.get(id))
      .filter((i): i is number => i !== undefined),
  );
  if (!input.routingOnly) {
    if (input.strategy !== "incremental") {
      for (const i of scope) if (canMove(i)) affected.add(i);
      const seed = yield* seedLayout(ns, g, root, input.mode, budget);
      for (const [i, p] of seed) if (canMove(i)) ns[i] = { ...ns[i], ...p };
    } else {
      for (const i of changed) if (i !== g.root) addBranch(i);
      // Only siblings adjacent to a changed/removed rectangle enter the first
      // influence set. Reading the complete scene does not grant movement.
      const regions = [
        ...input.previousObstacleRects,
        ...[...changed].map((i) => original[i]),
      ].map((r) => inflate(r, input.options.nodeGap * 2));
      for (const id of input.affectedParentIds) {
        const p = g.byId.get(id);
        if (p === undefined) continue;
        for (const c of g.children[p])
          if (regions.some((r) => overlaps(r, original[c]))) addBranch(c);
      }
    }
  }
  // A fixed hidden descendant also protects its collapsed ancestor. Moving
  // the latter would violate the required relative-position invariant.
  for (const i of fixed) {
    const owner = g.collapsedOwner[i];
    if (owner >= 0) {
      fixed.add(owner);
      affected.delete(owner);
      ns[owner] = { ...original[owner] };
    }
  }
  const index = new SpatialIndex<EngineNode & { index: number }>();
  for (const i of g.preorder)
    if (!g.hidden.has(i)) index.set(ns[i].id, { ...ns[i], index: i });
  const startBounds = boundsOf(original.filter((_, i) => !g.hidden.has(i)));
  const modeAllows = (i: number, p: Point): boolean => {
    if (input.mode === "radial" && input.strategy === "incremental") {
      const c = center(original[g.root]),
        a = center(original[i]),
        b = center({ ...ns[i], ...p });
      const da = { x: a.x - c.x, y: a.y - c.y },
        db = { x: b.x - c.x, y: b.y - c.y };
      return (
        da.x * db.x + da.y * db.y >= 0 &&
        Math.abs(da.x * db.y - da.y * db.x) <=
          Math.max(1, Math.hypot(da.x, da.y) * Math.hypot(db.x, db.y) * 0.12)
      );
    }
    if (input.mode === "bidirectional" && input.strategy === "incremental") {
      const c = center(original[g.root]).x,
        old = center(original[i]).x - c,
        next = p.x + ns[i].width / 2 - c;
      return Math.abs(old) < 1 || old * next >= 0;
    }
    return true;
  };
  const valid = function* (group: number[], delta: Point): Work<boolean> {
    const members = new Set(group);
    for (const i of group) {
      const p = { ...ns[i], x: ns[i].x + delta.x, y: ns[i].y + delta.y };
      if (
        !canMove(i) ||
        !modeAllows(i, p) ||
        Math.max(Math.abs(p.x), Math.abs(p.y)) >
          input.options.maxCoordinateAbs ||
        distance(original[i], p) > input.options.maxDisplacement
      )
        return false;
      if (
        startBounds &&
        (p.x < startBounds.x - input.options.maxAddedExtent ||
          p.y < startBounds.y - input.options.maxAddedExtent ||
          p.x + p.width >
            startBounds.x + startBounds.width + input.options.maxAddedExtent ||
          p.y + p.height >
            startBounds.y + startBounds.height + input.options.maxAddedExtent)
      )
        return false;
      if (!g.hidden.has(i))
        for (const obstacle of index.query(
          inflate(p, input.options.nodeGap / 2),
        )) {
          if (!budget.check()) return false;
          if (
            !members.has(obstacle.index) &&
            overlaps(inflate(p, input.options.nodeGap / 2), obstacle)
          )
            return false;
          if ((budget.checks & 127) === 0) yield;
        }
    }
    return true;
  };
  const move = (group: number[], delta: Point) => {
    for (const i of group) {
      ns[i] = { ...ns[i], x: ns[i].x + delta.x, y: ns[i].y + delta.y };
      if (!g.hidden.has(i)) index.set(ns[i].id, { ...ns[i], index: i });
    }
  };
  let passes = 0;
  if (!input.routingOnly)
    for (; passes < input.options.maxPasses && !budget.reason; passes++) {
      const pairs = yield* collisionPairs(ns, g);
      if (!pairs.length) break;
      let progress = false;
      for (const [a, b] of pairs) {
        if (!overlaps(ns[a], ns[b])) continue;
        if (input.strategy === "incremental") {
          if (affected.has(a) && !affected.has(b) && canMove(b)) addBranch(b);
          if (affected.has(b) && !affected.has(a) && canMove(a)) addBranch(a);
        }
        const choices = [a, b]
          .filter((i) => affected.has(i) && canMove(i))
          .sort(
            (i, j) =>
              g.depth[j] - g.depth[i] ||
              Number(changed.has(j)) - Number(changed.has(i)) ||
              j - i,
          );
        let solved = false;
        for (const i of choices) {
          const j = i === a ? b : a,
            branch = subtree(g, i).filter((k) => !g.hidden.has(k));
          const groups = branch.every((k) => affected.has(k) && canMove(k))
            ? [branch, [i]]
            : [[i]];
          const gap = input.options.nodeGap;
          const candidates: Point[] = [
            { x: 0, y: ns[j].y + ns[j].height + gap - ns[i].y },
            { x: 0, y: ns[j].y - ns[i].height - gap - ns[i].y },
            { x: ns[j].x + ns[j].width + gap - ns[i].x, y: 0 },
            { x: ns[j].x - ns[i].width - gap - ns[i].x, y: 0 },
          ];
          // Additional nearby obstacle boundaries let a branch step over a dense
          // sibling group in one accepted move instead of oscillating pairwise.
          for (const o of index
            .query(inflate(ns[i], Math.max(ns[i].width, ns[i].height) * 3))
            .slice(0, 64)) {
            candidates.push(
              { x: 0, y: o.y + o.height + gap - ns[i].y },
              { x: 0, y: o.y - ns[i].height - gap - ns[i].y },
              { x: o.x + o.width + gap - ns[i].x, y: 0 },
              { x: o.x - ns[i].width - gap - ns[i].x, y: 0 },
            );
          }
          if (input.mode === "radial" && input.strategy === "incremental") {
            const c = center(ns[g.root]),
              p = center(ns[i]),
              len = Math.max(1, distance(c, p));
            for (const d of [
              gap + ns[i].height,
              gap + ns[i].width,
              2 * (gap + ns[i].width),
              4 * (gap + ns[i].width),
            ])
              candidates.push({
                x: ((p.x - c.x) / len) * d,
                y: ((p.y - c.y) / len) * d,
              });
          }
          candidates.sort((u, v) => {
            const penalty = (p: Point) =>
              input.mode === "vertical" ? (p.y ? 0.3 : 0) : p.x ? 0.3 : 0;
            return (
              Math.hypot(u.x, u.y) * (1 + penalty(u)) -
                Math.hypot(v.x, v.y) * (1 + penalty(v)) ||
              u.y - v.y ||
              u.x - v.x
            );
          });
          for (const group of groups) {
            for (const delta of candidates) {
              if (!budget.check()) break;
              if (yield* valid(group, delta)) {
                move(group, delta);
                progress = true;
                solved = true;
                break;
              }
              yield;
            }
            if (solved || budget.reason) break;
          }
          if (solved || budget.reason) break;
        }
        if (budget.reason) break;
      }
      if (!progress) break;
      yield;
    }
  // Return toward the original position after a necessary displacement, only
  // if the complete branch remains clear. No unrelated global compaction.
  if (
    !input.routingOnly &&
    input.strategy === "incremental" &&
    !budget.reason
  ) {
    for (const i of affected) {
      if (fixed.has(i) || g.hidden.has(i)) continue;
      const delta = { x: original[i].x - ns[i].x, y: original[i].y - ns[i].y };
      if (delta.x || delta.y) {
        const group = subtree(g, i).filter(
          (j) => affected.has(j) && !fixed.has(j),
        );
        for (const t of [1, 0.5, 0.25]) {
          const d = { x: delta.x * t, y: delta.y * t };
          if (yield* valid(group, d)) {
            move(group, d);
            break;
          }
        }
      }
    }
    if (input.compact)
      for (const id of input.affectedParentIds) {
        const p = g.byId.get(id);
        if (p === undefined) continue;
        const kids = g.children[p].filter((i) => !g.hidden.has(i));
        for (let k = 1; k < kids.length; k++) {
          const i = kids[k],
            prev = kids[k - 1];
          if (!affected.has(i)) continue;
          const group = subtree(g, i);
          if (!group.every((j) => canMove(j) && affected.has(j))) continue;
          const delta =
            input.mode === "vertical"
              ? {
                  x:
                    ns[prev].x +
                    ns[prev].width +
                    input.options.nodeGap -
                    ns[i].x,
                  y: 0,
                }
              : {
                  x: 0,
                  y:
                    ns[prev].y +
                    ns[prev].height +
                    input.options.nodeGap -
                    ns[i].y,
                };
          if (
            input.mode !== "radial" &&
            (input.mode === "vertical" ? delta.x < 0 : delta.y < 0) &&
            (yield* valid(group, delta))
          )
            move(group, delta);
        }
      }
  }
  // Translate structurally hidden descendants exactly once, by the outer
  // collapsed boundary's delta. Display/focus flags never enter this graph.
  for (const i of g.hidden) {
    const owner = g.collapsedOwner[i];
    if (owner < 0 || fixed.has(i)) continue;
    const dx = ns[owner].x - original[owner].x,
      dy = ns[owner].y - original[owner].y;
    if (dx || dy) {
      ns[i] = { ...ns[i], x: original[i].x + dx, y: original[i].y + dy };
      affected.add(i);
    }
    if ((i & 127) === 0) yield;
  }
  const after = yield* collisionPairs(ns, g);
  const before = after.length
    ? yield* collisionPairs(original, g, after.length + 1)
    : [];
  const outOfRange = ns.some(
    (n, i) =>
      !Number.isFinite(n.x) ||
      !Number.isFinite(n.y) ||
      Math.max(Math.abs(n.x), Math.abs(n.y)) > input.options.maxCoordinateAbs ||
      distance(n, original[i]) > input.options.maxDisplacement ||
      (!!startBounds &&
        !g.hidden.has(i) &&
        (n.x < startBounds.x - input.options.maxAddedExtent ||
          n.y < startBounds.y - input.options.maxAddedExtent ||
          n.x + n.width >
            startBounds.x + startBounds.width + input.options.maxAddedExtent ||
          n.y + n.height >
            startBounds.y + startBounds.height + input.options.maxAddedExtent)),
  );
  if (outOfRange) {
    for (let i = 0; i < ns.length; i++) ns[i] = { ...original[i] };
    budget.reason = "search-limit";
    diagnostics.push({
      code: "LIMIT_REACHED",
      nodeIds: [],
      edgeIds: [],
      severity: "warning",
      message:
        "Seed exceeds displacement or coordinate limit; original positions preserved",
    });
  }

  if (after.length > before.length) {
    for (let i = 0; i < ns.length; i++) ns[i] = { ...original[i] };
    diagnostics.push({
      code: "ROLLBACK",
      nodeIds: [],
      edgeIds: [],
      severity: "warning",
      message: "Candidate worsened existing overlaps; positions preserved",
    });
  }
  for (const [a, b] of yield* collisionPairs(ns, g)) {
    const hard = fixed.has(a) && fixed.has(b);
    diagnostics.push({
      code: hard ? "FIXED_OVERLAP" : "UNRESOLVED_OVERLAP",
      nodeIds: [ns[a].id, ns[b].id],
      edgeIds: [],
      severity: hard ? "error" : "warning",
      message: hard
        ? "Fixed rectangles overlap"
        : "Overlap remains within movement/search limits",
    });
  }
  return { nodes: ns, affected, fixed, diagnostics, passes };
}
