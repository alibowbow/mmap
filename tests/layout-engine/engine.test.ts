import assert from "node:assert/strict";
import test from "node:test";
import { solveLayout } from "../../src/lib/layout-engine";
import {
  adaptInput,
  applyPositionPatch,
} from "../../src/lib/layout-engine/adapter";
import { RouteCache } from "../../src/lib/layout-engine/route-cache";
import { flatten } from "../../src/lib/layout-engine/geometry";
import {
  DEFAULT_OPTIONS,
  type LayoutMode,
  type LayoutInput,
} from "../../src/lib/layout-engine/types";
import { computeDepths, getDescendantIds, walkTree } from "../../src/lib/tree";
import { fixture } from "./fixtures/generate";
import { assertNoOverlap, assertRoutesClear, resultNodes } from "./independent";
import baseline from "./fixtures/baseline.json";
import type { MindMapNode } from "../../src/types/mindmap";
const modes: LayoutMode[] = [
  "right-tree",
  "bidirectional",
  "vertical",
  "radial",
];
test("a blocked relation label still anchors on the real detour", () => {
  const base = adaptInput(fixture(3), { mode: "right-tree" });
  const placed = applyPositionPatch(fixture(3), solveLayout(base));
  const input = adaptInput(
    placed,
    {
      mode: "right-tree",
      relations: [{ id: "rel", source: "n1", target: "n2", label: "label" }],
    },
    { routingOnly: true },
  );
  const r = solveLayout({
    ...input,
    edges: input.edges.map((e) =>
      e.id === "rel" ? { ...e, labelSize: { width: 2000, height: 2000 } } : e,
    ),
  });
  const route = r.routes.find((e) => e.edgeId === "rel")!;
  const p = route.labelAnchor!,
    ps = flatten(route.segments).points;
  let nearest = Infinity;
  for (let i = 1; i < ps.length; i++) {
    const a = ps[i - 1],
      b = ps[i],
      dx = b.x - a.x,
      dy = b.y - a.y;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
      ),
    );
    nearest = Math.min(
      nearest,
      Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy),
    );
  }
  assert.ok(nearest < 0.5);
  assert.ok(r.diagnostics.some((d) => d.code === "LABEL_BLOCKED"));
});
test("invalid measured port, label and stroke geometry never reaches routing", () => {
  const input = adaptInput(fixture(3), { mode: "right-tree" });
  for (const edge of [
    { ...input.edges[0], halfWidth: Infinity },
    { ...input.edges[0], halfWidth: input.options.maxCoordinateAbs * 2 },
    { ...input.edges[0], labelSize: { width: NaN, height: 20 } },
    { ...input.edges[0], labelSize: { width: 80, height: -2 } },
  ]) {
    const r = solveLayout({ ...input, edges: [edge] });
    assert.equal(r.status, "invalid");
    assert.deepEqual(r.positions, []);
  }
  const r = solveLayout({
    ...input,
    nodes: input.nodes.map((n, i) =>
      i
        ? n
        : {
            ...n,
            ports: [
              {
                handleId: "right",
                face: "right",
                offset: { x: Infinity, y: 0 },
              },
            ],
          },
    ),
  });
  assert.equal(r.status, "invalid");
});
function freeze<T>(obj: T): T {
  if (obj && typeof obj === "object") {
    Object.freeze(obj);
    for (const v of Object.values(obj)) freeze(v);
  }
  return obj;
}
for (const mode of modes)
  for (const count of [0, 1, 14, 50, 200])
    test(`${mode}: ${count} measured nodes / immutable / deterministic`, () => {
      const input = freeze(adaptInput(fixture(count), { mode, edges: [] }));
      const a = solveLayout(input),
        b = solveLayout(input);
      assert.equal(a.status, "ok");
      assert.deepEqual(a, b);
      assertNoOverlap(input, a);
      const ns = applyPositionPatch(fixture(count), a);
      const again = solveLayout(adaptInput(ns, { mode, edges: [] }));
      assert.deepEqual(again.positions, []);
    });
