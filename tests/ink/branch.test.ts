import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  branchGeometry,
  branchPaintPaths,
  renderPoints,
  strokePath,
  validateInk,
  itemHit,
  itemCenter,
  transformPoint,
} from "../../src/lib/ink";
import { branchStudyDocument } from "../../src/lib/branchExamples";
import { exportDocumentJson } from "../../src/lib/export";
import { parseImportJson } from "../../src/lib/validation";
import { loadWorkspaceFromStorage } from "../../src/lib/storage";
import { useMindMapStore as store } from "../../src/store/mindMapStore";
import type { InkStroke } from "../../src/types/mindmap";
const clean = (v: unknown) => JSON.parse(JSON.stringify(v));
const stroke = (extra: Partial<InkStroke> = {}): InkStroke => ({
  id: "branch",
  color: "#e0614e",
  width: 32,
  brush: "brush",
  branchStyle: "hand-v1",
  seed: 12,
  taper: 0.94,
  texture: 0.45,
  points: Array.from({ length: 51 }, (_, i) => ({
    x: i * 7,
    y: Math.sin(i / 12) * 35,
    pressure: 1,
  })),
  ...extra,
});
globalThis.requestAnimationFrame = (fn) =>
  setTimeout(() => fn(performance.now()), 0) as unknown as number;
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

