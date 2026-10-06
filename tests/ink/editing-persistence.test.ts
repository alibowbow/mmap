import test from "node:test";
import assert from "node:assert/strict";
import { useMindMapStore as store } from "../../src/store/mindMapStore";
import { inkItems, strokePath, validateInk } from "../../src/lib/ink";
import { appendStrokeErasure, translateInkItems } from "../../src/lib/inkEditing";
import { deformStrokeAt } from "../../src/lib/inkCurveEditing";
import { exportDocumentJson } from "../../src/lib/export";
import { parseImportJson } from "../../src/lib/validation";
import { loadWorkspaceFromStorage } from "../../src/lib/storage";
import type { InkStroke, MindMapDocument } from "../../src/types/mindmap";

globalThis.requestAnimationFrame = (fn) =>
  setTimeout(() => fn(performance.now()), 0) as unknown as number;
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
const clean = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const branch = (id = "branch"): InkStroke => ({
  id, color: "#246d56", width: 28, brush: "brush", branchStyle: "hand-v1",
  materialStyle: "grain-v1", seed: 71, texture: 0.65, taper: 0.88,
  points: Array.from({ length: 41 }, (_, i) => ({
    x: i * 5, y: Math.sin(i / 13) * 12, pressure: 0.3 + i / 60,
  })),
});
function open() {
  store.setState({
    documents: [], activeDocumentId: null, history: [], future: [],
    inkGestureActive: false, flow: null, hydrated: true, freshDocumentId: null,
    selectedInkId: null, selectedInkIds: [],
  });
  store.getState().createInkBoard();
}
const currentInk = () => clean(store.getState().ink);
const activeDoc = () => store.getState().documents.find((d) => d.id === store.getState().activeDocumentId)!;
const contentState = () => clean({
  ink: store.getState().ink, documents: store.getState().documents,
  activeDocumentId: store.getState().activeDocumentId,
  history: store.getState().history, future: store.getState().future,
  selectedInkId: store.getState().selectedInkId,
  selectedInkIds: store.getState().selectedInkIds,
  revision: store.getState().revision,
});
function assertSelectionExists() {
  const s = store.getState(), ids = new Set(inkItems(s.ink).map((item) => item.id));
  assert.ok(s.selectedInkIds.every((id) => ids.has(id)), "selection must contain only live ink IDs");
  assert.equal(s.selectedInkId, s.selectedInkIds[0] ?? null, "single and group selection must have the same primary item");
}

test("partial erasure and group movement are atomic, retain immutable history and survive JSON/storage", () => {
  open();
  const s = store.getState();
  s.addInkStroke(branch());
  s.addInkStroke({ ...branch("other"), materialStyle: undefined, joinWidth: 5 });
  s.addInkObject({ id: "label", kind: "label", text: "성장", x: 110, y: -25,
    width: 60, height: 40, fontSize: 24, color: "#246d56", fill: false,
    transform: { x: 7, y: 9, rotation: -16, scale: 1.1 } });
  s.setInkPaper({ kind: "kraft", texture: 0.55, seed: 45 });
  s.setInkSettings({ materialStyle: "grain-v1", connectBranches: true, eraserMode: "partial", labelOnBranch: true });
  s.selectInkItems(["branch", "label"]);
  const before = currentInk(), original = store.getState().ink.strokes[0], historyLength = store.getState().history.length;
  const erased = appendStrokeErasure(original, [{ x: 85, y: -30 }, { x: 85, y: 30 }], 12);
  assert.notEqual(erased, original);
  const items = translateInkItems(inkItems(store.getState().ink).map((item) => item.id === erased.id ? erased : item), ["branch", "label"], 37, -23);
  assert.ok(s.replaceInkItems(items));
  assert.equal(store.getState().history.length, historyLength + 1, "one edit is one history entry");
  const edited = currentInk();
  assert.equal(edited.version, 4);
  assert.deepEqual(original.points, before.strokes[0].points);
  assert.equal(original.erasures, undefined, "earlier references must not acquire masks");
  s.undo(); assert.deepEqual(currentInk(), before);
  s.redo(); assert.deepEqual(currentInk(), edited);
  s.saveSnapshot();
  const snap = activeDoc().snapshots![0];
  s.clearInk(); s.restoreSnapshot(snap.id);
  assert.deepEqual(currentInk(), edited);
  const exported = s.exportJson();
  assert.equal(JSON.parse(exported).version, 6);
  const parsed = parseImportJson(exported); assert.ok(parsed.ok);
  assert.deepEqual(parsed.document.ink, edited);
  assert.deepEqual(parsed.document.inkSettings, activeDoc().inkSettings);
  assert.deepEqual(parsed.document.snapshots![0].ink, edited);
  assert.ok(s.importJson(exported)); assert.deepEqual(currentInk(), edited);
  assert.deepEqual(activeDoc().inkSettings, parsed.document.inkSettings);
  const rawWorkspace = JSON.stringify({ version: 3, activeDocumentId: activeDoc().id, documents: [activeDoc()] });
  const previous = globalThis.window;
  globalThis.window = { localStorage: { getItem: () => rawWorkspace } } as unknown as Window & typeof globalThis;
  try {
    const loaded = loadWorkspaceFromStorage(); assert.ok(loaded.ok);
    assert.deepEqual(loaded.workspace.documents[0].ink, edited);
    assert.deepEqual(loaded.workspace.documents[0].inkSettings, parsed.document.inkSettings);
    assert.deepEqual(loaded.workspace.documents[0].snapshots![0].ink, edited);
  } finally { globalThis.window = previous; }
});

