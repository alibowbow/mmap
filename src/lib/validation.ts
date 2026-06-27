import type { Edge, MindMapDocument, MindMapNode } from "@/types/mindmap";

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
  const edges = (Array.isArray(c.edges) ? c.edges : []) as Edge[];
  const now = new Date().toISOString();

  const doc: MindMapDocument = {
    id: typeof c.id === "string" ? c.id : "",
    title: typeof c.title === "string" ? c.title : "가져온 문서",
    nodes,
    edges,
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
