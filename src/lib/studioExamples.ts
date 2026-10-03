import { freehandGarden } from "./freehandDemo";
import { DEFAULT_APPEARANCE } from "./appearance";
import { BRUSHES, BRUSH_WIDTH, hashSeed, type InkItem } from "./ink";
import type {
  AnalogBrush,
  InkData,
  InkObject,
  InkPoint,
  InkStroke,
  MindMapDocument,
} from "@/types/mindmap";

// Original editable vector examples. Each call imports a new document ID;
// examples never modify an existing map or call an image service.
export function studioDocument(kind: "map" | "swatches"): MindMapDocument {
  const strokes: InkStroke[] = [],
    objects: InkObject[] = [],
    order: string[] = [];
  let serial = 0;
  const add = (item: InkItem) => {
    if ("points" in item) strokes.push(item);
    else objects.push(item);
    order.push(item.id);
    return item;
  };
  const line = (
    points: InkPoint[],
    brush: AnalogBrush,
    color: string,
    width: number,
    extra: Partial<InkStroke> = {},
  ) => {
    const id = "example-" + kind + "-" + serial++;
    return add({
      id,
      points,
      brush,
      color,
      width,
      seed: hashSeed(id),
      opacity: 1,
      texture: 0.8,
      taper: 0.86,
      curve: 0.22,
      ...extra,
    });
  };
  const label = (
    text: string,
    x: number,
    y: number,
    size: number,
    color = "#334047",
    rotation = 0,
  ) =>
    add({
      id: "example-" + kind + "-" + serial++,
      kind: "label",
      text,
      x,
      y,
      width: Math.max(
        20,
        [...text].reduce((n, c) => n + (/[^\x00-\x7F]/.test(c) ? 1 : 0.56), 0) *
          size,
      ),
      height: size * 1.5,
      color,
      fontSize: size,
      fill: false,
      ...(rotation ? { transform: { x: 0, y: 0, scale: 1, rotation } } : {}),
    });
  const point = (x: number, y: number): InkPoint => ({ x, y, pressure: 1 });
  if (kind === "swatches") {
    label("자국이 다른 여섯 가지 도구", 30, -145, 40);
    label("같은 곡선, 필압 없이", 0, -84, 18, "#677576");
    label("두 획 겹침", 390, -84, 18, "#677576");
    const colors = [
      "#285b85",
      "#26374a",
      "#e0614e",
      "#eab53c",
      "#7868ad",
      "#246d56",
    ];
    const descriptions = [
      "사각사각, 종이가 비치는 결",
      "또렷한 선과 둥근 끝",
      "넓고 납작한 색의 띠",
      "투명한 색, 겹칠수록 진하게",
      "필압 없이도 가늘고 굵게",
      "시작은 굵게, 끝은 가늘게",
    ];
    BRUSHES.forEach((brush, j) => {
      const y = j * 115,
        color = colors[j];
      label(
        ["색연필", "펜", "마커", "형광펜", "브러시", "가지"][j],
        -360,
        y - 5,
        28,
        color,
      );
      line(
        Array.from({ length: 70 }, (_, i) =>
          point(-235 + i * 6.4, y + Math.sin(i / 10) * 15),
        ),
        brush,
        color,
        brush === "pencil" ? 15 : BRUSH_WIDTH[brush],
        { curve: 0.16 },
      );
      line(
        Array.from({ length: 20 }, (_, i) =>
          point(325 + i * 7, y - 27 + i * 2.8),
        ),
        brush,
        color,
        brush === "pencil" ? 15 : BRUSH_WIDTH[brush],
      );
      line(
        Array.from({ length: 20 }, (_, i) =>
          point(325 + i * 7, y + 27 - i * 2.8),
        ),
        brush,
        color,
        brush === "pencil" ? 15 : BRUSH_WIDTH[brush],
        { curve: -0.22 },
      );
      label(descriptions[j], -4, y + (brush === "branch" ? 70 : 43), 17, "#738079");
    });
    label("색을 겹치고, 선에 리듬을 더하세요", 30, 702, 24, "#52695c");
  } else {
    for (const stroke of freehandGarden()) add(stroke);
  }
  const ink: InkData = {
    version: 2,
    strokes,
    objects,
    order,
    paper: { kind: "cream", texture: 0.5, seed: 1977 },
  };
  return {
    id: "studio-" + kind,
    title: kind === "map" ? "생각의 정원" : "아날로그 도구 자국 비교",
    boardMode: "blank",
    ink,
    nodes: [],
    edges: [],
    inkSettings: {
      color: "#246d56",
      width: 4,
      brush: "pen",
      taper: 0.86,
      curve: 0.22,
    },
    appearance: { ...DEFAULT_APPEARANCE, font: "jua", canvasBg: "none" },
    createdAt: "2026-10-03T04:00:00Z",
    updatedAt: "2026-10-03T04:00:00Z",
  };
}
