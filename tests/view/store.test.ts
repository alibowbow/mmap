import assert from "node:assert/strict";
import test from "node:test";
import { useMindMapStore as store } from "../../src/store/mindMapStore";
import { buildEdgesFromNodes, getHiddenNodeIds } from "../../src/lib/tree";
import { loadWorkspaceFromStorage } from "../../src/lib/storage";
import type { MindMapDocument, MindMapNode, MindMapRelation } from "../../src/types/mindmap";

globalThis.requestAnimationFrame = fn => setTimeout(() => fn(performance.now()), 0) as unknown as number;
globalThis.cancelAnimationFrame = id => clearTimeout(id);
const node = (id: string, parentId: string | null, x: number, y: number, collapsed = true): MindMapNode => ({
  id, type: "mindmap", position: { x, y }, data: { label: `label-${id}`, parentId, type: "plain", collapsed },
});
function coordinates(nodes: MindMapNode[]) { return nodes.map(n => [n.id, n.position.x, n.position.y]); }
function collapseState(nodes: MindMapNode[]) { return nodes.map(n => [n.id, !!n.data.collapsed]); }
type FocusDouble = {
  dataset: { id?: string }; isConnected: boolean;
  closest: (selector: string) => FocusDouble | null;
  contains: (element: unknown) => boolean;
  querySelectorAll: () => FocusDouble[];
  querySelector: () => FocusDouble | null;
  hasAttribute: (name: string) => boolean;
  setAttribute: (name: string, value: string) => void;
  focus: (options?: FocusOptions) => void;
};
function focusHarness(renderNodes = true) {
  const calls: { id?: string; preventScroll?: boolean }[] = [];
  const element = (id?: string): FocusDouble => {
    const attributes = new Map<string, string>();
    const result: FocusDouble = {
      dataset: { id }, isConnected: true, closest: () => null,
      contains: target => target === result, querySelectorAll: () => [], querySelector: () => null,
      hasAttribute: name => attributes.has(name), setAttribute: (name, value) => { attributes.set(name, value); },
      focus: options => { dom.activeElement = result; calls.push({ id, preventScroll: options?.preventScroll }); },
    };
    return result;
  };
  const body = element(), pane = element("pane"), canvas = element("canvas");
  const dom: { body: FocusDouble; activeElement: FocusDouble } = { body, activeElement: body };
  const wrappers = store.getState().nodes.map(node => element(node.id));
  for (const wrapper of wrappers) wrapper.closest = selector => selector === ".react-flow__node" ? wrapper : canvas;
  canvas.querySelectorAll = () => renderNodes ? wrappers.filter(wrapper => !getHiddenNodeIds(store.getState().nodes).has(wrapper.dataset.id!)) : [];
  canvas.querySelector = () => pane;
  return { dom, calls, wrappers, pane };
}
async function reset(nodes = [node("r", null, 0, 0), node("a", "r", 250, 0), node("b", "a", 500, 0), node("c", "b", 750, 0), node("side", "r", 250, 150)]) {
  const edges = buildEdgesFromNodes(nodes), relations: MindMapRelation[] = [{ id: "rel", source: "side", target: "c", label: "link" }];
  const doc: MindMapDocument = { id: `view-test-${Math.random()}`, title: "View tests", nodes, edges, relations, layoutMode: "right-tree", createdAt: "2026-10-11", updatedAt: "2026-10-11", viewport: { x: 12, y: 34, zoom: 0.7 } };
  store.setState({ documents: [doc], activeDocumentId: doc.id, nodes, edges, relations, history: [], future: [],
    selectedNodeId: null, selectedNodeIds: [], editingNodeId: null, editSeed: null, selectedRelationId: null, contextMenu: null,
    dropTargetId: null, dropPendingId: null, focusModeNodeId: null, presentationIndex: 0, mobileSheetOpen: false,
    activeLayoutMode: "right-tree", inkGestureActive: false, hydrated: true, flow: null, freshDocumentId: null });
  await store.getState().settleLayout();
  return doc;
}

test("each preset is a single persistent undo step, idempotent, and preserves camera and positions", async () => {
  const doc = await reset(), initialCoordinates = coordinates(store.getState().nodes);
  const cameraCalls: string[] = [];
  store.setState({ flow: { fitView: () => cameraCalls.push("fit"), setCenter: () => cameraCalls.push("center"), setViewport: () => cameraCalls.push("viewport") } as never });
  for (const [depth, count] of [[1, 3], [2, 4], [3, 5], [0, 1]] as const) {
    const before = collapseState(store.getState().nodes), h = store.getState().history.length;
    store.getState().expandToDepth(depth);
    await store.getState().settleLayout();
    assert.equal(store.getState().nodes.length - getHiddenNodeIds(store.getState().nodes).size, count);
    assert.equal(store.getState().history.length, h + 1);
    assert.deepEqual(coordinates(store.getState().nodes), initialCoordinates);
    const revision = store.getState().revision, after = collapseState(store.getState().nodes);
    store.getState().expandToDepth(depth);
    await store.getState().settleLayout();
    assert.equal(store.getState().history.length, h + 1);
    assert.equal(store.getState().revision, revision);
    store.getState().undo(); await store.getState().settleLayout();
    assert.deepEqual(collapseState(store.getState().nodes), before);
    store.getState().redo(); await store.getState().settleLayout();
    assert.deepEqual(collapseState(store.getState().nodes), after);
    assert.deepEqual(coordinates(store.getState().nodes), initialCoordinates);
  }
  store.getState().expandAll(); await store.getState().settleLayout();
  assert.equal(getHiddenNodeIds(store.getState().nodes).size, 0);
  store.getState().collapseAll(); await store.getState().settleLayout();
  assert.equal(getHiddenNodeIds(store.getState().nodes).size, 4);
  assert.deepEqual(store.getState().documents[0].viewport, doc.viewport);
  assert.deepEqual(cameraCalls, []);
});

