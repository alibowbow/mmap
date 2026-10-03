import assert from "node:assert/strict";
import test from "node:test";
import { portableFixture } from "./fixture";
import { appearanceFrom, DEFAULT_APPEARANCE } from "../../src/lib/appearance";
import { exportDocumentJson } from "../../src/lib/export";
import { parseImportJson } from "../../src/lib/validation";
import { loadWorkspaceFromStorage } from "../../src/lib/storage";
import { useMindMapStore as store } from "../../src/store/mindMapStore";

globalThis.requestAnimationFrame = (fn: FrameRequestCallback) =>
  setTimeout(() => fn(performance.now()), 0) as unknown as number;
globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id);

test("v4 preserves design, Korean content, manual geometry, collapse, relations and snapshots", () => {
  const doc = portableFixture();
  doc.nodes[0].width = 333;
  doc.nodes[0].height = 100;
  doc.nodes[0].measured = { width: 333, height: 100 };
  doc.snapshots = [
    {
      id: "snap",
      label: "이전 생각",
      createdAt: doc.createdAt,
      nodes: doc.nodes,
      edges: doc.edges,
      relations: doc.relations,
      layoutMode: "vertical",
    },
  ];
  const json = exportDocumentJson(doc),
    parsed = parseImportJson(json);
  assert.equal(JSON.parse(json).version, 4);
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.document.nodes, doc.nodes);
  assert.deepEqual(parsed.document.appearance, doc.appearance);
  assert.deepEqual(parsed.document.viewport, doc.viewport);
  assert.deepEqual(parsed.document.relations, doc.relations);
  assert.deepEqual(parsed.document.snapshots, doc.snapshots);
  const reexport = parseImportJson(exportDocumentJson(parsed.document));
  assert.ok(reexport.ok);
  assert.deepEqual(
    { ...reexport.document, updatedAt: "" },
    { ...parsed.document, updatedAt: "" },
  );
});

test("v1, unversioned wrappers, bare documents and partial design use safe defaults", () => {
  const doc = portableFixture();
  delete doc.appearance;
  for (const raw of [
    doc,
    { document: doc },
    { format: "mindforge-document", version: 1, document: doc },
    { format: "mindbranch-document", version: 1, document: doc },
  ]) {
    const result = parseImportJson(JSON.stringify(raw));
    assert.ok(result.ok);
    assert.deepEqual(result.document.appearance, DEFAULT_APPEARANCE);
  }
  const result = parseImportJson(
    JSON.stringify({ ...doc, appearance: { font: "jua" } }),
  );
  assert.ok(result.ok);
  assert.deepEqual(result.document.appearance, appearanceFrom({ font: "jua" }));
});

test("malformed, partial, nonfinite geometry, invalid styles, future versions and broken graphs fail before store mutation", async () => {
  const doc = portableFixture();
  store.setState({
    ...DEFAULT_APPEARANCE,
    documents: [doc],
    activeDocumentId: doc.id,
    nodes: doc.nodes,
    edges: doc.edges,
    relations: doc.relations,
    activeLayoutMode: doc.layoutMode,
  });
  await store.getState().settleLayout();
  const before = JSON.stringify({
    docs: store.getState().documents,
    nodes: store.getState().nodes,
    active: store.getState().activeDocumentId,
  });
  const bad: unknown[] = [
    null,
    { nodes: [] },
    { ...doc, edges: null },
    { ...doc, relations: [null] },
    { ...doc, appearance: { font: "invented" } },
    { ...doc, appearance: { levelFontSizes: [18] } },
    { ...doc, viewport: { x: 0, y: 0, zoom: -1 } },
    { ...doc, nodes: [{ ...doc.nodes[0], position: { x: null, y: 0 } }] },
    { ...doc, nodes: [{ ...doc.nodes[0], width: -2 }] },
    { ...doc, nodes: [{ ...doc.nodes[0], data: { label: 123 } }] },
    { ...doc, nodes: [...doc.nodes, doc.nodes[0]] },
    { format: "other", version: 2, document: doc },
    { format: "mindforge-document", version: 99, document: doc },
    { version: "2", document: doc },
  ];
  for (const text of ["{", ...bad.map((x) => JSON.stringify(x))]) {
    const parsed = parseImportJson(text);
    assert.equal(parsed.ok, false, text);
    assert.equal(store.getState().importJson(text), false);
    assert.equal(
      JSON.stringify({
        docs: store.getState().documents,
        nodes: store.getState().nodes,
        active: store.getState().activeDocumentId,
      }),
      before,
    );
  }
  assert.match(
    (
      parseImportJson(JSON.stringify({ version: 99, document: doc })) as {
        error: string;
      }
    ).error,
    /99.*5/,
  );
});

