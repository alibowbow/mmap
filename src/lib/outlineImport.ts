import { NODE_TYPE_CONFIG } from "@/lib/constants";
import { createId } from "@/lib/id";
import { layoutRightTree } from "@/lib/layout";
import { buildEdgesFromNodes } from "@/lib/tree";
import type { Edge, MindMapNode } from "@/types/mindmap";

type OutlineItem = { level: number; text: string };

// Parse Markdown / indented outline text into flat (level, text) items.
// Supports: #/##/### headings, -/*/+ and numbered bullets, [ ]/[x] checkboxes,
// and indentation (2 spaces or 1 tab per level).
export function parseOutlineToItems(text: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  let headingLevel = -1; // base level contributed by the most recent heading

  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.trim()) continue;

    const heading = rawLine.match(/^\s*(#{1,6})\s+(.*\S)\s*$/);
    if (heading) {
      const level = heading[1].length - 1;
      headingLevel = level;
      items.push({ level, text: heading[2].trim() });
      continue;
    }

    const m = rawLine.match(/^(\s*)(.*)$/);
    const indent = (m?.[1] ?? "").replace(/\t/g, "  ");
    const depth = Math.floor(indent.length / 2);
    let content = (m?.[2] ?? "").trim();
    content = content
      .replace(/^([-*+]|\d+[.)])\s+/, "") // bullet / number
      .replace(/^\[[ xX]\]\s+/, "") // checkbox
      .trim();
    if (!content) continue;

    const base = headingLevel >= 0 ? headingLevel + 1 : 0;
    items.push({ level: base + depth, text: content });
  }

  return items;
}

// Build a positioned node/edge tree from outline text. Returns null if empty.
export function parseOutlineToTree(
  text: string
): { nodes: MindMapNode[]; edges: Edge[]; title: string } | null {
  const items = parseOutlineToItems(text);
  if (!items.length) return null;

  const minLevel = Math.min(...items.map((i) => i.level));
  for (const it of items) it.level -= minLevel;

  const topCount = items.filter((i) => i.level === 0).length;
  const useSyntheticRoot = topCount !== 1;

  const nodes: MindMapNode[] = [];
  const stack: { level: number; id: string }[] = [];

  const make = (label: string, parentId: string | null, isRoot: boolean) => {
    const id = createId(isRoot ? "root" : "n");
    const type = isRoot ? "root" : "plain";
    nodes.push({
      id,
      type: "mindmap",
      position: { x: 0, y: 0 },
      data: {
        label,
        parentId,
        isRoot,
        type,
        status: "none",
        color: NODE_TYPE_CONFIG[type].color,
        collapsed: false,
      },
    });
    return id;
  };

  if (useSyntheticRoot) {
    const rootId = make("중심 주제", null, true);
    stack.push({ level: -1, id: rootId });
  }

  for (const it of items) {
    while (stack.length && stack[stack.length - 1].level >= it.level) {
      stack.pop();
    }
    const parentId = stack.length ? stack[stack.length - 1].id : null;
    const id = make(it.text, parentId, parentId === null);
    stack.push({ level: it.level, id });
  }

  const laid = layoutRightTree(nodes);
  const title = nodes.find((n) => n.data.isRoot)?.data.label || "가져온 아웃라인";
  return { nodes: laid, edges: buildEdgesFromNodes(laid), title };
}
