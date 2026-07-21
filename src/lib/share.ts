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
import type {
  LayoutMode,
  MindMapDocument,
  MindMapNode,
  MindMapNodeData,
} from "@/types/mindmap";

// The fragment key: full URL looks like `https://host/#m=<code>`.
export const SHARE_HASH_KEY = "m";

// Keep copied links below the long-standing ~2 KB interoperability boundary.
// Browsers can usually hold much larger fragments, but chat apps, Markdown
// renderers, and mobile hand-off surfaces may truncate them before the browser
// ever sees the hash.
export const SHARE_URL_WARN_LEN = 1600;
export const SHARE_URL_MAX_LEN = 2000;

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
const LAYOUT_MODES = [
  "right-tree",
  "bidirectional",
  "vertical",
  "radial",
] as const satisfies readonly LayoutMode[];
const VALID_LAYOUT_MODES = new Set<LayoutMode>(LAYOUT_MODES);

const NODE_TYPES = [
  "root",
  "plain",
  "idea",
  "task",
  "note",
  "question",
  "warning",
  "link",
] as const;
const NODE_STATUSES = ["none", "todo", "doing", "done", "blocked"] as const;
const BRANCH_SIDES = ["left", "right"] as const;

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
type LegacySharePayload = {
  v: 1;
  title: string;
  nodes: MindMapNode[];
  edges: MindMapDocument["edges"];
  relations: NonNullable<MindMapDocument["relations"]>;
  layoutMode?: LayoutMode;
};

