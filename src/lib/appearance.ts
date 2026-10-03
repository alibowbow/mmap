import {
  ACCENT_OPTIONS,
  CANVAS_BG_OPTIONS,
  DEFAULT_ACCENT,
  DEFAULT_CANVAS_BG,
  DEFAULT_EDGE_LINE,
  DEFAULT_FONT,
  DEFAULT_LEVEL_FONT_SIZES,
  DEFAULT_NODE_STYLE,
  EDGE_COLOR_OPTIONS,
  EDGE_LINE_OPTIONS,
  EDGE_STYLE_OPTIONS,
  FONT_OPTIONS,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  NODE_STYLE_OPTIONS,
} from "./constants";
import type { MindMapAppearance, MindMapDocument } from "@/types/mindmap";

export const DEFAULT_APPEARANCE: MindMapAppearance = {
  theme: "system",
  font: DEFAULT_FONT,
  nodeStyle: DEFAULT_NODE_STYLE,
  levelFontSizes: [...DEFAULT_LEVEL_FONT_SIZES],
  edgeStyle: "curved",
  edgeAnimated: false,
  edgeWidth: 2,
  edgeColorMode: "default",
  edgeLine: DEFAULT_EDGE_LINE,
  nodeTint: false,
  canvasBg: DEFAULT_CANVAS_BG,
  accent: DEFAULT_ACCENT,
  rainbowBranches: false,
};

const choices: Partial<Record<keyof MindMapAppearance, readonly string[]>> = {
  theme: ["light", "dark", "system"],
  font: FONT_OPTIONS.map((x) => x.id),
  nodeStyle: NODE_STYLE_OPTIONS.map((x) => x.id),
  edgeStyle: EDGE_STYLE_OPTIONS.map((x) => x.id),
  edgeColorMode: EDGE_COLOR_OPTIONS.map((x) => x.id),
  edgeLine: EDGE_LINE_OPTIONS.map((x) => x.id),
  canvasBg: CANVAS_BG_OPTIONS.map((x) => x.id),
  accent: ACCENT_OPTIONS.map((x) => x.id),
};

export function validAppearanceField(
  key: keyof MindMapAppearance,
  value: unknown,
): boolean {
  if (key === "levelFontSizes")
    return (
      Array.isArray(value) &&
      value.length === 4 &&
      value.every(
        (n) =>
          typeof n === "number" &&
          Number.isFinite(n) &&
          n >= FONT_SIZE_MIN &&
          n <= FONT_SIZE_MAX,
      )
    );
  if (key === "edgeWidth")
    return (
      typeof value === "number" &&
      Number.isFinite(value) &&
      value > 0 &&
      value <= 20
    );
  if (choices[key])
    return typeof value === "string" && choices[key]!.includes(value);
  return typeof value === "boolean";
}

// Explicitly pick the design keys; never merge imported properties into state.
export function appearanceFrom(value: unknown): MindMapAppearance {
  const input =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const result = {
    ...DEFAULT_APPEARANCE,
    levelFontSizes: [...DEFAULT_APPEARANCE.levelFontSizes],
  };
  for (const key of Object.keys(
    DEFAULT_APPEARANCE,
  ) as (keyof MindMapAppearance)[]) {
    if (validAppearanceField(key, input[key]))
      Object.assign(result, { [key]: input[key] });
  }
  result.levelFontSizes = [...result.levelFontSizes];
  return result;
}

export function preserveDocumentDesign(
  documents: MindMapDocument[],
  fallback: unknown,
): MindMapDocument[] {
  return documents.map((doc) =>
    doc.appearance ? doc : { ...doc, appearance: appearanceFrom(fallback) },
  );
}
