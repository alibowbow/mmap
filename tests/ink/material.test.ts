import test from "node:test";
import assert from "node:assert/strict";
import {
  materialPaintPaths,
  materialPaperTransform,
} from "../../src/lib/inkMaterial";
import {
  branchGeometry,
  itemTransform,
  renderPoints,
  strokePath,
  validateInk,
} from "../../src/lib/ink";
import { exportDocumentJson } from "../../src/lib/export";
import { parseImportJson } from "../../src/lib/validation";
import { portableFixture } from "../io/fixture";
import type { InkStroke } from "../../src/types/mindmap";

const clean = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const stroke = (extra: Partial<InkStroke> = {}): InkStroke => ({
  id: "material-stroke",
  color: "#246d56",
  brush: "brush",
  materialStyle: "grain-v1",
  width: 24,
  seed: 1977,
  texture: 0.7,
  taper: 0.72,
  points: Array.from({ length: 41 }, (_, i) => ({
    x: i * 8,
    y: Math.sin(i / 10) * 40,
    pressure: 0.2 + Math.sin((i / 40) * Math.PI) * 0.8,
  })),
  ...extra,
});

function applyTransform(
  path: string | undefined,
  point: { x: number; y: number },
) {
  let p = { ...point };
  const operations = [
    ...(path ?? "").matchAll(/(translate|scale|rotate)\(([^)]+)\)/g),
  ];
  for (const operation of operations.reverse()) {
    const values = operation[2].split(/[ ,]+/).map(Number);
    if (operation[1] === "translate") {
      p.x += values[0];
      p.y += values[1] ?? 0;
    } else if (operation[1] === "scale") {
      p.x *= values[0];
      p.y *= values[1] ?? values[0];
    } else {
      const radians = (values[0] * Math.PI) / 180,
        x = p.x;
      p.x = x * Math.cos(radians) - p.y * Math.sin(radians);
      p.y = x * Math.sin(radians) + p.y * Math.cos(radians);
    }
  }
  return p;
}

test("material rendering is opt-in and retains every released non-marker trajectory", () => {
  const legacy = stroke({ materialStyle: undefined }),
    before = strokePath(legacy);
  assert.equal(materialPaintPaths(legacy), undefined);
  assert.equal(
    materialPaintPaths({ ...legacy, materialStyle: "classic" }),
    undefined,
  );
  for (const brush of [
    "pencil",
    "pen",
    "highlighter",
    "brush",
    "branch",
  ] as const) {
    const s = stroke({ brush }),
      points = clean(s.points),
      released = renderPoints(s),
      material = materialPaintPaths(s)!;
    assert.equal(material.body, strokePath(s));
    assert.deepEqual(s.points, points);
    assert.equal(renderPoints(s), released);
    assert.equal(materialPaintPaths(s), material);
    assert.deepEqual(materialPaintPaths(clean(s)), material);
  }
  assert.equal(strokePath(legacy), before);
});

test("pencil uses page-grain deposits and pressure density; pens/highlighters stay clean", () => {
  const low = stroke({
      brush: "pencil",
      points: [0, 50, 100].map((x) => ({ x, y: 0, pressure: 0.1 })),
    }),
    high = { ...low, points: low.points.map((p) => ({ ...p, pressure: 1 })) },
    light = materialPaintPaths(low)!,
    dark = materialPaintPaths(high)!;
  assert.ok(light.paperGrain && dark.paperGrain);
  assert.equal(light.paperGrain.size, 12);
  assert.equal(light.paperGrain.path.match(/M/g)?.length, 24);
  const deposits = [
      ...dark.paperGrain.path.matchAll(
        /M(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)a(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)/g,
      ),
    ],
    centers = deposits.map((m) => ({
      x: Number(m[1]) + Number(m[3]),
      y: Number(m[2]),
      radius: Number(m[3]),
    }));
  assert.equal(centers.length, 24);
  assert.ok(new Set(centers.map((p) => p.x.toFixed(2))).size > 20);
  assert.ok(new Set(centers.map((p) => p.y.toFixed(2))).size > 20);
  for (const p of centers) {
    assert.ok(p.x - p.radius >= 0 && p.x + p.radius <= 12);
    assert.ok(p.y - p.radius >= 0 && p.y + p.radius <= 12);
  }
  assert.ok(dark.bodyOpacity > light.bodyOpacity);
  assert.ok(dark.paperGrain.opacity > light.paperGrain.opacity);
  assert.ok(dark.accentOpacity! > light.accentOpacity!);
  assert.equal(light.grain, undefined);
  for (const brush of ["pen", "highlighter"] as const) {
    const s = stroke({ brush }),
      material = materialPaintPaths(s)!;
    assert.deepEqual(material, { body: strokePath(s), bodyOpacity: 1 });
  }
});