test("hidden editor, relation, drop targets, contextual UI and focused branch are cleaned without deleting links", async () => {
  await reset();
  store.getState().expandAll(); await store.getState().settleLayout();
  store.setState({ selectedNodeId: "c", selectedNodeIds: ["side", "c"], editingNodeId: "c", editSeed: "x",
    selectedRelationId: "rel", contextMenu: { nodeId: "b", x: 10, y: 10 }, dropTargetId: "c", dropPendingId: "b", focusModeNodeId: "a", mobileSheetOpen: true, presentationIndex: 4 });
  const label = store.getState().nodes.find(n => n.id === "c")!.data.label;
  store.getState().expandToDepth(1); await store.getState().settleLayout();
  const state = store.getState();
  assert.deepEqual(state.selectedNodeIds, ["side"]);
  assert.equal(state.selectedNodeId, "side");
  assert.equal(state.editingNodeId, null); assert.equal(state.editSeed, null);
  assert.equal(state.selectedRelationId, null); assert.equal(state.contextMenu, null);
  assert.equal(state.dropTargetId, null); assert.equal(state.dropPendingId, null); assert.equal(state.focusModeNodeId, null);
  assert.equal(state.presentationIndex, 2);
  assert.equal(state.edges.length, 4); assert.equal(state.relations.length, 1);
  assert.equal(state.nodes.find(n => n.id === "c")!.data.label, label);
  store.getState().collapseAll(); await store.getState().settleLayout();
  assert.equal(store.getState().mobileSheetOpen, false);
  assert.equal(store.getState().selectedNodeId, null);
});

test("single-node collapse and undo/redo never retain a selection hidden by restored collapse state", async () => {
  await reset(); store.getState().expandAll(); await store.getState().settleLayout();
  store.getState().selectNode("c"); store.getState().toggleCollapse("a"); await store.getState().settleLayout();
  assert.equal(store.getState().selectedNodeId, null);
  store.getState().undo(); await store.getState().settleLayout();
  store.getState().selectNode("c"); store.getState().redo(); await store.getState().settleLayout();
  assert.equal(store.getState().selectedNodeId, null);
  store.getState().expandAll(); await store.getState().settleLayout(); store.getState().selectNode("c");
  store.getState().undo(); await store.getState().settleLayout();
  assert.equal(store.getState().selectedNodeId, null, "undoing an expansion hides descendants safely");
});

test("newly expanded node measurements retain custom coordinates, including coincident legacy children", async () => {
  const nodes = [node("r", null, 0, 0), node("a", "r", 0, 0), node("b", "a", 0, 0), node("c", "b", 0, 0)];
  await reset(nodes); const before = coordinates(nodes);
  store.getState().expandAll(); await store.getState().settleLayout();
  store.getState().onNodesChange([{ id: "a", type: "dimensions", dimensions: { width: 370, height: 240 } }, { id: "b", type: "dimensions", dimensions: { width: 210, height: 100 } }]);
  await store.getState().settleLayout();
  assert.deepEqual(coordinates(store.getState().nodes), before);
  assert.equal(store.getState().history.length, 1);
  assert.equal(store.getState().nodes.some(n => n.data.layoutMode), false, "view expansion does not become a subtree layout action");
});

test("invalid depth and active ink gesture are no-ops; repeating the restored view preserves redo history", async () => {
  await reset(); const state = store.getState();
  for (const depth of [-1, NaN, Infinity]) store.getState().expandToDepth(depth);
  assert.equal(store.getState().nodes, state.nodes); assert.equal(store.getState().history.length, 0);
  store.setState({ inkGestureActive: true }); store.getState().expandAll();
  assert.equal(store.getState().nodes, state.nodes);
  store.setState({ inkGestureActive: false }); store.getState().collapseAll(); await store.getState().settleLayout();
  store.getState().expandAll(); await store.getState().settleLayout();
  store.getState().undo(); await store.getState().settleLayout();
  const future = store.getState().future;
  store.getState().expandToDepth(0); await store.getState().settleLayout();
  const next = store.getState().nodes;
  store.getState().expandToDepth(0); await store.getState().settleLayout();
  assert.equal(store.getState().nodes, next);
  assert.equal(store.getState().future, future);
  assert.equal(future.length, 1);
});

