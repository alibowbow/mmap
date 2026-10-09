import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { setImmediate as nextTurn } from "node:timers/promises";
import { portableFixture } from "../io/fixture";
import { toSharedCloudDocument } from "../../src/lib/cloud/projection";
import type { SharedCloudDocument } from "../../src/lib/cloud/contracts";
import { BRANCH_AUTO_PALETTE } from "../../src/lib/constants";
import {
  createSharedDocumentLoader,
  fetchSharedDocument,
  readSharedResponse,
  SharedViewError,
  type SharedLoadState,
} from "../../src/components/share/viewer-client";
import {
  initialCollapsed,
  matchingNodeIds,
  revealAncestors,
  safeViewerHref,
  tokenFromFragment,
  viewerProjection,
} from "../../src/components/share/viewer-model";

const tokenA = "A".repeat(43), tokenB = "B".repeat(43);
const fixture = () => toSharedCloudDocument(portableFixture());
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test("viewer accepts the capability only from an exact token fragment", () => {
  assert.equal(tokenFromFragment(`#token=${tokenA}`), tokenA);
  for (const value of ["", `?token=${tokenA}`, `#m=${tokenA}`, `#token=${tokenA}&other=x`, `#token=${tokenA}%20`, `#token=${tokenA.slice(1)}`])
    assert.equal(tokenFromFragment(value), null);
});

test("wire reader strips owner, navigation, runtime and nested private data while preserving ink v4", () => {
  const input = portableFixture();
  input.ink = {
    version: 4,
    strokes: [{
      id: "stroke", color: "#246d56", width: 8,
      points: [{ x: 1, y: 2, pressure: .8 }, { x: 55, y: 60, pressure: .4 }],
      brush: "branch", branchStyle: "hand-v1", materialStyle: "grain-v1",
      seed: 7, joinWidth: 6, curve: .2, opacity: .8, texture: .6, taper: .5,
      transform: { x: 12, y: 8, scale: 1.2, rotation: .3 },
      erasures: [{ radius: 4, points: [{ x: 20, y: 22 }] }],
    }],
    objects: [{ id: "label", kind: "label", text: "손그림", x: 90, y: 80, width: 80, height: 30, color: "#92400e", fontSize: 24, fill: false, transform: { x: 2, y: 3, scale: 1, rotation: 0 } }],
    order: ["label", "stroke"],
    paper: { kind: "cream", texture: .5, seed: 11 },
  };
  const dirty = JSON.parse(JSON.stringify(input));
  dirty.owner_id = "private owner";
  dirty.snapshots = [{ label: "private history" }];
  dirty.nodes[0].selected = true;
  dirty.nodes[0].style = { backgroundImage: "private URL" };
  Object.assign(dirty.nodes[0].data, { linkedDocId: "other-doc", backDocId: "private-parent", _suppressMenu: true });
  dirty.nodes[2].data.tags.push({ snapshots: "private" });
  dirty.ink.paper.owner = "private";
  dirty.ink.strokes[0].transform.token = "private";
  const output = readSharedResponse({ document: dirty, token: tokenA });
  assert.deepEqual(output.appearance, input.appearance);
  assert.deepEqual(output.ink, input.ink);
  assert.deepEqual(output.viewport, input.viewport);
  assert.equal(output.nodes.length, input.nodes.length);
  assert.ok(!("id" in output) && !("owner_id" in output) && !("snapshots" in output));
  assert.ok(!("selected" in output.nodes[0]) && !("style" in output.nodes[0]));
  assert.ok(!("linkedDocId" in output.nodes[0].data) && !("backDocId" in output.nodes[0].data) && !("_suppressMenu" in output.nodes[0].data));
  assert.ok(!JSON.stringify(output).includes("private"));
});

test("wire reader rejects malformed renderer data and future ink without losing drawings silently", () => {
  const values: unknown[] = [null, {}, { document: { title: "", nodes: [], edges: [], ink: { version: 5, strokes: [] } } }];
  for (const mutate of [
    (doc: SharedCloudDocument) => { doc.nodes[0].position.x = Infinity; },
    (doc: SharedCloudDocument) => { doc.nodes.push(doc.nodes[0]); },
    (doc: SharedCloudDocument) => { (doc.nodes[0].data as Record<string, unknown>).type = "unknown"; },
    (doc: SharedCloudDocument) => { (doc.nodes[0].data as Record<string, unknown>).collapsed = "yes"; },
    (doc: SharedCloudDocument) => { (doc.nodes[0].data as Record<string, unknown>).checklist = [{ text: "missing ID", checked: true }]; },
  ]) { const doc = fixture(); mutate(doc); values.push({ document: doc }); }
  for (const value of values) assert.throws(() => readSharedResponse(value), (error: unknown) => error instanceof SharedViewError && error.kind === "failed");
});

