import { center } from "./geometry";
import { subtree, visibleChildren, type Graph } from "./graph";
import {
  Budget,
  type EngineNode,
  type LayoutMode,
  type Point,
  type Work,
} from "./types";

type Slice = { low: number; high: number; min: number; max: number };
type Contour = { slices: Map<number, Slice>; offset: number };
// A contour retains occupied level intervals, not the bounding box of a whole
// subtree. Single-child chains share their contour: no quadratic chain copies.
export function* seedLayout(
  ns: readonly EngineNode[],
  g: Graph,
  root: number,
  mode: LayoutMode,
  budget: Budget,
): Work<Map<number, Point>> {
  const ids = subtree(g, root).filter((i) => !g.hidden.has(i)),
    positions = new Map<number, Point>();
  if (!ids.length) return positions;
  const anchor = ns[root],
    vertical = mode === "vertical";
  const leaves = new Map<number, number>();
  for (let k = ids.length - 1; k >= 0; k--) {
    const i = ids[k],
      kids = visibleChildren(g, ns, i);
    leaves.set(
      i,
      kids.length ? kids.reduce((s, c) => s + (leaves.get(c) ?? 1), 0) : 1,
    );
    if ((k & 127) === 0) yield;
  }
  if (mode === "radial") return yield* radial(ns, g, root, ids, leaves, budget);
  const levelWidths: number[] = [],
    levelHeights: number[] = [];
  for (const i of ids) {
    const d = g.depth[i] - g.depth[root];
    levelWidths[d] = Math.max(levelWidths[d] ?? 0, ns[i].width);
    levelHeights[d] = Math.max(levelHeights[d] ?? 0, ns[i].height);
  }
  const offsets = [0];
  for (let d = 1; d < levelWidths.length; d++)
    offsets[d] =
      offsets[d - 1] +
      (vertical ? levelHeights[d - 1] : levelWidths[d - 1]) +
      budget.options.levelGap;
  const topKids = visibleChildren(g, ns, root),
    directions = new Map<number, 1 | -1>();
  let left = 0,
    right = 0;
  for (const c of topKids) {
    let dir: 1 | -1 = 1;
    if (mode === "bidirectional") {
      dir =
        ns[c].side === "left"
          ? -1
          : ns[c].side === "right"
            ? 1
            : right <= left
              ? 1
              : -1;
      if (dir === 1) right += leaves.get(c)!;
      else left += leaves.get(c)!;
    }
    for (const i of subtree(g, c)) directions.set(i, dir);
  }
  const contours = new Map<number, Contour>(),
    shifts = new Map<number, number>();
  // Process each side separately at the root; descendants retain stable order.
  const assemble = function* (kids: number[]): Work<Contour> {
    let merged: Contour = { slices: new Map(), offset: 0 };
    let firstCenter = 0,
      lastCenter = 0;
    for (let k = 0; k < kids.length; k++) {
      const child = kids[k],
        c = contours.get(child)!;
      let shift = 0;
      if (k) {
        // Same global level has disjoint longitudinal bounds from all other
        // levels. Compare actual occupied rectangles within those intervals.
        shift = -Infinity;
        for (const [d, s] of c.slices) {
          const m = merged.slices.get(d);
          if (m && s.high > m.low && m.high > s.low)
            shift = Math.max(
              shift,
              m.max + merged.offset + budget.options.nodeGap - s.min - c.offset,
            );
          if (!budget.check()) break;
          if ((budget.checks & 127) === 0) yield;
        }
        if (!Number.isFinite(shift)) shift = 0;
      }
      shifts.set(child, shift);
      if (!k) firstCenter = shift;
      lastCenter = shift;
      if (!k) {
        merged = c;
        merged.offset += shift;
      } else
        for (const [d, s] of c.slices) {
          const min = s.min + c.offset + shift - merged.offset,
            max = s.max + c.offset + shift - merged.offset,
            m = merged.slices.get(d);
          if (m) {
            m.min = Math.min(m.min, min);
            m.max = Math.max(m.max, max);
            m.low = Math.min(m.low, s.low);
            m.high = Math.max(m.high, s.high);
          } else merged.slices.set(d, { ...s, min, max });
          if ((d & 127) === 0) yield;
        }
      if (budget.reason) break;
    }
    const mid = (firstCenter + lastCenter) / 2;
    for (const child of kids) shifts.set(child, (shifts.get(child) ?? 0) - mid);
    merged.offset -= mid;
    return merged;
  };
  for (let k = ids.length - 1; k >= 0; k--) {
    const i = ids[k];
    if (i === root && mode === "bidirectional") continue;
    const kids = visibleChildren(g, ns, i),
      c = yield* assemble(kids),
      d = g.depth[i] - g.depth[root];
    const transverse = vertical ? ns[i].width : ns[i].height,
      long = vertical ? ns[i].height : ns[i].width;
    c.slices.set(d, {
      low: offsets[d],
      high: offsets[d] + long,
      min: -transverse / 2 - c.offset,
      max: transverse / 2 - c.offset,
    });
    contours.set(i, c);
    yield;
  }
  if (mode === "bidirectional") {
    yield* assemble(topKids.filter((i) => directions.get(i) === 1));
    yield* assemble(topKids.filter((i) => directions.get(i) === -1));
  }
  const cross = new Map<number, number>([[root, 0]]);
  for (const i of ids) {
    const d = g.depth[i] - g.depth[root],
      t = i === root ? 0 : (cross.get(g.parent[i]) ?? 0) + (shifts.get(i) ?? 0);
    cross.set(i, t);
    const dir = directions.get(i) ?? 1;
    positions.set(
      i,
      vertical
        ? {
            x: anchor.x + anchor.width / 2 + t - ns[i].width / 2,
            y: anchor.y + offsets[d],
          }
        : {
            x:
              dir === 1
                ? anchor.x + offsets[d]
                : anchor.x + anchor.width - offsets[d] - ns[i].width,
            y: anchor.y + anchor.height / 2 + t - ns[i].height / 2,
          },
    );
    if ((d & 127) === 0) yield;
  }
  positions.set(root, { x: anchor.x, y: anchor.y });
  return positions;
}