test("invalid replacement and future/malformed imports leave current art, history and selection unchanged", () => {
  open(); const s = store.getState(); s.addInkStroke(branch()); s.selectInk("branch");
  s.updateInkItem("branch", { transform: { x: 15, y: -7, scale: 1.2, rotation: 12 } }); s.undo();
  const before = contentState(), source = store.getState().ink.strokes[0];
  const invalid = [
    [source, { ...source }],
    [{ ...source, erasures: [{ radius: -1, points: [{ x: 0, y: 0 }] }] }],
    [{ ...source, erasures: [{ radius: 5, points: Array.from({ length: 8193 }, (_, x) => ({ x, y: 0 })) }] }],
    [{ ...source, materialStyle: "unknown" as InkStroke["materialStyle"] }],
  ];
  for (const items of invalid) {
    assert.equal(s.replaceInkItems(items), false); assert.deepEqual(contentState(), before);
  }
  const base = JSON.parse(s.exportJson());
  for (const mutate of [
    (raw: any) => { raw.version = 7; },
    (raw: any) => { raw.document.ink.strokes[0].erasures = [{ radius: 5, points: [{ x: "bad", y: 0 }] }]; },
    (raw: any) => { raw.document.inkSettings.connectBranches = "true"; },
    (raw: any) => { raw.document.inkSettings.eraserMode = "pixel"; },
  ]) {
    const raw = clean(base); mutate(raw);
    assert.equal(s.importJson(JSON.stringify(raw)), false); assert.deepEqual(contentState(), before);
  }
});

test("new settings alone export a v6 envelope; legacy art still roundtrips without restyling", () => {
  open(); const s = store.getState();
  s.setInkSettings({ connectBranches: false, eraserMode: "stroke", labelOnBranch: false });
  assert.equal(JSON.parse(s.exportJson()).version, 6);
  const configured = parseImportJson(s.exportJson()); assert.ok(configured.ok);
  assert.deepEqual(configured.document.inkSettings, activeDoc().inkSettings);
  const legacy = { ...branch("legacy"), materialStyle: undefined, branchStyle: undefined };
  const doc: MindMapDocument = { id: "legacy-doc", title: "Legacy", nodes: [], edges: [], boardMode: "blank",
    ink: { version: 1, strokes: [legacy] }, createdAt: "2026-10-01", updatedAt: "2026-10-01" };
  const oldPath = strokePath(legacy);
  const parsed = parseImportJson(exportDocumentJson(doc)); assert.ok(parsed.ok);
  assert.deepEqual(parsed.document.ink, clean(doc.ink));
  assert.equal(strokePath(parsed.document.ink!.strokes[0]), oldPath);
  assert.ok(validateInk({ version: 4, strokes: [branch()] }).ok);
  assert.equal(validateInk({ version: 3, strokes: [branch()] }).ok, false, "new rendering cannot masquerade as old ink");
});

test("curve edits survive undo/redo without altering pressure, seed or group paint order", () => {
  open(); const s = store.getState(); s.addInkStroke(branch()); s.addInkStroke(branch("other"));
  const before = currentInk(), original = store.getState().ink.strokes[0];
  const changed = deformStrokeAt(original, 0.5, { x: 100, y: 45 });
  assert.notEqual(changed, original);
  assert.ok(s.replaceInkItems(inkItems(store.getState().ink).map((item) => item.id === changed.id ? changed : item)));
  const after = currentInk();
  assert.deepEqual(after.order, before.order);
  assert.deepEqual(changed.points.map((p) => p.pressure), original.points.map((p) => p.pressure));
  assert.equal(changed.seed, original.seed);
  s.undo(); assert.deepEqual(currentInk(), before); s.redo(); assert.deepEqual(currentInk(), after);
  const parsed = parseImportJson(s.exportJson()); assert.ok(parsed.ok); assert.deepEqual(parsed.document.ink, after);
});

test("primary group selection follows surviving art through deletion, undo, redo and snapshot restore", () => {
  open(); const s = store.getState(); s.addInkStroke(branch("first")); s.addInkStroke(branch("second"));
  s.selectInkItems(["first", "second"]); s.eraseInkStrokes(["first"]);
  assert.deepEqual(store.getState().selectedInkIds, ["second"]); assertSelectionExists();
  s.saveSnapshot(); const snapshot = activeDoc().snapshots![0];
  s.addInkStroke(branch("new")); s.selectInkItems(["new", "second"]);
  s.undo(); assertSelectionExists();
  s.redo(); assertSelectionExists();
  s.selectInk("new"); s.restoreSnapshot(snapshot.id); assertSelectionExists();
});
