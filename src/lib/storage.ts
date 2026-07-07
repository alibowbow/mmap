import {
  DEFAULT_ACCENT,
  DEFAULT_CANVAS_BG,
  DEFAULT_EDGE_LINE,
  DEFAULT_LEVEL_FONT_SIZES,
  STORAGE_KEY,
  WORKSPACE_VERSION,
} from "@/lib/constants";
import type { MindMapWorkspace } from "@/types/mindmap";

const BACKUP_KEY = `${STORAGE_KEY}-corrupt-backup`;

export type LoadResult =
  | { ok: true; workspace: MindMapWorkspace; droppedDocs: number }
  | { ok: false; empty: true }
  | { ok: false; corrupted: true; raw: string };

// A document is usable only if it has an id and node/edge arrays. One broken
// doc must never brick the whole workspace, so we drop just the bad ones.
function isUsableDoc(d: unknown): boolean {
  if (!d || typeof d !== "object") return false;
  const doc = d as Record<string, unknown>;
  return (
    typeof doc.id === "string" &&
    Array.isArray(doc.nodes) &&
    Array.isArray(doc.edges)
  );
}

// Read + migrate the workspace from localStorage.
export function loadWorkspaceFromStorage(): LoadResult {
  if (typeof window === "undefined") return { ok: false, empty: true };
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return { ok: false, empty: true };
  try {
    const parsed = JSON.parse(raw) as Partial<MindMapWorkspace>;
    if (!parsed || !Array.isArray(parsed.documents)) {
      return { ok: false, corrupted: true, raw };
    }
    // Keep the good documents, drop the malformed ones (degrade gracefully).
    const all = parsed.documents as unknown[];
    const good = all.filter(isUsableDoc) as MindMapWorkspace["documents"];
    const droppedDocs = all.length - good.length;
    const workspace = migrateWorkspace({ ...parsed, documents: good });
    return { ok: true, workspace, droppedDocs };
  } catch {
    return { ok: false, corrupted: true, raw };
  }
}

// Preserve an unparseable blob so a bad write never destroys recoverable data.
export function backupCorruptData(raw: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BACKUP_KEY, raw);
  } catch {
    /* backup is best-effort */
  }
}

// Forward-compatible migration. Bump WORKSPACE_VERSION and branch here when
// the schema changes.
function migrateWorkspace(
  parsed: Partial<MindMapWorkspace>
): MindMapWorkspace {
  return {
    version: WORKSPACE_VERSION,
    documents: parsed.documents ?? [],
    activeDocumentId:
      parsed.activeDocumentId ?? parsed.documents?.[0]?.id ?? null,
    theme: parsed.theme ?? "system",
    font: parsed.font ?? "inter",
    nodeStyle: parsed.nodeStyle ?? "card",
    levelFontSizes:
      Array.isArray(parsed.levelFontSizes) && parsed.levelFontSizes.length
        ? parsed.levelFontSizes
        : [...DEFAULT_LEVEL_FONT_SIZES],
    edgeStyle: parsed.edgeStyle ?? "curved",
    edgeAnimated: parsed.edgeAnimated ?? false,
    edgeWidth: parsed.edgeWidth ?? 2,
    edgeColorMode: parsed.edgeColorMode ?? "default",
    edgeLine: parsed.edgeLine ?? DEFAULT_EDGE_LINE,
    nodeTint: parsed.nodeTint ?? false,
    canvasBg: parsed.canvasBg ?? DEFAULT_CANVAS_BG,
    accent: parsed.accent ?? DEFAULT_ACCENT,
    rainbowBranches: parsed.rainbowBranches ?? false,
    sidebarCollapsed: parsed.sidebarCollapsed ?? false,
    inspectorOpen: parsed.inspectorOpen ?? true,
  };
}

export type SaveResult = { ok: true } | { ok: false; quota: boolean };

export function saveWorkspaceToStorage(
  workspace: MindMapWorkspace
): SaveResult {
  if (typeof window === "undefined") return { ok: false, quota: false };
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...workspace, version: WORKSPACE_VERSION })
    );
    return { ok: true };
  } catch (e) {
    const quota =
      e instanceof DOMException &&
      (e.name === "QuotaExceededError" ||
        e.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
        e.code === 22);
    return { ok: false, quota };
  }
}

export function clearWorkspaceStorage(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