function interval(
  k: number,
  fixed: number,
  clearance: number,
): [number, number] | null {
  if (Math.abs(k) < 1e-9)
    return Math.abs(fixed) < clearance ? [-Infinity, Infinity] : null;
  const a = (fixed - clearance) / k,
    b = (fixed + clearance) / k;
  return [Math.min(a, b), Math.max(a, b)];
}
// Radial seed. Angles are allocated so that:
//  - a node's angular width reflects its REAL extent along the ring — a wide
//    card needs far more angle at north/south than at east/west;
//  - children cluster around their parent's angle instead of being smeared
//    across the parent's whole wedge (which sent a heavy branch's children
//    around to the far side of the map on long, backward-pointing edges);
//  - top-level branches get even gaps, so leaf-only branches aren't crushed;
//  - branches read clockwise from 12 o'clock.
// Final radii still go through the pairwise/interval collision pass below,
// so the no-overlap guarantee does not depend on the allocation heuristics.
const RING_GAP = 40; // radial breathing room between consecutive rings
const ARC_GAP = 18; // tangential gap between neighbours on a ring
const PAIR_CLEARANCE = 12.25; // hard clearance enforced by the collision pass
const FILL = Math.PI * 2 * 0.94; // max share of a ring the allocation may use
function* radial(
  ns: readonly EngineNode[],
  g: Graph,
  root: number,
  ids: number[],
  leaves: Map<number, number>,
  budget: Budget,
): Work<Map<number, Point>> {
  const depth = (i: number) => g.depth[i] - g.depth[root];
  const rings: number[][] = [],
    ws: number[] = [],
    hs: number[] = [],
    kids = new Map<number, number[]>();
  for (const i of ids) {
    const d = depth(i);
    (rings[d] ??= []).push(i);
    ws[d] = Math.max(ws[d] ?? 0, ns[i].width);
    hs[d] = Math.max(hs[d] ?? 0, ns[i].height);
    kids.set(i, visibleChildren(g, ns, i));
  }
  const deepest = rings.length - 1;
  // Planned ellipse radii per ring: same increments/aspect clamp the
  // collision pass uses, so planning and resolution agree.
  const incX = (d: number) => (ws[d - 1] + ws[d]) / 2 + RING_GAP,
    incY = (d: number) => (hs[d - 1] + hs[d]) / 2 + RING_GAP;
  const px = [0],
    py = [0];
  const plan = (from: number) => {
    for (let d = Math.max(1, from); d <= deepest; d++) {
      let bx = Math.max(px[d] ?? 0, px[d - 1] + incX(d)),
        by = Math.max(py[d] ?? 0, py[d - 1] + incY(d));
      if (bx / by > 2.2) by = bx / 2.2;
      if (bx / by < 1.15) bx = by * 1.15;
      px[d] = bx;
      py[d] = by;
    }
  };
  plan(1);
  // Angular width of node i at angle t on ring d. Moving dθ along the ellipse
  // shifts a center by (tx, ty)·dθ; neighbours are clear once separated on
  // EITHER axis (the same rule the collision pass enforces), so the angle a
  // node needs is the smaller of the x- and y-separation angles. A wide card
  // is thus cheap at east/west (stacks vertically) and costly at north/south.
  const arc = (i: number, t: number, d: number) => {
    const tx = Math.abs(px[d] * Math.sin(t)),
      ty = Math.abs(py[d] * Math.cos(t));
    return Math.min(
      tx > 1e-9 ? (ns[i].width + ARC_GAP) / tx : Infinity,
      ty > 1e-9 ? (ns[i].height + ARC_GAP) / ty : Infinity,
    );
  };
  // Initial angles: leaf-weighted, used only to evaluate `arc` on pass one.
  const angle = new Map<number, number>([[root, 0]]);
  {
    const stack: [number, number, number][] = [[root, -Math.PI / 2, Math.PI * 1.5]];
    while (stack.length) {
      const [i, a, b] = stack.pop()!;
      angle.set(i, (a + b) / 2);
      const ks = kids.get(i)!,
        total = ks.reduce((s, c) => s + leaves.get(c)!, 0);
      let cursor = a;
      for (const c of ks) {
        const span = ((b - a) * leaves.get(c)!) / total;
        stack.push([c, cursor, cursor + span]);
        cursor += span;
      }
    }
    yield;
  }
  const need = new Map<number, number>();
  const measure = function* () {
    for (let k = ids.length - 1; k >= 0; k--) {
      const i = ids[k];
      const own = i === root ? 0 : arc(i, angle.get(i)!, depth(i));
      const sum = kids.get(i)!.reduce((s, c) => s + need.get(c)!, 0);
      need.set(i, Math.max(own, sum));
      if ((k & 127) === 0) yield;
    }
  };
  const allocate = function* () {
    const top = kids.get(root)!;
    if (!top.length) return;
    const S = top.reduce((s, c) => s + need.get(c)!, 0),
      gap = Math.max(0, Math.PI * 2 - S) / top.length; // even branch gaps
    // One branch: east. Otherwise the first wedge starts at 12 o'clock and
    // branches continue clockwise (y grows downward).
    let cursor =
      top.length === 1 ? -(need.get(top[0])! + gap) / 2 : -Math.PI / 2;
    const stack: [number, number, number][] = [];
    for (const c of top) {
      const w = need.get(c)! + gap;
      stack.push([c, cursor, cursor + w]);
      cursor += w;
    }
    while (stack.length) {
      const [i, a, b] = stack.pop()!;
      if (i !== root && depth(i) === 1) angle.set(i, (a + b) / 2);
      const ks = kids.get(i)!;
      if (!ks.length) continue;
      const S2 = ks.reduce((s, c) => s + need.get(c)!, 0);
      // Cluster children around the parent's own angle; allow a little
      // breathing room but never the whole wedge.
      const extra = Math.min(Math.max(0, b - a - S2), S2 * 0.35),
        T = S2 + extra;
      let c0 = angle.get(i)! - T / 2;
      c0 = Math.min(Math.max(c0, a), b - T);
      for (const c of ks) {
        const w = need.get(c)! + (S2 > 0 ? (extra * need.get(c)!) / S2 : 0);
        angle.set(c, c0 + w / 2);
        stack.push([c, c0, c0 + w]);
        c0 += w;
      }
      if (!budget.check()) return;
      if ((budget.checks & 127) === 0) yield;
    }
  };
  for (let pass = 0; pass < 6; pass++) {
    yield* measure();
    // Grow only the rings that are genuinely too crowded, innermost first.
    let grew = false;
    for (let d = 1; d <= deepest; d++) {
      const T = rings[d].reduce((s, i) => s + arc(i, angle.get(i)!, d), 0);
      if (T > FILL) {
        const f = T / FILL;
        px[d] *= f;
        py[d] *= f;
        plan(d + 1);
        grew = true;
      }
    }
    if (grew) yield* measure();
    // Nesting can still overflow (a subtree needs its full width at every
    // depth); fall back to a uniform scale of the outer rings.
    const total = kids.get(root)!.reduce((s, c) => s + need.get(c)!, 0);
    if (total > FILL) {
      const f = total / FILL;
      for (let d = 1; d <= deepest; d++) {
        px[d] *= f;
        py[d] *= f;
      }
      yield* measure();
    }
    yield* allocate();
    if (budget.reason) return new Map();
  }
  // Collision pass: push each ring outward until no pair in it — and nothing
  // from an inner ring — overlaps. Starts from the planned radii.
  const centers = new Map<number, Point>([[root, { x: 0, y: 0 }]]),
    rx = [0],
    ry = [0];
  for (let d = 1; d < rings.length; d++) {
    let bx = Math.max(px[d], rx[d - 1] + incX(d)),
      by = Math.max(py[d], ry[d - 1] + incY(d));
    if (bx / by > 2.2) by = bx / 2.2;
    if (bx / by < 1.15) bx = by * 1.15;
    let scale = 1;
    const group = rings[d];
    for (let a = 0; a < group.length; a++)
      for (let b = a + 1; b < group.length; b++) {
        if (!budget.check()) return new Map();
        const i = group[a],
          j = group[b];
        const dx =
            bx * Math.abs(Math.cos(angle.get(i)!) - Math.cos(angle.get(j)!)),
          dy =
            by * Math.abs(Math.sin(angle.get(i)!) - Math.sin(angle.get(j)!));
        scale = Math.max(
          scale,
          Math.min(
            dx > 1e-9
              ? ((ns[i].width + ns[j].width) / 2 + PAIR_CLEARANCE) / dx
              : Infinity,
            dy > 1e-9
              ? ((ns[i].height + ns[j].height) / 2 + PAIR_CLEARANCE) / dy
              : Infinity,
          ),
        );
        if ((budget.checks & 127) === 0) yield;
      }
    const intervals: [number, number][] = [];
    for (const i of group)
      for (const [j, p] of centers) {
        if (!budget.check()) return new Map();
        const x = interval(
            bx * Math.cos(angle.get(i)!),
            p.x,
            (ns[i].width + ns[j].width) / 2 + PAIR_CLEARANCE,
          ),
          y = interval(
            by * Math.sin(angle.get(i)!),
            p.y,
            (ns[i].height + ns[j].height) / 2 + PAIR_CLEARANCE,
          );
        if (x && y) {
          const start = Math.max(x[0], y[0], 0),
            end = Math.min(x[1], y[1]);
          if (start < end && end >= scale) intervals.push([start, end]);
        }
        if ((budget.checks & 127) === 0) yield;
      }
    intervals.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (const [a, b] of intervals) {
      if (b <= scale) continue;
      if (a >= scale) break;
      scale = b + 1e-6;
    }
    rx[d] = bx * scale;
    ry[d] = by * scale;
    for (const i of group)
      centers.set(i, {
        x: Math.cos(angle.get(i)!) * rx[d],
        y: Math.sin(angle.get(i)!) * ry[d],
      });
  }
  const c = center(ns[root]),
    out = new Map<number, Point>();
  for (const [i, p] of centers)
    out.set(i, {
      x: c.x + p.x - ns[i].width / 2,
      y: c.y + p.y - ns[i].height / 2,
    });
  return out;
}