test("marker has a fixed chisel nib with direction-dependent width and long stripe deposits", () => {
  const horizontal = stroke({
      brush: "marker",
      width: 20,
      points: [
        { x: 0, y: 0, pressure: 1 },
        { x: 100, y: 0, pressure: 1 },
      ],
    }),
    vertical = {
      ...horizontal,
      points: [
        { x: 0, y: 0, pressure: 1 },
        { x: 0, y: 100, pressure: 1 },
      ],
    },
    h = materialPaintPaths(horizontal)!,
    v = materialPaintPaths(vertical)!,
    coordinates = (d: string) =>
      [...d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => [
        Number(m[1]),
        Number(m[2]),
      ]),
    horizontalHalfWidth = Math.max(
      ...coordinates(h.body).map((p) => Math.abs(p[1])),
    ),
    verticalHalfWidth = Math.max(
      ...coordinates(v.body).map((p) => Math.abs(p[0])),
    );
  assert.ok(verticalHalfWidth > horizontalHalfWidth * 1.4);
  assert.ok(horizontalHalfWidth < 10 && verticalHalfWidth <= 10);
  assert.notEqual(h.body, strokePath(horizontal));
  assert.equal(h.body.match(/M/g)?.length, 1);
  assert.ok(h.grain && !h.paperGrain && !h.accent);
  assert.ok((h.grain.match(/M/g)?.length ?? 0) <= 12);
});

test("brush and hand branches preserve body geometry while pigment follows pressure and seeded fibers", () => {
  for (const branchStyle of ["classic", "hand-v1"] as const) {
    const s = stroke({ branchStyle }),
      material = materialPaintPaths(s)!,
      changed = materialPaintPaths({ ...s, seed: s.seed! + 1 })!;
    assert.equal(material.body, strokePath(s));
    assert.ok(material.accent && material.grain);
    assert.notEqual(material.grain, changed.grain);
    if (branchStyle === "classic") assert.equal(material.body, changed.body);
    else
      assert.deepEqual(
        branchGeometry(s).points,
        branchGeometry({ ...s, seed: s.seed! + 1 }).points,
      );
    assert.ok((material.grain.match(/M/g)?.length ?? 0) <= 26);
    assert.equal(material.paperGrain, undefined);
  }
  const joined = stroke({ branchStyle: "hand-v1", joinWidth: 0.1 }),
    shape = branchGeometry(joined),
    paint = materialPaintPaths(joined)!;
  assert.equal(paint.body, strokePath(joined));
  assert.ok(shape.radii[0] <= 0.05);
  assert.ok(
    paint.accent!.startsWith(`M${joined.points[0].x},${joined.points[0].y}L`),
  );
  assert.ok(!JSON.stringify(paint).includes("NaN"));
});

test("page grain cancels move/scale/rotation exactly; all other paths stay local to the stroke", () => {
  const s = stroke({ brush: "pencil" }),
    moved = {
      ...s,
      transform: { x: -311, y: 427, scale: 2.7, rotation: 37 },
    },
    before = materialPaintPaths(s)!,
    after = materialPaintPaths(moved)!;
  assert.equal(after.body, before.body);
  assert.equal(after.accent, before.accent);
  assert.equal(after.paperGrain!.path, before.paperGrain!.path);
  assert.equal(before.paperGrain!.transform, undefined);
  assert.equal(after.paperGrain!.transform, materialPaperTransform(moved));
  for (const p of [
    { x: 0, y: 0 },
    { x: 12, y: 4 },
    { x: -47, y: 821 },
  ]) {
    const local = applyTransform(after.paperGrain!.transform, p),
      world = applyTransform(itemTransform(moved), local);
    assert.ok(Math.abs(world.x - p.x) < 1e-9);
    assert.ok(Math.abs(world.y - p.y) < 1e-9);
  }
});

test("portable JSON restores seeded materials without changing exported world-space paint", () => {
  const original = stroke({
      brush: "pencil",
      transform: { x: 53, y: -91, scale: 0.4, rotation: -125 },
    }),
    document = {
      ...portableFixture(),
      ink: { version: 4 as const, strokes: [original] },
    },
    raw = exportDocumentJson(document),
    parsed = parseImportJson(raw);
  assert.ok(parsed.ok);
  const restored = parsed.document.ink!.strokes[0];
  assert.equal(restored.materialStyle, "grain-v1");
  assert.deepEqual(materialPaintPaths(restored), materialPaintPaths(original));
  assert.equal(itemTransform(restored), itemTransform(original));
  assert.equal(validateInk(document.ink).ok, true);
  assert.equal(validateInk({ ...document.ink, version: 3 }).ok, false);
});

test("dots, repeated points and 12,000-sample strokes remain finite with bounded compound grain", () => {
  for (const brush of [
    "pencil",
    "pen",
    "marker",
    "highlighter",
    "brush",
    "branch",
  ] as const) {
    for (const points of [
      [{ x: -999999, y: 999999, pressure: 0 }],
      Array.from({ length: 5 }, () => ({ x: 3, y: -7, pressure: 0.5 })),
    ]) {
      const paint = materialPaintPaths(stroke({ brush, width: 1, points }))!;
      assert.ok(paint.body.length > 0);
      assert.ok(!/NaN|Infinity/.test(JSON.stringify(paint)));
    }
  }
  const long = stroke({
      points: Array.from({ length: 12000 }, (_, i) => ({
        x: i,
        y: Math.sin(i / 200) * 50,
        pressure: 0.5,
      })),
    }),
    paint = materialPaintPaths(long)!;
  assert.ok((paint.grain?.match(/M/g)?.length ?? 0) <= 26);
  assert.ok(Buffer.byteLength(JSON.stringify(paint)) < 3 * 1024 * 1024);
  assert.equal(materialPaintPaths(long), paint);
});
