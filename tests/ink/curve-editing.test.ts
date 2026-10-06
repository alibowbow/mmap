import test from "node:test";
import assert from "node:assert/strict";
import type { InkStroke } from "../../src/types/mindmap";
import { itemCenter, renderPoints, transformPoint } from "../../src/lib/ink";
import { deformStrokeAt, strokeEditHandles } from "../../src/lib/inkCurveEditing";

const stroke = (extra: Partial<InkStroke> = {}): InkStroke => ({
  id: "edit-branch", brush: "brush", color: "#246d56", width: 24,
  branchStyle: "hand-v1", seed: 72, taper: 0.94, texture: 0.45,
  points: [0, 10, 20, 50, 80, 90, 100].map((x, i) => ({
    x, y: 0, pressure: 0.2 + i * 0.1,
  })),
  ...extra,
});
const near = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  assert.ok(Math.abs(a.x - b.x) < 1e-8, `${a.x} ≠ ${b.x}`);
  assert.ok(Math.abs(a.y - b.y) < 1e-8, `${a.y} ≠ ${b.y}`);
};
const worldEndpoints = (s: InkStroke) => {
  const points = renderPoints(s), center = itemCenter(s);
  return [points[0], points[points.length - 1]].map((p) =>
    s.transform ? transformPoint(p, s.transform, center) : p,
  );
};

test("curve handles use arc length and deterministic world coordinates", () => {
  const s = stroke({ transform: { x: 25, y: 30, rotation: 90, scale: 2 } });
  const handles = strokeEditHandles(s);
  assert.deepEqual(handles.map((h) => [h.id, h.fraction]),
    [["start", 0], ["middle", 0.5], ["end", 1]]);
  near(handles[1].point, transformPoint({ x: 50, y: 0 }, s.transform!, itemCenter(s)));
  assert.deepEqual(handles, strokeEditHandles(structuredClone(s)));
});

test("brush middle edits preserve endpoints, pressure, style, original and arc falloff", () => {
  const s = stroke(), original = structuredClone(s);
  const result = deformStrokeAt(s, 0.5, { x: 50, y: 40 });
  assert.deepEqual(s, original);
  assert.deepEqual(result.points[0], s.points[0]);
  assert.deepEqual(result.points.at(-1), s.points.at(-1));
  assert.deepEqual(result.points.map((p) => p.pressure), s.points.map((p) => p.pressure));
  assert.equal(result.points[3].y, 40);
  assert.ok(result.points[2].y > result.points[1].y);
  assert.ok(Math.abs(result.points[1].y - result.points[5].y) < 1e-8);
  for (const k of ["branchStyle", "seed", "taper", "texture", "width", "brush", "color"] as const)
    assert.equal(result[k], s[k]);
  assert.deepEqual(result, deformStrokeAt(s, 0.5, { x: 50, y: 40 }));
});

test("rotation/scale and changed bounds do not move the fixed endpoint anchors", () => {
  for (const brush of ["brush", "branch"] as const) {
    const s = stroke({ brush, transform: { x: 20, y: -13, rotation: 37, scale: 1.8 } });
    const handle = strokeEditHandles(s)[1], endpoints = worldEndpoints(s);
    const result = deformStrokeAt(s, 0.5,
      { x: handle.point.x - 12, y: handle.point.y + 30 });
    worldEndpoints(result).forEach((p, i) => near(p, endpoints[i]));
    assert.equal(result.transform!.rotation, s.transform!.rotation);
    assert.equal(result.transform!.scale, s.transform!.scale);
  }
});

test("branch middle knob changes only constrained curve and retains hand-v1 geometry", () => {
  const s = stroke({ brush: "branch", curve: 0.2 });
  const result = deformStrokeAt(s, 0.5, { x: 85, y: 30 });
  assert.equal(result.curve, 0.6);
  assert.equal(result.points, s.points);
  assert.equal(result.brush, "branch");
  assert.equal(result.branchStyle, "hand-v1");
  near(strokeEditHandles(result)[1].point, { x: 50, y: 30 });
  assert.equal(deformStrokeAt(s, 0.5, { x: 50, y: 300 }).curve, 1);
  assert.equal(deformStrokeAt(s, 0.5, { x: 50, y: -300 }).curve, -1);
});

test("endpoint knobs reach world target while holding opposite transformed endpoint", () => {
  for (const brush of ["brush", "branch"] as const) {
    for (const f of [0, 1]) {
      const s = stroke({ brush, transform: { x: 30, y: 40, rotation: -24, scale: 0.7 } });
      const before = worldEndpoints(s), target = { x: 190, y: 70 };
      const result = deformStrokeAt(s, f, target), after = worldEndpoints(result);
      near(after[f], target);
      near(after[1 - f], before[1 - f]);
      assert.equal(result.points[0].pressure, s.points[0].pressure);
      assert.equal(result.points.at(-1)!.pressure, s.points.at(-1)!.pressure);
    }
  }
});

test("sparse brush gestures can bend; handwriting, erased and invalid inputs remain intact", () => {
  const sparse = stroke({ points: [{ x: 0, y: 0, pressure: 0.3 }, { x: 100, y: 0, pressure: 0.9 }] });
  const result = deformStrokeAt(sparse, 0.5, { x: 50, y: 20 });
  assert.equal(result.points.length, 5);
  assert.equal(result.points[2].y, 20);
  assert.deepEqual(result.points[0], sparse.points[0]);
  assert.deepEqual(result.points.at(-1), sparse.points.at(-1));
  const masked = { ...stroke(), erasures: [{ points: [{ x: 20, y: 0 }], radius: 6 }] };
  for (const s of [stroke({ brush: "pen" }), stroke({ brush: "pencil" }), masked]) {
    assert.deepEqual(strokeEditHandles(s), []);
    assert.equal(deformStrokeAt(s, 0.5, { x: 50, y: 40 }), s);
  }
  const s = stroke();
  assert.equal(deformStrokeAt(s, 0.5, { x: 50, y: 0 }), s);
  assert.equal(deformStrokeAt(s, NaN, { x: 50, y: 40 }), s);
  assert.equal(deformStrokeAt(s, 0.5, { x: Infinity, y: 40 }), s);
});