test("hand-v1 preserves every stored point and the entire released smoothed centreline", () => {
  const s = stroke(),
    before = clean(s.points),
    base = renderPoints({ ...s, branchStyle: undefined }),
    g = branchGeometry(s);
  assert.deepEqual(s.points, before);
  for (const p of base)
    assert.ok(
      g.points.includes(p) || g.points.some((q) => q.x === p.x && q.y === p.y),
    );
  for (const p of g.points) {
    let nearest = Infinity;
    for (let i = 1; i < base.length; i++) {
      const a = base[i - 1],
        b = base[i],
        dx = b.x - a.x,
        dy = b.y - a.y,
        t = Math.max(
          0,
          Math.min(
            1,
            ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
          ),
        );
      nearest = Math.min(
        nearest,
        Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t),
      );
    }
    assert.ok(nearest < 1e-8, "no seeded or fitted centreline offset");
  }
  assert.deepEqual(branchGeometry({ ...s, seed: 13 }).points, g.points);
  assert.deepEqual(
    branchGeometry({ ...s, texture: 1, taper: 0.3 }).points,
    g.points,
  );
});
test("taper follows arc distance, not sample count; fallback is continuous, pressure steps are restrained", () => {
  const s = stroke({ texture: 0 }),
    g = branchGeometry(s);
  assert.ok(g.radii[0] > 15 && g.radii.at(-1)! < 1);
  g.radii.forEach((r, i) => {
    assert.ok(r > 0 && r <= 16);
    if (i) assert.ok(r <= g.radii[i - 1] + 1e-9);
  });
  const uneven = stroke({
      texture: 0,
      points: [0, 1, 2, 100, 101, 200, 350].map((x) => ({
        x,
        y: 0,
        pressure: 1,
      })),
    }),
    u = branchGeometry(uneven);
  for (let i = 0; i < u.points.length; i++)
    assert.ok(
      Math.abs(
        u.radii[i] / 16 -
          (1 - 0.94 + 0.94 * Math.pow(1 - u.distances[i] / 350, 0.85)),
      ) < 1e-9,
    );
  const pressure = branchGeometry(
    stroke({
      texture: 0,
      taper: 0,
      points: Array.from({ length: 100 }, (_, i) => ({
        x: i,
        y: 0,
        pressure: i < 50 ? 0.2 : 1,
      })),
    }),
  );
  assert.ok(pressure.radii.at(-1)! > pressure.radii[0] + 3);
  assert.ok(
    Math.max(
      ...pressure.radii.slice(1).map((r, i) => Math.abs(r - pressure.radii[i])),
    ) < 1,
  );
  assert.ok(
    !strokePath(stroke({ points: [{ x: 0, y: 0, pressure: 1 }] })).includes(
      "NaN",
    ),
  );
});
test("seed changes only restrained edge/pigment, with cached bounded SVG geometry", () => {
  const s = stroke(),
    p = branchPaintPaths(s),
    g = branchGeometry(s),
    plain = branchGeometry({ ...s, texture: 0 });
  assert.equal(branchPaintPaths(s), p);
  assert.deepEqual(branchPaintPaths(clean(s)), p);
  assert.notEqual(branchPaintPaths({ ...s, seed: 13 }).outline, p.outline);
  g.radii.forEach((r, i) =>
    assert.ok(r <= plain.radii[i] && r >= plain.radii[i] * 0.976),
  );
  assert.ok(g.points.length <= renderPoints(s).length + 1024);
  assert.equal(p.outline.match(/M/g)!.length, 3);
  assert.equal(p.pigment.match(/M/g)!.length, 3);
  assert.ok((p.fibers.match(/M/g)?.length ?? 0) <= 28);
});
test("v1-v4 legacy geometry stays exact; unsupported style/version rejects atomically", () => {
  const legacy = stroke({ branchStyle: undefined, texture: 0.7, taper: 0.8 });
  // Expected hash of the released PR #10 renderer for this exact trajectory.
  assert.equal(
    createHash("sha256").update(strokePath(legacy)).digest("hex"),
    "12f0b24141922540a20a558bc9d63eb056ad6c012941bc28caaafdd6b0f22d35",
  );
  for (const version of [1, 2, 3, 4]) {
    const doc = branchStudyDocument("before"),
      raw = JSON.stringify({
        format: "mindforge-document",
        version,
        document: doc,
      });
    const parsed = parseImportJson(raw);
    assert.ok(parsed.ok);
    assert.equal(
      strokePath(parsed.document.ink!.strokes[0]),
      strokePath(doc.ink!.strokes[0]),
    );
  }
  store.setState({
    documents: [],
    activeDocumentId: null,
    history: [],
    future: [],
    inkGestureActive: false,
    flow: null,
    hydrated: true,
    freshDocumentId: null,
  });
  assert.ok(
    store
      .getState()
      .importJson(exportDocumentJson(branchStudyDocument("after"))),
  );
  const before = clean(store.getState().ink),
    count = store.getState().documents.length;
  for (const mutate of [
    (d: any) => (d.ink.strokes[0].branchStyle = "hand-v2"),
    (d: any) => (d.ink.version = 5),
    (d: any) => {
      d.ink.version = 2;
      d.ink.strokes[0].branchStyle = "hand-v1";
    },
  ]) {
    const d = clean(branchStudyDocument("after"));
    mutate(d);
    assert.equal(store.getState().importJson(exportDocumentJson(d)), false);
    assert.deepEqual(clean(store.getState().ink), before);
    assert.equal(store.getState().documents.length, count);
  }
});
test("new style/seed survives store edits, transformations, order, erase, undo, snapshot and portable reload", () => {
  const s = store.getState();
  s.createInkBoard();
  s.addInkStroke(stroke());
  assert.equal(store.getState().ink.version, 3);
  s.addInkStroke(stroke({ id: "fork", width: 9 }));
  s.setInkPaper({ kind: "cream", texture: 0.3, seed: 98 });
  s.reorderInk("branch", true);
  s.updateInkItem("branch", {
    transform: { x: 40, y: -50, scale: 1.5, rotation: 30 },
  });
  const before = clean(store.getState().ink),
    item = store.getState().ink.strokes[0],
    c = itemCenter(item),
    p = {
      ...transformPoint(renderPoints(item)[30], item.transform!, c),
      pressure: 1,
    };
  assert.ok(itemHit(item, p));
  s.eraseInkStrokes(["branch"]);
  s.undo();
  assert.deepEqual(clean(store.getState().ink), before);
  s.redo();
  s.undo();
  s.saveSnapshot();
  s.clearInk();
  s.undo();
  assert.deepEqual(clean(store.getState().ink), before);
  const raw = s.exportJson();
  assert.equal(JSON.parse(raw).version, 5);
  assert.ok(s.importJson(raw));
  assert.deepEqual(clean(store.getState().ink), before);
  const active = store
    .getState()
    .documents.find((d) => d.id === store.getState().activeDocumentId)!;
  const rawWorkspace = JSON.stringify({
    version: 3,
    activeDocumentId: active.id,
    documents: [active],
  });
  const previous = globalThis.window;
  globalThis.window = {
    localStorage: { getItem: () => rawWorkspace },
  } as unknown as Window & typeof globalThis;
  try {
    const loaded = loadWorkspaceFromStorage();
    assert.ok(loaded.ok);
    assert.deepEqual(clean(loaded.workspace.documents[0].ink), before);
  } finally {
    globalThis.window = previous;
  }
});
