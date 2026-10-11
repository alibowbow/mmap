import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { parseImportJson } from "../../src/lib/validation";
import { computeDepths, getHiddenNodeIds } from "../../src/lib/tree";
import { useMindMapStore as store } from "../../src/store/mindMapStore";
import { loadWorkspaceFromStorage } from "../../src/lib/storage";

globalThis.requestAnimationFrame = fn => setTimeout(() => fn(performance.now()), 0) as unknown as number;
globalThis.cancelAnimationFrame = id => clearTimeout(id);
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fixturePath = process.env.MMAP_PRIVATE_FIXTURE;

// The original file remains outside the repository. Assertions compare counts
// and digests so a failed check cannot print private document content.
test("actual private 846-node document imports, reveals every level, persists and reimports as a new copy", { skip: !fixturePath }, async () => {
  const text = readFileSync(fixturePath!, "utf8"), originalDigest = digest(text), parsed = parseImportJson(text);
  assert.ok(parsed.ok, "private input must pass document validation");
  assert.equal(parsed.document.nodes.length, 846);
  assert.equal(parsed.document.nodes.filter(n => n.data.collapsed).length, 843);
  assert.equal(Math.max(...computeDepths(parsed.document.nodes).values()), 6);
  store.setState({ documents: [], activeDocumentId: null, nodes: [], edges: [], relations: [], history: [], future: [], editingNodeId: null, selectedNodeId: null, selectedNodeIds: [], focusModeNodeId: null, inkGestureActive: false, flow: null, hydrated: true, freshDocumentId: null });
  assert.equal(store.getState().importJson(text), true); await store.getState().settleLayout();
  const firstId = store.getState().activeDocumentId, positions = digest(store.getState().nodes.map(n => n.position));
  for (const [depth, count] of [1, 8, 47, 145, 336, 618, 846].entries()) {
    store.getState().expandToDepth(depth); await store.getState().settleLayout();
    assert.equal(store.getState().nodes.length - getHiddenNodeIds(store.getState().nodes).size, count);
    assert.equal(digest(store.getState().nodes.map(n => n.position)), positions);
  }
  store.getState().collapseAll(); await store.getState().settleLayout();
  assert.equal(store.getState().nodes.length - getHiddenNodeIds(store.getState().nodes).size, 1);
  store.getState().expandAll(); await store.getState().settleLayout();
  assert.equal(getHiddenNodeIds(store.getState().nodes).size, 0);
  store.getState().expandToDepth(3); await store.getState().settleLayout();
  const firstDocumentDigest = digest(store.getState().documents[0]);
  const originalWindow = globalThis.window, values = new Map<string, string>();
  globalThis.window = { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) }, matchMedia: () => ({ matches: false }) } as unknown as Window & typeof globalThis;
  try {
    store.getState().saveWorkspace(); const saved = loadWorkspaceFromStorage(); assert.ok(saved.ok);
    assert.equal(saved.workspace.documents[0].nodes.length, 846);
    store.setState({ hydrated: false }); store.getState().loadWorkspace(); await store.getState().settleLayout();
    assert.equal(store.getState().nodes.length - getHiddenNodeIds(store.getState().nodes).size, 145);
    assert.equal(digest(store.getState().nodes.map(n => n.position)), positions);
    assert.equal(store.getState().importJson(text), true); await store.getState().settleLayout();
    assert.notEqual(store.getState().activeDocumentId, firstId); assert.equal(store.getState().documents.length, 2);
    assert.equal(digest(store.getState().documents.find(d => d.id === firstId)), firstDocumentDigest, "reimport preserves the edited prior copy");
    assert.equal(store.getState().nodes.length, 846);
  } finally { globalThis.window = originalWindow; }
  assert.equal(digest(readFileSync(fixturePath!, "utf8")), originalDigest, "source file is unchanged");
});
