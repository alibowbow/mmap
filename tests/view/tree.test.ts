import assert from "node:assert/strict";
import test from "node:test";
import { computeDepths, getHiddenNodeIds, getVisibleDfsOrder, nodesExpandedToDepth, walkTree } from "../../src/lib/tree";
import type { MindMapNode } from "../../src/types/mindmap";

const node = (id: string, parentId: string | null, collapsed = false): MindMapNode => ({
  id, position: { x: 20, y: 40 }, data: { label: id, parentId, type: "plain", collapsed },
});
const visible = (nodes: MindMapNode[]) => nodes.filter(n => !getHiddenNodeIds(nodes).has(n.id)).map(n => n.id).sort();

test("depth uses parentId rather than root styling, with every forest and orphan root at zero", () => {
  const nodes = [node("grandchild", "child"), node("other-child", "other"), node("child", "root"),
    node("orphan-child", "orphan"), node("root", null), node("other", null), node("orphan", "missing")];
  nodes[2].data.isRoot = true;
  nodes[2].data.type = "root";
  assert.deepEqual(Object.fromEntries(computeDepths(nodes)), {
    orphan: 0, "orphan-child": 1, other: 0, "other-child": 1, root: 0, child: 1, grandchild: 2,
  });
  assert.deepEqual(visible(nodesExpandedToDepth(nodes, 0)), ["orphan", "other", "root"]);
  assert.deepEqual(visible(nodesExpandedToDepth(nodes, 1)), ["child", "orphan", "orphan-child", "other", "other-child", "root"]);
  assert.equal(getVisibleDfsOrder(nodes).length, nodes.length);
});

test("every depth resets collapsed ancestors and descendants independent of prior state", () => {
  const nodes = [node("r", null, true), node("a", "r", true), node("b", "a", true), node("c", "b", true), node("d", "c", true), node("side", "r", true)];
  for (let depth = 0; depth <= 4; depth++) {
    const next = nodesExpandedToDepth(nodes, depth);
    assert.deepEqual(visible(next), [...computeDepths(nodes)].filter(([, d]) => d <= depth).map(([id]) => id).sort());
    assert.equal(next.find(n => n.id === "side")!.data.collapsed, false, "leaf flags are cleared");
    assert.equal(nodesExpandedToDepth(next, depth), next, "repeating a preset is referentially stable");
  }
  const expanded = nodesExpandedToDepth(nodes, null);
  assert.equal(getHiddenNodeIds(expanded).size, 0);
  assert.ok(expanded.every(n => !n.data.collapsed));
  assert.ok(nodes.every(n => n.data.collapsed), "input remains immutable");
});

test("cycle traversal cuts one deterministic view link, retaining actual document relationships", () => {
  const nodes = [node("z-tail", "b"), node("c", "b", true), node("b", "a", true), node("a", "c", true), node("self", "self", true)];
  const originalParents = nodes.map(n => n.data.parentId);
  const expected = { self: 0, a: 0, b: 1, "z-tail": 2, c: 2 };
  assert.deepEqual(Object.fromEntries(computeDepths(nodes)), expected);
  assert.deepEqual([...computeDepths([...nodes].reverse())].sort(), [...computeDepths(nodes)].sort(), "array ordering does not change cycle depth");
  assert.deepEqual(visible(nodesExpandedToDepth(nodes, 0)), ["a", "self"]);
  assert.deepEqual(visible(nodesExpandedToDepth(nodes, 1)), ["a", "b", "self"]);
  assert.equal(getHiddenNodeIds(nodesExpandedToDepth(nodes, null)).size, 0);
  const walked: string[] = [];
  walkTree(nodes, n => walked.push(n.id));
  assert.equal(new Set(walked).size, nodes.length);
  assert.deepEqual(nodes.map(n => n.data.parentId), originalParents);
});

test("a 20,000-node chain traverses without recursion and obeys a deep boundary", () => {
  const nodes = Array.from({ length: 20_000 }, (_, i) => node(`n${i}`, i ? `n${i - 1}` : null, true));
  assert.equal(computeDepths(nodes).get("n19999"), 19_999);
  const expanded = nodesExpandedToDepth(nodes, 512);
  assert.equal(nodes.length - getHiddenNodeIds(expanded).size, 513);
  assert.equal(getVisibleDfsOrder(expanded).length, 513);
});
