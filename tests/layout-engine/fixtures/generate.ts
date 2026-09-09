import type { MindMapNode } from "../../../src/types/mindmap";
// Integer LCG, fixed seed and stable IDs; test content does not affect geometry.
export function fixture(
  count: number,
  shape: "balanced" | "star" | "chain" = "balanced",
  seed = 43,
): MindMapNode[] {
  let state = seed;
  const rand = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  return Array.from({ length: count }, (_, i) => ({
    id: `n${i}`,
    type: "mindmap",
    position: { x: 0, y: 0 },
    measured: {
      width: 180 + Math.floor(rand() * 150),
      height: 76 + Math.floor(rand() * 110),
    },
    data: {
      label: `생각 ${i} — long English title 🧠`,
      description: "설명",
      tags: ["연구"],
      checklist: [{ id: `c${i}`, text: "확인", checked: i % 3 === 0 }],
      type: i ? "plain" : "root",
      isRoot: !i,
      parentId: i
        ? `n${shape === "chain" ? i - 1 : shape === "star" ? 0 : Math.floor((i - 1) / 3)}`
        : null,
    },
  }));
}
