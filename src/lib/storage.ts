import {
  DEFAULT_ACCENT,
  DEFAULT_CANVAS_BG,
  DEFAULT_EDGE_LINE,
  DEFAULT_LEVEL_FONT_SIZES,
  STORAGE_KEY,
  WORKSPACE_VERSION,
} from "@/lib/constants";
import type { MindMapWorkspace } from "@/types/mindmap";
import { appearanceFrom } from "./appearance";

// A failed durable write still survives an in-tab account/workspace switch.
// This memory cache is scoped by the same owner key and is never a cross-tab
// synchronization source; reload protection must still warn about failed saves.
const volatileWorkspaces = new Map<string, string>();
const lastKnownWorkspaces = new Map<string, string>();

// Cloud caches never share a key with the original, logged-out workspace.
export function workspaceStorageKey(ownerId: string | null = null): string {
  return ownerId ? `${STORAGE_KEY}:cloud:${encodeURIComponent(ownerId)}` : STORAGE_KEY;
}

export type LoadResult =
  | { ok: true; workspace: MindMapWorkspace; droppedDocs: number; volatile?: boolean }
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
export function loadWorkspaceFromStorage(ownerId: string | null = null): LoadResult {
  if (typeof window === "undefined") return { ok: false, empty: true };
  const key = workspaceStorageKey(ownerId);
  let raw: string | null = volatileWorkspaces.get(key) ?? null;
  let volatile = raw !== null;
  if (!volatile) {
    try { raw = window.localStorage.getItem(key); }
    catch { raw = lastKnownWorkspaces.get(key) ?? null; volatile = raw !== null; }
  }
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
    lastKnownWorkspaces.set(key, raw);
    return { ok: true, workspace, droppedDocs, ...(volatile ? { volatile: true } : {}) };
  } catch {
    return { ok: false, corrupted: true, raw };
  }
}

// Preserve an unparseable blob so a bad write never destroys recoverable data.
export function backupCorruptData(raw: string, ownerId: string | null = null): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${workspaceStorageKey(ownerId)}-corrupt-backup`, raw);
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
    documents: (parsed.documents ?? []).map(doc => ({
      ...doc, appearance: appearanceFrom(doc.appearance ?? parsed),
    })),
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
  workspace: MindMapWorkspace,
  ownerId: string | null = null,
): SaveResult {
  if (typeof window === "undefined") return { ok: false, quota: false };
  const key = workspaceStorageKey(ownerId);
  try {
    const raw = JSON.stringify({ ...workspace, version: WORKSPACE_VERSION });
    volatileWorkspaces.set(key, raw);
    lastKnownWorkspaces.set(key, raw);
    window.localStorage.setItem(key, raw);
    volatileWorkspaces.delete(key);
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

export function clearWorkspaceStorage(ownerId: string | null = null): void {
  if (typeof window === "undefined") return;
  volatileWorkspaces.delete(workspaceStorageKey(ownerId));
  lastKnownWorkspaces.delete(workspaceStorageKey(ownerId));
  window.localStorage.removeItem(workspaceStorageKey(ownerId));
}