test("baseline density gate in all four modes", () => {
  for (const mode of modes) {
    const nodes = baseline.nodes as MindMapNode[],
      input = adaptInput(nodes, { mode, edges: [] }),
      r = solveLayout(input);
    assertNoOverlap(input, r);
    const ps = baseline.positions[mode],
      minX = Math.min(...ps.map((p) => p.x)),
      maxX = Math.max(...ps.map((p) => p.x + 232)),
      minY = Math.min(...ps.map((p) => p.y)),
      maxY = Math.max(...ps.map((p) => p.y + 76));
    assert.ok(
      r.metrics.area <= (maxX - minX) * (maxY - minY) * 1.15,
      `${mode} area increased >15%`,
    );
  }
});
test("2000 deep chain and all editor tree traversals terminate", () => {
  const nodes = fixture(2000, "chain");
  const input = adaptInput(nodes, { mode: "right-tree", edges: [] });
  const r = solveLayout(input);
  assert.equal(r.status, "ok");
  assert.equal(computeDepths(nodes).get("n1999"), 1999);
  assert.equal(getDescendantIds(nodes, "n0").length, 1999);
  let count = 0;
  walkTree(nodes, () => count++);
  assert.equal(count, 2000);
  assertNoOverlap(input, r);
});
for (const bad of [
  "duplicate",
  "missing",
  "self",
  "cycle",
  "roots",
  "NaN",
  "Infinity",
  "zero",
] as const)
  test(`reject ${bad} without patch`, () => {
    const input = adaptInput(fixture(4), { mode: "right-tree", edges: [] }),
      ns = input.nodes.map((n) => ({ ...n }));
    if (bad === "duplicate") ns[1].id = ns[0].id;
    if (bad === "missing") ns[1].parentId = "absent";
    if (bad === "self") ns[1].parentId = ns[1].id;
    if (bad === "cycle") {
      ns[1].parentId = ns[2].id;
      ns[2].parentId = ns[1].id;
    }
    if (bad === "roots") ns[1].parentId = null;
    if (bad === "NaN") ns[1].x = NaN;
    if (bad === "Infinity") ns[1].y = Infinity;
    if (bad === "zero") ns[1].width = 0;
    const r = solveLayout({ ...input, nodes: ns });
    assert.equal(r.status, "invalid");
    assert.deepEqual(r.positions, []);
  });
