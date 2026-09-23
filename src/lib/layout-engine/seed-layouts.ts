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
function* radial(
  ns: readonly EngineNode[],
  g: Graph,
  root: number,
  ids: number[],
  leaves: Map<number, number>,
  budget: Budget,
): Work<Map<number, Point>> {
  const angles = new Map<number, number>(),
    rings: number[][] = [],
    ws: number[] = [],
    hs: number[] = [];
  const stack: [number, number, number][] = [[root, 0, Math.PI * 2]];
  while (stack.length) {
    const [i, a, b] = stack.pop()!,
      d = g.depth[i] - g.depth[root];
    angles.set(i, (a + b) / 2);
    (rings[d] ??= []).push(i);
    ws[d] = Math.max(ws[d] ?? 0, ns[i].width);
    hs[d] = Math.max(hs[d] ?? 0, ns[i].height);
    const kids = visibleChildren(g, ns, i),
      total = kids.reduce((s, c) => s + leaves.get(c)!, 0);
    let cursor = a;
    for (const c of kids) {
      const span = ((b - a) * leaves.get(c)!) / total;
      stack.push([c, cursor, cursor + span]);
      cursor += span;
    }
    yield;
  }
  const centers = new Map<number, Point>([[root, { x: 0, y: 0 }]]),
    rx = [0],
    ry = [0];
  for (let d = 1; d < rings.length; d++) {
    let bx = rx[d - 1] + (ws[d - 1] + ws[d]) / 2 + 16,
      by = ry[d - 1] + (hs[d - 1] + hs[d]) / 2 + 16;
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
            bx * Math.abs(Math.cos(angles.get(i)!) - Math.cos(angles.get(j)!)),
          dy =
            by * Math.abs(Math.sin(angles.get(i)!) - Math.sin(angles.get(j)!));
        scale = Math.max(
          scale,
          Math.min(
            dx > 1e-9
              ? ((ns[i].width + ns[j].width) / 2 + 12.25) / dx
              : Infinity,
            dy > 1e-9
              ? ((ns[i].height + ns[j].height) / 2 + 12.25) / dy
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
            bx * Math.cos(angles.get(i)!),
            p.x,
            (ns[i].width + ns[j].width) / 2 + 12.25,
          ),
          y = interval(
            by * Math.sin(angles.get(i)!),
            p.y,
            (ns[i].height + ns[j].height) / 2 + 12.25,
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
        x: Math.cos(angles.get(i)!) * rx[d],
        y: Math.sin(angles.get(i)!) * ry[d],
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
