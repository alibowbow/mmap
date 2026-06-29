import {
  DEFAULT_LEVEL_FONT_SIZES,
  STORAGE_KEY,
  WORKSPACE_VERSION,
} from "@/lib/constants";
import type { MindMapWorkspace } from "@/types/mindmap";

export type LoadResult =
  | { ok: true; workspace: MindMapWorkspace }
  | { ok: false; empty: true }
  | { ok: false; corrupted: true; raw: string };

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
    const workspace = migrateWorkspace(parsed);
    return { ok: true, workspace };
  } catch {
    return { ok: false, corrupted: true, raw };
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
    nodeTint: parsed.nodeTint ?? false,
    sidebarCollapsed: parsed.sidebarCollapsed ?? false,
    inspectorOpen: parsed.inspectorOpen ?? true,
  };
}

export function saveWorkspaceToStorage(workspace: MindMapWorkspace): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...workspace, version: WORKSPACE_VERSION })
    );
    return true;
  } catch {
    return false;
  }
}

export function clearWorkspaceStorage(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
