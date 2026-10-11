import assert from "node:assert/strict";
import test from "node:test";
import { useMindMapStore as store } from "../../src/store/mindMapStore";
import { buildEdgesFromNodes, getHiddenNodeIds, getSubtreeIds } from "../../src/lib/tree";
import { exportDocumentJson } from "../../src/lib/export";
import type { MindMapDocument, MindMapNode } from "../../src/types/mindmap";

globalThis.requestAnimationFrame = fn => setTimeout(() => fn(performance.now()), 0) as unknown as number;
globalThis.cancelAnimationFrame = id => clearTimeout(id);
function documentFixture(prefix = ""): MindMapDocument {
  const nodes: MindMapNode[] = [
    ["r", null, 0, 0], ["a", "r", 300, 0], ["aa", "a", 600, 0], ["b", "r", 300, 180],
  ].map(([id, parentId, x, y]) => ({
    id: prefix + id, type: "mindmap", position: { x: x as number, y: y as number },
    data: { label: `Incoming ${id}`, parentId: parentId ? prefix + parentId : null, type: parentId ? "idea" : "root", collapsed: false },
  }));
  return { id: "fixture-doc", title: "Import boundary", nodes, edges: buildEdgesFromNodes(nodes), relations: [], layoutMode: "right-tree", createdAt: "2026-10-11", updatedAt: "2026-10-11" };
}
async function openOld() {
  const doc = { ...documentFixture(), id: "old-doc" };
  store.setState({ documents: [doc], activeDocumentId: doc.id, nodes: doc.nodes, edges: doc.edges, relations: [], history: [], future: [],
    focusModeNodeId: null, presentationMode: false, presentationIndex: 0, presentationReveal: false, connectMode: false,
    selectedNodeId: "r", selectedNodeIds: ["r"], selectedRelationId: null, editingNodeId: null, editSeed: null,
    dropTargetId: null, dropPendingId: null, contextMenu: null, searchOpen: false, searchQuery: "", searchTypes: [], searchStatuses: [],
    commandPaletteOpen: false, mobileDrawerOpen: false, mobileMoreOpen: false, mobileSheetOpen: false, dialog: null,
    activeLayoutMode: "right-tree", flow: null, hydrated: true, freshDocumentId: null, inkGestureActive: false });
  await store.getState().settleLayout();
  store.getState().updateNodeLabel("aa", "Current unsaved content");
  await store.getState().settleLayout();
  return doc.id;
}
function renderedCount() {
  const state = store.getState(), hidden = getHiddenNodeIds(state.nodes);
  const focus = state.focusModeNodeId ? new Set(getSubtreeIds(state.nodes, state.focusModeNodeId)) : null;
  return state.nodes.filter(node => !hidden.has(node.id) && (!focus || focus.has(node.id))).length;
}
const snapshot = () => {
  const s = store.getState();
  return JSON.parse(JSON.stringify({ documents: s.documents, activeDocumentId: s.activeDocumentId, nodes: s.nodes, edges: s.edges, relations: s.relations,
    history: s.history, future: s.future, focusModeNodeId: s.focusModeNodeId, presentationMode: s.presentationMode, presentationIndex: s.presentationIndex,
    presentationReveal: s.presentationReveal, connectMode: s.connectMode, dropTargetId: s.dropTargetId, dropPendingId: s.dropPendingId,
    contextMenu: s.contextMenu, selectedNodeId: s.selectedNodeId, selectedNodeIds: s.selectedNodeIds, selectedRelationId: s.selectedRelationId,
    editingNodeId: s.editingNodeId, editSeed: s.editSeed, searchOpen: s.searchOpen, searchQuery: s.searchQuery, searchTypes: s.searchTypes,
    searchStatuses: s.searchStatuses, commandPaletteOpen: s.commandPaletteOpen, mobileDrawerOpen: s.mobileDrawerOpen,
    mobileMoreOpen: s.mobileMoreOpen, mobileSheetOpen: s.mobileSheetOpen, dialog: s.dialog, ink: s.ink, inkSettings: s.inkSettings,
    selectedInkId: s.selectedInkId, selectedInkIds: s.selectedInkIds, sidebarCollapsed: s.sidebarCollapsed, inspectorOpen: s.inspectorOpen,
    clipboard: s.clipboard, tutorialStep: s.tutorialStep, revision: s.revision, saveStatus: s.saveStatus }));
};
function primeTransientState() {
  store.setState({ focusModeNodeId: "a", presentationMode: true, presentationIndex: 2, connectMode: true,
    dropTargetId: "aa", dropPendingId: "a", contextMenu: { nodeId: "a", x: 20, y: 30 }, selectedNodeId: "aa", selectedNodeIds: ["a", "aa"],
    selectedRelationId: "old-relation", editingNodeId: "aa", editSeed: "Draft seed", searchOpen: true, searchQuery: "Old filter",
    searchTypes: ["task"], searchStatuses: ["done"], commandPaletteOpen: true, mobileDrawerOpen: true, mobileMoreOpen: true, mobileSheetOpen: true,
    selectedInkId: "old-ink", selectedInkIds: ["old-ink"], dialog: "import", sidebarCollapsed: true, inspectorOpen: false,
    clipboard: [store.getState().nodes[1]], tutorialStep: 2 });
}

