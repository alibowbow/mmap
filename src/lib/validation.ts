import { validateInk, validInkSettings } from "./ink";
import { adaptInput } from "./layout-engine/adapter";
import { buildGraph } from "./layout-engine/graph";
import { drain } from "./layout-engine/types";
import {
  appearanceFrom,
  DEFAULT_APPEARANCE,
  validAppearanceField,
} from "./appearance";
import { DOCUMENT_EXPORT_VERSION, DOCUMENT_FORMAT } from "./export";
import { NODE_STYLE_OPTIONS } from "./constants";
import type {
  Edge,
  LayoutMode,
  MindMapAppearance,
  MindMapDocument,
  MindMapNode,
  MindMapNodeData,
  MindMapRelation,
} from "@/types/mindmap";

const modes: LayoutMode[] = [
  "right-tree",
  "bidirectional",
  "vertical",
  "radial",
];
const types = [
  "root",
  "plain",
  "idea",
  "task",
  "note",
  "question",
  "warning",
  "link",
];
const statuses = ["none", "todo", "doing", "done", "blocked"];
export const MAX_IMPORT_BYTES = 32 * 1024 * 1024;
const LEGACY_IMPORT_BYTES = 10 * 1024 * 1024;
export type ImportResult =
  { ok: true; document: MindMapDocument } | { ok: false; error: string };
const fail = (error: string): ImportResult => ({ ok: false, error });
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const number = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1_000_000;
const dimension = (v: unknown): v is number => number(v) && v > 0;

