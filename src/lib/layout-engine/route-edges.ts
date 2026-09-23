import {
  distance,
  flatten,
  inflate,
  lerp,
  lines,
  pointBounds,
  ribbon,
  rounded,
  segmentHitsRect,
  union,
} from "./geometry";
import { choosePorts, normals, worldPort } from "./ports";
import { SpatialIndex } from "./spatial-index";
import {
  Budget,
  type EdgeRoute,
  type EngineEdge,
  type EngineNode,
  type EnginePort,
  type LayoutInput,
  type PathSegment,
  type Point,
  type Rect,
  type Work,
} from "./types";

type SearchState = {
  x: number;
  y: number;
  dir: number;
  g: number;
  f: number;
  key: string;
  parent?: SearchState;
};
class Heap {
  a: SearchState[] = [];
  less(a: SearchState, b: SearchState) {
    return (
      a.f < b.f ||
      (a.f === b.f && (a.g < b.g || (a.g === b.g && a.key < b.key)))
    );
  }
  push(v: SearchState) {
    let i = this.a.length;
    this.a.push(v);
    while (i) {
      const p = (i - 1) >> 1;
      if (!this.less(v, this.a[p])) break;
      this.a[i] = this.a[p];
      i = p;
    }
    this.a[i] = v;
  }
  pop() {
    const out = this.a[0],
      last = this.a.pop()!;
    if (this.a.length) {
      let i = 0;
      while (i * 2 + 1 < this.a.length) {
        let c = i * 2 + 1;
        if (c + 1 < this.a.length && this.less(this.a[c + 1], this.a[c])) c++;
        if (!this.less(this.a[c], last)) break;
        this.a[i] = this.a[c];
        i = c;
      }
      this.a[i] = last;
    }
    return out;
  }
}
function simplify(ps: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of ps) {
    if (out.length && distance(out[out.length - 1], p) < 1e-8) continue;
    while (out.length >= 2) {
      const a = out[out.length - 2],
        b = out[out.length - 1];
      if (
        Math.abs((b.x - a.x) * (p.y - b.y) - (b.y - a.y) * (p.x - b.x)) > 1e-8
      )
        break;
      out.pop();
    }
    out.push(p);
  }
  return out;
}