test("import creates a copy, freezes legacy document design and restores each document design on switching", async () => {
  const old = portableFixture();
  delete old.appearance;
  const oldDesign = appearanceFrom({
    font: "inter",
    nodeStyle: "pill",
    canvasBg: "lines",
    accent: "blue",
  });
  store.setState({
    ...oldDesign,
    documents: [old],
    activeDocumentId: old.id,
    nodes: old.nodes,
    edges: old.edges,
    relations: old.relations,
    activeLayoutMode: old.layoutMode,
  });
  await store.getState().settleLayout();
  const incoming = portableFixture();
  assert.ok(store.getState().importJson(exportDocumentJson(incoming)));
  const importedId = store.getState().activeDocumentId;
  assert.notEqual(importedId, old.id);
  assert.equal(store.getState().documents.length, 2);
  assert.deepEqual(store.getState().nodes, incoming.nodes);
  assert.deepEqual(appearanceFrom(store.getState()), incoming.appearance);
  store.getState().setActiveDocument(old.id);
  assert.deepEqual(appearanceFrom(store.getState()), oldDesign);
  assert.deepEqual(store.getState().nodes, old.nodes);
  store.getState().setActiveDocument(importedId!);
  assert.deepEqual(appearanceFrom(store.getState()), incoming.appearance);
  store.getState().setFont("inter");
  assert.equal(
    store.getState().documents.find((d) => d.id === importedId)?.appearance
      ?.font,
    "inter",
  );
  assert.deepEqual(
    store.getState().documents.find((d) => d.id === old.id)?.appearance,
    oldDesign,
  );
});

test("legacy workspace migration preserves the stored design and all existing content", () => {
  const doc = portableFixture();
  delete doc.appearance;
  const workspace = {
    version: 1,
    documents: [doc],
    activeDocumentId: doc.id,
    font: "jua",
    nodeStyle: "soft",
    theme: "dark",
  };
  const savedWindow = globalThis.window;
  globalThis.window = {
    localStorage: { getItem: () => JSON.stringify(workspace) },
  } as unknown as Window & typeof globalThis;
  try {
    const result = loadWorkspaceFromStorage();
    assert.ok(result.ok);
    assert.deepEqual(result.workspace.documents[0].nodes, doc.nodes);
    assert.deepEqual(
      result.workspace.documents[0].appearance,
      appearanceFrom(workspace),
    );
  } finally {
    globalThis.window = savedWindow;
  }
});

test("measuring an imported manual map does not silently rearrange its saved coordinates", async () => {
  const doc = portableFixture();
  store.getState().importJson(exportDocumentJson(doc));
  await store.getState().settleLayout();
  const before = store.getState().nodes.map((n) => n.position);
  store
    .getState()
    .onNodesChange([
      {
        id: "leaf-0-0",
        type: "dimensions",
        dimensions: { width: 232, height: 400 },
      },
    ]);
  await store.getState().settleLayout();
  assert.deepEqual(
    store.getState().nodes.map((n) => n.position),
    before,
  );
  assert.equal(store.getState().history.length, 0);
});

test("pasted JSON uses the same UTF-8 byte limit as file upload", () => {
  const result = parseImportJson(JSON.stringify({ document: { nodes: [], title: "가".repeat(3_600_000) } }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /10MB/);
});
