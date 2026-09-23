import { adaptInput } from "./layout-engine/adapter";
import { buildGraph } from "./layout-engine/graph";
import { drain } from "./layout-engine/types";
import type { LayoutMode } from "@/types/mindmap";
const modes: LayoutMode[] = ["right-tree", "bidirectional", "vertical", "radial"];
import type {
  Edge,
  MindMapDocument,
  MindMapNode,
  MindMapRelation,
} from "@/types/mindmap";

export type ImportResult =
  | { ok: true; document: MindMapDocument }
  | { ok: false; error: string };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

// Validate a parsed object into a MindMapDocument. Accepts both the wrapped
// export format ({ document: ... }) and a bare document object.
export function validateImportedDocument(raw: unknown): ImportResult {
  let candidate: unknown = raw;
  if (isObject(raw) && "document" in raw) {
    candidate = (raw as Record<string, unknown>).document;
  }
  if (!isObject(candidate)) {
    return { ok: false, error: "유효한 문서 객체가 아닙니다." };
  }
  const c = candidate as Record<string, unknown>;
  if (!Array.isArray(c.nodes)) {
    return { ok: false, error: "nodes 배열이 없습니다." };
  }
  // Validate nodes minimally.
  for (const n of c.nodes as unknown[]) {
    if (!isObject(n) || typeof (n as any).id !== "string") {
      return { ok: false, error: "노드 형식이 올바르지 않습니다." };
    }
    if (!isObject((n as any).data) || typeof (n as any).data.label !== "string") {
      return { ok: false, error: "노드 data.label 이 필요합니다." };
    }
    if (!isObject((n as any).position)) {
      return { ok: false, error: "노드 position 이 필요합니다." };
    }
  }

  const nodes = c.nodes as MindMapNode[];
  for (const n of nodes) if (n.data.layoutMode && !modes.includes(n.data.layoutMode)) return { ok: false, error: "유효하지 않은 가지 배치 모드입니다." };
  const edges = (Array.isArray(c.edges) ? c.edges : []) as Edge[];
  if (edges.some(e => !isObject(e) || typeof e.id !== "string" || typeof e.source !== "string" || typeof e.target !== "string")) return { ok: false, error: "연결선 형식이 올바르지 않습니다." };
  const nodeIds = new Set(nodes.map((n) => n.id));
  const relations = (Array.isArray(c.relations) ? c.relations : []).filter(
    (r): r is MindMapRelation =>
      isObject(r) &&
      typeof (r as any).id === "string" &&
      nodeIds.has((r as any).source) &&
      nodeIds.has((r as any).target)
  );
  const graph = drain(buildGraph(adaptInput(nodes, { mode: "right-tree", edges, relations })));
  if (graph.diagnostics.length) return { ok: false, error: `트리 구조 또는 좌표 오류: ${graph.diagnostics[0].message}` };
  const now = new Date().toISOString();

  const doc: MindMapDocument = {
    id: typeof c.id === "string" ? c.id : "",
    title: typeof c.title === "string" ? c.title : "가져온 문서",
    nodes,
    edges,
    relations,
    layoutMode: modes.includes(c.layoutMode as LayoutMode) ? c.layoutMode as LayoutMode : undefined,
    viewport: isObject(c.viewport)
      ? (c.viewport as MindMapDocument["viewport"])
      : undefined,
    createdAt: typeof c.createdAt === "string" ? c.createdAt : now,
    updatedAt: now,
  };
  return { ok: true, document: doc };
}

export function parseImportJson(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "JSON 파싱에 실패했습니다." };
  }
  return validateImportedDocument(parsed);
}

// Summary used in the import preview UI.
export function summarizeDocument(doc: MindMapDocument): {
  nodeCount: number;
  edgeCount: number;
  title: string;
} {
  return {
    nodeCount: doc.nodes.length,
    edgeCount: doc.edges.length,
    title: doc.title,
  };
}
