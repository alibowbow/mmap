import test from "node:test";
import assert from "node:assert/strict";
import { useMindMapStore as store } from "../../src/store/mindMapStore";
import {
  EMPTY_INK,
  DEFAULT_INK_SETTINGS,
  validateInk,
  inkBounds,
  strokePath,
  strokeHit,
  appendInkPoint,
  MAX_STROKE_POINTS,
} from "../../src/lib/ink";
import { parseImportJson } from "../../src/lib/validation";
import { exportDocumentJson } from "../../src/lib/export";
import { loadWorkspaceFromStorage } from "../../src/lib/storage";
import { portableFixture } from "../io/fixture";
import type { InkPoint, InkStroke } from "../../src/types/mindmap";

globalThis.requestAnimationFrame = (fn) =>
  setTimeout(() => fn(performance.now()), 0) as unknown as number;
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
const stroke = (id = "s", x = -350): InkStroke => ({
  id,
  color: "#2563eb",
  width: 12,
  points: [
    { x, y: -300, pressure: 0.2 },
    { x: x + 140, y: 50, pressure: 1 },
  ],
});
function reset() {
  store.setState({
    documents: [],
    activeDocumentId: null,
    nodes: [],
    edges: [],
    relations: [],
    ink: EMPTY_INK,
    boardMode: "map",
    inkSettings: DEFAULT_INK_SETTINGS,
    inkTool: "node",
    inkGestureActive: false,
    history: [],
    future: [],
    hydrated: true,
    flow: null,
    freshDocumentId: null,
  });
}
function data() {
  const s = store.getState();
  return { nodes: s.nodes, edges: s.edges, ink: s.ink, boardMode: s.boardMode };
}