function* routeWithPorts(
  input: LayoutInput,
  edge: EngineEdge,
  source: EngineNode,
  target: EngineNode,
  index: SpatialIndex<EngineNode>,
  budget: Budget,
  ports?: [EnginePort, EnginePort],
): Work<EdgeRoute> {
  const [sp, tp] = ports ?? choosePorts(source, target, edge, input.mode),
    start = worldPort(source, sp),
    end = worldPort(target, tp);
  const normalS = normals[sp.face],
    normalT = normals[tp.face];
  const pad =
    input.options.edgeClearance +
    Math.max(edge.halfWidth, edge.arrowHalfWidth) +
    input.options.curveTolerance;
  const exitLength = Math.max(pad + 2, edge.arrowLength + 2);
  const escapeDistance = (node: EngineNode, p: Point, n: Point) =>
    Math.max(
      exitLength,
      n.x > 0
        ? node.x + node.width + pad + 2 - p.x
        : n.x < 0
          ? p.x - node.x + pad + 2
          : n.y > 0
            ? node.y + node.height + pad + 2 - p.y
            : p.y - node.y + pad + 2,
    );
  const sourceExit = escapeDistance(source, start, normalS),
    targetExit = escapeDistance(target, end, normalT);
  const exit = {
    x: start.x + normalS.x * sourceExit,
    y: start.y + normalS.y * sourceExit,
  };
  const entry = {
    x: end.x + normalT.x * targetExit,
    y: end.y + normalT.y * targetExit,
  };
  let verified = true;
  const clearLine = (a: Point, b: Point, except?: string): boolean => {
    for (const o of index.query(inflate(pointBounds([a, b]), pad))) {
      if (!budget.check()) return false;
      if (o.id !== except && segmentHitsRect(a, b, inflate(o, pad)))
        return false;
    }
    return true;
  };
  // Only the endpoint's own normal escape segment can cross its body.
  const escapesClear =
    clearLine(start, exit, source.id) && clearLine(entry, end, target.id);
  const safe = (segments: readonly PathSegment[]): boolean => {
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i],
        f = flatten([s], input.options.curveTolerance);
      if (!f.verified) {
        verified = false;
        return false;
      }
      for (let j = 1; j < f.points.length; j++) {
        const except =
          i === 0 &&
          s.kind === "line" &&
          distance(s.from, start) < 0.01 &&
          distance(s.to, exit) < 0.01
            ? source.id
            : i === segments.length - 1 &&
                s.kind === "line" &&
                distance(s.from, entry) < 0.01 &&
                distance(s.to, end) < 0.01
              ? target.id
              : undefined;
        if (!clearLine(f.points[j - 1], f.points[j], except)) return false;
      }
    }
    return true;
  };
  let segments: PathSegment[] = [],
    status: EdgeRoute["status"] = "blocked";
  if (edge.style === "straight" && input.options.straightPolicy === "strict") {
    segments = lines([start, end]);
    const v = { x: end.x - start.x, y: end.y - start.y };
    let clear =
      v.x * normalS.x + v.y * normalS.y >= 0 &&
      v.x * normalT.x + v.y * normalT.y <= 0;
    for (const o of index.query(inflate(pointBounds([start, end]), pad))) {
      if (!budget.check()) {
        clear = false;
        break;
      }
      // A straight segment cannot leave and re-enter a convex endpoint. Its
      // direction was checked above; all other obstacles retain full padding.
      if (
        o.id !== source.id &&
        o.id !== target.id &&
        segmentHitsRect(start, end, inflate(o, pad))
      )
        clear = false;
    }
    status = clear ? "ok" : "blocked";
  } else if (escapesClear) {
    const axisGap = normalS.x
      ? Math.abs(entry.x - exit.x)
      : Math.abs(entry.y - exit.y);
    const controls = Math.max(0, Math.min(96, axisGap * 0.55));
    const cubic: PathSegment = {
      kind: "cubic",
      from: exit,
      c1: {
        x: exit.x + normalS.x * controls,
        y: exit.y + normalS.y * controls,
      },
      c2: {
        x: entry.x + normalT.x * controls,
        y: entry.y + normalT.y * controls,
      },
      to: entry,
    };
    const candidates: PathSegment[][] = [];
    if (edge.style !== "step")
      candidates.push([...lines([start, exit]), cubic, ...lines([entry, end])]);
    const midX = (exit.x + entry.x) / 2,
      midY = (exit.y + entry.y) / 2;
    const polylines = [
      [start, exit, { x: entry.x, y: exit.y }, entry, end],
      [start, exit, { x: exit.x, y: entry.y }, entry, end],
      [
        start,
        exit,
        { x: midX, y: exit.y },
        { x: midX, y: entry.y },
        entry,
        end,
      ],
      [
        start,
        exit,
        { x: exit.x, y: midY },
        { x: entry.x, y: midY },
        entry,
        end,
      ],
    ];
    // Keep endpoint stubs distinct during validation (simplifying them would
    // extend their exceptional corridor through a node's entire body).
    for (const ps of polylines) candidates.push(lines(ps));
    for (const c of candidates) {
      if (safe(c)) {
        segments = c;
        status = "ok";
        break;
      }
      yield;
    }
    if (status !== "ok" && !budget.reason) {
      const base = pointBounds([exit, entry]);
      for (const margin of [80, 320, 1280, 5120]) {
        if (margin > input.options.maxAddedExtent) break;
        const window = inflate(base, margin),
          obstacles = index.query(inflate(window, pad));
        const xs = new Set([
            exit.x,
            entry.x,
            window.x,
            window.x + window.width,
          ]),
          ys = new Set([exit.y, entry.y, window.y, window.y + window.height]);
        for (const o of obstacles) {
          const r = inflate(o, pad + 1);
          xs.add(r.x);
          xs.add(r.x + r.width);
          ys.add(r.y);
          ys.add(r.y + r.height);
        }
        const x = [...xs].sort((a, b) => a - b),
          y = [...ys].sort((a, b) => a - b);
        const ex = x.indexOf(exit.x),
          ey = y.indexOf(exit.y),
          tx = x.indexOf(entry.x),
          ty = y.indexOf(entry.y);
        const heap = new Heap(),
          cost = new Map<string, number>(),
          lineCache = new Map<string, boolean>();
        const initial: SearchState = {
          x: ex,
          y: ey,
          dir: 0,
          g: 0,
          f: distance(exit, entry),
          key: `${ex}:${ey}:0`,
        };
        heap.push(initial);
        cost.set(initial.key, 0);
        let goal: SearchState | undefined,
          expansions = 0;
        // Lazily materialized Hanan grid: four adjacent axis neighbors only.
        // Storage is capped by expansions, never all |x| * |y| intersections.
        while (
          heap.a.length &&
          expansions < input.options.maxRouteExpansions &&
          !budget.reason
        ) {
          const s = heap.pop();
          if (s.g !== cost.get(s.key)) continue;
          if (s.x === tx && s.y === ty) {
            goal = s;
            break;
          }
          expansions++;
          budget.expansions++;
          for (const [dx, dy, dir] of [
            [-1, 0, 1],
            [1, 0, 1],
            [0, -1, 2],
            [0, 1, 2],
          ]) {
            const nx = s.x + dx,
              ny = s.y + dy;
            if (nx < 0 || ny < 0 || nx >= x.length || ny >= y.length) continue;
            const a = { x: x[s.x], y: y[s.y] },
              b = { x: x[nx], y: y[ny] };
            if (
              Math.max(Math.abs(b.x), Math.abs(b.y)) >
              input.options.maxCoordinateAbs
            )
              continue;
            const lk =
              dx < 0 || dy < 0
                ? `${nx}:${ny}/${s.x}:${s.y}`
                : `${s.x}:${s.y}/${nx}:${ny}`;
            let clear = lineCache.get(lk);
            if (clear === undefined) {
              clear = clearLine(a, b);
              lineCache.set(lk, clear);
            }
            if (!clear) continue;
            const key = `${nx}:${ny}:${dir}`,
              ng = s.g + distance(a, b) + (s.dir && s.dir !== dir ? 24 : 0);
            if (ng >= (cost.get(key) ?? Infinity)) continue;
            cost.set(key, ng);
            heap.push({
              x: nx,
              y: ny,
              dir,
              g: ng,
              f: ng + Math.abs(b.x - entry.x) + Math.abs(b.y - entry.y),
              key,
              parent: s,
            });
          }
          if ((expansions & 31) === 0) yield;
        }
        if (goal) {
          const ps: Point[] = [];
          let s: SearchState | undefined = goal;
          while (s) {
            ps.push({ x: x[s.x], y: y[s.y] });
            s = s.parent;
          }
          const middle = simplify(ps.reverse());
          const candidate = [
            ...lines([start, exit]),
            ...lines(middle),
            ...lines([entry, end]),
          ];
          if (safe(candidate)) {
            segments = candidate;
            status = "ok";
            break;
          }
        }
        yield;
      }
    }
    if (
      status === "ok" &&
      segments.every((s) => s.kind === "line") &&
      segments.length > 2
    ) {
      const ps = [segments[1].from, ...segments.slice(1, -1).map((s) => s.to)];
      for (const radius of [12, 6, 2]) {
        const smooth = [
          segments[0],
          ...rounded(simplify(ps), radius),
          segments[segments.length - 1],
        ];
        if (safe(smooth)) {
          segments = smooth;
          break;
        }
        yield;
      }
    }
  }
  if (!segments.length) segments = lines([start, exit, entry, end]);
  if (budget.reason || !verified) status = "unverified";
  const flat = flatten(segments, input.options.curveTolerance),
    ps = flat.points;
  const rib =
    edge.style === "taper"
      ? ribbon(ps, edge.halfWidth, Math.max(1, edge.halfWidth * 0.2))
      : undefined;
  let arrow: Point[] | undefined;
  if (edge.arrowLength && ps.length > 1) {
    const last = ps[ps.length - 1],
      prev = ps[ps.length - 2],
      len = Math.max(1e-8, distance(prev, last));
    const ux = (last.x - prev.x) / len,
      uy = (last.y - prev.y) / len;
    arrow = [
      last,
      {
        x: last.x - ux * edge.arrowLength - uy * edge.arrowHalfWidth,
        y: last.y - uy * edge.arrowLength + ux * edge.arrowHalfWidth,
      },
      {
        x: last.x - ux * edge.arrowLength + uy * edge.arrowHalfWidth,
        y: last.y - uy * edge.arrowLength - ux * edge.arrowHalfWidth,
      },
    ];
  }
  let labelAnchor: Point | undefined, labelBounds: Rect | undefined;
  if (edge.labelSize) {
    const options = ps
      .slice(1)
      .map((p, i) => ({ a: ps[i], b: p, len: distance(ps[i], p) }))
      .sort((a, b) => b.len - a.len);
    for (const { a, b } of options) {
      const p = lerp(a, b, 0.5),
        r = {
          x: p.x - edge.labelSize.width / 2,
          y: p.y - edge.labelSize.height / 2,
          ...edge.labelSize,
        };
      if (!index.query(inflate(r, 2)).length) {
        labelAnchor = p;
        labelBounds = r;
        break;
      }
    }
    if (!labelAnchor) {
      // Even a blocked label remains anchored on the actual detour. The
      // midpoint of the endpoints can be nowhere near the routed polyline.
      let remaining = options.reduce((sum, part) => sum + part.len, 0) / 2;
      labelAnchor = ps[0] ?? start;
      for (let i = 1; i < ps.length; i++) {
        const len = distance(ps[i - 1], ps[i]);
        if (remaining <= len && len > 0) {
          labelAnchor = lerp(ps[i - 1], ps[i], remaining / len);
          break;
        }
        remaining -= len;
      }
      labelBounds = {
        x: labelAnchor.x - edge.labelSize.width / 2,
        y: labelAnchor.y - edge.labelSize.height / 2,
        ...edge.labelSize,
      };
    }
  }
  let bounds = inflate(
    pointBounds(ps),
    edge.halfWidth + input.options.curveTolerance,
  );
  if (rib?.length) bounds = union(bounds, pointBounds(rib));
  if (arrow) bounds = union(bounds, pointBounds(arrow));
  if (labelBounds) bounds = union(bounds, labelBounds);
  return {
    edgeId: edge.id,
    kind: edge.kind,
    sourcePort: sp,
    targetPort: tp,
    segments,
    labelAnchor,
    labelBounds,
    ribbon: rib,
    arrow,
    bounds,
    status,
  };
}

