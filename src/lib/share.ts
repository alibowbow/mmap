// ── Client-side "share via URL" ──────────────────────────────────────────────
// A document is compressed into the URL *fragment* (#m=…) so a map can be
// shared as a plain link with NO backend. The recipient decodes it and gets a
// private copy added to their own workspace — the link never touches a server.
//
// Security note: a share link is fully attacker-controllable. Everything that
// comes back out of a link is treated as untrusted and re-sanitized on ingest
// (see sanitizeIngestedDocument): cross-document references are dropped,
// transient render flags are stripped, href-bearing fields are limited to safe
// schemes, and layoutMode is allow-listed so a hostile value can't crash the
// layout engine.

import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from "lz-string";

import { validateImportedDocument, type ImportResult } from "@/lib/validation";
import type { LayoutMode, MindMapDocument, MindMapNode } from "@/types/mindmap";

// The fragment key: full URL looks like `https://host/#m=<code>`.
export const SHARE_HASH_KEY = "m";

// Links longer than this still work but get unwieldy — some chat apps truncate
// pasted URLs. We surface a warning past this point and steer to JSON export.
export const SHARE_URL_WARN_LEN = 8000;

// A byte-mode QR (error-correction M) stays comfortably scannable by a phone
// camera below roughly this many characters; past it we hide the QR.
export const SHARE_QR_MAX_LEN = 1000;

// Hard ceilings on ingest so a hostile link can't lock up the tab.
const MAX_ENCODED_CHARS = 500_000; // reject before we even decompress
const MAX_DECODED_CHARS = 5_000_000;
const MAX_SHARED_NODES = 20_000;

// Only these URL schemes may appear in a clickable node link. Everything else
// (notably javascript:, data:, vbscript:) is dropped.
const SAFE_LINK_SCHEMES = new Set(["http:", "https:", "mailto:"]);

// The layout modes the engine actually knows how to run. An unknown value would
// make runLayout call `undefined(nodes)`, so anything off this list is dropped.
const VALID_LAYOUT_MODES = new Set<LayoutMode>([
  "right-tree",
  "bidirectional",
  "vertical",
  "radial",
]);

// Drop any "__proto__" key while parsing. JSON.parse doesn't pollute the
// prototype on its own (it defines an own property), but this removes the odd
// own key entirely so nothing downstream can be surprised by it.
function safeJsonParse(text: string): unknown {
  return JSON.parse(text, (key, value) =>
    key === "__proto__" ? undefined : value
  );
}

// Return the href unchanged if it uses a safe scheme, else undefined. Relative
// URLs (no scheme) are allowed and treated as same-origin links.
export function sanitizeHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  // Browsers strip ASCII tab/LF/CR from anywhere in a URL and drop leading C0
  // controls BEFORE resolving the scheme, so `java\tscript:` collapses to
  // `javascript:` at the click site. Remove all C0 control chars first so the
  // scheme check sees the same string the browser will — otherwise a control
  // char smuggled inside the scheme slips past the allowlist.
  const cleaned = Array.from(href)
    .filter((ch) => ch.charCodeAt(0) > 0x1f)
    .join("");
  const trimmed = cleaned.trim();
  if (!trimmed) return undefined;
  // A leading scheme like `javascript:` — reject unless explicitly allowed.
  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(trimmed);
  if (schemeMatch) {
    return SAFE_LINK_SCHEMES.has(schemeMatch[1].toLowerCase() + ":")
      ? trimmed
      : undefined;
  }
  // No scheme → relative/anchor/protocol-relative. Block protocol-relative
  // (`//evil`) defensively; allow ordinary relative paths.
  if (trimmed.startsWith("//")) return undefined;
  return trimmed;
}

// Coerce an untrusted value to a known LayoutMode, or undefined.
function safeLayoutMode(value: unknown): LayoutMode | undefined {
  return typeof value === "string" && VALID_LAYOUT_MODES.has(value as LayoutMode)
    ? (value as LayoutMode)
    : undefined;
}

