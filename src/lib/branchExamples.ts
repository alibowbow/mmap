import { studioDocument } from "./studioExamples";
import type { InkObject, InkStroke, MindMapDocument } from "@/types/mindmap";

// The same original freehand trajectories on both sides. Only the explicitly
// identified coloured branches opt in; lettering and doodles retain their tools.
export function branchStudyDocument(
  kind: "before" | "after" | "comparison" = "comparison",
): MindMapDocument {
  const source = studioDocument("map");
  const strokes: InkStroke[] = [],
    objects: InkObject[] = [];
  for (const side of kind === "comparison" ? ["before", "after"] : [kind]) {
    const offset = kind === "comparison" ? (side === "before" ? -730 : 730) : 0;
    for (const s of source.ink!.strokes) {
      const branch = s.brush === "brush" && (s.width === 27 || s.width === 9);
      strokes.push({
        ...s,
        id: side + "-" + s.id,
        ...(branch && side === "after"
          ? { branchStyle: "hand-v1", texture: 0.45, taper: 0.94 }
          : {}),
        ...(offset
          ? { transform: { x: offset, y: 0, scale: 1, rotation: 0 } }
          : {}),
      });
    }
    objects.push({
      id: side + "-heading",
      kind: "label",
      text: side === "before" ? "이전 · 기본 붓터치" : "개선 · 손그림 가지",
      x: offset,
      y: -440,
      width: 490,
      height: 58,
      fontSize: 38,
      color: "#334047",
      fill: false,
    });
    objects.push({
      id: side + "-caption",
      kind: "label",
      text:
        side === "before"
          ? "같은 궤적, 같은 색과 굵기"
          : "굵은 시작 → 가는 끝 · 은은한 안료 결",
      x: offset,
      y: 480,
      width: 630,
      height: 35,
      fontSize: 23,
      color: "#66746b",
      fill: false,
    });
  }
  return {
    ...source,
    id: "branch-study-" + kind,
    title:
      kind === "comparison" ? "가지 필치 전후 비교" : "가지 필치 · " + kind,
    ink: {
      ...source.ink!,
      version: kind === "before" ? 2 : 3,
      strokes,
      objects,
      order: [...strokes.map((s) => s.id), ...objects.map((s) => s.id)],
    },
  };
}
