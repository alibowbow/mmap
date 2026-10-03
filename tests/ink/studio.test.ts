import test from "node:test";
import assert from "node:assert/strict";
import { useMindMapStore as store } from "../../src/store/mindMapStore";
import { studioDocument } from "../../src/lib/studioExamples";
import { exportDocumentJson } from "../../src/lib/export";
import { parseImportJson } from "../../src/lib/validation";
import {
  validateInk,
  texturePath,
  strokePath,
  itemBounds,
  inkBounds,
  itemHit,
  transformPoint,
  inversePoint,
  itemCenter,
} from "../../src/lib/ink";
import type { InkStroke } from "../../src/types/mindmap";

globalThis.requestAnimationFrame = (fn) =>
  setTimeout(() => fn(performance.now()), 0) as unknown as number;
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
const clean = (v: unknown) => JSON.parse(JSON.stringify(v));
const ink = () => clean(store.getState().ink);
function open() {
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
    store.getState().importJson(exportDocumentJson(studioDocument("swatches"))),
  );
}

test("six profiles produce deterministic geometry, pressure/fallback taper and capped texture", () => {
  const doc = studioDocument("swatches");
  assert.ok(validateInk(doc.ink).ok);
  const s = doc.ink!.strokes.find((s) => s.brush === "brush")!;
  const a = strokePath(s),
    b = strokePath({
      ...s,
      points: s.points.map((p, i) => ({ ...p, pressure: i / s.points.length })),
    });
  assert.notEqual(a, b);
  assert.equal(a, strokePath({ ...s }));
  assert.notEqual(strokePath({ ...s, brush: "pen" }), a);
  assert.notEqual(strokePath({ ...s, brush: "marker" }), a);
  assert.notEqual(strokePath({ ...s, brush: "branch" }), a);
  const texture = texturePath(23);
  assert.equal(texture, texturePath(23));
  assert.notEqual(texture, texturePath(24));
  assert.equal(texture.match(/M/g)!.length, 12);
  assert.equal(texturePath(23, true).match(/M/g)!.length, 32);
});
test("the garden is entirely editable freehand ink, with no node layout, text objects or stamps", () => {
  const doc = studioDocument("map");
  assert.equal(doc.nodes.length, 0);
  assert.equal(doc.edges.length, 0);
  assert.equal(doc.ink!.objects!.length, 0);
  assert.ok(doc.ink!.strokes.length > 200);
  assert.ok(doc.ink!.strokes.every((s) => s.brush !== "branch"));
  assert.ok(new Set(doc.ink!.strokes.map((s) => s.brush)).size >= 5);
  assert.ok(parseImportJson(exportDocumentJson(doc)).ok);
});
test("transformed world geometry matches bounds and swept erasing for ink, labels and stamps", () => {
  const s: InkStroke = {
    id: "curve",
    color: "#246d56",
    width: 30,
    brush: "branch",
    curve: 0.8,
    points: [
      { x: 0, y: 0, pressure: 1 },
      { x: 100, y: 0, pressure: 1 },
    ],
    transform: { x: -300, y: 450, scale: 2, rotation: 35 },
  };
  const c = itemCenter(s),
    raw = { x: 50, y: 40, pressure: 1 },
    p = { ...transformPoint(raw, s.transform!, c), pressure: 1 };
  assert.ok(itemHit(s, p));
  assert.ok(Math.abs(inversePoint(p, s.transform!, c).x - 50) < 1e-9);
  const b = itemBounds(s);
  assert.ok(
    p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height,
  );
  const o = {
    id: "book",
    kind: "stamp" as const,
    shape: "book" as const,
    x: 0,
    y: 0,
    width: 60,
    height: 70,
    color: "#246d56",
    fontSize: 28,
    fill: false,
    transform: { x: 120, y: 10, scale: 1.3, rotation: 45 },
  };
  assert.ok(
    itemHit(
      o,
      { x: 20, y: 10, pressure: 1 },
      { x: 240, y: 10, pressure: 1 },
      2,
    ),
  );
  assert.ok(!itemHit(o, { x: -300, y: 0, pressure: 1 }));
  assert.ok(inkBounds({ version: 2, strokes: [s], objects: [o] })!.width > 300);
});
test("paper, object edits, transforms and order are atomic undoable state and survive snapshots/JSON", () => {
  open();
  const s = store.getState();
  const initial = ink();
  s.setInkPaper({ kind: "kraft", texture: 0.7, seed: 98 });
  const paper = ink();
  s.undo();
  assert.deepEqual(ink(), initial);
  s.redo();
  assert.deepEqual(ink(), paper);
  s.addInkObject({
    id: "label",
    kind: "label",
    text: "WORK",
    x: -22,
    y: 48,
    width: 88,
    height: 42,
    fontSize: 28,
    color: "#246d56",
    fill: false,
  });
  const placed = ink();
  s.updateInkItem("label", {
    transform: { x: 100, y: -80, scale: 1.5, rotation: -30 },
    text: "PLAY",
  });
  const moved = ink();
  s.undo();
  assert.deepEqual(ink(), placed);
  s.redo();
  assert.deepEqual(ink(), moved);
  s.reorderInk("label", false);
  assert.equal(store.getState().ink.order![0], "label");
  s.undo();
  assert.equal(store.getState().ink.order!.at(-1), "label");
  s.redo();
  s.saveSnapshot();
  const snap = store.getState().documents[0].snapshots![0];
  const before = ink();
  s.clearInk();
  assert.equal(store.getState().ink.objects!.length, 0);
  assert.deepEqual(store.getState().ink.paper, before.paper);
  s.undo();
  assert.deepEqual(ink(), before);
  s.eraseInkStrokes(["label"]);
  s.restoreSnapshot(snap.id);
  assert.deepEqual(ink(), before);
  const raw = s.exportJson();
  const parsed = parseImportJson(raw);
  assert.ok(parsed.ok);
  assert.deepEqual(clean(parsed.document.ink), before);
  assert.ok(s.importJson(raw));
  assert.deepEqual(ink(), before);
});
test("all invalid tool, seed, paper, shape, transform and z-order files fail before mutation", () => {
  open();
  const before = ink(),
    documents = store.getState().documents.length;
  const base = studioDocument("swatches");
  const mutations = [
    (d: any) => (d.ink.strokes[0].brush = "oil-paint"),
    (d: any) => (d.ink.strokes[0].seed = -1),
    (d: any) => (d.ink.strokes[0].opacity = 2),
    (d: any) =>
      (d.ink.strokes[0].transform = { x: 0, y: 0, scale: 0, rotation: 0 }),
    (d: any) => (d.ink.paper.kind = "toString"),
    (d: any) => (d.ink.paper.seed = 0.2),
    (d: any) => (d.ink.objects[0].text = "a\nb"),
    (d: any) => (d.ink.objects[0].kind = "image"),
    (d: any) => d.ink.order.push("unknown"),
    (d: any) => (d.ink.order[0] = d.ink.order[1]),
  ];
  for (const mutate of mutations) {
    const d = clean(base);
    mutate(d);
    assert.equal(store.getState().importJson(exportDocumentJson(d)), false);
    assert.deepEqual(ink(), before);
    assert.equal(store.getState().documents.length, documents);
  }
  const legacy = clean(base);
  legacy.ink = {
    version: 1,
    strokes: [
      {
        id: "legacy",
        width: 4,
        color: "#2563eb",
        points: [{ x: 0, y: 0, pressure: 1 }],
      },
    ],
  };
  const result = parseImportJson(
    JSON.stringify({
      format: "mindforge-document",
      version: 3,
      document: legacy,
    }),
  );
  assert.ok(result.ok);
  assert.deepEqual(result.document.ink, legacy.ink);
});
test("mixed 100k-point textured ink keeps one bounded pattern per stroke, cached paths and portable state", () => {
  const doc = studioDocument("swatches");
  const template = doc.ink!.strokes[0];
  const strokes = Array.from({ length: 500 }, (_, i) => ({
    ...template,
    id: "large-" + i,
    seed: i,
    points: Array.from({ length: 200 }, (_, j) => ({
      x: i * 2 + j,
      y: i + Math.sin(j / 20) * 30,
      pressure: 1,
    })),
  }));
  const start = performance.now();
  const raw = JSON.stringify({ version: 2, strokes });
  const result = validateInk(JSON.parse(raw));
  assert.ok(result.ok);
  for (const s of result.ink.strokes) {
    const d = strokePath(s);
    assert.equal(strokePath(s), d);
    assert.ok(d.length < 40000);
    assert.equal(texturePath(s.seed!).match(/M/g)!.length, 12);
  }
  console.log(
    JSON.stringify({
      analogLarge: {
        samples: 100000,
        strokes: 500,
        jsonBytes: Buffer.byteLength(raw),
        validateRenderMs: Math.round(performance.now() - start),
      },
    }),
  );
});