test("blank board → drawing → erase / clear → undo / redo is atomic and preserves nodes", async () => {
  reset();
  store.getState().createInkBoard();
  assert.equal(store.getState().nodes.length, 0);
  assert.equal(store.getState().boardMode, "blank");
  store.getState().addInkStroke(stroke());
  store.getState().addInkStroke(stroke("s2", 400));
  const full = data();
  store.getState().eraseInkStrokes(["s"]);
  assert.deepEqual(
    store.getState().ink.strokes.map((s) => s.id),
    ["s2"],
  );
  store.getState().undo();
  assert.deepEqual(data(), full);
  store.getState().redo();
  assert.equal(store.getState().ink.strokes.length, 1);
  store.getState().clearInk();
  assert.equal(store.getState().ink.strokes.length, 0);
  store.getState().undo();
  assert.equal(store.getState().ink.strokes[0].id, "s2");
  store.getState().createDocument();
  store.getState().addInkStroke(stroke());
  const map = data();
  store.getState().eraseInkStrokes(["s"]);
  assert.deepEqual(store.getState().nodes, map.nodes);
  store.getState().undo();
  assert.deepEqual(data(), map);
  await store.getState().settleLayout();
});
test("mixed node and ink edits retain drawings across node history, layouts and snapshots", async () => {
  reset();
  store.getState().createDocument();
  store.getState().addInkStroke(stroke());
  const ink = store.getState().ink;
  const root = store.getState().nodes[0].id;
  store.getState().updateNodeLabel(root, "편집 후");
  await store.getState().settleLayout();
  store.getState().undo();
  assert.equal(store.getState().ink, ink);
  store.getState().redo();
  assert.equal(store.getState().nodes[0].data.label, "편집 후");
  assert.equal(store.getState().ink, ink);
  store.getState().saveSnapshot();
  const snap = store.getState().documents[0].snapshots![0];
  store.getState().clearInk();
  store.getState().restoreSnapshot(snap.id);
  assert.deepEqual(store.getState().ink, ink);
  store.getState().undo();
  assert.equal(store.getState().ink.strokes.length, 0);
  await store.getState().settleLayout();
});
test("document switching, duplication and deletion preserve each ink and settings", () => {
  reset();
  store.getState().createInkBoard();
  const a = store.getState().activeDocumentId!;
  store.getState().addInkStroke(stroke());
  store.getState().setInkSettings({ width: 9, color: "#dc2626" });
  store.getState().duplicateDocument(a);
  const copy = store.getState().documents[0];
  store.getState().createDocument();
  const b = store.getState().activeDocumentId!;
  store.getState().addInkStroke(stroke("b", 100));
  store.getState().setActiveDocument(a);
  assert.equal(store.getState().ink.strokes[0].id, "s");
  assert.equal(store.getState().inkSettings.width, 9);
  assert.equal(store.getState().nodes.length, 0);
  store.getState().setActiveDocument(copy.id);
  assert.deepEqual(store.getState().ink, copy.ink);
  store.getState().deleteDocument(copy.id);
  assert.equal(store.getState().activeDocumentId, b);
  assert.equal(store.getState().ink.strokes[0].id, "b");
});
test("v3 blank and node-overlay JSON round trip preserves world coordinates, pressure, settings, snapshots", () => {
  for (const blank of [false, true]) {
    reset();
    if (blank) store.getState().createInkBoard();
    else store.getState().createDocument();
    store.getState().addInkStroke(stroke());
    store.getState().setInkSettings({ width: 22 });
    store.getState().saveSnapshot();
    const raw = store.getState().exportJson(),
      before = data(),
      parsed = parseImportJson(raw);
    assert.equal(JSON.parse(raw).version, 3);
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.document.ink, before.ink);
    const old = store.getState().activeDocumentId;
    assert.equal(store.getState().importJson(raw), true);
    assert.notEqual(store.getState().activeDocumentId, old);
    assert.deepEqual(
      JSON.parse(JSON.stringify(data())),
      JSON.parse(JSON.stringify(before)),
    );
    assert.equal(store.getState().inkSettings.width, 22);
    assert.deepEqual(
      store.getState().documents[0].snapshots![0].ink,
      before.ink,
    );
  }
});
test("v1 / v2 imports reset ink safely; malformed ink and future versions preserve existing documents", () => {
  reset();
  store.getState().createInkBoard();
  store.getState().addInkStroke(stroke());
  const before = JSON.stringify(data());
  for (const bad of [
    { version: 2, strokes: [] },
    { version: 1, strokes: [{ ...stroke(), color: "url(javascript:x)" }] },
    { version: 1, strokes: [{ ...stroke(), width: 0 }] },
    {
      version: 1,
      strokes: [{ ...stroke(), points: [{ x: 0, y: 0, pressure: 2 }] }],
    },
    { version: 1, strokes: [stroke(), stroke()] },
  ]) {
    assert.equal(
      store.getState().importJson(
        JSON.stringify({
          nodes: [],
          edges: [],
          boardMode: "blank",
          ink: bad,
        }),
      ),
      false,
    );
    assert.equal(JSON.stringify(data()), before);
  }
  for (const version of [1, 2]) {
    assert.equal(
      store.getState().importJson(
        JSON.stringify({
          version,
          format: "mindforge-document",
          document: portableFixture(),
        }),
      ),
      true,
    );
    assert.deepEqual(store.getState().ink, EMPTY_INK);
    assert.equal(store.getState().boardMode, "map");
  }
  assert.equal(
    validateInk({ version: 1, strokes: [{ ...stroke(), points: [] }] }).ok,
    false,
  );
});
test("autosave storage schema migration retains blank boards and legacy maps", () => {
  const blank = {
    id: "blank",
    title: "빈 보드",
    nodes: [],
    edges: [],
    boardMode: "blank",
    ink: { version: 1, strokes: [stroke()] },
    inkSettings: DEFAULT_INK_SETTINGS,
  };
  const raw = JSON.stringify({
    version: 1,
    documents: [portableFixture(), blank],
    activeDocumentId: "blank",
  });
  const previous = globalThis.window;
  globalThis.window = {
    localStorage: { getItem: () => raw },
  } as unknown as Window & typeof globalThis;
  try {
    const loaded = loadWorkspaceFromStorage();
    assert.ok(loaded.ok);
    assert.equal(loaded.workspace.version, 2);
    assert.deepEqual(loaded.workspace.documents[1].ink, blank.ink);
    assert.equal(loaded.workspace.documents[0].nodes.length, 22);
  } finally {
    globalThis.window = previous;
  }
});
test("swept eraser hits crossings and dots, misses separated ink, expands bounds by full width", () => {
  const s = stroke(),
    p = { x: -500, y: -125, pressure: 1 },
    q = { x: 0, y: -125, pressure: 1 };
  assert.equal(strokeHit(s, p, q, 2), true);
  assert.equal(strokeHit(s, { ...p, y: 900 }, { ...q, y: 900 }, 12), false);
  const dot = { ...s, points: [{ x: 900, y: 800, pressure: 1 }] };
  assert.equal(
    strokeHit(
      dot,
      { x: 900, y: 800, pressure: 1 },
      { x: 900, y: 800, pressure: 1 },
      0,
    ),
    true,
  );
  const b = inkBounds({ version: 1, strokes: [s, dot] })!;
  assert.ok(
    b.x <= -356 && b.y <= -306 && b.x + b.width >= 906 && b.y + b.height >= 806,
  );
  assert.ok(strokePath(s).includes("Z"));
  assert.ok(!strokePath(dot).includes("NaN"));
});
test("sampling drops redundant moves, retains pressure changes, clamps long strokes", () => {
  const ps: InkPoint[] = [];
  appendInkPoint(ps, { x: 0, y: 0, pressure: 1 }, 1);
  assert.equal(appendInkPoint(ps, { x: 0.01, y: 0, pressure: 1 }, 1), false);
  assert.equal(appendInkPoint(ps, { x: 0.01, y: 0, pressure: 0.2 }, 1), true);
  const long = Array.from({ length: MAX_STROKE_POINTS }, () => ({
    x: 1,
    y: 1,
    pressure: 1,
  }));
  assert.equal(
    appendInkPoint(long, { x: 2, y: 2, pressure: 1 }, 1, true),
    false,
  );
});
test("100,000 samples remain portable; path/bounds cache and shared history avoid repeated copying", () => {
  const strokes = Array.from({ length: 1000 }, (_, j) => ({
    id: `large${j}`,
    color: "#2563eb",
    width: 4,
    points: Array.from({ length: 100 }, (_, i) => ({
      x: j * 3 + i,
      y: j * 2 + Math.sin(i),
      pressure: 1,
    })),
  }));
  const doc = { ...portableFixture(), ink: { version: 1 as const, strokes } };
  const start = performance.now(),
    json = exportDocumentJson(doc),
    parsed = parseImportJson(json),
    ms = performance.now() - start;
  assert.ok(parsed.ok);
  assert.equal(parsed.document.ink!.strokes.length, 1000);
  assert.ok(Buffer.byteLength(json) < 10 * 1024 * 1024);
  console.log(
    JSON.stringify({
      largeInk: {
        samples: 100000,
        jsonBytes: Buffer.byteLength(json),
        roundTripMs: Math.round(ms),
      },
    }),
  );
  assert.equal(strokePath(strokes[0]), strokePath(strokes[0]));
});

test("full 250,000-sample v3 ink JSON over 10MB remains importable within the 32MB bound", () => {
  const strokes = Array.from({ length: 25 }, (_, j) => ({
    id: `max${j}`,
    color: "#2563eb",
    width: 4,
    points: Array.from({ length: 10000 }, (_, i) => ({
      x: Math.sin(i) * 999999,
      y: Math.cos(i + j) * 999999,
      pressure: 0.123456789,
    })),
  }));
  const raw = exportDocumentJson({
    ...portableFixture(),
    ink: { version: 1, strokes },
  });
  assert.ok(Buffer.byteLength(raw) > 10 * 1024 * 1024);
  const checked = parseImportJson(raw);
  assert.ok(checked.ok);
  assert.deepEqual(checked.document.ink!.strokes, strokes);
  const tooLarge = parseImportJson(" ".repeat(32 * 1024 * 1024 + 1));
  assert.equal(tooLarge.ok, false);
  if (!tooLarge.ok) assert.match(tooLarge.error, /32MB/);
});