// Validate before touching the store; import only document fields, not UI flags.
export function validateImportedDocument(raw: unknown): ImportResult {
  let candidate: unknown = raw;
  if (object(raw) && "document" in raw) {
    if (
      raw.format !== undefined &&
      raw.format !== DOCUMENT_FORMAT &&
      raw.format !== "mindbranch-document"
    )
      return fail("MindBranch/MindForge 문서 JSON이 아닙니다.");
    if (
      raw.version !== undefined &&
      (!Number.isInteger(raw.version) || (raw.version as number) < 1)
    )
      return fail("문서 버전 형식이 올바르지 않습니다.");
    if (
      typeof raw.version === "number" &&
      raw.version > DOCUMENT_EXPORT_VERSION
    )
      return fail(
        "이 파일은 버전 " +
          raw.version +
          "입니다. 이 앱은 버전 " +
          DOCUMENT_EXPORT_VERSION +
          "까지 지원합니다. 앱을 업데이트하거나 호환 버전으로 내보내세요.",
      );
    candidate = raw.document;
  }
  if (!object(candidate)) return fail("유효한 문서 객체가 아닙니다.");
  const c = candidate;
  if (
    c.boardMode !== undefined &&
    c.boardMode !== "map" &&
    c.boardMode !== "blank"
  )
    return fail("보드 종류가 올바르지 않습니다.");
  if (!Array.isArray(c.nodes) || (!c.nodes.length && c.boardMode !== "blank"))
    return fail(
      "nodes 배열과 최소 한 개의 노드가 필요합니다. 빈 손그림 보드는 boardMode=blank로 저장하세요.",
    );
  const ink = validateInk(c.ink);
  if (!ink.ok) return fail(ink.error);
  if (c.inkSettings !== undefined && !validInkSettings(c.inkSettings))
    return fail("펜 설정이 올바르지 않습니다.");
  if (c.nodes.length > 20_000)
    return fail("한 문서는 20,000개 이하의 노드를 가져올 수 있습니다.");
  if (c.title !== undefined && typeof c.title !== "string")
    return fail("문서 제목은 문자열이어야 합니다.");
  if (c.layoutMode !== undefined && !modes.includes(c.layoutMode as LayoutMode))
    return fail("문서 배치 모드가 올바르지 않습니다.");
  if (c.appearance !== undefined) {
    if (!object(c.appearance))
      return fail("문서 디자인(appearance) 형식이 올바르지 않습니다.");
    for (const key of Object.keys(
      DEFAULT_APPEARANCE,
    ) as (keyof MindMapAppearance)[]) {
      if (key in c.appearance && !validAppearanceField(key, c.appearance[key]))
        return fail("문서 디자인의 " + key + " 값이 올바르지 않습니다.");
    }
  }
  const nodes: MindMapNode[] = [];
  for (const n of c.nodes) {
    if (
      !object(n) ||
      typeof n.id !== "string" ||
      !n.id.trim() ||
      !object(n.data)
    )
      return fail("노드의 id 또는 data 형식이 올바르지 않습니다.");
    const d = n.data;
    const prefix = "노드 " + n.id + ": ";
    if (typeof d.label !== "string")
      return fail(prefix + "제목(data.label)이 필요합니다.");
    if (!object(n.position) || !number(n.position.x) || !number(n.position.y))
      return fail(prefix + "x, y 좌표는 유효한 숫자여야 합니다.");
    if (
      d.parentId !== undefined &&
      d.parentId !== null &&
      typeof d.parentId !== "string"
    )
      return fail(prefix + "부모 id 형식이 올바르지 않습니다.");
    if (d.type !== undefined && !types.includes(d.type as string))
      return fail(prefix + "알 수 없는 노드 종류입니다.");
    if (d.status !== undefined && !statuses.includes(d.status as string))
      return fail(prefix + "상태 값이 올바르지 않습니다.");
    if (
      d.style !== undefined &&
      !NODE_STYLE_OPTIONS.some((x) => x.id === d.style)
    )
      return fail(prefix + "스타일 값이 올바르지 않습니다.");
    if (
      d.layoutMode !== undefined &&
      !modes.includes(d.layoutMode as LayoutMode)
    )
      return fail(prefix + "가지 배치 모드가 올바르지 않습니다.");
    if (d.side !== undefined && d.side !== "left" && d.side !== "right")
      return fail(prefix + "가지 방향이 올바르지 않습니다.");
    for (const key of ["collapsed", "isRoot"])
      if (d[key] !== undefined && typeof d[key] !== "boolean")
        return fail(prefix + key + " 값은 참/거짓이어야 합니다.");
    for (const key of [
      "description",
      "color",
      "icon",
      "emoji",
      "link",
      "linkedDocId",
      "backDocId",
      "backNodeId",
    ])
      if (d[key] !== undefined && typeof d[key] !== "string")
        return fail(prefix + key + " 값은 문자열이어야 합니다.");
    if (
      d.tags !== undefined &&
      (!Array.isArray(d.tags) || !d.tags.every((x) => typeof x === "string"))
    )
      return fail(prefix + "태그는 문자열 배열이어야 합니다.");
    if (
      d.checklist !== undefined &&
      (!Array.isArray(d.checklist) ||
        !d.checklist.every(
          (x) =>
            object(x) &&
            typeof x.id === "string" &&
            typeof x.text === "string" &&
            typeof x.checked === "boolean",
        ))
    )
      return fail(prefix + "체크리스트 형식이 올바르지 않습니다.");
    if (
      (n.width !== undefined && !dimension(n.width)) ||
      (n.height !== undefined && !dimension(n.height))
    )
      return fail(prefix + "크기는 양수여야 합니다.");
    if (
      n.measured !== undefined &&
      (!object(n.measured) ||
        (n.measured.width !== undefined && !dimension(n.measured.width)) ||
        (n.measured.height !== undefined && !dimension(n.measured.height)))
    )
      return fail(prefix + "측정된 크기가 올바르지 않습니다.");
    const data: MindMapNodeData = {
      label: d.label,
      type: (d.type ??
        (d.isRoot ? "root" : "plain")) as MindMapNodeData["type"],
    };
    for (const key of [
      "description",
      "parentId",
      "collapsed",
      "isRoot",
      "status",
      "color",
      "style",
      "icon",
      "emoji",
      "side",
      "layoutMode",
      "tags",
      "link",
      "checklist",
      "linkedDocId",
      "backDocId",
      "backNodeId",
    ])
      if (d[key] !== undefined) Object.assign(data, { [key]: d[key] });
    if (
      data.link &&
      /^(?:javascript|data|vbscript):/i.test(
        data.link.replace(/[\u0000-\u0020]/g, ""),
      )
    )
      delete data.link;
    nodes.push({
      id: n.id,
      type: "mindmap",
      position: { x: n.position.x, y: n.position.y },
      data,
      ...(n.width !== undefined ? { width: n.width as number } : {}),
      ...(n.height !== undefined ? { height: n.height as number } : {}),
      ...(object(n.measured)
        ? { measured: n.measured as MindMapNode["measured"] }
        : {}),
    });
  }
  if (c.edges !== undefined && !Array.isArray(c.edges))
    return fail("연결선(edges)은 배열이어야 합니다.");
  const edges = (c.edges ?? []) as Edge[];
  if (
    edges.some(
      (e) =>
        !object(e) ||
        typeof e.id !== "string" ||
        typeof e.source !== "string" ||
        typeof e.target !== "string",
    )
  )
    return fail("연결선의 id, source, target 형식이 올바르지 않습니다.");
  if (c.relations !== undefined && !Array.isArray(c.relations))
    return fail("관계선(relations)은 배열이어야 합니다.");
  const ids = new Set(nodes.map((n) => n.id));
  const relations = (c.relations ?? []) as MindMapRelation[];
  if (
    relations.some(
      (r) =>
        !object(r) ||
        typeof r.id !== "string" ||
        !ids.has(r.source) ||
        !ids.has(r.target) ||
        (r.label !== undefined && typeof r.label !== "string"),
    )
  )
    return fail("관계선의 끝점 또는 제목이 올바르지 않습니다.");
  if (
    c.viewport !== undefined &&
    (!object(c.viewport) ||
      !number(c.viewport.x) ||
      !number(c.viewport.y) ||
      !dimension(c.viewport.zoom) ||
      c.viewport.zoom > 100)
  )
    return fail("화면 위치 또는 확대 비율이 올바르지 않습니다.");
  const graph = drain(
    buildGraph(
      adaptInput(nodes, {
        mode: (c.layoutMode as LayoutMode) ?? "right-tree",
        edges,
        relations,
      }),
    ),
  );
  if (nodes.length && graph.diagnostics.length)
    return fail(
      "트리 구조 또는 좌표를 확인하세요. 노드 id는 고유해야 하고 모든 가지는 한 중심 주제에 연결되어야 합니다.",
    );
  const now = new Date().toISOString();
  const doc: MindMapDocument = {
    id: typeof c.id === "string" ? c.id : "",
    title: typeof c.title === "string" ? c.title : "가져온 문서",
    nodes,
    edges,
    relations,
    boardMode: c.boardMode === "blank" ? "blank" : "map",
    ink: ink.ink,
    inkSettings: c.inkSettings as MindMapDocument["inkSettings"],
    appearance: appearanceFrom(c.appearance),
    layoutMode: (c.layoutMode as LayoutMode) ?? "right-tree",
    viewport: c.viewport as MindMapDocument["viewport"],
    pinned: typeof c.pinned === "boolean" ? c.pinned : undefined,
    createdAt: typeof c.createdAt === "string" ? c.createdAt : now,
    updatedAt: now,
  };
  if (c.snapshots !== undefined) {
    if (!Array.isArray(c.snapshots) || c.snapshots.length > 100)
      return fail("버전 기록 형식이 올바르지 않습니다.");
    doc.snapshots = [];
    for (const snap of c.snapshots) {
      if (
        !object(snap) ||
        typeof snap.id !== "string" ||
        typeof snap.label !== "string" ||
        typeof snap.createdAt !== "string"
      )
        return fail("버전 기록 형식이 올바르지 않습니다.");
      const checked = validateImportedDocument({
        boardMode: snap.boardMode ?? c.boardMode,
        ink: snap.ink,
        nodes: snap.nodes,
        edges: snap.edges,
        relations: snap.relations,
        layoutMode: snap.layoutMode,
      });
      if (!checked.ok) return fail("버전 기록: " + checked.error);
      doc.snapshots.push({
        id: snap.id,
        label: snap.label,
        createdAt: snap.createdAt,
        ...(snap.boardMode !== undefined
          ? { boardMode: checked.document.boardMode }
          : {}),
        ...(snap.ink !== undefined ? { ink: checked.document.ink } : {}),
        nodes: checked.document.nodes,
        edges: checked.document.edges,
        relations: checked.document.relations,
        layoutMode: checked.document.layoutMode,
      });
    }
  }
  return { ok: true, document: doc };
}
export function parseImportJson(text: string): ImportResult {
  if (text.length > MAX_IMPORT_BYTES)
    return fail("32MB 이하의 JSON 파일을 사용하세요.");
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > MAX_IMPORT_BYTES)
    return fail("32MB 이하의 JSON 파일을 사용하세요.");
  try {
    const raw: unknown = JSON.parse(
      text.replace(/^\uFEFF/, ""),
      (key, value) => (key === "__proto__" ? undefined : value),
    );
    // Existing node-only imports retain their 10MB bound. The explicit v3
    // ink envelope needs room for up to 250,000 world-space samples.
    const inkEnvelope =
      object(raw) &&
      (raw.version === 3 || raw.version === 4) &&
      raw.format === DOCUMENT_FORMAT &&
      object(raw.document) &&
      object(raw.document.ink) &&
      Array.isArray(raw.document.ink.strokes);
    if (bytes > LEGACY_IMPORT_BYTES && !inkEnvelope)
      return fail(
        "10MB 이하의 JSON 파일을 사용하세요. 손그림 v3/v4 파일은 32MB까지 지원합니다.",
      );
    return validateImportedDocument(raw);
  } catch {
    return fail(
      "JSON을 읽지 못했습니다. 파일이 잘렸거나 문법이 잘못됐는지 확인하세요.",
    );
  }
}
export function summarizeDocument(doc: MindMapDocument) {
  return {
    nodeCount: doc.nodes.length,
    edgeCount: doc.edges.length,
    title: doc.title,
  };
}
