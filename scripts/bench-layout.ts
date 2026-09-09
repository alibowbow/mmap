import { writeFileSync, mkdirSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fixture } from "../tests/layout-engine/fixtures/generate";
import { runLayout as legacy } from "../tests/layout-engine/fixtures/legacy-layout";
import {
  adaptInput,
  applyPositionPatch,
} from "../src/lib/layout-engine/adapter";
import { solveLayout, solveLayoutSteps } from "../src/lib/layout-engine";
import type { LayoutMode } from "../src/types/mindmap";
import { buildGraph } from "../src/lib/layout-engine/graph";
import {
  solvePositions,
  countCollisions,
} from "../src/lib/layout-engine/incremental";
import { SpatialIndex } from "../src/lib/layout-engine/spatial-index";
import { RouteCache } from "../src/lib/layout-engine/route-cache";
import { routeEdge } from "../src/lib/layout-engine/route-edges";
import { measureSteps } from "../src/lib/layout-engine/metrics";
import {
  Budget,
  drain,
  type EngineNode,
  type LayoutInput,
} from "../src/lib/layout-engine/types";
import { validateLayoutPatch } from "../src/lib/layoutTransactions";
// A separate cold-cache pass exposes the core stages. It is not added to the
// end-to-end samples and structuredClone is not claimed as Worker transfer time.
function profileStages(input: LayoutInput) {
  const times: Record<string, number> = {};
  const timed = <T>(name: string, fn: () => T): T => {
    const t = performance.now();
    const result = fn();
    times[name] = performance.now() - t;
    return result;
  };
  timed("structuredCloneMs", () => structuredClone(input));
  const { graph } = timed("graphValidationMs", () => drain(buildGraph(input)));
  const budget = new Budget(input.options);
  const { nodes } = timed("placementMs", () =>
    drain(solvePositions(input, graph, budget)),
  );
  const visible = nodes.filter((_, i) => !graph.hidden.has(i));
  const index = new SpatialIndex<EngineNode>();
  const cache = new RouteCache();
  timed("spatialIndexAndCacheMs", () => {
    for (const n of visible) index.set(n.id, n);
    drain(cache.prepare(input, visible));
  });
  const routes = timed("routingMs", () =>
    input.edges
      .filter(
        (e) =>
          !graph.hidden.has(graph.byId.get(e.source)!) &&
          !graph.hidden.has(graph.byId.get(e.target)!),
      )
      .map((e) =>
        drain(
          routeEdge(
            input,
            e,
            nodes[graph.byId.get(e.source)!],
            nodes[graph.byId.get(e.target)!],
            index,
            budget,
          ),
        ),
      ),
  );
  timed("geometryMetricsMs", () => {
    drain(
      measureSteps(
        input.nodes.filter((_, i) => !graph.hidden.has(i)),
        visible,
        routes,
        input.changedNodeIds,
      ),
    );
    drain(countCollisions(nodes, graph));
  });
  return times;
}
const modes: LayoutMode[] = [
  "right-tree",
  "bidirectional",
  "vertical",
  "radial",
];
const rows = [];
const percentile = (xs: number[], q: number) =>
  xs.sort((a, b) => a - b)[Math.max(0, Math.ceil(xs.length * q) - 1)];
for (const count of [14, 200, 500, 1000, 3000])
  for (const mode of modes) {
    const nodes = fixture(count),
      baseStart = performance.now(),
      old = legacy(nodes, mode),
      oldMs = performance.now() - baseStart;
    const oldMinX = Math.min(...old.map((n) => n.position.x)),
      oldMaxX = Math.max(...old.map((n) => n.position.x + n.measured!.width!));
    const oldMinY = Math.min(...old.map((n) => n.position.y)),
      oldMaxY = Math.max(...old.map((n) => n.position.y + n.measured!.height!));
    const adapterStart = performance.now();
    const input = adaptInput(nodes, { mode }),
      times: number[] = [];
    const adapterMs = performance.now() - adapterStart;
    let r = solveLayout(input);
    for (let i = 0; i < 3; i++) {
      const start = performance.now();
      r = solveLayout(input);
      times.push(performance.now() - start);
    }
    const placed = applyPositionPatch(nodes, r),
      edited = placed.map((n, i) =>
        i === count - 1 ? { ...n, measured: { width: 450, height: 280 } } : n,
      );
    const local = adaptInput(
        edited,
        { mode },
        {
          strategy: "incremental",
          changedNodeIds: [`n${count - 1}`],
          affectedParentIds: [edited[count - 1].data.parentId!],
        },
      ),
      start = performance.now(),
      inc = solveLayout(local),
      incrementalMs = performance.now() - start;
    // Drain the same generator in 6ms chunks to measure its cooperative granularity.
    let maxChunk = 0,
      chunks = 0;
    const steps = solveLayoutSteps(input);
    let done = false;
    while (!done) {
      const start = performance.now();
      let step = steps.next();
      while (!step.done && performance.now() - start < 6) step = steps.next();
      maxChunk = Math.max(maxChunk, performance.now() - start);
      chunks++;
      done = !!step.done;
    }
    const row = {
      count,
      treeEdges: input.edges.length,
      relationEdges: 0,
      mode,
      status: r.status,
      oldMs,
      medianMs: percentile(times, 0.5),
      p95Ms: percentile(times, 0.95),
      incrementalMs,
      incrementalStatus: inc.status,
      beforeArea: (oldMaxX - oldMinX) * (oldMaxY - oldMinY),
      afterArea: r.metrics.area,
      renderBoundsArea: r.bounds ? r.bounds.width * r.bounds.height : 0,
      aspectRatio: r.metrics.aspectRatio,
      routeLength: r.metrics.routeLength,
      bends: r.metrics.bends,
      labelOverlaps: r.metrics.labelOverlaps,
      nodeOverlaps: r.metrics.nodeOverlaps,
      blockedRoutes: r.metrics.blockedRoutes,
      movedRatio: inc.metrics.movedRatio,
      unchangedMedian: inc.metrics.displacementMedian,
      unchangedP95: inc.metrics.displacementP95,
      unchangedMax: inc.metrics.displacementMax,
      maxChunkMs: maxChunk,
      chunks,
      candidateChecks: r.metrics.candidateChecks,
      routeExpansions: r.metrics.routeExpansions,
      stages: {
        adapterMs,
        ...profileStages(input),
        ...(() => {
          let t = performance.now();
          validateLayoutPatch(input, r, input.stamp);
          const finalPatchValidationMs = performance.now() - t;
          t = performance.now();
          applyPositionPatch(nodes, r);
          const applyNodePatchMs = performance.now() - t;
          return { finalPatchValidationMs, applyNodePatchMs };
        })(),
      },
    };
    rows.push(row);
    console.log(JSON.stringify(row));
  }
mkdirSync("verification", { recursive: true });
writeFileSync(
  "verification/layout-benchmark.json",
  JSON.stringify(
    {
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      notes:
        "Core timings only, 3 warm repetitions. Not browser end-to-end or real-phone measurements. Input seed 43. Legacy source pinned to 05bb470. No relation edges in this table.",
      rows,
    },
    null,
    2,
  ) + "\n",
);
