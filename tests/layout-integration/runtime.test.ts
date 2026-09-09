import assert from "node:assert/strict";
import test from "node:test";
import { useMindMapStore as store } from "../../src/store/mindMapStore";
import { fixture } from "../layout-engine/fixtures/generate";
import { runLayout } from "../../src/lib/layout";
import { buildEdgesFromNodes, getDescendantIds } from "../../src/lib/tree";
import {
  LayoutWorkerClient,
  type WorkerLike,
} from "../../src/lib/layout-engine/worker-client";
import { adaptInput } from "../../src/lib/layout-engine/adapter";
import { solveLayout } from "../../src/lib/layout-engine";
import { validateLayoutPatch } from "../../src/lib/layoutTransactions";
import { exportDocumentJson } from "../../src/lib/export";
import { parseImportJson } from "../../src/lib/validation";
import {
  encodeSharedDocument,
  decodeSharedDocument,
} from "../../src/lib/share";
import type { LayoutResult } from "../../src/lib/layout-engine/types";
globalThis.requestAnimationFrame = (fn: FrameRequestCallback) =>
  setTimeout(() => fn(performance.now()), 0) as unknown as number;
globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id);
async function reset() {
  const nodes = runLayout(fixture(14), "right-tree"),
    edges = buildEdgesFromNodes(nodes),
    doc = {
      id: `test${Math.random()}`,
      title: "테스트",
      nodes,
      edges,
      relations: [],
      layoutMode: "right-tree" as const,
      createdAt: "2026-09-09",
      updatedAt: "2026-09-09",
    };
  store.setState({
    activeDocumentId: doc.id,
    documents: [doc],
    nodes,
    edges,
    relations: [],
    history: [],
    future: [],
    editingNodeId: null,
    selectedNodeIds: [],
    activeLayoutMode: "right-tree",
    flow: null,
  });
  await store.getState().settleLayout();
  return store.getState();
}
test("one mode change is one undo, including mode and all coordinates", async () => {
  const before = await reset();
  store.getState().autoLayout("vertical");
  await store.getState().settleLayout();
  assert.equal(store.getState().history.length, 1);
  assert.equal(store.getState().activeLayoutMode, "vertical");
  store.getState().undo();
  await store.getState().settleLayout();
  assert.deepEqual(
    store.getState().nodes.map((n) => n.position),
    before.nodes.map((n) => n.position),
  );
  assert.equal(store.getState().activeLayoutMode, "right-tree");
  store.getState().redo();
  await store.getState().settleLayout();
  assert.equal(store.getState().activeLayoutMode, "vertical");
});
test("no-op auto layout and cancelled edit add no history", async () => {
  await reset();
  store.getState().autoLayout();
  await store.getState().settleLayout();
  assert.equal(store.getState().history.length, 0);
  store.getState().setEditingNode("n1");
  store.getState().setEditingNode(null);
  await store.getState().settleLayout();
  assert.equal(store.getState().history.length, 0);
  store
    .getState()
    .updateNodeData("n1", { label: store.getState().nodes[1].data.label });
  assert.equal(store.getState().history.length, 0);
});
test("add -> settle -> undo once removes only the new subtree", async () => {
  const before = await reset();
  const id = store.getState().addChildNode("n4");
  await store.getState().settleLayout();
  assert.equal(store.getState().editingNodeId, null);
  assert.equal(store.getState().history.length, 1);
  assert.ok(store.getState().nodes.some((n) => n.id === id));
  store.getState().undo();
  await store.getState().settleLayout();
  assert.deepEqual(
    store.getState().nodes.map((n) => [n.id, n.position]),
    before.nodes.map((n) => [n.id, n.position]),
  );
});
test("duplicate and paste seed a translated subtree, retain existing edges and undo once", async () => {
  for (const action of ["duplicate", "paste"] as const) {
    const before = await reset();
    const source = before.nodes.filter(
      (n) =>
        n.id === "n1" || getDescendantIds(before.nodes, "n1").includes(n.id),
    );
    if (action === "duplicate") store.getState().duplicateSubtree("n1");
    else {
      store.getState().copySubtree("n1");
      store.getState().pasteSubtree("n2");
    }
    const clones = store
      .getState()
      .nodes.filter((n) => !before.nodes.some((b) => b.id === n.id));
    assert.equal(clones.length, source.length);
    const sourceRoot = source.find((n) => n.id === "n1")!,
      cloneRoot = clones.find(
        (n) => !clones.some((c) => c.id === n.data.parentId),
      )!;
    const dx = cloneRoot.position.x - sourceRoot.position.x,
      dy = cloneRoot.position.y - sourceRoot.position.y;
    for (const clone of clones) {
      const original = source.find((n) =>
        clone === cloneRoot ? n.id === "n1" : n.data.label === clone.data.label,
      )!;
      assert.deepEqual(clone.position, {
        x: original.position.x + dx,
        y: original.position.y + dy,
      });
      assert.deepEqual(clone.data.checklist, original.data.checklist);
    }
    for (const edge of before.edges)
      assert.deepEqual(
        store.getState().edges.find((e) => e.id === edge.id),
        edge,
      );
    await store.getState().settleLayout();
    assert.equal(store.getState().history.length, 1);
    store.getState().undo();
    await store.getState().settleLayout();
    assert.deepEqual(
      store.getState().nodes.map((n) => [n.id, n.position]),
      before.nodes.map((n) => [n.id, n.position]),
    );
  }
});
test("text commit and measured correction share one history entry; dimensions do not save", async () => {
  await reset();
  store.getState().setEditingNode("n4");
  store.getState().updateNodeLabel("n4", "긴 한글 제목");
  store.getState().setEditingNode(null);
  const revision = store.getState().revision;
  store
    .getState()
    .onNodesChange([
      { id: "n4", type: "dimensions", dimensions: { width: 640, height: 320 } },
    ]);
  assert.equal(store.getState().revision, revision);
  await store.getState().settleLayout();
  assert.equal(store.getState().history.length, 1);
  store.getState().undo();
  await store.getState().settleLayout();
  assert.notEqual(
    store.getState().nodes.find((n) => n.id === "n4")!.data.label,
    "긴 한글 제목",
  );
});
test("temporary editor dimensions then Escape preserve positions and history", async () => {
  const before = await reset();
  store.getState().setEditingNode("n4");
  store
    .getState()
    .onNodesChange([
      { type: "dimensions", id: "n4", dimensions: { width: 640, height: 400 } },
    ]);
  await store.getState().settleLayout();
  assert.deepEqual(
    store.getState().nodes.map((n) => n.position),
    before.nodes.map((n) => n.position),
  );
  const size = before.nodes.find((n) => n.id === "n4")!.measured!;
  store.getState().onNodesChange([
    {
      type: "dimensions",
      id: "n4",
      dimensions: { width: size.width!, height: size.height! },
    },
  ]);
  store.getState().setEditingNode(null);
  await store.getState().settleLayout();
  assert.equal(store.getState().history.length, 0);
  assert.deepEqual(
    store.getState().nodes.map((n) => n.position),
    before.nodes.map((n) => n.position),
  );
});
test("legacy collapsed children stored at the parent recover on expand without moving outside", async () => {
  await reset();
  const root = store.getState().nodes.find((n) => n.id === "n1")!;
  const ids = new Set(getDescendantIds(store.getState().nodes, "n1"));
  const nodes = store
    .getState()
    .nodes.map((n) =>
      n.id === "n1"
        ? { ...n, data: { ...n.data, collapsed: true } }
        : ids.has(n.id)
          ? { ...n, position: { ...root.position } }
          : n,
    );
  store.setState({ nodes });
  await store.getState().settleLayout();
  store.getState().toggleCollapse("n1");
  await store.getState().settleLayout();
  assert.equal(store.getState().layoutResult?.metrics.nodeOverlaps, 0);
  for (const before of nodes.filter((n) => !ids.has(n.id)))
    assert.deepEqual(
      store.getState().nodes.find((n) => n.id === before.id)!.position,
      before.position,
    );
});
test("snapshot differing only by mode restores and undoes atomically", async () => {
  await reset();
  store.getState().saveSnapshot();
  const doc = store.getState().documents[0];
  const snap = doc.snapshots![0];
  store.setState({
    documents: [{ ...doc, snapshots: [{ ...snap, layoutMode: "vertical" }] }],
  });
  store.getState().restoreSnapshot(snap.id);
  await store.getState().settleLayout();
  assert.equal(store.getState().activeLayoutMode, "vertical");
  assert.equal(store.getState().history.length, 1);
  store.getState().undo();
  await store.getState().settleLayout();
  assert.equal(store.getState().activeLayoutMode, "right-tree");
});
test("drag -> reparent -> undo restores the entire gesture once", async () => {
  const before = await reset();
  store.getState().beginNodeDrag(["n4"]);
  store.getState().onNodesChange([
    {
      type: "position",
      id: "n4",
      position: { x: 500, y: 150 },
      dragging: true,
    },
  ]);
  store.getState().reparentNode("n4", "n2");
  store.getState().endNodeDrag();
  await store.getState().settleLayout();
  assert.equal(store.getState().history.length, 1);
  assert.equal(
    store.getState().nodes.find((n) => n.id === "n4")!.data.parentId,
    "n2",
  );
  store.getState().undo();
  await store.getState().settleLayout();
  assert.deepEqual(
    store.getState().nodes.map((n) => [n.position, n.data.parentId]),
    before.nodes.map((n) => [n.position, n.data.parentId]),
  );
});
test("free drag is preserved; empty drag produces no history", async () => {
  await reset();
  store.getState().beginNodeDrag(["n4"]);
  store.getState().endNodeDrag();
  await store.getState().settleLayout();
  assert.equal(store.getState().history.length, 0);
  store.getState().beginNodeDrag(["n4"]);
  store.getState().onNodesChange([
    {
      type: "position",
      id: "n4",
      position: { x: 345, y: 678 },
      dragging: true,
    },
  ]);
  store.getState().endNodeDrag();
  await store.getState().settleLayout();
  assert.deepEqual(
    store.getState().nodes.find((n) => n.id === "n4")!.position,
    { x: 345, y: 678 },
  );
  assert.equal(store.getState().history.length, 1);
});
test("collapsed drag translates hidden descendants once, including nested folds", async () => {
  await reset();
  store.getState().toggleCollapse("n1");
  await store.getState().settleLayout();
  const before = store.getState().nodes,
    root = before.find((n) => n.id === "n1")!;
  store.getState().beginNodeDrag(["n1"]);
  store.getState().onNodesChange([
    {
      type: "position",
      id: "n1",
      position: { x: root.position.x + 80, y: root.position.y + 40 },
    },
  ]);
  store.getState().endNodeDrag();
  await store.getState().settleLayout();
  for (const id of getDescendantIds(before, "n1")) {
    const a = before.find((n) => n.id === id)!,
      b = store.getState().nodes.find((n) => n.id === id)!;
    assert.deepEqual(b.position, {
      x: a.position.x + 80,
      y: a.position.y + 40,
    });
  }
});
test("new edit cancels unfinished layout; deletion cannot resurrect nodes", async () => {
  await reset();
  store.getState().autoLayout("radial");
  store.getState().updateNodeLabel("n4", "latest");
  store.getState().deleteNode("n5");
  await store.getState().settleLayout();
  assert.equal(store.getState().activeLayoutMode, "right-tree");
  assert.ok(!store.getState().nodes.some((n) => n.id === "n5"));
  assert.equal(
    store.getState().nodes.find((n) => n.id === "n4")!.data.label,
    "latest",
  );
});
test("A -> B -> A changes epoch and discards the initial A calculation", async () => {
  const a = await reset(),
    doc = a.documents[0];
  store.getState().autoLayout("radial");
  store.getState().createDocument("blank");
  const b = store.getState().activeDocumentId;
  store.getState().setActiveDocument(doc.id);
  await store.getState().settleLayout();
  assert.notEqual(b, doc.id);
  assert.equal(store.getState().activeLayoutMode, "right-tree");
  assert.ok(
    store.getState().layoutStamp.documentEpoch > a.layoutStamp.documentEpoch,
  );
});
test("selection, focus, presentation and viewport do not request permanent layout", async () => {
  await reset();
  const stamp = store.getState().layoutStamp;
  store.getState().selectNode("n4");
  store.getState().updateViewport({ x: 1, y: 2, zoom: 0.8 });
  store.setState({
    focusModeNodeId: "n1",
    presentationIndex: 2,
    presentationReveal: true,
  });
  assert.deepEqual(store.getState().layoutStamp, stamp);
  store.setState({ focusModeNodeId: null, presentationReveal: false });
});
test("subtree mode and v1 JSON/share/snapshot round trip retain meaning", async () => {
  await reset();
  store.getState().autoLayoutSubtree("n1", "vertical");
  await store.getState().settleLayout();
  const s = store.getState();
  assert.equal(s.activeLayoutMode, "right-tree");
  assert.equal(s.nodes.find((n) => n.id === "n1")!.data.layoutMode, "vertical");
  const doc = s.documents.find((d) => d.id === s.activeDocumentId)!;
  const imported = parseImportJson(exportDocumentJson(doc));
  assert.equal(imported.ok, true);
  if (imported.ok) {
    assert.equal(imported.document.layoutMode, "right-tree");
    assert.equal(
      imported.document.nodes.find((n) => n.id === "n1")!.data.layoutMode,
      "vertical",
    );
  }
  const shared = decodeSharedDocument(encodeSharedDocument(doc));
  assert.equal(shared.ok, true);
  if (shared.ok)
    assert.ok(
      shared.document.nodes.some((n) => n.data.layoutMode === "vertical"),
    );
  store.getState().saveSnapshot();
  const snap = store
    .getState()
    .documents.find((d) => d.id === s.activeDocumentId)!.snapshots![0];
  store.getState().autoLayout("radial");
  await store.getState().settleLayout();
  store.getState().restoreSnapshot(snap.id);
  await store.getState().settleLayout();
  assert.equal(store.getState().activeLayoutMode, "right-tree");
});
class FakeWorker implements WorkerLike {
  onmessage: ((e: MessageEvent<LayoutResult>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  terminated = false;
  postMessage() {}
  terminate() {
    this.terminated = true;
  }
}
test("terminate settles pending promise and ignores a late callback", async () => {
  const ws: FakeWorker[] = [],
    client = new LayoutWorkerClient(() => {
      const w = new FakeWorker();
      ws.push(w);
      return w;
    });
  const input = adaptInput(fixture(10), { mode: "right-tree" });
  const first = client.run(input);
  const callback = ws[0].onmessage!;
  client.cancel();
  assert.equal((await first).status, "cancelled");
  assert.equal(ws[0].terminated, true);
  const next = { ...input, stamp: { ...input.stamp, requestGeneration: 1 } },
    second = client.run(next);
  callback({ data: solveLayout(input) } as MessageEvent<LayoutResult>);
  ws[1].onmessage!({ data: solveLayout(next) } as MessageEvent<LayoutResult>);
  assert.notEqual((await second).status, "cancelled");
  client.cancel();
});
test("worker creation failure runs chunked fallback and can be cancelled", async () => {
  const client = new LayoutWorkerClient(() => {
      throw Error("unavailable");
    }),
    input = adaptInput(fixture(500), { mode: "radial" });
  const result = client.run(input);
  let heartbeat = false;
  setTimeout(() => {
    heartbeat = true;
    client.cancel();
  }, 2);
  assert.equal((await result).status, "cancelled");
  assert.ok(heartbeat);
});
test("final gate rejects stale/unknown/duplicate/fixed/invalid patches", () => {
  const input = adaptInput(
      fixture(4),
      { mode: "right-tree" },
      { fixedNodeIds: ["n0"] },
    ),
    r = solveLayout(input);
  assert.equal(
    validateLayoutPatch(input, r, { ...input.stamp, documentEpoch: 1 }),
    false,
  );
  for (const positions of [
    [{ id: "absent", x: 0, y: 0 }],
    [{ id: "n0", x: 1, y: 2 }],
    [{ id: "n1", x: NaN, y: 0 }],
    [
      { id: "n1", x: 1, y: 2 },
      { id: "n1", x: 3, y: 4 },
    ],
  ])
    assert.equal(
      validateLayoutPatch(input, { ...r, positions }, input.stamp),
      false,
    );
});