// Reduce a node to the fields that are safe and meaningful to share. Drops
// React Flow selection state, transient render-only flags, and cross-document
// portal links (which would dangle for a recipient who lacks those maps).
function sanitizeNodeForShare(n: MindMapNode): MindMapNode {
  const {
    // Cross-doc links — meaningless (and confusing) in someone else's workspace.
    linkedDocId: _linkedDocId,
    backDocId: _backDocId,
    backNodeId: _backNodeId,
    // Transient render-time flags injected by the canvas.
    _depth,
    _dimmed,
    _autoColor,
    searchMatch: _searchMatch,
    hidden: _hidden,
    link,
    ...restData
  } = n.data;
  void _linkedDocId;
  void _backDocId;
  void _backNodeId;
  void _depth;
  void _dimmed;
  void _autoColor;
  void _searchMatch;
  void _hidden;
  const safeLink = sanitizeHref(link);
  return {
    id: n.id,
    type: n.type,
    position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
    data: { ...restData, ...(safeLink ? { link: safeLink } : {}) },
    // Intentionally omit `selected`, width/height, and other RF runtime props.
  } as MindMapNode;
}

// Shape written into the URL. Deliberately minimal: no ids/timestamps/viewport/
// snapshots — the recipient gets a fresh document id and their own history.
type SharePayload = {
  v: 1;
  title: string;
  nodes: MindMapNode[];
  edges: MindMapDocument["edges"];
  relations: NonNullable<MindMapDocument["relations"]>;
  layoutMode?: LayoutMode;
};

// Serialize + compress a document into the URL-fragment code.
export function encodeSharedDocument(doc: MindMapDocument): string {
  const payload: SharePayload = {
    v: 1,
    title: doc.title,
    nodes: doc.nodes.map(sanitizeNodeForShare),
    edges: doc.edges,
    relations: doc.relations ?? [],
    layoutMode: safeLayoutMode(doc.layoutMode),
  };
  return compressToEncodedURIComponent(JSON.stringify(payload));
}

// Build the full shareable URL for the current page.
export function buildShareUrl(doc: MindMapDocument): string {
  const code = encodeSharedDocument(doc);
  if (typeof window === "undefined") return `#${SHARE_HASH_KEY}=${code}`;
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#${SHARE_HASH_KEY}=${code}`;
}

// Pull the share code out of a location hash (`#m=…`), or null if absent.
export function readShareCodeFromHash(hash: string): string | null {
  if (!hash) return null;
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  // The fragment may carry other params; find m=… among &-separated pairs.
  for (const part of raw.split("&")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq) === SHARE_HASH_KEY) {
      return part.slice(eq + 1) || null;
    }
  }
  return null;
}

// Re-sanitize a validated document coming from an untrusted link: strip
// cross-doc links and transient flags, and clamp hrefs to safe schemes. This
// runs even though encodeSharedDocument already sanitizes, because the code in
// a link is attacker-controlled and may not have gone through our encoder.
function sanitizeIngestedDocument(doc: MindMapDocument): MindMapDocument {
  return { ...doc, nodes: doc.nodes.map(sanitizeNodeForShare) };
}

export type ShareDecodeResult =
  | { ok: true; document: MindMapDocument; layoutMode?: LayoutMode }
  | { ok: false; error: string };

// Decode → validate → sanitize a share code into a document ready to add.
export function decodeSharedDocument(code: string): ShareDecodeResult {
  if (!code || code.length > MAX_ENCODED_CHARS) {
    return { ok: false, error: "링크가 올바르지 않거나 너무 깁니다." };
  }
  let json: string | null;
  try {
    json = decompressFromEncodedURIComponent(code);
  } catch {
    json = null;
  }
  if (!json) return { ok: false, error: "링크를 해독할 수 없습니다." };
  if (json.length > MAX_DECODED_CHARS) {
    return { ok: false, error: "공유 데이터가 너무 큽니다." };
  }
  let parsed: unknown;
  try {
    parsed = safeJsonParse(json);
  } catch {
    return { ok: false, error: "공유 데이터 형식이 올바르지 않습니다." };
  }
  if (
    parsed &&
    typeof parsed === "object" &&
    Array.isArray((parsed as { nodes?: unknown[] }).nodes) &&
    (parsed as { nodes: unknown[] }).nodes.length > MAX_SHARED_NODES
  ) {
    return { ok: false, error: "공유된 노드 수가 너무 많습니다." };
  }
  const result: ImportResult = validateImportedDocument(parsed);
  if (!result.ok) return { ok: false, error: result.error };
  // layoutMode is attacker-controlled and never checked by validateImportedDocument,
  // so allow-list it here before it can reach the layout engine.
  const layoutMode = safeLayoutMode(
    (parsed as { layoutMode?: unknown }).layoutMode
  );
  return {
    ok: true,
    document: sanitizeIngestedDocument(result.document),
    layoutMode,
  };
}
