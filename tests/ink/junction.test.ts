import test from "node:test";
import assert from "node:assert/strict";
import {
  branchGeometry,
  itemCenter,
  renderPoints,
  strokePath,
  transformPoint,
  validateInk,
} from "../../src/lib/ink";
import { isErasedAt } from "../../src/lib/inkEditing";
import { findBranchJunction, snapBranchStart } from "../../src/lib/inkJunction";
import type { InkData, InkStroke } from "../../src/types/mindmap";

const stroke = (extra: Partial<InkStroke> = {}): InkStroke => ({
  id: "parent",
  brush: "brush",
  color: "#e0614e",
  width: 24,
  taper: 0,
  points: [{ x: 0, y: 0, pressure: 1 }, { x: 100, y: 0, pressure: 1 }],
  ...extra,
});
const ink = (...strokes: InkStroke[]): InkData => ({ version: 4, strokes });
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-7, `${a} ≈ ${b}`);
const clean = <T>(v: T): T => JSON.parse(JSON.stringify(v));

test("junctions use only painted branch/brush strokes and prefer matching colour within the radius", () => {
  const matching = stroke({ id: "same", color: "#E0614E", points: [{ x: 0, y: 10, pressure: 1 }, { x: 100, y: 10, pressure: 1 }] }),
    nearest = stroke({ id: "other", color: "#246d56", points: [{ x: 0, y: 1, pressure: 1 }, { x: 100, y: 1, pressure: 1 }] }),
    pen = stroke({ id: "pen", brush: "pen" }),
    invisible = stroke({ id: "invisible", opacity: 0 });
  const doc = ink(matching, nearest, pen, invisible), before = clean(doc);
  const same = findBranchJunction(doc, { x: 40, y: 0 }, 12, "#e0614e")!;
  assert.equal(same.parentId, "same");
  assert.deepEqual(same.point, { x: 40, y: 10 });
  assert.deepEqual(same.tangent, { x: 1, y: 0 });
  close(same.width, 24);
  assert.equal(findBranchJunction(doc, { x: 40, y: 0 }, 5, "#e0614e")!.parentId, "other");
  assert.equal(findBranchJunction(doc, { x: 40, y: 0 }, 12)!.parentId, "other");
  assert.equal(findBranchJunction(ink(pen, invisible), { x: 40, y: 0 }, 12), null);
  assert.deepEqual(doc, before);
});

test("display smoothing, hand-v1 taper, parent rotation and scale define the world-space junction", () => {
  const parent = stroke({
    branchStyle: "hand-v1", taper: 0.8, texture: 0, seed: 3,
    points: Array.from({ length: 40 }, (_, i) => ({ x: i * 5, y: Math.sin(i / 7) * 24, pressure: 0.8 })),
    transform: { x: 33, y: -21, scale: 1.7, rotation: 73 },
  }),
    geometry = branchGeometry(parent), index = 20,
    point = transformPoint(geometry.points[index], parent.transform!, itemCenter(parent)),
    junction = findBranchJunction(ink(parent), point, 0.001)!;
  assert.ok(junction);
  close(junction.point.x, point.x);
  close(junction.point.y, point.y);
  close(junction.width, geometry.radii[index] * 2 * 1.7);
  close(Math.hypot(junction.tangent.x, junction.tangent.y), 1);
  assert.equal(findBranchJunction(ink(parent), geometry.points[index], 0.001), null);
  assert.equal(strokePath(parent), strokePath(clean(parent)), "finding a junction cannot modify the old hand-v1 appearance");
});

test("erased holes are excluded and visible portions of a long segment remain attachable", () => {
  const parent = stroke({ erasures: [{ radius: 10, points: [{ x: 50, y: 0 }] }] }),
    doc = ink(parent);
  assert.equal(findBranchJunction(doc, { x: 50, y: 0 }, 5), null);
  const edge = findBranchJunction(doc, { x: 50, y: 0 }, 11)!;
  assert.ok(edge);
  assert.equal(isErasedAt(parent, edge.point), false);
  assert.ok(Math.abs(edge.point.x - 50) > 10 && Math.abs(edge.point.x - 50) < 10.001);
  assert.equal(findBranchJunction(doc, { x: 80, y: 2 }, 3)!.point.x, 80);
  const transformed = { ...parent, transform: { x: 30, y: 20, scale: 2, rotation: 90 } },
    center = transformPoint({ x: 50, y: 0 }, transformed.transform, itemCenter(transformed));
  assert.equal(findBranchJunction(ink(transformed), center, 15), null);
  assert.ok(findBranchJunction(ink(transformed), center, 21));
});

test("equal-distance choices follow document stacking order; immutable replacement invalidates indexes", () => {
  const lower = stroke({ id: "lower" }), upper = stroke({ id: "upper" }),
    doc = { ...ink(lower, upper), order: ["upper", "lower"] };
  assert.equal(findBranchJunction(doc, { x: 20, y: 0 }, 0)!.parentId, "lower");
  const next = { ...doc, strokes: doc.strokes.map((s) => ({ ...s, erasures: [{ radius: 20, points: [{ x: 20, y: 0 }] }] })) };
  assert.equal(findBranchJunction(next, { x: 20, y: 0 }, 1), null);
  assert.equal(findBranchJunction(doc, { x: 20, y: 0 }, 0)!.parentId, "lower");
});