test("search reveals ancestors and collapse stays local while portable colors and positions survive", () => {
  const doc = fixture();
  const before = JSON.stringify(doc);
  const collapsed = initialCollapsed(doc);
  const hiddenProjection = viewerProjection(doc, collapsed, "");
  assert.equal(hiddenProjection.nodes.find((node) => node.id === "leaf-1-0")!.hidden, true);
  assert.ok(matchingNodeIds(doc, " 첫 줄 ").includes("leaf-1-0"));
  assert.ok(matchingNodeIds(doc, "실제 파일 확인").includes("leaf-1-0"));
  assert.ok(matchingNodeIds(doc, "검증").includes("leaf-1-0"));
  const revealed = revealAncestors(doc, collapsed, "leaf-1-0");
  assert.ok(collapsed.has("branch-1"));
  assert.ok(!revealed.has("branch-1"));
  const projection = viewerProjection(doc, revealed, "first nonexistent");
  assert.equal(projection.nodes.find((node) => node.id === "leaf-1-0")!.hidden, false);
  assert.deepEqual(projection.nodes.map((node) => node.position), doc.nodes.map((node) => node.position));
  assert.equal(projection.nodes.find((node) => node.id === "branch-0")!.data._viewerColor, "#f97316");
  assert.equal(projection.nodes.find((node) => node.id === "leaf-0-0")!.data._viewerColor, BRANCH_AUTO_PALETTE[0]);
  assert.equal(projection.edges.find((edge) => edge.target === "branch-0")!.style!.stroke, "#f97316");
  assert.equal(projection.edges.find((edge) => edge.target === "branch-0")!.sourceHandle, "left-source");
  for (const node of projection.nodes) assert.ok(!node.draggable && !node.connectable && !node.selectable && !node.deletable);
  for (const edge of projection.edges) assert.ok(!edge.selectable && !edge.deletable && !edge.focusable && !edge.reconnectable);
  assert.equal(JSON.stringify(doc), before);
});

test("viewer ignores saved editable ReactFlow behavior and unsafe navigation", () => {
  const doc = fixture();
  Object.assign(doc.nodes[0], { draggable: true, selected: true, type: "editable", style: { background: "red" } });
  const projection = viewerProjection(doc, new Set(), "한국어");
  assert.equal(projection.nodes[0].type, "sharedNode");
  assert.ok(!("selected" in projection.nodes[0]));
  assert.equal(projection.nodes[0].style?.background, undefined);
  assert.equal(projection.nodes[0].data._viewerMatch, true);
  for (const value of ["javascript:alert(1)", "JaVa\u0000script:alert(1)", "data:text/html,<script>", "//example.com", "/other-document", "file:///tmp/secret"])
    assert.equal(safeViewerHref(value), undefined);
  assert.equal(safeViewerHref(" https://example.com/ "), "https://example.com/");
  assert.equal(safeViewerHref("mailto:owner@example.com"), "mailto:owner@example.com");
});

test("anonymous lookup sends the token in a no-store POST body without session cookies or referrer", async (t) => {
  const calls: { url: unknown; options: RequestInit | undefined }[] = [];
  const controller = new AbortController();
  t.mock.method(globalThis, "fetch", async (url: unknown, options?: RequestInit) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ document: fixture() }), { status: 200 });
  });
  const document = await fetchSharedDocument(tokenA, controller.signal);
  assert.equal(document.title, portableFixture().title);
  assert.equal(calls[0].url, "/api/cloud/shared");
  assert.deepEqual(calls[0].options, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: tokenA }), cache: "no-store", credentials: "omit",
    referrerPolicy: "no-referrer", redirect: "error", signal: controller.signal,
  });
});

test("lookup maps revoked links and temporary failures to distinct safe states", async (t) => {
  let status = 404;
  t.mock.method(globalThis, "fetch", async () => new Response("{}", { status }));
  for (const [code, kind] of [[404, "not-found"], [410, "not-found"], [429, "unavailable"], [503, "unavailable"], [500, "failed"]] as const) {
    status = code;
    await assert.rejects(fetchSharedDocument(tokenA), (error: unknown) => error instanceof SharedViewError && error.kind === kind);
  }
});

test("fragment rotation aborts an earlier lookup and ignores its late completion", async (t) => {
  const first = deferred<SharedCloudDocument>(), second = deferred<SharedCloudDocument>();
  const signals: AbortSignal[] = [], tokens: string[] = [], states: SharedLoadState[] = [];
  const loader = createSharedDocumentLoader((state) => states.push(state), (token, signal) => {
    tokens.push(token); signals.push(signal!);
    return token === tokenA ? first.promise : second.promise;
  });
  t.after(() => loader.dispose());
  loader.load(`#token=${tokenA}`);
  loader.load(`#token=${tokenB}`);
  assert.ok(signals[0].aborted && !signals[1].aborted);
  second.resolve({ ...fixture(), title: "Rotated map" });
  await nextTurn();
  first.resolve({ ...fixture(), title: "Stale private map" });
  await nextTurn();
  assert.deepEqual(tokens, [tokenA, tokenB]);
  assert.deepEqual(states.map((state) => state.status), ["loading", "loading", "ready"]);
  const ready = states.at(-1)!;
  assert.ok(ready.status === "ready" && ready.document.title === "Rotated map" && ready.revision === 2);
});

