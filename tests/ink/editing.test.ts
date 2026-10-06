import test from "node:test";
import assert from "node:assert/strict";
import {
  appendStrokeErasure,
  isErasedAt,
  selectInkInPolygon,
  strokeVisibleHit,
  translateInkItems,
  visibleStrokeSegmentIntervals,
} from "../../src/lib/inkEditing";
import { itemCenter, strokePath, transformPoint, type InkItem } from "../../src/lib/ink";
import type { InkObject, InkStroke } from "../../src/types/mindmap";

const line = (id = "line"): InkStroke => ({
  id, color: "#246d56", width: 4,
  points: [{ x: 0, y: 0, pressure: 0.6 }, { x: 100, y: 0, pressure: 1 }],
});
const rectangle = (x: number, y: number, width: number, height: number) => [
  { x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height },
];
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} ≈ ${expected}`);
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

test("a sparse diagonal eraser crosses ink between input samples without changing its trajectory or style", () => {
  const s = freeze({ ...line(), brush: "brush" as const, branchStyle: "hand-v1" as const, taper: 0.9, seed: 22, texture: 0.7 });
  const path = freeze([{ x: 35, y: -20 }, { x: 65, y: 20 }]);
  const originalPath = strokePath(s);
  const erased = appendStrokeErasure(s, path, 4);
  assert.notEqual(erased, s);
  assert.equal(erased.points, s.points);
  assert.equal(erased.taper, s.taper);
  assert.equal(erased.seed, s.seed);
  assert.equal(erased.texture, s.texture);
  assert.equal(strokePath(erased), originalPath);
  assert.ok(isErasedAt(erased, { x: 50, y: 0 }));
  assert.ok(!isErasedAt(erased, { x: 10, y: 0 }));
  assert.equal(s.erasures, undefined);
  assert.notEqual(erased.erasures![0].points, path);
});

test("a local erasure follows the ink under rotation, scale, translation and later group movement", () => {
  const s = { ...line(), transform: { x: 40, y: -30, scale: 2, rotation: 67 } };
  const center = itemCenter(s), local = [{ x: 50, y: -10 }, { x: 50, y: 10 }];
  const world = local.map((p) => transformPoint(p, s.transform, center));
  const erased = appendStrokeErasure(s, world, 12);
  close(erased.erasures![0].radius, 6);
  erased.erasures![0].points.forEach((p, i) => { close(p.x, local[i].x); close(p.y, local[i].y); });
  const hit = transformPoint({ x: 50, y: 0 }, s.transform, center);
  assert.ok(isErasedAt(erased, hit));
  assert.ok(!strokeVisibleHit(erased, hit, hit, 3));
  const [moved] = translateInkItems([erased], [s.id], 30, 50) as InkStroke[];
  assert.equal(moved.points, s.points);
  assert.equal(moved.erasures, erased.erasures);
  assert.ok(isErasedAt(moved, { x: hit.x + 30, y: hit.y + 50 }));
  assert.ok(!isErasedAt(moved, hit));
});

test("misses and repeated fully covered passes retain the original reference", () => {
  const s = line();
  assert.equal(appendStrokeErasure(s, [{ x: 300, y: 400 }], 10), s);
  assert.equal(appendStrokeErasure(s, [], 10), s);
  assert.equal(appendStrokeErasure(s, [{ x: NaN, y: 0 }], 10), s);
  assert.equal(appendStrokeErasure(s, [{ x: 50, y: 0 }], -10), s);
  const path = [{ x: 40, y: -10 }, { x: 60, y: 10 }];
  const erased = appendStrokeErasure(s, path, 8);
  assert.equal(appendStrokeErasure(erased, path, 8), erased);
  assert.equal(appendStrokeErasure(erased, [{ x: 50, y: 0 }], 3), erased);
});

test("later erasures keep existing masks and never mutate canceled gesture inputs", () => {
  const first = freeze(appendStrokeErasure(line(), [{ x: 25, y: 0 }], 5));
  const serialized = JSON.stringify(first), path = freeze([{ x: 75, y: -12 }, { x: 75, y: 12 }]);
  const second = appendStrokeErasure(first, path, 6);
  assert.equal(JSON.stringify(first), serialized);
  assert.equal(first.erasures!.length, 1);
  assert.equal(second.erasures!.length, 2);
  assert.equal(second.erasures![0], first.erasures![0]);
  assert.ok(isErasedAt(second, { x: 25, y: 0 }));
  assert.ok(isErasedAt(second, { x: 75, y: 0 }));
});

test("mask capsules include swept middle points, rounded ends and world-space tolerance", () => {
  const s: InkStroke = {
    ...line(), transform: { x: 0, y: 0, scale: 2, rotation: 90 },
    erasures: [{ points: [{ x: 40, y: -10 }, { x: 60, y: 10 }], radius: 3 }],
  };
  const at = (p: { x: number; y: number }) => transformPoint(p, s.transform!, itemCenter(s));
  assert.ok(isErasedAt(s, at({ x: 50, y: 0 })));
  assert.ok(isErasedAt(s, at({ x: 62, y: 10 })));
  assert.ok(!isErasedAt(s, at({ x: 64, y: 10 })));
  assert.ok(isErasedAt(s, at({ x: 64, y: 10 }), 2.1));
  assert.ok(!isErasedAt(s, at({ x: 62, y: 10 }), -3));
});

test("visible hit rejects the erased gap but keeps visible ends and swept crossings selectable", () => {
  const erased = appendStrokeErasure(line(), [{ x: 50, y: -15 }, { x: 50, y: 15 }], 8);
  assert.ok(!strokeVisibleHit(erased, { x: 50, y: 0 }, undefined, 4));
  assert.ok(!strokeVisibleHit(erased, { x: 46, y: -1 }, { x: 54, y: 1 }, 1));
  assert.ok(strokeVisibleHit(erased, { x: 15, y: 0 }, undefined, 2));
  assert.ok(strokeVisibleHit(erased, { x: 35, y: 0 }, { x: 65, y: 0 }, 1));
  assert.ok(!strokeVisibleHit(erased, { x: 150, y: -50 }, { x: 150, y: 50 }, 2));
});

test("fully covered strokes have no selectable ghost even with click padding", () => {
  const erased = appendStrokeErasure(line(), [{ x: 0, y: 0 }, { x: 100, y: 0 }], 10);
  assert.ok(!strokeVisibleHit(erased, { x: 50, y: 0 }, undefined, 8));
  assert.ok(!strokeVisibleHit(erased, { x: 50, y: 12 }, undefined, 12));
  assert.ok(!strokeVisibleHit(erased, { x: -20, y: 0 }, { x: 120, y: 0 }, 5));
  assert.equal(appendStrokeErasure(erased, [{ x: 0, y: 0 }, { x: 100, y: 0 }], 20), erased);
});

test("a thin erased center keeps the wider stroke's surviving edges selectable", () => {
  const s = { ...line(), width: 20, points: [{ x: 0, y: 0, pressure: 1 }, { x: 100, y: 0, pressure: 1 }] };
  const erased = appendStrokeErasure(s, [{ x: 0, y: 0 }, { x: 100, y: 0 }], 2);
  assert.ok(!strokeVisibleHit(erased, { x: 50, y: 0 }));
  assert.ok(strokeVisibleHit(erased, { x: 50, y: 6 }));
  assert.ok(strokeVisibleHit(erased, { x: 20, y: 6 }, { x: 80, y: 6 }));
  const widened = appendStrokeErasure(erased, [{ x: 50, y: 0 }], 8);
  assert.notEqual(widened, erased);
  assert.ok(!strokeVisibleHit(widened, { x: 50, y: 6 }));
  assert.ok(strokeVisibleHit(widened, { x: 20, y: 6 }));
});

test("branch erasing follows the rendered curved branch rather than the raw chord", () => {
  const s: InkStroke = { ...line(), brush: "branch", branchStyle: "hand-v1", curve: 0.8, width: 16 };
  const erased = appendStrokeErasure(s, [{ x: 50, y: 40 }], 5);
  assert.notEqual(erased, s);
  assert.ok(isErasedAt(erased, { x: 50, y: 40 }));
  assert.ok(!strokeVisibleHit(erased, { x: 50, y: 40 }, undefined, 1));
  assert.ok(strokeVisibleHit(erased, { x: 20, y: 25.6 }, undefined, 2));
  assert.equal(appendStrokeErasure(s, [{ x: 50, y: 0 }], 2), s);
});

test("analytic visible intervals expose both sides of a sparse erased segment for snapping", () => {
  const s: InkStroke = { ...line(), erasures: [{ points: [{ x: 50, y: -10 }, { x: 50, y: 10 }], radius: 8 }] };
  const intervals = visibleStrokeSegmentIntervals(s, { x: 0, y: 0 }, { x: 100, y: 0 });
  assert.equal(intervals.length, 2);
  close(intervals[0][0], 0); close(intervals[0][1], 0.42);
  close(intervals[1][0], 0.58); close(intervals[1][1], 1);
  const transformed = { ...s, transform: { x: -20, y: 100, scale: 1.6, rotation: -40 } };
  const c = itemCenter(transformed);
  assert.deepEqual(visibleStrokeSegmentIntervals(transformed,
    transformPoint({ x: 0, y: 0 }, transformed.transform, c),
    transformPoint({ x: 100, y: 0 }, transformed.transform, c),
  ).map((r) => r.map((t) => Math.round(t * 100))), [[0, 42], [58, 100]]);
});

test("lasso requires full containment and includes strokes, stamps and labels in original item order", () => {
  const stamp: InkObject = { id: "stamp", kind: "stamp", shape: "leaf", x: 30, y: 30, width: 16, height: 20, color: "#246d56", fill: false, fontSize: 20 };
  const label: InkObject = { ...stamp, id: "label", kind: "label", text: "가지", x: 70, y: 30 };
  const crossing = { ...line("crossing"), points: [{ x: -20, y: 20, pressure: 1 }, { x: 150, y: 20, pressure: 1 }] };
  assert.deepEqual(selectInkInPolygon([label, line(), crossing, stamp], rectangle(-10, -10, 120, 60)), ["label", "line", "stamp"]);
  assert.deepEqual(selectInkInPolygon([line()], rectangle(1, -10, 98, 20)), []);
  assert.deepEqual(selectInkInPolygon([line()], [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }]), []);
});

test("concave lassos reject a segment whose endpoints are enclosed but middle crosses outside", () => {
  const polygon = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 6, y: 10 }, { x: 6, y: 4 }, { x: 4, y: 4 }, { x: 4, y: 10 }, { x: 0, y: 10 }];
  const s = { ...line(), width: 1, points: [{ x: 2, y: 8, pressure: 1 }, { x: 8, y: 8, pressure: 1 }] };
  assert.deepEqual(selectInkInPolygon([s], polygon), []);
  const enclosed = { ...s, points: [{ x: 1.5, y: 2, pressure: 1 }, { x: 8.5, y: 2, pressure: 1 }] };
  assert.deepEqual(selectInkInPolygon([enclosed], polygon), [enclosed.id]);
});

test("transformed objects are contained by their rotated corners, not their untransformed box", () => {
  const o: InkObject = { id: "label", kind: "label", text: "생각", x: 0, y: 0, width: 20, height: 40, color: "#246d56", fill: false, fontSize: 20, transform: { x: 100, y: 100, scale: 2, rotation: 90 } };
  assert.deepEqual(selectInkInPolygon([o], rectangle(40, 60, 120, 80)), [o.id]);
  assert.deepEqual(selectInkInPolygon([o], rectangle(-60, -60, 120, 120)), []);
});

test("lasso ignores a fully erased stroke and can enclose only the surviving visible piece", () => {
  const erased = appendStrokeErasure(line(), [{ x: 0, y: 0 }, { x: 100, y: 0 }], 10);
  assert.deepEqual(selectInkInPolygon([erased], rectangle(-20, -20, 140, 40)), []);
  const partial = appendStrokeErasure(line(), [{ x: 50, y: 0 }, { x: 110, y: 0 }], 10);
  assert.deepEqual(selectInkInPolygon([partial], rectangle(-5, -5, 50, 10)), [partial.id]);
});

test("group movement is immutable, moves existing transforms in world space and leaves unrelated items alone", () => {
  const stroke = freeze(appendStrokeErasure({ ...line(), transform: { x: 10, y: 20, scale: 1.5, rotation: 45 } }, [{ x: 60, y: 20 }], 8));
  const object: InkObject = freeze({ id: "label", kind: "label", text: "묶음", x: 30, y: 40, width: 40, height: 30, color: "#246d56", fill: false, fontSize: 20 });
  const untouched = line("untouched"), items: InkItem[] = freeze([stroke, object, untouched]);
  const moved = translateInkItems(items, [stroke.id, object.id], -15, 40);
  assert.notEqual(moved, items);
  assert.equal(moved[2], untouched);
  assert.equal((moved[0] as InkStroke).points, stroke.points);
  assert.equal((moved[0] as InkStroke).erasures, stroke.erasures);
  assert.deepEqual(moved[0].transform, { x: -5, y: 60, scale: 1.5, rotation: 45 });
  assert.deepEqual(moved[1].transform, { x: -15, y: 40, scale: 1, rotation: 0 });
  assert.equal(stroke.transform!.x, 10);
  assert.equal(object.transform, undefined);
  assert.equal(translateInkItems(items, [stroke.id], 0, 0), items);
  assert.equal(translateInkItems(items, ["missing"], 3, 5), items);
  assert.equal(translateInkItems(items, [stroke.id], Infinity, 5), items);
});