test("late measurements after undo and redo preserve the restored view coordinates", async () => {
  await reset(); store.getState().expandAll(); await store.getState().settleLayout();
  const before = coordinates(store.getState().nodes);
  store.getState().expandToDepth(1); await store.getState().settleLayout();
  store.getState().undo(); await store.getState().settleLayout();
  store.getState().onNodesChange([{ id: "a", type: "dimensions", dimensions: { width: 450, height: 340 } }]);
  await store.getState().settleLayout();
  assert.deepEqual(coordinates(store.getState().nodes), before);
  store.getState().redo(); await store.getState().settleLayout();
  store.getState().onNodesChange([{ id: "a", type: "dimensions", dimensions: { width: 260, height: 75 } }]);
  await store.getState().settleLayout();
  assert.deepEqual(coordinates(store.getState().nodes), before);
});

test("a delayed drag dwell cannot re-arm a hidden or missing drop target", async () => {
  await reset(); store.getState().expandAll(); await store.getState().settleLayout();
  store.getState().setDropPendingId("c"); store.getState().setDropTargetId("c");
  assert.equal(store.getState().dropTargetId, "c");
  store.getState().expandToDepth(1); await store.getState().settleLayout();
  store.getState().setDropTargetId("c"); store.getState().setDropPendingId("b");
  assert.equal(store.getState().dropTargetId, null); assert.equal(store.getState().dropPendingId, null);
  store.getState().setDropTargetId("missing"); assert.equal(store.getState().dropTargetId, null);
  store.getState().setDropPendingId("side"); assert.equal(store.getState().dropPendingId, "side");
  store.setState({ focusModeNodeId: "a" }); store.getState().setDropTargetId("side");
  assert.equal(store.getState().dropTargetId, null, "the target must also be visible in branch focus");
});

test("hiding the keyboard-focused node restores its nearest visible ancestor without scrolling", async () => {
  await reset(); store.getState().expandAll(); await store.getState().settleLayout();
  const originalDocument = globalThis.document, { dom, calls, wrappers } = focusHarness();
  dom.activeElement = wrappers.find(node => node.dataset.id === "c")!;
  globalThis.document = dom as unknown as Document;
  try {
    store.getState().expandToDepth(1);
    dom.activeElement = dom.body;
    await store.getState().settleLayout();
    assert.equal(dom.activeElement.dataset.id, "a");
    assert.deepEqual(calls, [{ id: "a", preventScroll: true }]);
    store.getState().undo(); await store.getState().settleLayout();
    dom.activeElement = wrappers.find(node => node.dataset.id === "c")!;
    store.getState().redo(); dom.activeElement = dom.body;
    await store.getState().settleLayout();
    assert.equal(dom.activeElement.dataset.id, "a", "keyboard redo also restores visible focus");
  } finally { globalThis.document = originalDocument; }
});

test("hidden-node focus recovery falls back to the canvas pane and respects later toolbar focus", async () => {
  await reset(); store.getState().expandAll(); await store.getState().settleLayout();
  const originalDocument = globalThis.document, { dom, calls, wrappers, pane } = focusHarness(false);
  const leaf = wrappers.find(node => node.dataset.id === "c")!;
  dom.activeElement = leaf; globalThis.document = dom as unknown as Document;
  try {
    store.getState().collapseAll(); dom.activeElement = dom.body;
    await store.getState().settleLayout();
    assert.equal(dom.activeElement, pane); assert.equal(pane.hasAttribute("tabindex"), true);
    assert.deepEqual(calls, [{ id: "pane", preventScroll: true }]);
    store.getState().expandAll(); await store.getState().settleLayout();
    dom.activeElement = leaf; store.getState().collapseAll();
    const laterToolbarFocus = wrappers.find(node => node.dataset.id === "side")!;
    dom.activeElement = laterToolbarFocus;
    await store.getState().settleLayout();
    assert.equal(dom.activeElement, laterToolbarFocus);
    assert.equal(calls.length, 1, "scheduled recovery does not steal a later focus change");
  } finally { globalThis.document = originalDocument; }
});

test("collapse state survives storage reload without changing positions or links", async () => {
  const originalWindow = globalThis.window;
  const values = new Map<string, string>();
  globalThis.window = { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) }, matchMedia: () => ({ matches: false }) } as unknown as Window & typeof globalThis;
  try {
    await reset(); store.getState().expandToDepth(2); await store.getState().settleLayout();
    const before = coordinates(store.getState().nodes), collapsed = collapseState(store.getState().nodes);
    store.getState().saveWorkspace(); const saved = loadWorkspaceFromStorage();
    assert.ok(saved.ok); assert.deepEqual(collapseState(saved.workspace.documents[0].nodes), collapsed);
    store.setState({ hydrated: false, flow: null }); store.getState().loadWorkspace(); await store.getState().settleLayout();
    assert.deepEqual(collapseState(store.getState().nodes), collapsed); assert.deepEqual(coordinates(store.getState().nodes), before);
    assert.equal(store.getState().edges.length, 4); assert.equal(store.getState().relations.length, 1);
    assert.equal(store.getState().nodes.length - getHiddenNodeIds(store.getState().nodes).size, 4);
  } finally { globalThis.window = originalWindow; }
});
