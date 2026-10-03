import { appearanceFrom } from "../../src/lib/appearance";
import { buildEdgesFromNodes } from "../../src/lib/tree";
import type { MindMapDocument, MindMapNode } from "../../src/types/mindmap";

// One root, six branches, fifteen leaves. Manual coordinates deliberately do
// not match auto layout; import must not turn them into a different map.
export function portableFixture(): MindMapDocument {
  const nodes: MindMapNode[] = [
    {
      id: "root",
      type: "mindmap",
      position: { x: 0, y: 0 },
      data: {
        label: "한국어 메시지 지도",
        type: "root",
        isRoot: true,
        parentId: null,
      },
    },
  ];
  for (let b = 0; b < 6; b++) {
    const side = b < 3 ? "left" : "right";
    const x = b < 3 ? -450 : 450,
      y = ((b % 3) - 1) * 520;
    nodes.push({
      id: `branch-${b}`,
      type: "mindmap",
      position: { x, y },
      data: {
        label: `가지 ${b + 1} · 생각을 연결해요`,
        type: "idea",
        parentId: "root",
        side,
        collapsed: b === 1,
        ...(b === 0 ? { color: "#f97316", style: "outline" as const } : {}),
      },
    });
    for (let j = 0; j < (b < 3 ? 3 : 2); j++) {
      nodes.push({
        id: `leaf-${b}-${j}`,
        type: "mindmap",
        position: { x: x * 2, y: y + (j - 1) * 140 },
        data: {
          label: j
            ? "짧은 문장"
            : "한글과 English가 함께 있는 아주 긴 문장도 줄바꿈과 디자인을 유지해야 합니다.",
          type: "task",
          parentId: `branch-${b}`,
          status: j ? "done" : "todo",
          description: "첫 줄\n두 번째 줄",
          tags: ["검증", "내보내기"],
          emoji: "🌱",
          link: "https://example.com/",
          checklist: [{ id: "check", text: "실제 파일 확인", checked: j > 0 }],
        },
      });
    }
  }
  return {
    id: "io-source",
    title: "한글 메시지 왕복 검증",
    nodes,
    edges: buildEdgesFromNodes(nodes),
    relations: [
      {
        id: "rel-1",
        source: "branch-0",
        target: "branch-5",
        label: "별도 관계선",
      },
    ],
    layoutMode: "bidirectional",
    appearance: appearanceFrom({
      font: "jua",
      theme: "light",
      nodeStyle: "soft",
      nodeTint: true,
      rainbowBranches: true,
      edgeStyle: "curved",
      edgeWidth: 3,
      edgeColorMode: "node",
      edgeLine: "dashed",
      canvasBg: "cross",
      accent: "rose",
      levelFontSizes: [24, 20, 18, 16],
    }),
    viewport: { x: 400, y: 300, zoom: 0.55 },
    pinned: true,
    createdAt: "2026-10-02",
    updatedAt: "2026-10-02",
  };
}
