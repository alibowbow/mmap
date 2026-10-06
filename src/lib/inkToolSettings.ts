import type { AnalogBrush, InkSettings } from "@/types/mindmap";

// Paired hues keep a light marking colour and a legible writing colour close.
// The neutral pair prevents a black/grey pen from turning into coloured ink.
export const MARKER_PASTEL_PALETTE = [
  "#cbdcf3",
  "#d1e8df",
  "#f5e8bb",
  "#f4d4cc",
  "#e2d7f0",
  "#e2e5e8",
] as const;
// Short toolbar-facing name; both markers and highlighters use these pastels.
export const MARKER_PALETTE = MARKER_PASTEL_PALETTE;
export const MARKER_DARK_PALETTE = [
  "#285b85",
  "#246d56",
  "#946b1a",
  "#b95847",
  "#7868ad",
  "#475569",
] as const;
export const MARKER_DEFAULT_OPACITY = 0.42;
export const HIGHLIGHTER_DEFAULT_OPACITY = 0.8;

function rgb(color: string) {
  return [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255);
}
function luminance(color: string) {
  const linear = rgb(color).map((v) =>
    v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4),
  );
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
function hue(color: string) {
  const [r, g, b] = rgb(color),
    maximum = Math.max(r, g, b),
    minimum = Math.min(r, g, b),
    chroma = maximum - minimum;
  if (chroma < 0.08) return undefined;
  const angle =
    maximum === r
      ? ((g - b) / chroma) % 6
      : maximum === g
        ? (b - r) / chroma + 2
        : (r - g) / chroma + 4;
  return (angle * 60 + 360) % 360;
}
function paletteIndex(color: string) {
  const paired = MARKER_DARK_PALETTE.findIndex(
    (shade) => shade === color.toLowerCase(),
  );
  if (paired >= 0) return paired;
  const angle = hue(color);
  if (angle === undefined) return 5;
  let index = 0,
    distance = Infinity;
  for (let i = 0; i < MARKER_PASTEL_PALETTE.length - 1; i++) {
    const target = hue(MARKER_PASTEL_PALETTE[i]) ?? 0,
      gap = Math.abs(angle - target),
      circular = Math.min(gap, 360 - gap);
    if (circular < distance) {
      distance = circular;
      index = i;
    }
  }
  return index;
}
const isMarker = (brush: AnalogBrush) =>
  brush === "marker" || brush === "highlighter";

/** Apply only when the user changes brush, never in a colour/opacity handler.
 * Same-tool clicks and writing-tool changes preserve explicit user settings.
 * This patch affects future strokes only; saved marks keep their own style.
 */
export function brushPaintSettings(
  current: InkSettings,
  nextBrush: AnalogBrush,
): Partial<InkSettings> {
  const previous = current.brush ?? "pen";
  if (previous === nextBrush) return {};
  if (isMarker(nextBrush)) {
    const patch: Partial<InkSettings> = {
      opacity:
        nextBrush === "marker"
          ? MARKER_DEFAULT_OPACITY
          : HIGHLIGHTER_DEFAULT_OPACITY,
    };
    if (!isMarker(previous)) {
      const channels = rgb(current.color),
        chroma = Math.max(...channels) - Math.min(...channels);
      // Already-light, quiet custom colours stay as selected. Strong yellow
      // also needs a pastel even though its luminance may be relatively high.
      if (luminance(current.color) < 0.62 || chroma > 0.35)
        patch.color = MARKER_PASTEL_PALETTE[paletteIndex(current.color)];
    }
    return patch;
  }
  if (isMarker(previous)) {
    const patch: Partial<InkSettings> = { opacity: 1 },
      known = MARKER_PASTEL_PALETTE.findIndex(
        (color) => color === current.color.toLowerCase(),
      );
    if (known >= 0) patch.color = MARKER_DARK_PALETTE[known];
    else if (luminance(current.color) >= 0.62)
      patch.color = MARKER_DARK_PALETTE[paletteIndex(current.color)];
    return patch;
  }
  return {};
}