test("reload clears visible content before a revoked lookup, and invalid fragments cancel pending loads", async (t) => {
  const pending = deferred<SharedCloudDocument>(), states: SharedLoadState[] = [];
  let calls = 0;
  const loader = createSharedDocumentLoader((state) => states.push(state), async () => {
    calls++;
    if (calls === 1) return fixture();
    if (calls === 2) throw new SharedViewError("not-found");
    return pending.promise;
  });
  t.after(() => loader.dispose());
  loader.load(`#token=${tokenA}`);
  await nextTurn();
  assert.equal(states.at(-1)!.status, "ready");
  loader.load(`#token=${tokenA}`);
  assert.deepEqual(states.at(-1), { status: "loading" });
  await nextTurn();
  assert.deepEqual(states.at(-1), { status: "not-found" });
  loader.load(`#token=${tokenA}`);
  loader.load("#m=legacy-editor-payload");
  pending.resolve(fixture());
  await nextTurn();
  assert.deepEqual(states.at(-1), { status: "not-found" });
  assert.equal(calls, 3);
});

test("timeout and unmount abort and suppress late response state writes", async () => {
  const pending = deferred<SharedCloudDocument>(), states: SharedLoadState[] = [];
  let signal: AbortSignal | undefined;
  const loader = createSharedDocumentLoader((state) => states.push(state), (_token, nextSignal) => {
    signal = nextSignal;
    return pending.promise;
  }, 1);
  loader.load(`#token=${tokenA}`);
  await new Promise<void>((resolve) => setTimeout(resolve, 10));
  assert.ok(signal!.aborted);
  assert.deepEqual(states.at(-1), { status: "failed" });
  pending.resolve(fixture());
  await nextTurn();
  assert.deepEqual(states.map((state) => state.status), ["loading", "failed"]);
  loader.dispose();

  const nextPending = deferred<SharedCloudDocument>(), nextStates: SharedLoadState[] = [];
  const nextLoader = createSharedDocumentLoader((state) => nextStates.push(state), (_token, nextSignal) => {
    signal = nextSignal;
    return nextPending.promise;
  });
  nextLoader.load(`#token=${tokenB}`);
  nextLoader.dispose();
  assert.ok(signal!.aborted);
  nextPending.reject(new Error("late network error"));
  await nextTurn();
  nextLoader.load(`#token=${tokenA}`);
  assert.deepEqual(nextStates.map((state) => state.status), ["loading"]);
});

test("share route runtime dependency graph contains no editor, workspace store, auth or autosave module", () => {
  const root = resolve(process.cwd(), "src");
  const queue = [join(root, "app/share/page.tsx"), ...readdirSync(join(root, "components/share")).filter((name) => /\.[jt]sx?$/.test(name)).map((name) => join(root, "components/share", name))];
  const seen = new Set<string>();
  while (queue.length) {
    const path = queue.pop()!;
    if (seen.has(path)) continue;
    seen.add(path);
    const source = readFileSync(path, "utf8");
    assert.ok(!/\/(?:store|hooks|components\/cloud|components\/layout)\//.test(path), `editable runtime dependency: ${path}`);
    assert.ok(!/\/(?:cloudClient|cloudSync|storage)\.[jt]s$/.test(path), `workspace runtime dependency: ${path}`);
    assert.ok(!/\b(?:localStorage|sessionStorage|useMindMapStore)\b/.test(source), `workspace state reference: ${path}`);
    for (const match of source.matchAll(/(?:import|export)\s+(?!type\b)[^;]*?\sfrom\s["']([^"']+)["']/g)) {
      const name = match[1];
      if (!name.startsWith("@/") && !name.startsWith(".")) continue;
      const imported = name.startsWith("@/") ? join(root, name.slice(2)) : resolve(dirname(path), name);
      if (extname(imported) === ".css") continue;
      const resolved = [imported, `${imported}.ts`, `${imported}.tsx`, join(imported, "index.ts")].find((candidate) => {
        try { return !!readFileSync(candidate); } catch { return false; }
      });
      assert.ok(resolved, `unresolved dependency: ${name}`);
      queue.push(resolved!);
    }
  }
  assert.ok(seen.has(join(root, "components/canvas/AnalogMark.tsx")), "shared ink must use the released pure renderer");
});