// Radial branches and free relations may choose another actual face when the
// preferred escape corridor is blocked. Horizontal/vertical tree faces stay fixed.
export function* routeEdge(
  input: LayoutInput,
  edge: EngineEdge,
  source: EngineNode,
  target: EngineNode,
  index: SpatialIndex<EngineNode>,
  budget: Budget,
): Work<EdgeRoute> {
  const first = yield* routeWithPorts(
    input,
    edge,
    source,
    target,
    index,
    budget,
  );
  if (
    first.status === "ok" ||
    budget.reason ||
    (edge.style === "straight" && input.options.straightPolicy === "strict") ||
    (edge.kind === "tree" && (source.effectiveMode ?? input.mode) !== "radial")
  )
    return first;
  const opposite = {
    left: "right",
    right: "left",
    top: "bottom",
    bottom: "top",
  };
  const choices = source.ports
    .filter(
      (p) => p.handleId.endsWith("-source") && p.face !== first.sourcePort.face,
    )
    .flatMap((sp) => {
      const tp = target.ports.find(
        (p) => p.handleId === `${opposite[sp.face]}-target`,
      );
      return tp ? [[sp, tp] as [EnginePort, EnginePort]] : [];
    })
    .sort(
      (a, b) =>
        distance(worldPort(source, a[0]), worldPort(target, a[1])) -
        distance(worldPort(source, b[0]), worldPort(target, b[1])),
    );
  for (const ports of choices) {
    const r = yield* routeWithPorts(
      input,
      edge,
      source,
      target,
      index,
      budget,
      ports,
    );
    if (r.status === "ok") return r;
    if (budget.reason) break;
  }
  return first;
}