test("a freehand prefix joins a reversed parent while preserving the later authored trajectory and pressure", () => {
  const parent = stroke({ points: [{ x: 100, y: 0, pressure: 1 }, { x: 0, y: 0, pressure: 1 }] }),
    junction = findBranchJunction(ink(parent), { x: 40, y: 3 }, 5)!,
    child = stroke({ id: "child", width: 18, branchStyle: "hand-v1", seed: 91,
      points: Array.from({ length: 80 }, (_, i) => ({ x: 40 + Math.sin(i / 10) * 15, y: 3 + i * 3, pressure: 0.4 + i / 200 })) }),
    before = clean(child), result = snapBranchStart(child, junction);
  assert.ok(junction.tangent.x < 0);
  assert.deepEqual(result.points[0], { x: 40, y: 0, pressure: 0.4 });
  assert.deepEqual(result.points.slice(-60), child.points.slice(-60));
  assert.deepEqual(child, before);
  assert.equal(result.seed, 91);
  assert.equal(result.joinWidth, 18);
  assert.deepEqual(validateInk(clean(ink(result))), { ok: true, ink: clean(ink(result)) });
  const rendered = renderPoints(result);
  assert.ok(rendered.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.pressure >= 0 && p.pressure <= 1));
});

test("short snapping respects sharp early turns and sparse strokes without moving their far endpoints", () => {
  const child = stroke({ id: "corner", points: [
    { x: 0, y: 3, pressure: 0.2 }, { x: 4, y: 3, pressure: 0.3 },
    { x: 4, y: 70, pressure: 0.4 }, { x: 200, y: 70, pressure: 0.5 },
  ] }),
    junction = { point: { x: 0, y: 0 }, tangent: { x: 1, y: 0 }, width: 3, parentId: "parent" },
    result = snapBranchStart(child, junction);
  assert.deepEqual(result.points.slice(-2), child.points.slice(-2));
  assert.ok(result.points.some((p) => p.x === 4 && p.y === 3), "the first deliberate turn survives");
  assert.equal(result.joinWidth, 3);
  const sparse = stroke({ points: [{ x: 2, y: 2, pressure: 0.2 }, { x: 600, y: 40, pressure: 0.8 }] }),
    sparseResult = snapBranchStart(sparse, junction);
  assert.deepEqual(sparseResult.points.at(-1), sparse.points.at(-1));
  assert.ok(sparseResult.points.slice(1, -1).every((p) => p.x < 35));
  const branch = { ...sparse, brush: "branch" as const, curve: 0.4 }, branchResult = snapBranchStart(branch, junction);
  assert.equal(branchResult.points.length, branch.points.length);
  assert.equal(branchResult.curve, 0.4);
  assert.deepEqual(branchResult.points.at(-1), branch.points.at(-1));
});

test("snapping a transformed child keeps the untouched remainder fixed in world space", () => {
  const child = stroke({ id: "moved", width: 30, branchStyle: "hand-v1",
    transform: { x: 60, y: -40, rotation: -37, scale: 2.3 },
    points: Array.from({ length: 100 }, (_, i) => ({ x: i * 4, y: Math.sin(i / 12) * 40, pressure: 0.7 })) }),
    center = itemCenter(child), start = transformPoint(child.points[0], child.transform!, center),
    junction = { point: { x: start.x - 3, y: start.y + 2 }, tangent: { x: 1, y: 0 }, width: 4.6, parentId: "other" },
    result = snapBranchStart(child, junction),
    snappedWorld = transformPoint(result.points[0], result.transform!, itemCenter(result));
  close(snappedWorld.x, junction.point.x);
  close(snappedWorld.y, junction.point.y);
  close(result.joinWidth!, 2);
  child.points.slice(-70).forEach((p, i) => {
    const oldWorld = transformPoint(p, child.transform!, center),
      newWorld = transformPoint(result.points[result.points.length - 70 + i], result.transform!, itemCenter(result));
    close(oldWorld.x, newWorld.x);
    close(oldWorld.y, newWorld.y);
  });
  assert.ok(validateInk(clean(ink(result))).ok);
});

test("dense documents, zero-length parents, invalid searches and minimum widths remain bounded", () => {
  const doc = ink(...Array.from({ length: 1400 }, (_, i) => stroke({ id: `p${i}`, points: [
    { x: i * 300, y: i % 5 * 200, pressure: 1 }, { x: i * 300 + 200, y: i % 5 * 200, pressure: 1 },
  ] })));
  for (let i = 0; i < 40; i++) {
    const p = doc.strokes[i * 20].points[0];
    assert.equal(findBranchJunction(doc, { x: p.x + 50, y: p.y + 2 }, 3)!.parentId, `p${i * 20}`);
  }
  assert.equal(findBranchJunction(doc, { x: NaN, y: 1 }, 12), null);
  assert.equal(findBranchJunction(doc, { x: 1, y: 1 }, -1), null);
  const dot = stroke({ points: [{ x: 4, y: 7, pressure: 0.5 }] });
  assert.ok(findBranchJunction(ink(dot), { x: 4, y: 7 }, 0));
  const tiny = snapBranchStart(dot, { point: { x: 4, y: 7 }, tangent: { x: 0, y: 0 }, width: 0.012, parentId: "fine-tip" });
  assert.equal(tiny.joinWidth, 0.1);
  assert.ok(validateInk(clean(ink(tiny))).ok);
});