for (const prefix of ["", "different-"]) {
  test(`successful JSON import clears branch focus with ${prefix ? "different" : "identical"} node IDs and preserves the prior edited document`, async () => {
    const oldId = await openOld();
    store.setState({ focusModeNodeId: "a" });
    assert.equal(renderedCount(), 2, "old document intentionally shows a focused branch");
    const oldNodes = JSON.stringify(store.getState().documents[0].nodes);
    assert.equal(store.getState().importJson(exportDocumentJson(documentFixture(prefix))), true);
    await store.getState().settleLayout();
    const s = store.getState();
    assert.notEqual(s.activeDocumentId, oldId); assert.equal(s.documents.length, 2);
    assert.equal(s.focusModeNodeId, null, "old focus must not constrain the imported copy");
    assert.equal(renderedCount(), 4);
    assert.equal(JSON.stringify(s.documents.find(doc => doc.id === oldId)!.nodes), oldNodes);
    const newId = s.activeDocumentId;
    s.undo(); await store.getState().settleLayout();
    assert.equal(store.getState().activeDocumentId, newId); assert.equal(renderedCount(), 4);
    assert.equal(store.getState().history.length, 0, "old document history cannot undo inside the new copy");
  });
}

test("only successful JSON activation resets document-specific surfaces and IDs while preserving user preferences", async () => {
  await openOld(); primeTransientState();
  const clipboard = store.getState().clipboard, inkSettings = store.getState().inkSettings;
  assert.equal(store.getState().importJson(exportDocumentJson(documentFixture())), true);
  await store.getState().settleLayout();
  const s = store.getState();
  for (const field of ["focusModeNodeId", "dropTargetId", "dropPendingId", "contextMenu", "selectedRelationId", "editingNodeId", "editSeed", "dialog", "tutorialStep"] as const) assert.equal(s[field], null, field);
  for (const field of ["presentationMode", "connectMode", "searchOpen", "commandPaletteOpen", "mobileDrawerOpen", "mobileMoreOpen", "mobileSheetOpen"] as const) assert.equal(s[field], false, field);
  assert.equal(s.presentationIndex, 0); assert.equal(s.searchQuery, ""); assert.deepEqual(s.searchTypes, []); assert.deepEqual(s.searchStatuses, []);
  assert.equal(s.selectedNodeId, "r"); assert.deepEqual(s.selectedNodeIds, ["r"]); assert.deepEqual(s.history, []); assert.deepEqual(s.future, []);
  assert.equal(s.selectedInkId, null); assert.deepEqual(s.selectedInkIds, []);
  assert.equal(s.presentationReveal, false); assert.equal(s.sidebarCollapsed, true); assert.equal(s.inspectorOpen, false); assert.equal(s.clipboard, clipboard);
  assert.deepEqual(s.inkSettings, inkSettings);
});

test("cancelled and malformed/unsupported JSON imports preserve current drafts, focus, history and settings", async () => {
  await openOld();
  store.getState().updateNodeLabel("b", "Undoable sibling edit"); await store.getState().settleLayout();
  store.getState().undo(); await store.getState().settleLayout();
  assert.ok(store.getState().history.length > 0); assert.ok(store.getState().future.length > 0);
  store.getState().setInkSettings({ color: "#13579b", width: 9 });
  primeTransientState();
  const beforeCancel = snapshot();
  store.getState().setDialog(null);
  const cancelled = snapshot();
  assert.equal(store.getState().focusModeNodeId, "a"); assert.equal(store.getState().editingNodeId, "aa");
  assert.deepEqual(cancelled, { ...beforeCancel, dialog: null, mobileMoreOpen: false }, "cancellation closes the dialog and its mobile menu launcher, retaining document context");
  store.getState().setDialog("import");
  for (const text of ["{ malformed", JSON.stringify({ version: 999, document: documentFixture() }), JSON.stringify({ format: "unrelated-format", version: 4, document: documentFixture() }), JSON.stringify({ nodes: [] })]) {
    const before = snapshot();
    assert.equal(store.getState().importJson(text), false);
    assert.deepEqual(snapshot(), before, "failure may add a toast but must not change the document or transient context");
  }
});

test("the unfocused imported copy survives its own undo/redo and storage reload", async () => {
  const previousWindow = globalThis.window, values = new Map<string, string>();
  globalThis.window = { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) }, matchMedia: () => ({ matches: false }) } as unknown as Window & typeof globalThis;
  try {
    await openOld(); store.setState({ focusModeNodeId: "a" });
    assert.equal(store.getState().importJson(exportDocumentJson(documentFixture())), true); await store.getState().settleLayout();
    const newId = store.getState().activeDocumentId;
    store.getState().updateNodeLabel("aa", "Imported copy edit"); await store.getState().settleLayout();
    store.getState().undo(); await store.getState().settleLayout();
    assert.equal(store.getState().activeDocumentId, newId); assert.equal(renderedCount(), 4);
    assert.equal(store.getState().nodes.find(node => node.id === "aa")!.data.label, "Incoming aa");
    store.getState().redo(); await store.getState().settleLayout();
    assert.equal(store.getState().focusModeNodeId, null); assert.equal(renderedCount(), 4);
    store.getState().saveWorkspace(); store.setState({ hydrated: false }); store.getState().loadWorkspace(); await store.getState().settleLayout();
    assert.equal(store.getState().activeDocumentId, newId); assert.equal(store.getState().documents.length, 2);
    assert.equal(store.getState().focusModeNodeId, null); assert.equal(renderedCount(), 4);
    assert.equal(store.getState().nodes.find(node => node.id === "aa")!.data.label, "Imported copy edit");
  } finally { globalThis.window = previousWindow; }
});