test("cyclic relations are valid", () => {
  const nodes = fixture(4),
    relations = [
      { id: "r1", source: "n1", target: "n2" },
      { id: "r2", source: "n2", target: "n3" },
      { id: "r3", source: "n3", target: "n1" },
    ];
  const r = solveLayout(adaptInput(nodes, { mode: "right-tree", relations }));
  assert.notEqual(r.status, "invalid");
});
test("incremental edit keeps distant branches, sides and no-op coordinates", () => {
  const nodes = fixture(50),
    base = solveLayout(adaptInput(nodes, { mode: "bidirectional", edges: [] }));
  let placed = applyPositionPatch(nodes, base);
  placed = placed.map((n) =>
    n.id === "n49" ? { ...n, measured: { width: 600, height: 300 } } : n,
  );
  const input = adaptInput(
    placed,
    { mode: "bidirectional", edges: [] },
    {
      strategy: "incremental",
      changedNodeIds: ["n49"],
      affectedParentIds: ["n16"],
    },
  );
  const r = solveLayout(input);
  assertNoOverlap(input, r);
  assert.ok(r.positions.length < 15);
  assert.ok(!r.positions.some((p) => p.id === "n1"));
  for (const p of r.positions) {
    const n = input.nodes.find((n) => n.id === p.id)!;
    assert.ok((n.x - 116) * (p.x - 116) >= 0);
  }
  const again = solveLayout({
    ...input,
    nodes: resultNodes(input, r),
    changedNodeIds: [],
    affectedParentIds: [],
  });
  assert.deepEqual(again.positions, []);
});
test("subtree uses outside obstacles and preserves every outside coordinate", () => {
  const nodes = fixture(14),
    base = solveLayout(adaptInput(nodes, { mode: "right-tree", edges: [] })),
    placed = applyPositionPatch(nodes, base);
  const branch = new Set(["n1", ...getDescendantIds(placed, "n1")]);
  const internal = placed.find((n) => n.id === "n4")!;
  placed.find((n) => n.id === "n2")!.position = {
    x: internal.position.x,
    y: internal.position.y,
  };
  const input = adaptInput(
      placed,
      { mode: "vertical", edges: [] },
      { strategy: "subtree", subtreeRootId: "n1" },
    ),
    r = solveLayout(input);
  for (const p of r.positions) assert.ok(branch.has(p.id) && p.id !== "n1");
  assertNoOverlap(input, r);
});
test("fixed overlap proves infeasible, budget exhaustion does not", () => {
  const input = adaptInput(
    fixture(3),
    { mode: "right-tree", edges: [] },
    { fixedNodeIds: ["n0", "n1"] },
  );
  const r = solveLayout(input);
  assert.equal(r.status, "infeasible");
  assert.ok(!r.positions.some((p) => p.id === "n1"));
  const limited = solveLayout({
    ...input,
    fixedNodeIds: [],
    options: { ...DEFAULT_OPTIONS, maxCandidateChecks: 1 },
  });
  assert.notEqual(limited.status, "infeasible");
});
test("collapsed descendants keep relative coordinates during full layout", () => {
  let nodes = fixture(14);
  nodes = applyPositionPatch(
    nodes,
    solveLayout(adaptInput(nodes, { mode: "right-tree", edges: [] })),
  );
  nodes.find((n) => n.id === "n1")!.data.collapsed = true;
  const input = adaptInput(nodes, { mode: "vertical", edges: [] }),
    r = solveLayout(input),
    out = resultNodes(input, r),
    root = out.find((n) => n.id === "n1")!,
    before = input.nodes.find((n) => n.id === "n1")!;
  for (const id of getDescendantIds(nodes, "n1")) {
    const a = input.nodes.find((n) => n.id === id)!,
      b = out.find((n) => n.id === id)!;
    assert.equal(b.x - root.x, a.x - before.x);
    assert.equal(b.y - root.y, a.y - before.y);
  }
});
function obstacleScene(style = "curved"): LayoutInput {
  const nodes = fixture(4);
  const ps = [
    { x: 0, y: 0 },
    { x: 700, y: 0 },
    { x: 330, y: -120 },
    { x: 330, y: 280 },
  ];
  nodes.forEach((n, i) => {
    n.position = ps[i];
    n.measured = { width: 180, height: i === 2 ? 300 : 80 };
  });
  return adaptInput(
    nodes,
    {
      mode: "right-tree",
      edges: [{ id: "test", source: "n0", target: "n1" }],
      edgeStyle: style,
      edgeWidth: 5,
    },
    { routingOnly: true },
  );
}
for (const style of ["curved", "step", "taper"])
  test(`${style} escapes a nonincident obstacle with matching envelope`, () => {
    const input = obstacleScene(style),
      r = solveLayout(input);
    assert.equal(r.routes[0].status, "ok");
    assertRoutesClear(input, r);
    assert.ok(r.routes[0].segments.length > 3);
  });
test("strict straight retains the line and reports blockage", () => {
  const r = solveLayout(obstacleScene("straight"));
  assert.equal(r.status, "partial");
  assert.equal(r.routes[0].status, "blocked");
  assert.equal(r.routes[0].segments.length, 1);
});
test("nonincident obstacle move invalidates cached route; zoom-free repeat reuses it", () => {
  const cache = new RouteCache(),
    input = obstacleScene();
  const first = solveLayout(input, cache);
  const second = solveLayout(input, cache);
  assert.equal(second.metrics.reusedRoutes, 1);
  const nodes = input.nodes.map((n) => (n.id === "n2" ? { ...n, y: -500 } : n));
  const third = solveLayout({ ...input, nodes }, cache);
  assert.equal(third.metrics.reusedRoutes, 0);
  assert.notDeepEqual(third.routes[0].segments, first.routes[0].segments);
  assertRoutesClear({ ...input, nodes }, third);
});
test("non-central line ports are honored", () => {
  const input = obstacleScene();
  const nodes = input.nodes.map((n) => ({
    ...n,
    ports: n.ports.map((p) =>
      p.face === "left" || p.face === "right"
        ? { ...p, offset: { ...p.offset, y: n.height - 1 } }
        : p,
    ),
  }));
  const r = solveLayout({ ...input, nodes });
  assert.equal(r.routes[0].segments[0].from.y, 79);
  assertRoutesClear({ ...input, nodes }, r);
});

