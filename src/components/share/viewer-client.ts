import type { SharedCloudDocument } from "@/lib/cloud/contracts";
import { validateInk } from "@/lib/ink";
import { appearanceFrom } from "@/lib/appearance";
import { NODE_TYPES, NODE_STATUSES } from "@/lib/constants";
import { projectJson, SHARED_DOCUMENT_PROJECTION } from "@/lib/cloud/projection";
import { tokenFromFragment } from "./viewer-model";

export class SharedViewError extends Error {
  constructor(public readonly kind: "not-found" | "unavailable" | "failed") {
    super(kind);
    this.name = "SharedViewError";
  }
}

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const optionalString = (value: unknown) => value === undefined || typeof value === "string";
const optionalBoolean = (value: unknown) => value === undefined || typeof value === "boolean";

// A small wire-contract check keeps a bad or truncated response out of the
// renderer. Full content and graph validation lives on the server boundary.
export function readSharedResponse(value: unknown): SharedCloudDocument {
  if (!object(value) || !object(value.document)) throw new SharedViewError("failed");
  // Apply the same deep allowlist as the public endpoint before retaining any
  // content. Even a bad endpoint response cannot hydrate owner/workspace data.
  const doc = projectJson(value.document, SHARED_DOCUMENT_PROJECTION);
  if (!object(doc)) throw new SharedViewError("failed");
  if (typeof doc.title !== "string" || !Array.isArray(doc.nodes) || !Array.isArray(doc.edges) || doc.nodes.length > 20_000)
    throw new SharedViewError("failed");
  const ids = new Set<string>();
  for (const node of doc.nodes) {
    if (!object(node) || typeof node.id !== "string" || !node.id || ids.has(node.id) || !object(node.position) ||
      !finite(node.position.x) || !finite(node.position.y) || !object(node.data)) throw new SharedViewError("failed");
    ids.add(node.id);
    const data = node.data;
    if (typeof data.label !== "string" || !NODE_TYPES.includes(data.type as never) ||
      ![data.description, data.color, data.style, data.emoji, data.link].every(optionalString) ||
      ![data.collapsed, data.isRoot].every(optionalBoolean) ||
      (data.status !== undefined && !NODE_STATUSES.includes(data.status as never)) ||
      (data.parentId != null && typeof data.parentId !== "string") ||
      (data.tags !== undefined && (!Array.isArray(data.tags) || !data.tags.every((tag) => typeof tag === "string"))) ||
      (data.checklist !== undefined && (!Array.isArray(data.checklist) || !data.checklist.every((item) =>
        object(item) && typeof item.id === "string" && typeof item.text === "string" && typeof item.checked === "boolean"))))
      throw new SharedViewError("failed");
  }
  for (const edge of doc.edges) {
    if (!object(edge) || typeof edge.id !== "string" || typeof edge.source !== "string" || typeof edge.target !== "string")
      throw new SharedViewError("failed");
  }
  if (doc.relations !== undefined && (!Array.isArray(doc.relations) || !doc.relations.every((relation) =>
    object(relation) && typeof relation.id === "string" && typeof relation.source === "string" &&
    typeof relation.target === "string" && optionalString(relation.label)))) throw new SharedViewError("failed");
  const ink = validateInk(doc.ink);
  if (!ink.ok) throw new SharedViewError("failed");
  const viewport = object(doc.viewport) && finite(doc.viewport.x) && finite(doc.viewport.y) &&
    finite(doc.viewport.zoom) && doc.viewport.zoom > 0 && doc.viewport.zoom <= 2.5
    ? { x: doc.viewport.x, y: doc.viewport.y, zoom: doc.viewport.zoom } : undefined;
  // Only display fields can leave this function. Never hydrate a workspace.
  return {
    title: doc.title,
    nodes: doc.nodes as SharedCloudDocument["nodes"],
    edges: doc.edges as SharedCloudDocument["edges"],
    relations: doc.relations as SharedCloudDocument["relations"],
    boardMode: doc.boardMode === "blank" ? "blank" : "map",
    ink: ink.ink,
    appearance: appearanceFrom(doc.appearance),
    layoutMode: ["right-tree", "bidirectional", "vertical", "radial"].includes(doc.layoutMode as string)
      ? doc.layoutMode as SharedCloudDocument["layoutMode"] : undefined,
    viewport,
  };
}

export type SharedLoadState =
  | { status: "loading" }
  | { status: "ready"; document: SharedCloudDocument; revision: number }
  | { status: "not-found" | "unavailable" | "failed" };

// Each viewer mount owns one loader. Reload/fragment rotation invalidates the
// earlier lookup even if a fetch implementation ignores its abort signal.
export function createSharedDocumentLoader(
  onState: (state: SharedLoadState) => void,
  fetchDocument = fetchSharedDocument,
  timeoutMs = 25_000,
) {
  let sequence = 0;
  let disposed = false;
  let pending: { controller: AbortController; timer: ReturnType<typeof setTimeout> } | null = null;
  const cancel = () => {
    if (!pending) return;
    clearTimeout(pending.timer);
    pending.controller.abort();
    pending = null;
  };
  return {
    load(fragment: string) {
      if (disposed) return;
      const current = ++sequence;
      cancel();
      const token = tokenFromFragment(fragment);
      // A new lookup clears the old map immediately, including revoked links.
      onState({ status: token ? "loading" : "not-found" });
      if (!token) return;
      const controller = new AbortController();
      const timer = setTimeout(() => {
        if (disposed || sequence !== current) return;
        controller.abort();
        pending = null;
        onState({ status: "failed" });
      }, timeoutMs);
      pending = { controller, timer };
      void (async () => {
        try {
          const document = await fetchDocument(token, controller.signal);
          if (!disposed && sequence === current && !controller.signal.aborted)
            onState({ status: "ready", document, revision: current });
        } catch (error: unknown) {
          if (!disposed && sequence === current && !controller.signal.aborted)
            onState({ status: error instanceof SharedViewError ? error.kind : "failed" });
        } finally {
          clearTimeout(timer);
          if (sequence === current) pending = null;
        }
      })();
    },
    dispose() {
      disposed = true;
      ++sequence;
      cancel();
    },
  };
}

export async function fetchSharedDocument(token: string, signal?: AbortSignal): Promise<SharedCloudDocument> {
  const response = await fetch("/api/cloud/shared", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    redirect: "error",
    signal,
  });
  if (response.status === 404 || response.status === 410) throw new SharedViewError("not-found");
  if (response.status === 503 || response.status === 429) throw new SharedViewError("unavailable");
  if (!response.ok) throw new SharedViewError("failed");
  return readSharedResponse(await response.json());
}
