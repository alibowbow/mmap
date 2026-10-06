import test from "node:test";
import assert from "node:assert/strict";
import {
  brushPaintSettings,
  MARKER_PASTEL_PALETTE,
  MARKER_DARK_PALETTE,
  MARKER_DEFAULT_OPACITY,
  HIGHLIGHTER_DEFAULT_OPACITY,
} from "../../src/lib/inkToolSettings";
import { inkColor, validInkSettings } from "../../src/lib/ink";
import type { AnalogBrush, InkSettings } from "../../src/types/mindmap";

const settings = (extra: Partial<InkSettings> = {}): InkSettings => ({
  color: "#2563eb",
  width: 4,
  brush: "pen",
  opacity: 1,
  ...extra,
});
const channels = (color: string) =>
  [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
const luminance = (rgb: number[]) => {
  const linear = rgb.map((byte) => {
    const v = byte / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
};
const composite = (paint: number[], base: number[], alpha: number) =>
  paint.map((v, i) => v * alpha + base[i] * (1 - alpha));

test("six paired marker colours are valid pastels and return to legible writing colours", () => {
  assert.equal(MARKER_PASTEL_PALETTE.length, 6);
  assert.equal(MARKER_DARK_PALETTE.length, 6);
  assert.equal(new Set(MARKER_PASTEL_PALETTE).size, 6);
  for (let i = 0; i < MARKER_PASTEL_PALETTE.length; i++) {
    const light = MARKER_PASTEL_PALETTE[i],
      dark = MARKER_DARK_PALETTE[i];
    assert.ok(inkColor(light) && inkColor(dark));
    assert.ok(luminance(channels(light)) > 0.68);
    assert.ok(luminance(channels(dark)) < 0.4);
    const marker = brushPaintSettings(settings({ color: dark }), "marker");
    assert.equal(marker.color, light);
    assert.equal(marker.opacity, MARKER_DEFAULT_OPACITY);
    const pen = brushPaintSettings(
      settings({ ...marker, brush: "marker" }),
      "pen",
    );
    assert.equal(pen.color, dark);
    assert.equal(pen.opacity, 1);
  }
});

test("all writing tools enter marker/highlighter with lighter paint and the right alpha", () => {
  for (const brush of ["pen", "pencil", "brush", "branch"] as const) {
    const current = settings({ brush, color: "#dc2626", opacity: 0.7 }),
      before = JSON.stringify(current);
    for (const next of ["marker", "highlighter"] as const) {
      const patch = brushPaintSettings(current, next);
      assert.ok(patch.color && inkColor(patch.color));
      assert.ok(
        luminance(channels(patch.color)) > luminance(channels(current.color)),
      );
      assert.equal(patch.opacity, next === "marker" ? 0.42 : 0.8);
      assert.ok(validInkSettings({ ...current, ...patch, brush: next }));
    }
    assert.equal(JSON.stringify(current), before);
  }
  assert.equal(
    brushPaintSettings(settings({ color: "#f4c343" }), "marker").color,
    MARKER_PASTEL_PALETTE[2],
    "strong yellow also becomes quiet even when already bright",
  );
});

test("pale marker overlay leaves dark writing visible on white and cream paper", () => {
  const alpha = MARKER_DEFAULT_OPACITY * 0.86,
    text = channels("#0f172a");
  for (const paintColor of MARKER_PASTEL_PALETTE) {
    const paint = channels(paintColor);
    for (const background of ["#ffffff", "#fcf5e8"]) {
      const onText = luminance(composite(paint, text, alpha)),
        onPaper = luminance(composite(paint, channels(background), alpha));
      assert.ok((onPaper + 0.05) / (onText + 0.05) > 4.5);
    }
  }
  assert.ok(HIGHLIGHTER_DEFAULT_OPACITY * 0.27 < alpha);
});

test("same-tool selection and writing-tool changes keep explicit colour/opacity untouched", () => {
  for (const brush of [
    "pencil",
    "pen",
    "marker",
    "highlighter",
    "brush",
    "branch",
  ] as const) {
    const current = settings({ brush, color: "#ff00aa", opacity: 0.29 });
    assert.deepEqual(brushPaintSettings(current, brush), {});
  }
  for (const next of ["pencil", "brush", "branch"] as const)
    assert.deepEqual(brushPaintSettings(settings({ opacity: 0.29 }), next), {});
  assert.deepEqual(
    brushPaintSettings(settings({ brush: undefined }), "pen"),
    {},
  );
});

test("already-light custom colours survive marker entry; marking-tool switches retain chosen hue", () => {
  const light = settings({ color: "#e8f3ee", opacity: 0.31 }),
    patch = brushPaintSettings(light, "marker");
  assert.equal(patch.color, undefined);
  assert.equal(patch.opacity, 0.42);
  const explicit = settings({
    brush: "marker",
    color: "#ff00aa",
    opacity: 0.24,
  });
  assert.deepEqual(brushPaintSettings(explicit, "highlighter"), {
    opacity: 0.8,
  });
  assert.deepEqual(
    brushPaintSettings({ ...explicit, brush: "highlighter" }, "marker"),
    { opacity: 0.42 },
  );
  assert.deepEqual(brushPaintSettings(explicit, "pen"), { opacity: 1 });
});

test("pastel writing return changes only paint settings and never mutates the current tool", () => {
  const current = Object.freeze(
      settings({
        brush: "marker",
        color: "#e8f3ee",
        width: 32,
        materialStyle: "grain-v1",
        taper: 0.8,
        texture: 0.6,
      }),
    ),
    before = JSON.stringify(current);
  for (const next of [
    "pen",
    "pencil",
    "brush",
    "branch",
  ] satisfies AnalogBrush[]) {
    const patch = brushPaintSettings(current, next);
    assert.ok(
      patch.color &&
        MARKER_DARK_PALETTE.includes(
          patch.color as (typeof MARKER_DARK_PALETTE)[number],
        ),
    );
    assert.equal(patch.opacity, 1);
    assert.deepEqual(Object.keys(patch).sort(), ["color", "opacity"]);
  }
  assert.equal(JSON.stringify(current), before);
});