// v2 keeps the same #m= transport, but replaces repeated JSON keys and UUIDs
// with array slots and node indexes. Edges are derivable from parent indexes,
// so the receiver rebuilds them. This makes ordinary maps substantially more
// portable through chat apps without introducing a backend or short-link page.
type CompactChecklistItem = [text: string, checked: 0 | 1];
type CompactNodeExtras = {
  d?: string; // description
  s?: number; // status index
  c?: number; // color palette index
  i?: string; // icon
  e?: string; // emoji
  b?: number; // branch side index
  g?: string[]; // tags
  h?: string; // safe href
  k?: CompactChecklistItem[];
};
type CompactNode = [
  parentIndex: number,
  x: number,
  y: number,
  label: string,
  typeIndex: number,
  flags: number,
  extras?: CompactNodeExtras,
];
type CompactRelation = [sourceIndex: number, targetIndex: number, label?: string];
type CompactSharePayload = {
  v: 2;
  t: string;
  n: CompactNode[];
  c?: string[];
  r?: CompactRelation[];
  l?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function roundedFinite(value: number): number {
  return Number.isFinite(value) ? Math.round(value) : 0;
}

function compactNodeId(index: number): string {
  return `s${index.toString(36)}`;
}

function encodeCompactPayload(doc: MindMapDocument): CompactSharePayload {
  const nodes = doc.nodes.map(sanitizeNodeForShare);
  const nodeIndexes = new Map(nodes.map((node, index) => [node.id, index]));
  const colors: string[] = [];
  const colorIndexes = new Map<string, number>();

  const internColor = (color: string): number => {
    const known = colorIndexes.get(color);
    if (known !== undefined) return known;
    const index = colors.length;
    colors.push(color);
    colorIndexes.set(color, index);
    return index;
  };

  const compactNodes: CompactNode[] = nodes.map((node) => {
    const { data } = node;
    const parentIndex = data.parentId
      ? nodeIndexes.get(data.parentId) ?? -1
      : -1;
    const rawTypeIndex = NODE_TYPES.indexOf(data.type);
    const typeIndex = rawTypeIndex >= 0 ? rawTypeIndex : 1;
    const flags = (data.collapsed ? 1 : 0) | (data.isRoot ? 2 : 0);
    const extras: CompactNodeExtras = {};

    if (data.description) extras.d = data.description;
    if (data.status && data.status !== "none") {
      const index = NODE_STATUSES.indexOf(data.status);
      if (index >= 0) extras.s = index;
    }
    if (data.color) extras.c = internColor(data.color);
    if (data.icon) extras.i = data.icon;
    if (data.emoji) extras.e = data.emoji;
    if (data.side) {
      const index = BRANCH_SIDES.indexOf(data.side);
      if (index >= 0) extras.b = index;
    }
    if (data.tags?.length) extras.g = [...data.tags];
    if (data.link) extras.h = data.link;
    if (data.checklist?.length) {
      extras.k = data.checklist.map((item) => [
        item.text,
        item.checked ? 1 : 0,
      ]);
    }

    const base: CompactNode = [
      parentIndex,
      roundedFinite(node.position.x),
      roundedFinite(node.position.y),
      data.label,
      typeIndex,
      flags,
    ];
    if (Object.keys(extras).length) base.push(extras);
    return base;
  });

  const compactRelations: CompactRelation[] = [];
  for (const relation of doc.relations ?? []) {
    const source = nodeIndexes.get(relation.source);
    const target = nodeIndexes.get(relation.target);
    if (source === undefined || target === undefined) continue;
    compactRelations.push(
      relation.label
        ? [source, target, relation.label]
        : [source, target]
    );
  }

  const payload: CompactSharePayload = { v: 2, t: doc.title, n: compactNodes };
  if (colors.length) payload.c = colors;
  if (compactRelations.length) payload.r = compactRelations;
  const layoutMode = safeLayoutMode(doc.layoutMode);
  if (layoutMode) payload.l = LAYOUT_MODES.indexOf(layoutMode);
  return payload;
}

function expandCompactPayload(
  raw: Record<string, unknown>
): { document: unknown; layoutMode?: LayoutMode } | null {
  if (raw.v !== 2 || typeof raw.t !== "string" || !Array.isArray(raw.n)) {
    return null;
  }

  let colors: string[] = [];
  if (raw.c !== undefined) {
    if (!Array.isArray(raw.c) || !raw.c.every((v) => typeof v === "string")) {
      return null;
    }
    colors = raw.c as string[];
  }

  let layoutMode: LayoutMode | undefined;
  if (raw.l !== undefined) {
    if (
      typeof raw.l !== "number" ||
      !Number.isInteger(raw.l) ||
      raw.l < 0 ||
      raw.l >= LAYOUT_MODES.length
    ) {
      return null;
    }
    layoutMode = LAYOUT_MODES[raw.l];
  }

  const nodeCount = raw.n.length;
  const nodes: MindMapNode[] = [];
  for (let index = 0; index < nodeCount; index += 1) {
    const tuple = raw.n[index];
    if (!Array.isArray(tuple) || tuple.length < 6) return null;
    const [parent, x, y, label, typeIndex, flags, rawExtras] = tuple;
    if (
      typeof parent !== "number" ||
      !Number.isInteger(parent) ||
      parent < -1 ||
      parent >= nodeCount ||
      parent === index ||
      typeof x !== "number" ||
      !Number.isFinite(x) ||
      typeof y !== "number" ||
      !Number.isFinite(y) ||
      typeof label !== "string" ||
      typeof typeIndex !== "number" ||
      !Number.isInteger(typeIndex) ||
      typeIndex < 0 ||
      typeIndex >= NODE_TYPES.length ||
      typeof flags !== "number" ||
      !Number.isInteger(flags) ||
      flags < 0 ||
      (rawExtras !== undefined && !isRecord(rawExtras))
    ) {
      return null;
    }

    const extras = rawExtras ?? {};
    const data: MindMapNodeData = {
      label,
      type: NODE_TYPES[typeIndex],
    };
    if (parent >= 0) data.parentId = compactNodeId(parent);
    if (flags & 1) data.collapsed = true;
    if (flags & 2) data.isRoot = true;
    if (typeof extras.d === "string") data.description = extras.d;
    if (
      typeof extras.s === "number" &&
      Number.isInteger(extras.s) &&
      extras.s >= 0 &&
      extras.s < NODE_STATUSES.length
    ) {
      data.status = NODE_STATUSES[extras.s];
    }
    if (
      typeof extras.c === "number" &&
      Number.isInteger(extras.c) &&
      extras.c >= 0 &&
      extras.c < colors.length
    ) {
      data.color = colors[extras.c];
    }
    if (typeof extras.i === "string") data.icon = extras.i;
    if (typeof extras.e === "string") data.emoji = extras.e;
    if (
      typeof extras.b === "number" &&
      Number.isInteger(extras.b) &&
      extras.b >= 0 &&
      extras.b < BRANCH_SIDES.length
    ) {
      data.side = BRANCH_SIDES[extras.b];
    }
    if (
      Array.isArray(extras.g) &&
      extras.g.every((v: unknown) => typeof v === "string")
    ) {
      data.tags = extras.g as string[];
    }
    if (typeof extras.h === "string") data.link = extras.h;
    if (
      Array.isArray(extras.k) &&
      extras.k.every(
        (item: unknown) =>
          Array.isArray(item) &&
          item.length >= 2 &&
          typeof item[0] === "string" &&
          (item[1] === 0 || item[1] === 1)
      )
    ) {
      data.checklist = extras.k.map((item: unknown, itemIndex: number) => {
        const tuple = item as CompactChecklistItem;
        return {
          id: `sc${index.toString(36)}-${itemIndex.toString(36)}`,
          text: tuple[0],
          checked: tuple[1] === 1,
        };
      });
    }

    nodes.push({
      id: compactNodeId(index),
      type: "mindmap",
      position: { x: Math.round(x), y: Math.round(y) },
      data,
    });
  }

  const relations: NonNullable<MindMapDocument["relations"]> = [];
  if (raw.r !== undefined) {
    if (!Array.isArray(raw.r)) return null;
    for (let index = 0; index < raw.r.length; index += 1) {
      const tuple = raw.r[index];
      if (!Array.isArray(tuple) || tuple.length < 2) return null;
      const [source, target, label] = tuple;
      if (
        typeof source !== "number" ||
        !Number.isInteger(source) ||
        source < 0 ||
        source >= nodeCount ||
        typeof target !== "number" ||
        !Number.isInteger(target) ||
        target < 0 ||
        target >= nodeCount ||
        (label !== undefined && typeof label !== "string")
      ) {
        return null;
      }
      relations.push({
        id: `sr${index.toString(36)}`,
        source: compactNodeId(source),
        target: compactNodeId(target),
        ...(label ? { label } : {}),
      });
    }
  }

  return {
    document: { title: raw.t, nodes, edges: [], relations },
    layoutMode,
  };
}

// Serialize + compress a document into the URL-fragment code.
export function encodeSharedDocument(doc: MindMapDocument): string {
  const payload = encodeCompactPayload(doc);
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
  const sharedNodes = isRecord(parsed)
    ? parsed.v === 2
      ? parsed.n
      : parsed.nodes
    : undefined;
  if (Array.isArray(sharedNodes) && sharedNodes.length > MAX_SHARED_NODES) {
    return { ok: false, error: "공유된 노드 수가 너무 많습니다." };
  }

  let candidate = parsed;
  let layoutMode: LayoutMode | undefined;
  if (isRecord(parsed) && parsed.v === 2) {
    const expanded = expandCompactPayload(parsed);
    if (!expanded) {
      return { ok: false, error: "공유 데이터 형식이 올바르지 않습니다." };
    }
    candidate = expanded.document;
    layoutMode = expanded.layoutMode;
  } else if (isRecord(parsed)) {
    // Keep every existing v1 link working after the compact codec ships.
    const legacy = parsed as Partial<LegacySharePayload>;
    layoutMode = safeLayoutMode(legacy.layoutMode);
  }

  const result: ImportResult = validateImportedDocument(candidate);
  if (!result.ok) return { ok: false, error: result.error };
  return {
    ok: true,
    document: sanitizeIngestedDocument(result.document),
    layoutMode,
  };
}