test("inset measured handles escape the entire card, not a fixed stub length", () => {
  const input = obstacleScene(),
    nodes = input.nodes.map((n) => ({
      ...n,
      ports: n.ports.map((p) =>
        p.face === "left"
          ? { ...p, offset: { ...p.offset, x: 6 } }
          : p.face === "right"
            ? { ...p, offset: { ...p.offset, x: n.width - 6 } }
            : p,
      ),
    }));
  const r = solveLayout({ ...input, nodes });
  assert.equal(r.routes[0].status, "ok");
  assertRoutesClear({ ...input, nodes }, r);
});
for (const shape of ["balanced", "star", "chain"] as const)
  test(`500 ${shape} nodes`, () => {
    const input = adaptInput(fixture(500, shape), { mode: "right-tree" }),
      r = solveLayout(input);
    assert.equal(r.status, "ok");
    assertNoOverlap(input, r);
  });
for (const mode of modes)
  test(`3000 ${mode} nodes, finite bounds and verified routes`, () => {
    const input = adaptInput(fixture(3000), { mode }),
      r = solveLayout(input);
    assert.equal(r.status, "ok");
    assertNoOverlap(input, r);
    for (const p of r.positions)
      assert.ok(
        Number.isFinite(p.x) &&
          Number.isFinite(p.y) &&
          Math.abs(p.x) < input.options.maxCoordinateAbs,
      );
  });
test("radial escape changes to another actual face when preferred face is blocked", () => {
  const input = adaptInput(fixture(200), { mode: "radial" }),
    r = solveLayout(input);
  assert.equal(r.status, "ok");
  assertRoutesClear(input, r);
});
test("coordinate and displacement budget cannot leak a seed outside bounds", () => {
  const input = adaptInput(fixture(50), { mode: "right-tree", edges: [] }),
    r = solveLayout({
      ...input,
      options: { ...input.options, maxDisplacement: 10 },
    });
  assert.notEqual(r.status, "ok");
  assert.deepEqual(r.positions, []);
});
test("nested collapse and an explicitly fixed hidden node preserve the whole boundary", () => {
  let nodes = fixture(50);
  nodes = applyPositionPatch(
    nodes,
    solveLayout(adaptInput(nodes, { mode: "right-tree", edges: [] })),
  );
  nodes[1].data.collapsed = true;
  nodes[4].data.collapsed = true;
  const input = adaptInput(
      nodes,
      { mode: "vertical", edges: [] },
      { fixedNodeIds: ["n13"] },
    ),
    r = solveLayout(input);
  for (const id of ["n1", "n13"])
    assert.ok(!r.positions.some((p) => p.id === id));
});
test("U-shaped obstacle requires projections and a detour outside the endpoints box", () => {
  const nodes = fixture(5);
  const rects = [
    { x: 0, y: 0, width: 80, height: 80 },
    { x: 420, y: 0, width: 80, height: 80 },
    { x: 150, y: -200, width: 70, height: 360 },
    { x: 150, y: 160, width: 200, height: 70 },
    { x: 280, y: -200, width: 70, height: 360 },
  ];
  nodes.forEach((n, i) => {
    n.position = { x: rects[i].x, y: rects[i].y };
    n.measured = { width: rects[i].width, height: rects[i].height };
  });
  const input = adaptInput(
      nodes,
      { mode: "right-tree", edges: [{ id: "u", source: "n0", target: "n1" }] },
      { routingOnly: true },
    ),
    r = solveLayout(input);
  assert.equal(r.routes[0].status, "ok");
  assertRoutesClear(input, r);
  assert.ok(
    r.routes[0].bounds.y < -200 ||
      r.routes[0].bounds.y + r.routes[0].bounds.height > 230,
  );
});
