"use client";

import {
  DEFAULT_INK_SETTINGS,
  EMPTY_INK,
  inkBounds,
  validateInk,
  validInkSettings,
  validPaper,
  inkItems,
  inkVersion,
  isStroke,
  type InkItem,
  DEFAULT_PAPER,
  MAX_INK_POINTS,
  MAX_INK_STROKES,
} from "@/lib/ink";
import {
  applyEdgeChanges,
  applyNodeChanges,
  type EdgeChange,
  type NodeChange,
  type ReactFlowInstance,
} from "@xyflow/react";
import { create } from "zustand";

import { COMMANDS, type CommandId } from "@/lib/commands";
import {
  DEFAULT_ACCENT,
  DEFAULT_LAYOUT_MODE,
  DEFAULT_CANVAS_BG,
  DEFAULT_EDGE_LINE,
  DEFAULT_FONT,
  DEFAULT_LEVEL_FONT_SIZES,
  DEFAULT_NODE_LABEL,
  DEFAULT_NODE_STYLE,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  NODE_HEIGHT,
  NODE_TYPE_CONFIG,
  NODE_WIDTH,
  THEME_PRESETS,
} from "@/lib/constants";
import {
  exportDocumentJson,
  exportMarkdown,
  exportOutlineText,
  safeFileName,
} from "@/lib/export";
import { renderCanvasImage } from "@/lib/image";
import { parseOutlineToTree } from "@/lib/outlineImport";
import { createId } from "@/lib/id";
import { runLayout } from "@/lib/layout";
import { LayoutRuntime, type LayoutRequest } from "@/lib/layoutRuntime";
import { nodeRect, nodeSize } from "@/lib/layout-engine/adapter";
import { union, boundsOf } from "@/lib/layout-engine/geometry";
import type {
  EdgeRoute,
  EnginePort,
  LayoutResult,
  RequestStamp,
} from "@/lib/layout-engine/types";
import { EMPTY_STAMP } from "@/lib/layout-engine/adapter";
import {
  backupCorruptData,
  loadWorkspaceFromStorage,
  saveWorkspaceToStorage,
} from "@/lib/storage";
import { buildTemplate, templateTitle } from "@/lib/templates";
import {
  buildEdgesFromNodes,
  getChildrenMap,
  getDescendantIds,
  getHiddenNodeIds,
  getNodeMap,
  getRootNode,
  getSubtreeIds,
  getVisibleDfsOrder,
} from "@/lib/tree";
import { decodeSharedDocument } from "@/lib/share";
import { parseImportJson } from "@/lib/validation";
import { appearanceFrom, preserveDocumentDesign } from "@/lib/appearance";
import { ensureDocumentFont } from "@/lib/fonts";
import type {
  InkData,
  InkStroke,
  InkSettings,
  InkTool,
  InkObject,
  PaperSpec,
  BranchSide,
  Edge,
  LayoutMode,
  MindMapDocument,
  MindMapAppearance,
  MindMapNode,
  MindMapNodeData,
  MindMapRelation,
  MindMapSnapshot,
  MindMapTheme,
  SaveStatus,
  TemplateType,
} from "@/types/mindmap";

export type ToastType = "success" | "error" | "info";
export type ToastAction = { label: string; onClick: () => void };
export type Toast = {
  id: string;
  message: string;
  type: ToastType;
  action?: ToastAction; // e.g. "되돌리기" right after a destructive change
};
export type DialogType =
  | "template"
  | "export"
  | "import"
  | "shortcuts"
  | "snapshots"
  | "stats"
  | "share"
  | null;
export type ContextMenuState = { nodeId: string; x: number; y: number } | null;

const HISTORY_LIMIT = 60;

// Throttle repeated save-failure toasts (autosave fires often).
let lastSaveErrorAt = 0;

// Runtime is initialized after the store; all user actions own transactions here.
let layoutRuntime: LayoutRuntime;

export type HistoryEntry = {
  ink?: InkData;
  boardMode?: "map" | "blank";
  layoutMode?: LayoutMode;
  nodes: MindMapNode[];
  edges: Edge[];
  relations: MindMapRelation[];
};

export type MindMapState = {
  layoutRoutes: Record<string, EdgeRoute>;
  layoutResult: LayoutResult | null;
  layoutStamp: RequestStamp;
  layoutBusy: boolean;
  requestLayout: (request?: LayoutRequest) => void;
  settleLayout: () => Promise<void>;
  beginNodeDrag: (ids: string[]) => void;
  endNodeDrag: () => void;
  noteCameraIntent: () => void;
  updateLayoutMeasurements: (
    ports: ReadonlyMap<string, readonly EnginePort[]>,
    labels?: ReadonlyMap<string, { width: number; height: number }>,
  ) => void;
  // ── Data ──
  documents: MindMapDocument[];
  activeDocumentId: string | null;
  nodes: MindMapNode[];
  edges: Edge[];
  relations: MindMapRelation[];

  ink: InkData;
  boardMode: "map" | "blank";
  inkTool: InkTool;
  inkSettings: InkSettings;
  inkGestureActive: boolean;
  selectedInkId: string | null;
  selectedInkIds: string[];
  selectInk: (id: string | null) => void;
  selectInkItems: (ids: string[]) => void;
  replaceInkItems: (items: InkItem[]) => boolean;
  addInkObject: (item: InkObject) => void;
  updateInkItem: (
    id: string,
    patch: Partial<InkObject> | Partial<InkStroke>,
  ) => void;
  reorderInk: (id: string, front: boolean) => void;
  setInkPaper: (paper: PaperSpec) => void;
  setInkTool: (tool: InkTool) => void;
  setInkSettings: (patch: Partial<InkSettings>) => void;
  createInkBoard: () => void;
  addInkStroke: (stroke: InkStroke) => void;
  eraseInkStrokes: (ids: string[]) => void;
  clearInk: () => void;

  // ── Selection / editing ──
  selectedNodeId: string | null; // primary selection (inspector / single-node UI)
  selectedNodeIds: string[]; // full multi-selection set
  editingNodeId: string | null;
  editSeed: string | null; // initial text for type-to-edit (typed char seeds it)
  dropTargetId: string | null; // armed re-parent target: releasing re-parents
  dropPendingId: string | null; // hovered, still dwelling before it arms
  selectedRelationId: string | null; // selected free-form relation edge
  connectMode: boolean; // when on, node handles become connectable
  clipboard: MindMapNode[] | null; // copied subtree (first entry = sub-root)

  // ── Search ──
  searchQuery: string;
  searchTypes: string[];
  searchStatuses: string[];
  searchOpen: boolean;

  // ── UI ──
  commandPaletteOpen: boolean;
  inspectorOpen: boolean;
  sidebarCollapsed: boolean;
  theme: MindMapTheme;
  font: string;
  nodeStyle: string;
  levelFontSizes: number[];
  edgeStyle: string;
  edgeAnimated: boolean;
  edgeWidth: number;
  edgeColorMode: string;
  edgeLine: string;
  nodeTint: boolean;
  canvasBg: string;
  accent: string;
  rainbowBranches: boolean;
  dialog: DialogType;
  importTab: "json" | "outline";
  contextMenu: ContextMenuState;
  outlineOpen: boolean;
  // mobile
  mobileDrawerOpen: boolean;
  mobileMoreOpen: boolean;
  mobileSheetOpen: boolean;

  // ── History ──
  history: HistoryEntry[];
  future: HistoryEntry[];

  // ── Persistence ──
  workspaceOwnerId: string | null;
  switchWorkspaceOwner: (ownerId: string | null) => void;
  openCloudDocument: (ownerId: string, document: MindMapDocument) => void;
  saveStatus: SaveStatus;
  lastSavedAt: string | null;
  revision: number;
  hydrated: boolean;

  // ── Tutorial ──
  tutorialStep: number | null; // null = off
  startTutorial: () => void;
  setTutorialStep: (step: number) => void;
  endTutorial: () => void;

  // ── Modes ──
  presentationMode: boolean;
  presentationIndex: number; // current step in the visible DFS order
  presentationReveal: boolean; // step-reveal: only show nodes up to the step
  setPresentationReveal: (on: boolean) => void;
  activeLayoutMode: LayoutMode;

  // ── Flow api ──
  flow: ReactFlowInstance | null;
  registerFlow: (instance: ReactFlowInstance | null) => void;

  // ── Toasts ──
  toasts: Toast[];
  addToast: (message: string, type?: ToastType, action?: ToastAction) => void;
  dismissToast: (id: string) => void;

  // ── Document actions ──
  // The document just created with createDocument, until it is first edited.
  freshDocumentId: string | null;
  createDocument: (templateType?: TemplateType) => void;
  // Drop the fresh document if it was never edited (see createDocument).
  discardFreshDocument: () => void;
  duplicateDocument: (documentId: string) => void;
  deleteDocument: (documentId: string) => void;
  renameDocument: (documentId: string, title: string) => void;
  toggleDocumentPin: (documentId: string) => void;
  setActiveDocument: (documentId: string) => void;
  loadWorkspace: () => void;
  saveWorkspace: () => void;

  // ── Node actions ──
  addChildNode: (parentId: string) => string | null;
  addSiblingNode: (nodeId: string) => string | null;
  updateNodeLabel: (nodeId: string, label: string) => void;
  updateNodeData: (nodeId: string, partial: Partial<MindMapNodeData>) => void;
  deleteNode: (nodeId: string) => void;
  duplicateSubtree: (nodeId: string) => void;
  deleteSubtree: (nodeId: string) => void;
  copySubtree: (nodeId: string) => void;
  pasteSubtree: (targetId: string) => void;
  promoteNodeToMap: (nodeId: string) => void;
  openLinkedDoc: (docId: string, nodeId?: string) => void;
  toggleCollapse: (nodeId: string) => void;
  setNodeSide: (nodeId: string, side: BranchSide | undefined) => void;
  selectNode: (nodeId: string | null) => void;
  toggleNodeSelection: (nodeId: string) => void;
  setSelection: (ids: string[]) => void;
  setEditingNode: (nodeId: string | null, seed?: string) => void;
  moveNodesBy: (ids: string[], dx: number, dy: number) => void;
  bulkUpdateData: (ids: string[], partial: Partial<MindMapNodeData>) => void;
  bulkDelete: (ids: string[]) => void;
  setDropTargetId: (id: string | null) => void;
  setDropPendingId: (id: string | null) => void;
  reparentNode: (nodeId: string, newParentId: string) => void;

  // ── Focus mode (isolate one branch) ──
  focusModeNodeId: string | null;
  enterFocusMode: (nodeId: string) => void;
  exitFocusMode: () => void;

  // ── Snapshots (local version history) ──
  saveSnapshot: () => void;
  restoreSnapshot: (snapshotId: string) => void;
  deleteSnapshot: (snapshotId: string) => void;

  // ── Relations (free-form cross links) ──
  setConnectMode: (on: boolean) => void;
  addRelation: (source: string, target: string) => void;
  removeRelation: (id: string) => void;
  updateRelationLabel: (id: string, label: string) => void;
  selectRelation: (id: string | null) => void;

  // ── Canvas actions ──
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  setNodes: (nodes: MindMapNode[]) => void;
  setEdges: (edges: Edge[]) => void;
  updateViewport: (viewport: { x: number; y: number; zoom: number }) => void;
  autoLayout: (mode?: LayoutMode) => void;
  autoLayoutSubtree: (nodeId: string, mode?: LayoutMode) => void;
  fitToView: () => void;
  focusNode: (nodeId: string) => void;

  // ── Search / command ──
  setSearchQuery: (query: string) => void;
  toggleSearchType: (type: string) => void;
  toggleSearchStatus: (status: string) => void;
  setSearchOpen: (open: boolean) => void;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  executeCommand: (commandId: CommandId) => void;

  // ── History ──
  undo: () => void;
  redo: () => void;
  pushHistory: () => void;

  // ── IO ──
  exportJson: () => string;
  importJson: (json: string) => boolean;
  importSharedDocument: (code: string) => boolean;
  importOutline: (text: string) => boolean;
  exportMarkdown: () => string;
  exportOutlineText: () => string;
  renderImage: (format: "png" | "svg") => Promise<string>;
  exportImage: (format: "png" | "svg") => Promise<void>;

  // ── UI actions ──
  toggleTheme: () => void;
  setTheme: (theme: MindMapTheme) => void;
  setFont: (font: string) => void;
  setNodeStyle: (style: string) => void;
  setEdgeStyle: (style: string) => void;
  setEdgeAnimated: (on: boolean) => void;
  setEdgeWidth: (w: number) => void;
  setEdgeColorMode: (mode: string) => void;
  setEdgeLine: (line: string) => void;
  applyThemePreset: (presetId: string) => void;
  setNodeTint: (on: boolean) => void;
  setCanvasBg: (bg: string) => void;
  setAccent: (accent: string) => void;
  setRainbowBranches: (on: boolean) => void;
  setLevelFontSize: (level: number, size: number) => void;
  resetLevelFontSizes: () => void;
  toggleSidebar: () => void;
  toggleInspector: () => void;
  setInspectorOpen: (open: boolean) => void;
  setDialog: (dialog: DialogType) => void;
  setImportTab: (tab: "json" | "outline") => void;
  openContextMenu: (nodeId: string, x: number, y: number) => void;
  closeContextMenu: () => void;
  setOutlineOpen: (open: boolean) => void;
  setMobileDrawerOpen: (open: boolean) => void;
  setMobileMoreOpen: (open: boolean) => void;
  setMobileSheetOpen: (open: boolean) => void;
  openPresentationMode: () => void;
  closePresentationMode: () => void;
  presentationNext: () => void;
  presentationPrev: () => void;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function nowIso() {
  return new Date().toISOString();
}

// Keep the primary id and the multi-selection set in sync for single selects.
function selectionFor(id: string | null) {
  return { selectedNodeId: id, selectedNodeIds: id ? [id] : [] };
}

// Swap the workspace accent by flipping the data attribute globals.css keys on.
function applyAccentAttr(accent: string) {
  if (typeof document === "undefined") return;
  if (accent && accent !== DEFAULT_ACCENT) {
    document.documentElement.dataset.accent = accent;
  } else {
    delete document.documentElement.dataset.accent;
  }
}

function applyThemeClass(theme: MindMapTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const dark = theme === "dark" || (theme === "system" && prefersDark);
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
}

function activateAppearance(
  doc: MindMapDocument,
  fallback: unknown,
): MindMapAppearance {
  const appearance = appearanceFrom(doc.appearance ?? fallback);
  applyThemeClass(appearance.theme);
  applyAccentAttr(appearance.accent);
  return appearance;
}

function makeDocument(
  title: string,
  nodes: MindMapNode[],
  edges: Edge[],
): MindMapDocument {
  const ts = nowIso();
  return {
    id: createId("doc"),
    title,
    nodes,
    edges,
    layoutMode: DEFAULT_LAYOUT_MODE,
    createdAt: ts,
    updatedAt: ts,
  };
}

function blankRootDocument(title = "새 마인드맵"): MindMapDocument {
  const { nodes, edges } = buildTemplate("blank");
  return makeDocument(title, nodes, edges);
}

function sampleDocument(): MindMapDocument {
  const { nodes, edges } = buildTemplate("project-plan");
  return makeDocument("MindBranch 시작하기", nodes, edges);
}

// Deep-clone a node with fresh checklist ids preserved (ids kept stable).
function cloneNode(n: MindMapNode): MindMapNode {
  return {
    ...n,
    data: {
      ...n.data,
      tags: n.data.tags ? [...n.data.tags] : undefined,
      checklist: n.data.checklist
        ? n.data.checklist.map((c) => ({ ...c }))
        : undefined,
    },
    position: { ...n.position },
  };
}

function reconcileEdges(nodes: MindMapNode[], edges: Edge[]): Edge[] {
  const old = new Map(edges.map((e) => [`${e.source}\0${e.target}`, e]));
  return buildEdgesFromNodes(nodes).map(
    (e) => old.get(`${e.source}\0${e.target}`) ?? e,
  );
}

let imageQueue: Promise<unknown> = Promise.resolve();

export const useMindMapStore = create<MindMapState>((set, get) => {
  function setAppearance(patch: Partial<MindMapAppearance>) {
    const state = get();
    if (
      Object.entries(patch).every(
        ([key, value]) =>
          JSON.stringify(state[key as keyof MindMapAppearance]) ===
          JSON.stringify(value),
      )
    )
      return;
    const appearance = appearanceFrom({ ...state, ...patch });
    set({
      ...patch,
      documents: preserveDocumentDesign(state.documents, state).map((doc) =>
        doc.id === state.activeDocumentId
          ? { ...doc, appearance, updatedAt: nowIso() }
          : doc,
      ),
      saveStatus: "idle",
      revision: state.revision + 1,
    });
  }
  function inkFor(doc: MindMapDocument) {
    return {
      ink: doc.ink ?? EMPTY_INK,
      boardMode: doc.boardMode ?? ("map" as "map" | "blank"),
      inkSettings: doc.inkSettings ?? DEFAULT_INK_SETTINGS,
      inkTool:
        doc.boardMode === "blank" ? ("pen" as InkTool) : ("node" as InkTool),
      inkGestureActive: false,
      selectedInkId: null,
      selectedInkIds: [],
    };
  }
  function inkSelectionFor(ink: InkData) {
    const state = get(),
      surviving = new Set(inkItems(ink).map((s) => s.id));
    const ids = state.selectedInkIds.length
      ? state.selectedInkIds
      : state.selectedInkId
        ? [state.selectedInkId]
        : [];
    const selectedInkIds = ids.filter((id) => surviving.has(id));
    return { selectedInkIds, selectedInkId: selectedInkIds[0] ?? null };
  }
  function commitInk(ink: InkData) {
    // References remain immutable; history shares old stroke geometry instead
    // of copying every sample on each pen movement or node edit.
    layoutRuntime.cancel(true);
    const state = get();
    const entry: HistoryEntry = {
      nodes: state.nodes,
      edges: state.edges,
      relations: state.relations,
      layoutMode: state.activeLayoutMode,
      ink: state.ink,
      boardMode: state.boardMode,
    };
    set({
      ink,
      ...inkSelectionFor(ink),
      history: [...state.history, entry].slice(-HISTORY_LIMIT),
      future: [],
    });
    syncActiveDocument(get().nodes, get().edges);
  }
  // Write the live nodes/edges back into the active document and mark dirty.
  // Relations referencing deleted nodes are pruned here — every node mutation
  // funnels through this, so it's the single cleanup choke point.
  function syncActiveDocument(
    nodes: MindMapNode[],
    edges: Edge[],
    touch = true,
  ) {
    const { activeDocumentId, documents } = get();
    if (!activeDocumentId) return;
    const nodeIds = new Set(nodes.map((n) => n.id));
    const relations = get().relations.filter(
      (r) => nodeIds.has(r.source) && nodeIds.has(r.target),
    );
    const updated = documents.map((d) =>
      d.id === activeDocumentId
        ? {
            ...d,
            nodes,
            edges,
            relations,
            ink: get().ink,
            boardMode: get().boardMode,
            inkSettings: get().inkSettings,
            layoutMode: get().activeLayoutMode,
            appearance: appearanceFrom(get()),
            updatedAt: touch ? nowIso() : d.updatedAt,
          }
        : d,
    );
    set((s) => ({
      documents: updated,
      relations,
      saveStatus: "idle",
      revision: s.revision + 1,
    }));
  }

  // Apply a node mutation: snapshot history, set live + document state.
  function commit(
    producer: (
      nodes: MindMapNode[],
      edges: Edge[],
    ) => {
      nodes: MindMapNode[];
      edges: Edge[];
    },
    record = true,
  ) {
    const state = get();
    const next = producer(state.nodes, state.edges);
    const sameNodes =
      next.nodes.length === state.nodes.length &&
      next.nodes.every((n, i) => {
        const old = state.nodes[i];
        return (
          n === old ||
          (n.id === old.id &&
            n.position.x === old.position.x &&
            n.position.y === old.position.y &&
            JSON.stringify(n.data) === JSON.stringify(old.data))
        );
      });
    if (sameNodes && JSON.stringify(next.edges) === JSON.stringify(state.edges))
      return;
    layoutRuntime.begin(
      "edit",
      !record ||
        layoutRuntime.isDragging ||
        (layoutRuntime.kind === "text" && !!state.editingNodeId),
    );
    layoutRuntime.record({ ...state, nodes: next.nodes, edges: next.edges });
    set({ nodes: next.nodes, edges: next.edges });
    syncActiveDocument(next.nodes, next.edges);
  }

  function focusSoon(nodeId: string) {
    // Wait a frame so React Flow has the node mounted, then center on it.
    if (typeof window === "undefined") return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => get().focusNode(nodeId));
    });
  }

  return {
    layoutRoutes: {},
    layoutResult: null,
    layoutStamp: EMPTY_STAMP,
    layoutBusy: false,
    requestLayout: (request) => layoutRuntime.queue(request),
    settleLayout: () => layoutRuntime.settle(),
    beginNodeDrag: (ids) => layoutRuntime.beginDrag(ids),
    endNodeDrag: () => layoutRuntime.endDrag(),
    noteCameraIntent: () => layoutRuntime.cameraIntent(),
    updateLayoutMeasurements: (ports, labels) =>
      layoutRuntime.measurements(ports, labels),
    documents: [],
    activeDocumentId: null,
    nodes: [],
    edges: [],
    relations: [],

    ink: EMPTY_INK,
    boardMode: "map",
    inkTool: "node",
    inkSettings: DEFAULT_INK_SETTINGS,
    inkGestureActive: false,
    selectedInkId: null,
    selectedInkIds: [],
    selectInk: (id) =>
      set({ selectedInkId: id, selectedInkIds: id ? [id] : [] }),
    selectInkItems: (ids) => {
      const existing = new Set(inkItems(get().ink).map((s) => s.id));
      const selectedInkIds = [...new Set(ids)].filter((id) => existing.has(id));
      set({ selectedInkId: selectedInkIds[0] ?? null, selectedInkIds });
    },
    replaceInkItems: (items) => {
      const ink = get().ink;
      const previous = inkItems(ink);
      if (
        items.length === previous.length &&
        items.every((item, i) => item === previous[i])
      )
        return false;
      const next: InkData = {
        ...ink,
        strokes: items.filter(isStroke),
        objects: items.filter((s): s is InkObject => !isStroke(s)),
        order: items.map((s) => s.id),
      };
      next.version = inkVersion(next);
      const checked = validateInk(next);
      if (!checked.ok) {
        get().addToast(checked.error, "error");
        return false;
      }
      commitInk(next);
      set({ freshDocumentId: null });
      return true;
    },
    addInkObject: (item) => {
      const ink = get().ink;
      if ((ink.objects?.length ?? 0) >= 1000) {
        get().addToast(
          "그림·라벨 한도에 도달했습니다. JSON으로 보관하세요.",
          "error",
        );
        return;
      }
      const next: InkData = {
        ...ink,
        version: inkVersion(ink),
        objects: [...(ink.objects ?? []), item],
        order: [...inkItems(ink).map((s) => s.id), item.id],
      };
      if (!validateInk(next).ok) return;
      commitInk(next);
      set({
        freshDocumentId: null,
        selectedInkId: item.id,
        selectedInkIds: [item.id],
      });
    },
    updateInkItem: (id, patch) => {
      const ink = get().ink,
        item = inkItems(ink).find((s) => s.id === id);
      if (
        !item ||
        JSON.stringify({ ...item, ...patch }) === JSON.stringify(item)
      )
        return;
      const next: InkData = {
        ...ink,
        version: inkVersion(ink),
        strokes: ink.strokes.map((s) =>
          s.id === id ? ({ ...s, ...patch } as InkStroke) : s,
        ),
        objects: ink.objects?.map((s) =>
          s.id === id ? ({ ...s, ...patch } as InkObject) : s,
        ),
      };
      next.version = inkVersion(next);
      if (validateInk(next).ok) commitInk(next);
    },
    reorderInk: (id, front) => {
      const ink = get().ink,
        order = inkItems(ink).map((s) => s.id);
      if (!order.includes(id)) return;
      const rest = order.filter((i) => i !== id),
        next = front ? [...rest, id] : [id, ...rest];
      if (next.join() !== order.join())
        commitInk({ ...ink, version: inkVersion(ink), order: next });
    },
    setInkPaper: (paper) => {
      if (
        !validPaper(paper) ||
        JSON.stringify(get().ink.paper) === JSON.stringify(paper)
      )
        return;
      commitInk({
        ...get().ink,
        version: inkVersion(get().ink),
        paper,
      });
      set({ freshDocumentId: null });
    },
    setInkTool: (inkTool) => {
      if (get().inkGestureActive) return;
      set({
        inkTool,
        editingNodeId: null,
        contextMenu: null,
        connectMode: false,
        mobileSheetOpen: false,
      });
      if (inkTool !== "node") set({ inspectorOpen: false });
    },
    setInkSettings: (patch) => {
      const inkSettings = { ...get().inkSettings, ...patch };
      if (!validInkSettings(inkSettings)) return;
      set({ inkSettings });
      syncActiveDocument(get().nodes, get().edges);
    },
    createInkBoard: () => {
      get().discardFreshDocument();
      const doc = makeDocument("새 손그림 보드", [], []);
      doc.boardMode = "blank";
      doc.ink = { version: 2, strokes: [], paper: { ...DEFAULT_PAPER } };
      doc.inkSettings = { ...DEFAULT_INK_SETTINGS };
      doc.appearance = appearanceFrom(get());
      set((s) => ({
        documents: [doc, ...s.documents],
        activeDocumentId: doc.id,
        freshDocumentId: doc.id,
        nodes: [],
        edges: [],
        relations: [],
        ...inkFor(doc),
        ...selectionFor(null),
        editingNodeId: null,
        selectedRelationId: null,
        focusModeNodeId: null,
        connectMode: false,
        history: [],
        future: [],
        revision: s.revision + 1,
        saveStatus: "idle",
        dialog: null,
        mobileDrawerOpen: false,
        inspectorOpen: false,
      }));
      get().flow?.setViewport({ x: 0, y: 0, zoom: 1 });
      get().addToast("빈 보드에 직접 그려보세요", "success");
    },
    addInkStroke: (stroke) => {
      const state = get();
      const checked = validateInk({
        version: inkVersion({ version: 2, strokes: [stroke] }),
        strokes: [stroke],
      });
      if (!checked.ok || inkItems(state.ink).some((s) => s.id === stroke.id))
        return;
      if (
        state.ink.strokes.length >= MAX_INK_STROKES ||
        state.ink.strokes.reduce((n, s) => n + s.points.length, 0) +
          stroke.points.length >
          MAX_INK_POINTS
      ) {
        get().addToast(
          "잉크 용량 한도에 도달했습니다. JSON으로 보관하고 새 보드에서 이어가세요.",
          "error",
        );
        return;
      }
      const next: InkData = {
        ...state.ink,
        strokes: [...state.ink.strokes, checked.ink.strokes[0]],
        order: [...inkItems(state.ink).map((s) => s.id), stroke.id],
      };
      next.version = inkVersion(next);
      const complete = validateInk(next);
      if (!complete.ok) {
        get().addToast(complete.error, "error");
        return;
      }
      commitInk(next);
      set({ freshDocumentId: null });
    },
    eraseInkStrokes: (ids) => {
      const removed = new Set(ids),
        ink = get().ink;
      const strokes = ink.strokes.filter((s) => !removed.has(s.id));
      const objects = ink.objects?.filter((s) => !removed.has(s.id));
      if (
        strokes.length !== ink.strokes.length ||
        objects?.length !== ink.objects?.length
      )
        commitInk({
          ...ink,
          strokes,
          objects,
          order: inkItems(ink)
            .map((s) => s.id)
            .filter((id) => !removed.has(id)),
        });
    },
    clearInk: () => {
      if (!inkItems(get().ink).length) return;
      commitInk({ ...get().ink, strokes: [], objects: [], order: [] });
      get().addToast(
        "잉크를 지웠습니다. 실행 취소로 복원할 수 있습니다.",
        "info",
      );
    },

    selectedNodeId: null,
    selectedNodeIds: [],
    editingNodeId: null,
    editSeed: null,
    dropTargetId: null,
    dropPendingId: null,
    selectedRelationId: null,
    connectMode: false,
    clipboard: null,

    searchQuery: "",
    searchTypes: [],
    searchStatuses: [],
    searchOpen: false,

    commandPaletteOpen: false,
    inspectorOpen: true,
    sidebarCollapsed: false,
    theme: "system",
    font: DEFAULT_FONT,
    nodeStyle: DEFAULT_NODE_STYLE,
    levelFontSizes: [...DEFAULT_LEVEL_FONT_SIZES],
    edgeStyle: "curved",
    edgeAnimated: false,
    edgeWidth: 2,
    edgeColorMode: "default",
    edgeLine: DEFAULT_EDGE_LINE,
    nodeTint: false,
    canvasBg: DEFAULT_CANVAS_BG,
    accent: DEFAULT_ACCENT,
    rainbowBranches: false,
    dialog: null,
    importTab: "json",
    contextMenu: null,
    outlineOpen: true,
    mobileDrawerOpen: false,
    mobileMoreOpen: false,
    mobileSheetOpen: false,

    history: [],
    future: [],

    workspaceOwnerId: null,
    saveStatus: "idle",
    lastSavedAt: null,
    revision: 0,
    hydrated: false,
    freshDocumentId: null,

    tutorialStep: null,
    // The tutorial starts on a fresh document so every step matches what the
    // user sees (root labelled 중심 주제, no other nodes).
    startTutorial: () => {
      get().createDocument();
      set({
        tutorialStep: 0,
        mobileMoreOpen: false,
        dialog: null,
        commandPaletteOpen: false,
      });
    },
    setTutorialStep: (tutorialStep) => set({ tutorialStep }),
    endTutorial: () => set({ tutorialStep: null }),

    presentationMode: false,
    presentationIndex: 0,
    presentationReveal: true,
    setPresentationReveal: (presentationReveal) => set({ presentationReveal }),
    activeLayoutMode: DEFAULT_LAYOUT_MODE,

    flow: null,
    registerFlow: (instance) => set({ flow: instance }),

    toasts: [],
    addToast: (message, type = "info", action) =>
      set((s) => ({
        toasts: [...s.toasts, { id: createId("t"), message, type, action }],
      })),
    dismissToast: (id) =>
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

    // ── Documents ──
    createDocument: (templateType) => {
      const doc =
        templateType && templateType !== "blank"
          ? makeDocument(
              templateTitle(templateType),
              ...(() => {
                const { nodes, edges } = buildTemplate(templateType);
                return [nodes, edges] as [MindMapNode[], Edge[]];
              })(),
            )
          : blankRootDocument();
      doc.appearance = appearanceFrom(get());
      set((s) => ({
        documents: [doc, ...s.documents],
        activeDocumentId: doc.id,
        freshDocumentId: doc.id,
        ...inkFor(doc),
        nodes: doc.nodes,
        edges: doc.edges,
        relations: [],
        selectedRelationId: null,
        activeLayoutMode: DEFAULT_LAYOUT_MODE,
        ...selectionFor(getRootNode(doc.nodes)?.id ?? null),
        editingNodeId: null,
        history: [],
        future: [],
        revision: s.revision + 1,
        saveStatus: "idle",
        mobileDrawerOpen: false,
        dialog: null,
      }));
      get().addToast("새 문서를 만들었습니다", "success");
      get().fitToView();
    },

    // A new map is a draft until its first edit: leaving it untouched (home,
    // another document, another new map) discards it, so trying templates
    // doesn't pile up identical copies. Edits bump updatedAt, which ends the
    // draft state for good.
    discardFreshDocument: () => {
      const { freshDocumentId, documents, activeDocumentId } = get();
      if (!freshDocumentId) return;
      set({ freshDocumentId: null });
      const doc = documents.find((d) => d.id === freshDocumentId);
      if (!doc || doc.updatedAt !== doc.createdAt || documents.length < 2)
        return;
      const rest = documents.filter((d) => d.id !== doc.id);
      if (activeDocumentId !== doc.id) {
        set((s) => ({ documents: rest, revision: s.revision + 1 }));
        return;
      }
      const next = rest[0];
      set((s) => ({
        documents: rest,
        activeDocumentId: next.id,
        ...inkFor(next),
        nodes: next.nodes,
        edges: next.edges,
        relations: next.relations ?? [],
        selectedRelationId: null,
        activeLayoutMode: next.layoutMode ?? "right-tree",
        ...activateAppearance(next, get()),
        ...selectionFor(getRootNode(next.nodes)?.id ?? null),
        editingNodeId: null,
        history: [],
        future: [],
        revision: s.revision + 1,
      }));
    },

    duplicateDocument: (documentId) => {
      const { documents } = get();
      const src = documents.find((d) => d.id === documentId);
      if (!src) return;
      const copy = makeDocument(
        `${src.title} (복사본)`,
        src.nodes.map(cloneNode),
        src.edges.map((e) => ({ ...e })),
      );
      copy.ink = src.ink;
      copy.boardMode = src.boardMode;
      copy.inkSettings = src.inkSettings;
      copy.relations = (src.relations ?? []).map((r) => ({ ...r }));
      copy.layoutMode = src.layoutMode;
      copy.viewport = src.viewport ? { ...src.viewport } : undefined;
      copy.appearance = appearanceFrom(src.appearance ?? get());
      set((s) => ({
        documents: [copy, ...s.documents],
        revision: s.revision + 1,
      }));
      get().addToast("문서를 복제했습니다", "success");
    },

    deleteDocument: (documentId) => {
      const { documents, activeDocumentId } = get();
      const remaining = documents.filter((d) => d.id !== documentId);
      let nextDocs = remaining;
      if (remaining.length === 0) {
        nextDocs = [blankRootDocument()];
      }
      const wasActive = activeDocumentId === documentId;
      const nextActive = wasActive ? nextDocs[0] : null;
      set((s) => ({
        documents: nextDocs,
        activeDocumentId: wasActive ? nextDocs[0].id : s.activeDocumentId,
        ...(wasActive ? inkFor(nextDocs[0]) : {}),
        nodes: wasActive ? nextDocs[0].nodes : s.nodes,
        edges: wasActive ? nextDocs[0].edges : s.edges,
        relations: wasActive ? (nextDocs[0].relations ?? []) : s.relations,
        selectedRelationId: wasActive ? null : s.selectedRelationId,
        activeLayoutMode: wasActive
          ? (nextDocs[0].layoutMode ?? "right-tree")
          : s.activeLayoutMode,
        ...(wasActive
          ? selectionFor(getRootNode(nextDocs[0].nodes)?.id ?? null)
          : {}),
        ...(wasActive ? activateAppearance(nextDocs[0], get()) : {}),
        history: wasActive ? [] : s.history,
        future: wasActive ? [] : s.future,
        revision: s.revision + 1,
      }));
      if (nextActive) get().fitToView();
      get().addToast("문서를 삭제했습니다", "info");
    },

    renameDocument: (documentId, title) => {
      set((s) => ({
        documents: s.documents.map((d) =>
          d.id === documentId ? { ...d, title, updatedAt: nowIso() } : d,
        ),
        revision: s.revision + 1,
      }));
    },

    // Pin toggling doesn't touch updatedAt — pinning shouldn't reorder the
    // "recent" sort or make an untouched document look freshly edited.
    toggleDocumentPin: (documentId) => {
      set((s) => ({
        documents: s.documents.map((d) =>
          d.id === documentId ? { ...d, pinned: !d.pinned } : d,
        ),
        revision: s.revision + 1,
      }));
    },

    setActiveDocument: (documentId) => {
      if (get().freshDocumentId !== documentId) get().discardFreshDocument();
      const { documents } = get();
      const doc = documents.find((d) => d.id === documentId);
      if (!doc) return;
      set((s) => ({
        activeDocumentId: documentId,
        ...inkFor(doc),
        nodes: doc.nodes,
        edges: doc.edges,
        relations: doc.relations ?? [],
        selectedRelationId: null,
        connectMode: false,
        focusModeNodeId: null,
        activeLayoutMode: doc.layoutMode ?? "right-tree",
        ...activateAppearance(doc, get()),
        ...selectionFor(getRootNode(doc.nodes)?.id ?? null),
        editingNodeId: null,
        history: [],
        future: [],
        mobileDrawerOpen: false,
        revision: s.revision + 1,
      }));
      get().fitToView();
    },

    switchWorkspaceOwner: (ownerId) => {
      if (get().workspaceOwnerId === ownerId) return;
      // Flush to the OLD key before changing the scope. The next load cannot
      // write an account document into the original local workspace.
      get().saveWorkspace();
      layoutRuntime.cancel(true);
      set({
        workspaceOwnerId: ownerId, hydrated: false, documents: [],
        activeDocumentId: null, nodes: [], edges: [], relations: [],
        ink: EMPTY_INK, boardMode: "map", inkSettings: DEFAULT_INK_SETTINGS,
        selectedInkId: null, selectedInkIds: [], inkGestureActive: false,
        history: [], future: [], clipboard: null, freshDocumentId: null,
        ...selectionFor(null), editingNodeId: null, editSeed: null,
        selectedRelationId: null, focusModeNodeId: null, connectMode: false,
        dialog: null, contextMenu: null, searchOpen: false, searchQuery: "",
        searchTypes: [], searchStatuses: [], commandPaletteOpen: false,
        mobileDrawerOpen: false, mobileMoreOpen: false, mobileSheetOpen: false,
        tutorialStep: null, presentationMode: false, dropTargetId: null,
        dropPendingId: null, toasts: [], revision: get().revision + 1,
      });
      get().loadWorkspace();
    },

    openCloudDocument: (ownerId, document) => {
      get().switchWorkspaceOwner(ownerId);
      layoutRuntime.cancel(true);
      set((s) => ({
        documents: [document, ...s.documents.filter((d) => d.id !== document.id)],
        freshDocumentId: null,
      }));
      get().setActiveDocument(document.id);
      get().saveWorkspace();
    },

    loadWorkspace: () => {
      // Load once. A second call (React StrictMode's dev double-mount, or any
      // future re-invocation) would re-read localStorage and clobber in-memory
      // state — including a just-imported shared document that hasn't been
      // persisted yet. The first load sets hydrated, so this stays a no-op.
      if (get().hydrated) return;
      const result = loadWorkspaceFromStorage(get().workspaceOwnerId);
      if (get().workspaceOwnerId && (!result.ok || !result.workspace.documents.length)) {
        // A new account cache starts empty; local sample documents stay local.
        set({ hydrated: true, saveStatus: "idle", lastSavedAt: null });
        if (!result.ok && "corrupted" in result) backupCorruptData(result.raw, get().workspaceOwnerId);
        return;
      }
      if (result.ok) {
        const ws = result.workspace;
        let documents = ws.documents;
        if (documents.length === 0) documents = [sampleDocument()];
        const activeId =
          ws.activeDocumentId &&
          documents.some((d) => d.id === ws.activeDocumentId)
            ? ws.activeDocumentId
            : documents[0].id;
        const active = documents.find((d) => d.id === activeId)!;
        set({
          documents,
          activeDocumentId: activeId,
          ...inkFor(active),
          nodes: active.nodes,
          edges: active.edges,
          relations: active.relations ?? [],
          activeLayoutMode: active.layoutMode ?? "right-tree",
          ...selectionFor(getRootNode(active.nodes)?.id ?? null),
          ...activateAppearance(active, ws),
          sidebarCollapsed: ws.sidebarCollapsed,
          inspectorOpen: ws.inspectorOpen,
          hydrated: true,
          lastSavedAt: result.volatile ? null : nowIso(),
          saveStatus: result.volatile ? "error" : "saved",
        });
      } else {
        // Empty or corrupted → start fresh with a sample document.
        const sample = sampleDocument();
        applyThemeClass("system");
        set({
          documents: [sample],
          activeDocumentId: sample.id,
          ...inkFor(sample),
          nodes: sample.nodes,
          edges: sample.edges,
          relations: [],
          ...selectionFor(getRootNode(sample.nodes)?.id ?? null),
          hydrated: true,
        });
        if ("corrupted" in result && result.corrupted) {
          // Keep the unparseable blob so it isn't destroyed by the next save.
          backupCorruptData(result.raw, get().workspaceOwnerId);
          get().addToast(
            "저장된 데이터가 손상되어 새로 시작합니다. 이전 데이터는 백업해 두었습니다.",
            "error",
          );
        }
      }
      // If some documents were dropped as unreadable, tell the user rather
      // than silently losing them.
      if (result.ok && result.droppedDocs > 0) {
        get().addToast(
          `문서 ${result.droppedDocs}개가 손상되어 제외되었습니다.`,
          "error",
        );
      }
      get().fitToView();
    },

    saveWorkspace: () => {
      const {
        documents,
        activeDocumentId,
        theme,
        font,
        nodeStyle,
        levelFontSizes,
        edgeStyle,
        edgeAnimated,
        edgeWidth,
        edgeColorMode,
        edgeLine,
        nodeTint,
        canvasBg,
        accent,
        rainbowBranches,
        sidebarCollapsed,
        inspectorOpen,
        hydrated,
      } = get();
      if (!hydrated) return;
      set({ saveStatus: "saving" });
      const result = saveWorkspaceToStorage({
        version: 1,
        documents,
        activeDocumentId,
        theme,
        font,
        nodeStyle,
        levelFontSizes,
        edgeStyle,
        edgeAnimated,
        edgeWidth,
        edgeColorMode,
        edgeLine,
        nodeTint,
        canvasBg,
        accent,
        rainbowBranches,
        sidebarCollapsed,
        inspectorOpen,
      }, get().workspaceOwnerId);
      set({
        saveStatus: result.ok ? "saved" : "error",
        lastSavedAt: result.ok ? nowIso() : get().lastSavedAt,
      });
      if (!result.ok) {
        // A silent no-op here means a refresh loses the session. Surface it
        // loudly and steer the user to a rescue export before that happens.
        const now = Date.now();
        if (now - lastSaveErrorAt > 20000) {
          lastSaveErrorAt = now;
          get().addToast(
            result.quota
              ? "저장 공간이 가득 찼습니다. 내보내기로 백업하고 오래된 스냅샷/문서를 정리하세요."
              : "자동 저장에 실패했습니다. 내보내기로 백업하세요.",
            "error",
          );
        }
      }
    },

    // ── Nodes ──
    addChildNode: (parentId) => {
      const { nodes } = get();
      const parent = getNodeMap(nodes).get(parentId);
      if (!parent) return null;
      const id = createId("n");
      const newNode: MindMapNode = {
        id,
        type: "mindmap",
        position: (() => {
          let siblings = nodes.filter((n) => n.data.parentId === parentId);
          const size = nodeSize(parent);
          let left =
            parent.data.side === "left" ||
            (siblings.length > 0 &&
              siblings[siblings.length - 1].position.x < parent.position.x);
          // Bidirectional maps grow first-level branches on the lighter side
          // of the central topic, so the map stays balanced as it grows.
          if (
            parent.data.isRoot &&
            get().activeLayoutMode === "bidirectional"
          ) {
            const onLeft = siblings.filter(
              (n) => n.position.x < parent.position.x,
            );
            left = onLeft.length < siblings.length - onLeft.length;
            siblings = left
              ? onLeft
              : siblings.filter((n) => n.position.x >= parent.position.x);
          }
          const last = siblings[siblings.length - 1];
          if (get().activeLayoutMode === "vertical")
            return {
              x: last
                ? last.position.x + nodeSize(last).width + 28
                : parent.position.x,
              y: parent.position.y + size.height + 56,
            };
          return {
            x:
              last?.position.x ??
              parent.position.x + (left ? -NODE_WIDTH - 56 : size.width + 56),
            y: last
              ? last.position.y + nodeSize(last).height + 28
              : parent.position.y,
          };
        })(),
        data: {
          label: DEFAULT_NODE_LABEL,
          parentId,
          type: "plain",
          status: "none",
          color: NODE_TYPE_CONFIG.plain.color,
          collapsed: false,
        },
      };
      commit((nds, eds) => {
        // expand parent if collapsed so the new child is visible
        const expanded = nds.map((n) =>
          n.id === parentId
            ? { ...n, data: { ...n.data, collapsed: false } }
            : n,
        );
        const withNew = [...expanded, newNode];
        return { nodes: withNew, edges: reconcileEdges(withNew, eds) };
      });
      // Select the new node but don't jump into edit mode — the user asked
      // that adding a child not immediately open the text cursor. (The
      // continuous Tab-while-typing flow opts back in explicitly.)
      set({ ...selectionFor(id), editingNodeId: null });

      return id;
    },

    addSiblingNode: (nodeId) => {
      const { nodes } = get();
      const node = getNodeMap(nodes).get(nodeId);
      if (!node) return null;
      const parentId = node.data.parentId;
      // Root has no siblings → add a child instead.
      if (!parentId) return get().addChildNode(nodeId);
      return get().addChildNode(parentId);
    },

    updateNodeLabel: (nodeId, label) => {
      commit((nds, eds) => ({
        nodes: nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, label } } : n,
        ),
        edges: eds,
      }));
    },

    updateNodeData: (nodeId, partial) => {
      commit((nds, eds) => ({
        nodes: nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, ...partial } } : n,
        ),
        edges: eds,
      }));
    },

    // Deleting a node removes its whole subtree (children included) and
    // re-tidies the tree so no empty gaps or stray branches remain.
    deleteNode: (nodeId) => {
      const { nodes } = get();
      const node = getNodeMap(nodes).get(nodeId);
      if (!node) return;
      if (node.data.isRoot || !node.data.parentId) {
        get().addToast("루트 노드는 삭제할 수 없습니다", "error");
        return;
      }
      const ids = new Set(getSubtreeIds(nodes, nodeId));
      const parentId = node.data.parentId;
      commit((nds, eds) => {
        const remaining = nds.filter((n) => !ids.has(n.id));
        return { nodes: remaining, edges: reconcileEdges(remaining, eds) };
      });
      set({
        ...selectionFor(parentId),
        editingNodeId: null,
        mobileSheetOpen: false,
        contextMenu: null,
      });
      requestAnimationFrame(() => get().focusNode(parentId));
    },

    deleteSubtree: (nodeId) => {
      const { nodes } = get();
      const node = getNodeMap(nodes).get(nodeId);
      if (!node) return;
      if (node.data.isRoot || !node.data.parentId) {
        get().addToast("루트 노드는 삭제할 수 없습니다", "error");
        return;
      }
      const ids = new Set(getSubtreeIds(nodes, nodeId));
      const parentId = node.data.parentId;
      commit((nds) => {
        const nextNodes = nds.filter((n) => !ids.has(n.id));
        return {
          nodes: nextNodes,
          edges: reconcileEdges(nextNodes, get().edges),
        };
      });
      set({
        ...selectionFor(parentId),
        editingNodeId: null,
        mobileSheetOpen: false,
        contextMenu: null,
      });
    },

    duplicateSubtree: (nodeId) => {
      const { nodes } = get();
      const node = getNodeMap(nodes).get(nodeId);
      if (!node) return;
      const subtreeIds = getSubtreeIds(nodes, nodeId);
      const sourceMap = getNodeMap(nodes);
      const idMap = new Map<string, string>();
      for (const oldId of subtreeIds) idMap.set(oldId, createId("n"));
      const clones: MindMapNode[] = subtreeIds.map((oldId) => {
        const original = sourceMap.get(oldId)!;
        const newId = idMap.get(oldId)!;
        const isSubRoot = oldId === nodeId;
        const newParent = isSubRoot
          ? (original.data.parentId ?? nodeId)
          : (idMap.get(original.data.parentId ?? "") ?? null);
        const clone = cloneNode(original);
        return {
          ...clone,
          id: newId,
          selected: false,
          data: {
            ...clone.data,
            parentId: newParent,
            isRoot: false,
            type: clone.data.type === "root" ? "plain" : clone.data.type,
            label: isSubRoot
              ? `${clone.data.label} (복사본)`
              : clone.data.label,
          },
          position: {
            x: original.position.x + NODE_WIDTH + 60,
            y: original.position.y + 40,
          },
        };
      });
      commit((nds, eds) => {
        const nextNodes = [...nds, ...clones];
        const newEdges = clones
          .filter((c) => c.data.parentId)
          .map((c) => ({
            id: `e_${c.data.parentId}_${c.id}`,
            source: c.data.parentId as string,
            target: c.id,
            type: "mindmap",
          }));
        return { nodes: nextNodes, edges: [...eds, ...newEdges] };
      });
      const newRootId = idMap.get(nodeId)!;
      set({ ...selectionFor(newRootId) });
      get().addToast("하위 트리를 복제했습니다", "success");
    },

    // Snapshot a subtree into the in-app clipboard (survives node deletion,
    // works across documents in the same session).
    copySubtree: (nodeId) => {
      const { nodes } = get();
      const map = getNodeMap(nodes);
      if (!map.get(nodeId)) return;
      const ids = getSubtreeIds(nodes, nodeId);
      const copied = ids.map((sid) => cloneNode(map.get(sid)!));
      set({ clipboard: copied });
      get().addToast(`${copied.length}개 노드를 복사했습니다`, "success");
    },

    // Paste the copied subtree as a child of the target node, with fresh ids.
    pasteSubtree: (targetId) => {
      const { clipboard, nodes } = get();
      if (!clipboard?.length) {
        get().addToast("복사된 노드가 없습니다", "info");
        return;
      }
      const map = getNodeMap(nodes);
      const target = map.get(targetId);
      if (!target) return;
      const srcRootId = clipboard[0].id;
      const idMap = new Map<string, string>();
      for (const n of clipboard) idMap.set(n.id, createId("n"));
      const clones: MindMapNode[] = clipboard.map((n) => {
        const isSubRoot = n.id === srcRootId;
        const clone = cloneNode(n);
        return {
          ...clone,
          id: idMap.get(n.id)!,
          position: {
            x:
              n.position.x -
              clipboard[0].position.x +
              target.position.x +
              nodeSize(target).width +
              56,
            y: n.position.y - clipboard[0].position.y + target.position.y + 104,
          },
          selected: false,
          data: {
            ...clone.data,
            parentId: isSubRoot
              ? targetId
              : (idMap.get(clone.data.parentId ?? "") ?? targetId),
            isRoot: false,
            type: clone.data.type === "root" ? "plain" : clone.data.type,
            // Pasted portals shouldn't share the original's cross-map links.
            linkedDocId: undefined,
            backDocId: undefined,
            backNodeId: undefined,
          },
        };
      });
      commit((nds) => {
        const expanded = nds.map((n) =>
          n.id === targetId
            ? { ...n, data: { ...n.data, collapsed: false } }
            : n,
        );
        const withNew = [...expanded, ...clones];
        return { nodes: withNew, edges: reconcileEdges(withNew, get().edges) };
      });
      const newRootId = idMap.get(srcRootId)!;
      set({ ...selectionFor(newRootId) });
      focusSoon(newRootId);
      get().addToast("붙여넣었습니다", "success");
    },

    // Promote a node into its own map: move its subtree to a new document
    // (with the node as root), turn the original node into a linked portal,
    // and add a back-link on the new map's root.
    promoteNodeToMap: (nodeId) => {
      const { nodes, activeDocumentId } = get();
      const node = getNodeMap(nodes).get(nodeId);
      if (!node || node.data.isRoot || !node.data.parentId) {
        get().addToast("이 노드는 새 맵으로 분리할 수 없습니다", "error");
        return;
      }
      const subtreeIds = getSubtreeIds(nodes, nodeId); // node + descendants
      const idMap = new Map<string, string>();
      for (const oldId of subtreeIds) {
        idMap.set(oldId, createId(oldId === nodeId ? "root" : "n"));
      }
      const newNodes: MindMapNode[] = subtreeIds.map((oldId) => {
        const original = getNodeMap(nodes).get(oldId)!;
        const isSubRoot = oldId === nodeId;
        const clone = cloneNode(original);
        return {
          ...clone,
          id: idMap.get(oldId)!,
          selected: false,
          data: {
            ...clone.data,
            parentId: isSubRoot
              ? null
              : (idMap.get(original.data.parentId ?? "") ?? null),
            isRoot: isSubRoot,
            type: isSubRoot ? "root" : clone.data.type,
            collapsed: false,
            linkedDocId: undefined,
            backDocId: isSubRoot ? (activeDocumentId ?? undefined) : undefined,
            backNodeId: isSubRoot ? nodeId : undefined,
          },
        };
      });
      const laid = runLayout(newNodes, DEFAULT_LAYOUT_MODE);
      const newDoc = makeDocument(
        node.data.label || "새 맵",
        laid,
        buildEdgesFromNodes(laid),
      );
      newDoc.appearance = appearanceFrom(get());

      // Update the current document: drop the moved descendants and turn the
      // node into a portal linking to the new map.
      const descIds = new Set(getDescendantIds(nodes, nodeId));
      commit((nds) => {
        const nextNodes = nds
          .filter((n) => !descIds.has(n.id))
          .map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  data: { ...n.data, collapsed: false, linkedDocId: newDoc.id },
                }
              : n,
          );
        return {
          nodes: nextNodes,
          edges: reconcileEdges(nextNodes, get().edges),
        };
      });

      set((s) => ({ documents: [newDoc, ...s.documents] }));
      get().setActiveDocument(newDoc.id);
      get().addToast("새 맵으로 분리했습니다", "success");
    },

    openLinkedDoc: (docId, nodeId) => {
      if (!get().documents.some((d) => d.id === docId)) {
        get().addToast("연결된 맵을 찾을 수 없습니다", "error");
        return;
      }
      get().setActiveDocument(docId);
      if (nodeId) {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            get().selectNode(nodeId);
            get().focusNode(nodeId);
          }),
        );
      }
    },

    toggleCollapse: (nodeId) => {
      commit((nds, eds) => ({
        nodes: nds.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, collapsed: !n.data.collapsed } }
            : n,
        ),
        edges: eds,
      }));
    },

    // Set a first-level branch's direction and re-run the bidirectional layout
    // so the change is immediately visible.
    setNodeSide: (nodeId, side) => {
      const state = get(),
        node = state.nodes.find((n) => n.id === nodeId);
      if (!node || node.data.side === side) return;
      const root = getRootNode(state.nodes);
      if (!root) return;
      const ids = new Set(getSubtreeIds(state.nodes, nodeId));
      const destination =
        root.position.x +
        (side === "left"
          ? -nodeSize(node).width - 56
          : nodeSize(root).width + 56);
      const delta = destination - node.position.x;
      commit((nodes, edges) => ({
        nodes: nodes.map((n) =>
          ids.has(n.id)
            ? {
                ...n,
                position: { x: n.position.x + delta, y: n.position.y },
                data: n.id === nodeId ? { ...n.data, side } : n.data,
              }
            : n,
        ),
        edges,
      }));
      set({ activeLayoutMode: "bidirectional" });
      syncActiveDocument(get().nodes, get().edges);
    },

    selectNode: (nodeId) =>
      set({
        selectedNodeId: nodeId,
        selectedNodeIds: nodeId ? [nodeId] : [],
        contextMenu: null,
      }),

    // Add/remove a node from the multi-selection (Shift/⌘ + click).
    toggleNodeSelection: (nodeId) =>
      set((s) => {
        const exists = s.selectedNodeIds.includes(nodeId);
        const next = exists
          ? s.selectedNodeIds.filter((id) => id !== nodeId)
          : [...s.selectedNodeIds, nodeId];
        return {
          selectedNodeIds: next,
          selectedNodeId: next.length ? next[next.length - 1] : null,
          contextMenu: null,
        };
      }),

    // Replace the whole selection at once (marquee / box select). No-ops when
    // the set is unchanged so React Flow's selection echo doesn't loop.
    setSelection: (ids) =>
      set((s) => {
        if (
          ids.length === s.selectedNodeIds.length &&
          ids.every((id) => s.selectedNodeIds.includes(id))
        ) {
          return {};
        }
        return {
          selectedNodeIds: ids,
          selectedNodeId: ids.length ? ids[ids.length - 1] : null,
          contextMenu: null,
        };
      }),

    // seed = a typed character (type-to-edit) used as the editor's initial
    // text. It never touches the stored label, so undo history stays clean:
    // the pre-edit label is captured on commit.
    setEditingNode: (nodeId, seed) =>
      set({ editingNodeId: nodeId, editSeed: nodeId ? (seed ?? null) : null }),

    // Apply the same data patch to many nodes at once.
    bulkUpdateData: (ids, partial) => {
      if (!ids.length) return;
      const idset = new Set(ids);
      commit((nds, eds) => ({
        nodes: nds.map((n) =>
          idset.has(n.id) ? { ...n, data: { ...n.data, ...partial } } : n,
        ),
        edges: eds,
      }));
    },

    // Delete several nodes (and their subtrees), skipping the root.
    bulkDelete: (ids) => {
      const { nodes } = get();
      const map = getNodeMap(nodes);
      const toRemove = new Set<string>();
      for (const id of ids) {
        const node = map.get(id);
        if (!node || node.data.isRoot || !node.data.parentId) continue;
        for (const sid of getSubtreeIds(nodes, id)) toRemove.add(sid);
      }
      if (!toRemove.size) return;
      commit((nds) => {
        const next = nds.filter((n) => !toRemove.has(n.id));
        return { nodes: next, edges: reconcileEdges(next, get().edges) };
      });
      set({
        selectedNodeId: null,
        selectedNodeIds: [],
        editingNodeId: null,
        contextMenu: null,
        mobileSheetOpen: false,
      });
    },

    setDropTargetId: (id) => set({ dropTargetId: id }),
    setDropPendingId: (id) => set({ dropPendingId: id }),

    // Re-parent a node onto a new parent (drag & drop). History is captured by
    // the drag start, so this mutation doesn't push its own history entry.
    reparentNode: (nodeId, newParentId) => {
      const { nodes } = get();
      if (nodeId === newParentId) return;
      const map = getNodeMap(nodes);
      const node = map.get(nodeId);
      const target = map.get(newParentId);
      if (!node || !target) return;
      if (node.data.isRoot || !node.data.parentId) return; // root stays root
      if (node.data.parentId === newParentId) return; // no change
      const descendants = new Set(getDescendantIds(nodes, nodeId));
      if (descendants.has(newParentId)) return; // would create a cycle

      const updated = nodes.map((n) => {
        if (n.id === nodeId)
          return { ...n, data: { ...n.data, parentId: newParentId } };
        if (n.id === newParentId)
          return { ...n, data: { ...n.data, collapsed: false } };
        return n;
      });
      commit(
        () => ({ nodes: updated, edges: reconcileEdges(updated, get().edges) }),
        !layoutRuntime.isDragging,
      );
      set({ dropTargetId: null, dropPendingId: null });
      // Say exactly what moved where, with a one-tap undo — a mis-drop should
      // cost one tap to fix, not a hunt through the undo history. The drag
      // start captured a single history entry, so undo restores both the
      // old parent and the old position.
      const clip = (t: string) =>
        (t.trim() || "빈 노드").length > 12
          ? `${(t.trim() || "빈 노드").slice(0, 12)}…`
          : t.trim() || "빈 노드";
      get().addToast(
        `‘${clip(node.data.label)}’ → ‘${clip(target.data.label)}’ 아래로 이동`,
        "success",
        { label: "되돌리기", onClick: () => get().undo() },
      );
    },

    // ── Focus mode ──
    focusModeNodeId: null,
    enterFocusMode: (nodeId) => {
      if (!getNodeMap(get().nodes).has(nodeId)) return;
      set({ focusModeNodeId: nodeId, contextMenu: null });
      requestAnimationFrame(() => get().fitToView());
      get().addToast("포커스 모드 — Esc 로 종료", "info");
    },
    exitFocusMode: () => {
      if (!get().focusModeNodeId) return;
      set({ focusModeNodeId: null });
      requestAnimationFrame(() => get().fitToView());
    },

    // ── Snapshots ──
    saveSnapshot: () => {
      const { activeDocumentId, nodes, edges, relations } = get();
      if (!activeDocumentId) return;
      const snap: MindMapSnapshot = {
        id: createId("snap"),
        label: new Date().toLocaleString("ko-KR", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
        createdAt: nowIso(),
        ink: get().ink,
        boardMode: get().boardMode,
        layoutMode: get().activeLayoutMode,
        nodes: nodes.map(cloneNode),
        edges: edges.map((e) => ({ ...e })),
        relations: relations.map((r) => ({ ...r })),
      };
      set((s) => ({
        documents: s.documents.map((d) =>
          d.id === activeDocumentId
            ? // Keep the most recent 5 — snapshots live in localStorage.
              { ...d, snapshots: [snap, ...(d.snapshots ?? [])].slice(0, 5) }
            : d,
        ),
        revision: s.revision + 1,
      }));
      get().addToast("스냅샷을 저장했습니다", "success");
    },

    restoreSnapshot: (snapshotId) => {
      const { activeDocumentId, documents } = get();
      const doc = documents.find((d) => d.id === activeDocumentId);
      const snap = doc?.snapshots?.find((s) => s.id === snapshotId);
      if (!snap) return;
      layoutRuntime.begin("restore");
      const restored = {
        ink: snap.ink ?? EMPTY_INK,
        boardMode:
          snap.boardMode ?? doc?.boardMode ?? ("map" as "map" | "blank"),
        nodes: snap.nodes.map(cloneNode),
        edges: snap.edges.map((e) => ({ ...e })),
        relations: (snap.relations ?? []).map((r) => ({ ...r })),
        activeLayoutMode:
          snap.layoutMode ?? doc?.layoutMode ?? ("right-tree" as LayoutMode),
      };
      layoutRuntime.record({ ...get(), ...restored });
      set({
        ...restored,
        ...inkSelectionFor(restored.ink),
        ...selectionFor(getRootNode(snap.nodes)?.id ?? null),
        focusModeNodeId: null,
        dialog: null,
      });
      syncActiveDocument(get().nodes, get().edges);
      layoutRuntime.cancel(true);
      layoutRuntime.queue({ routingOnly: true });
      get().fitToView();
      get().addToast("스냅샷을 복원했습니다 (⌘Z로 되돌리기 가능)", "success");
    },

    deleteSnapshot: (snapshotId) => {
      const { activeDocumentId } = get();
      if (!activeDocumentId) return;
      set((s) => ({
        documents: s.documents.map((d) =>
          d.id === activeDocumentId
            ? {
                ...d,
                snapshots: (d.snapshots ?? []).filter(
                  (sn) => sn.id !== snapshotId,
                ),
              }
            : d,
        ),
        revision: s.revision + 1,
      }));
    },

    // ── Relations (free-form cross links) ──
    setConnectMode: (on) => set({ connectMode: on, selectedRelationId: null }),

    addRelation: (source, target) => {
      if (source === target) return;
      const { relations, nodes } = get();
      const ids = new Set(nodes.map((n) => n.id));
      if (!ids.has(source) || !ids.has(target)) return;
      // Ignore duplicates (either direction) and links mirroring a tree edge.
      const dup = relations.some(
        (r) =>
          (r.source === source && r.target === target) ||
          (r.source === target && r.target === source),
      );
      const map = getNodeMap(nodes);
      const treeEdge =
        map.get(target)?.data.parentId === source ||
        map.get(source)?.data.parentId === target;
      if (dup || treeEdge) {
        get().addToast("이미 연결되어 있습니다", "info");
        return;
      }
      get().pushHistory();
      const rel: MindMapRelation = { id: createId("rel"), source, target };
      set((s) => ({
        relations: [...s.relations, rel],
        selectedRelationId: rel.id,
      }));
      syncActiveDocument(get().nodes, get().edges);
      get().addToast("관계선을 연결했습니다", "success");
    },

    removeRelation: (id) => {
      if (!get().relations.some((r) => r.id === id)) return;
      get().pushHistory();
      set((s) => ({
        relations: s.relations.filter((r) => r.id !== id),
        selectedRelationId:
          s.selectedRelationId === id ? null : s.selectedRelationId,
      }));
      syncActiveDocument(get().nodes, get().edges);
    },

    updateRelationLabel: (id, label) => {
      const relation = get().relations.find((r) => r.id === id);
      if (!relation || (relation.label ?? "") === label.trim()) return;
      get().pushHistory();
      set((s) => ({
        relations: s.relations.map((r) =>
          r.id === id ? { ...r, label: label.trim() || undefined } : r,
        ),
      }));
      syncActiveDocument(get().nodes, get().edges);
    },

    selectRelation: (id) => set({ selectedRelationId: id }),

    // Shift a set of nodes by a delta (used to drag a subtree together).
    moveNodesBy: (ids, dx, dy) => {
      if (!ids.length || (dx === 0 && dy === 0)) return;
      const idset = new Set(ids);
      const next = get().nodes.map((n) =>
        idset.has(n.id)
          ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } }
          : n,
      );
      layoutRuntime.record({ ...get(), nodes: next });
      set({ nodes: next });
      syncActiveDocument(next, get().edges, false);
    },

    // ── Canvas ──
    onNodesChange: (changes) => {
      // Selection changes (click / marquee) feed the store's selection state
      // instead of node.selected — the store is the single source of truth,
      // and letting both fight causes an infinite update loop.
      const selectChanges = changes.filter((c) => c.type === "select");
      if (selectChanges.length) {
        const cur = new Set(get().selectedNodeIds);
        for (const c of selectChanges) {
          if (c.selected) cur.add(c.id);
          else cur.delete(c.id);
        }
        const ids = [...cur];
        const same =
          ids.length === get().selectedNodeIds.length &&
          ids.every((id) => get().selectedNodeIds.includes(id));
        if (!same) {
          set({
            selectedNodeIds: ids,
            selectedNodeId: ids.length ? ids[ids.length - 1] : null,
          });
        }
      }
      const rest = changes.filter((c) => c.type !== "select");
      if (!rest.length) return;
      const before = get().nodes;
      const normalized = rest.map((c) =>
        c.type === "dimensions" && c.dimensions
          ? {
              ...c,
              dimensions: {
                width: Math.ceil(c.dimensions.width * 2) / 2,
                height: Math.ceil(c.dimensions.height * 2) / 2,
              },
            }
          : c,
      );
      let next = applyNodeChanges(normalized, before) as MindMapNode[];
      // Collapsed boundaries carry hidden descendants even on a normal drag.
      // An explicit position in the same batch wins, preventing double deltas.
      const moved = new Map(
        rest.flatMap((c) =>
          c.type === "position" && c.position ? [[c.id, c] as const] : [],
        ),
      );
      const translated = new Set<string>();
      const deltas = new Map<string, { x: number; y: number }>();
      for (const n of before) {
        const c = moved.get(n.id);
        if (
          !n.data.collapsed ||
          !c ||
          c.type !== "position" ||
          !c.position ||
          translated.has(n.id)
        )
          continue;
        const delta = {
          x: c.position.x - n.position.x,
          y: c.position.y - n.position.y,
        };
        for (const id of getDescendantIds(before, n.id)) {
          translated.add(id);
          if (!moved.has(id) && !deltas.has(id)) deltas.set(id, delta);
        }
      }
      if (deltas.size)
        next = next.map((n) => {
          const d = deltas.get(n.id);
          return d
            ? {
                ...n,
                position: { x: n.position.x + d.x, y: n.position.y + d.y },
              }
            : n;
        });
      const positioned = rest.some((c) => c.type === "position" && c.position);
      if (positioned) layoutRuntime.record({ ...get(), nodes: next });
      set({ nodes: next });
      // Measurements are transient geometry; they do not dirty storage/history.
      if (
        positioned ||
        rest.some((c) => c.type === "remove" || c.type === "add")
      )
        syncActiveDocument(next, get().edges, false);
      else if (rest.some((c) => c.type === "dimensions"))
        layoutRuntime.dimensionsChanged();
    },

    onEdgesChange: (changes) => {
      const next = applyEdgeChanges(changes, get().edges);
      set({ edges: next });
    },

    setNodes: (nodes) => {
      set({ nodes });
      syncActiveDocument(nodes, get().edges, false);
    },

    setEdges: (edges) => {
      set({ edges });
      syncActiveDocument(get().nodes, edges, false);
    },

    updateViewport: (viewport) => {
      const { activeDocumentId, documents } = get();
      if (!activeDocumentId) return;
      set({
        documents: documents.map((d) =>
          d.id === activeDocumentId ? { ...d, viewport } : d,
        ),
      });
    },

    autoLayout: (mode) => {
      layoutRuntime.begin("layout");
      layoutRuntime.queue({
        strategy: "full",
        mode: mode ?? get().activeLayoutMode,
        routingOnly: false,
      });
    },

    autoLayoutSubtree: (nodeId, mode) => {
      if (!get().nodes.some((n) => n.id === nodeId)) return;
      layoutRuntime.begin("layout");
      layoutRuntime.queue({
        strategy: "subtree",
        subtreeRootId: nodeId,
        mode: mode ?? get().activeLayoutMode,
        routingOnly: false,
      });
    },

    fitToView: () => {
      const { flow } = get();
      if (!flow) return;
      requestAnimationFrame(() => {
        const canvas = document.querySelector<HTMLElement>(
          '[data-mindmap-canvas="true"]',
        );
        const canvasRect = canvas?.getBoundingClientRect();
        const isCompact = (canvasRect?.width ?? window.innerWidth) < 768;
        let left = 24;
        let right = 24;
        let bottom = 24;

        // Tablet/laptop panels float above the canvas. Fit against the actual
        // visible work area so the root or outer branches never land behind a
        // panel. Wide-screen inline panels sit outside the canvas and therefore
        // contribute no inset here.
        if (canvas && canvasRect) {
          const leftPanel = document.querySelector<HTMLElement>(
            '[data-floating-panel="left"]',
          );
          const rightPanel = document.querySelector<HTMLElement>(
            '[data-floating-panel="right"]',
          );
          const leftRect = leftPanel?.getBoundingClientRect();
          const rightRect = rightPanel?.getBoundingClientRect();

          if (leftRect && leftRect.right > canvasRect.left) {
            left = Math.max(left, leftRect.right - canvasRect.left + 16);
          }
          if (rightRect && rightRect.left < canvasRect.right) {
            right = Math.max(right, canvasRect.right - rightRect.left + 16);
          }

          // The minimap owns the lower-right corner. Reserving its vertical
          // footprint is enough to keep nodes above it without squeezing the
          // map from two axes at once.
          const miniMap = canvas.querySelector<HTMLElement>(
            ".react-flow__minimap",
          );
          const miniMapRect = miniMap?.getBoundingClientRect();
          if (miniMapRect && miniMapRect.height > 0) {
            bottom = Math.max(bottom, canvasRect.bottom - miniMapRect.top + 16);
          }
        }

        const visible = flow.getNodes().filter((n) => !n.hidden);
        let bounds = boundsOf(visible.map((n) => nodeRect(n as MindMapNode)));
        const displayedEdges = new Set(
          flow
            .getEdges()
            .filter((e) => !e.hidden)
            .map((e) => e.id),
        );
        const inkRect = inkBounds(get().ink);
        if (inkRect) bounds = bounds ? union(bounds, inkRect) : inkRect;
        for (const [id, route] of Object.entries(get().layoutRoutes))
          if (displayedEdges.has(id)) bounds = union(bounds, route.bounds);
        if (!canvasRect) return;
        if (!bounds) {
          flow.setViewport({
            x: canvasRect.width / 2,
            y: canvasRect.height / 2,
            zoom: 1,
          });
          return;
        }
        let top = isCompact ? 16 : 24;
        if (isCompact) {
          left = 16;
          right = 16;
          bottom = 16;
        }
        const inkToolbar = canvas
          ?.querySelector<HTMLElement>("[data-ink-toolbar]")
          ?.getBoundingClientRect();
        if (inkToolbar)
          bottom = Math.max(bottom, canvasRect.bottom - inkToolbar.top + 16);
        const inkModeBar = canvas
          ?.querySelector<HTMLElement>("[data-ink-modebar]")
          ?.getBoundingClientRect();
        if (inkModeBar && !inkToolbar)
          top = Math.max(top, inkModeBar.bottom - canvasRect.top + 16);
        const width = Math.max(1, canvasRect.width - left - right);
        const height = Math.max(1, canvasRect.height - top - bottom);
        const natural =
          Math.min(
            width / Math.max(1, bounds.width),
            height / Math.max(1, bounds.height),
          ) * 0.9;
        const min = isCompact && natural >= 0.35 ? 0.35 : 0.0001;
        const zoom = Math.max(min, Math.min(1.2, natural));
        flow.setViewport(
          {
            x: left + (width - bounds.width * zoom) / 2 - bounds.x * zoom,
            y: top + (height - bounds.height * zoom) / 2 - bounds.y * zoom,
            zoom,
          },
          {
            duration: window.matchMedia("(prefers-reduced-motion: reduce)")
              .matches
              ? 0
              : 400,
          },
        );
      });
    },

    focusNode: (nodeId) => {
      const { flow, nodes } = get();
      if (!flow) return;
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      flow.setCenter(
        node.position.x + nodeSize(node).width / 2,
        node.position.y + nodeSize(node).height / 2,
        {
          zoom: Math.max(flow.getZoom?.() ?? 1, 1),
          duration: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? 0
            : 450,
        },
      );
    },

    // ── Search / command ──
    setSearchQuery: (query) => set({ searchQuery: query }),
    toggleSearchType: (type) =>
      set((s) => ({
        searchTypes: s.searchTypes.includes(type)
          ? s.searchTypes.filter((t) => t !== type)
          : [...s.searchTypes, type],
      })),
    toggleSearchStatus: (status) =>
      set((s) => ({
        searchStatuses: s.searchStatuses.includes(status)
          ? s.searchStatuses.filter((t) => t !== status)
          : [...s.searchStatuses, status],
      })),
    setSearchOpen: (open) => set({ searchOpen: open }),

    openCommandPalette: () => set({ commandPaletteOpen: true }),
    closeCommandPalette: () => set({ commandPaletteOpen: false }),

    executeCommand: (commandId) => {
      const s = get();
      s.closeCommandPalette();
      switch (commandId) {
        case "new-map":
          s.createDocument();
          break;
        case "add-child":
          if (s.selectedNodeId) s.addChildNode(s.selectedNodeId);
          else s.addToast("노드를 먼저 선택하세요", "info");
          break;
        case "add-sibling":
          if (s.selectedNodeId) s.addSiblingNode(s.selectedNodeId);
          else s.addToast("노드를 먼저 선택하세요", "info");
          break;
        case "auto-layout":
          s.autoLayout();
          break;
        case "open-search":
          s.setSearchOpen(true);
          break;
        case "open-templates":
          s.setDialog("template");
          break;
        case "toggle-theme":
          s.toggleTheme();
          break;
        case "export-json":
          s.setDialog("export");
          break;
        case "export-png":
          s.exportImage("png");
          break;
        case "import-json":
          s.setImportTab("json");
          s.setDialog("import");
          break;
        case "import-outline":
          s.setImportTab("outline");
          s.setDialog("import");
          break;
        case "share-link":
          s.setDialog("share");
          break;
        case "load-sample":
          s.createDocument("project-plan");
          break;
        case "presentation":
          s.openPresentationMode();
          break;
      }
    },

    // ── History ──
    pushHistory: () => {
      layoutRuntime.begin("edit");
      layoutRuntime.recordBefore();
    },

    undo: () => {
      if (get().inkGestureActive) return;
      layoutRuntime.cancel(true);
      const { history, nodes, edges, relations } = get();
      if (history.length === 0) return;
      const prev = history[history.length - 1];
      const current: HistoryEntry = {
        ink: get().ink,
        boardMode: get().boardMode,
        layoutMode: get().activeLayoutMode,
        nodes: nodes.map(cloneNode),
        edges: edges.map((e) => ({ ...e })),
        relations: relations.map((r) => ({ ...r })),
      };
      set((s) => ({
        ink: prev.ink ?? EMPTY_INK,
        ...inkSelectionFor(prev.ink ?? EMPTY_INK),
        boardMode: prev.boardMode ?? get().boardMode,
        nodes: prev.nodes,
        activeLayoutMode: prev.layoutMode ?? "right-tree",
        edges: prev.edges,
        relations: prev.relations ?? [],
        history: history.slice(0, -1),
        future: [current, ...s.future].slice(0, HISTORY_LIMIT),
      }));
      syncActiveDocument(prev.nodes, prev.edges);
      layoutRuntime.cancel(true);
      layoutRuntime.queue({ routingOnly: true });
    },

    redo: () => {
      if (get().inkGestureActive) return;
      layoutRuntime.cancel(true);
      const { future, nodes, edges, relations } = get();
      if (future.length === 0) return;
      const nextEntry = future[0];
      const current: HistoryEntry = {
        ink: get().ink,
        boardMode: get().boardMode,
        layoutMode: get().activeLayoutMode,
        nodes: nodes.map(cloneNode),
        edges: edges.map((e) => ({ ...e })),
        relations: relations.map((r) => ({ ...r })),
      };
      set((s) => ({
        ink: nextEntry.ink ?? EMPTY_INK,
        ...inkSelectionFor(nextEntry.ink ?? EMPTY_INK),
        boardMode: nextEntry.boardMode ?? get().boardMode,
        nodes: nextEntry.nodes,
        activeLayoutMode: nextEntry.layoutMode ?? "right-tree",
        edges: nextEntry.edges,
        relations: nextEntry.relations ?? [],
        history: [...s.history, current].slice(-HISTORY_LIMIT),
        future: future.slice(1),
      }));
      syncActiveDocument(nextEntry.nodes, nextEntry.edges);
      layoutRuntime.cancel(true);
      layoutRuntime.queue({ routingOnly: true });
    },

    // ── IO ──
    exportJson: () => {
      const { documents, activeDocumentId } = get();
      const doc = documents.find((d) => d.id === activeDocumentId);
      if (!doc) return "";
      return exportDocumentJson({
        ...doc,
        nodes: get().nodes,
        edges: get().edges,
        relations: get().relations,
        layoutMode: get().activeLayoutMode,
        appearance: appearanceFrom(get()),
      });
    },

    importJson: (json) => {
      const result = parseImportJson(json);
      if (!result.ok) {
        get().addToast(`가져오기 실패: ${result.error}`, "error");
        return false;
      }
      const doc = makeDocument(
        result.document.title,
        result.document.nodes,
        result.document.edges.length
          ? result.document.edges
          : buildEdgesFromNodes(result.document.nodes),
      );
      doc.ink = result.document.ink;
      doc.boardMode = result.document.boardMode;
      doc.inkSettings = result.document.inkSettings;
      doc.viewport = result.document.viewport;
      doc.layoutMode = result.document.layoutMode;
      doc.relations = result.document.relations ?? [];
      doc.appearance = result.document.appearance;
      doc.snapshots = result.document.snapshots;
      doc.pinned = result.document.pinned;
      set((s) => ({
        documents: [doc, ...preserveDocumentDesign(s.documents, s)],
        activeDocumentId: doc.id,
        freshDocumentId: null,
        ...inkFor(doc),
        nodes: doc.nodes,
        edges: doc.edges,
        relations: doc.relations ?? [],
        selectedRelationId: null,
        activeLayoutMode: doc.layoutMode ?? "right-tree",
        ...activateAppearance(doc, get()),
        editingNodeId: null,
        ...selectionFor(getRootNode(doc.nodes)?.id ?? null),
        history: [],
        future: [],
        dialog: null,
        revision: s.revision + 1,
      }));
      get().addToast("문서를 가져왔습니다", "success");
      get().fitToView();
      return true;
    },

    // Add a document decoded from a share link as a NEW copy in this workspace
    // (never overwrites existing maps). The share code is untrusted input, so
    // decodeSharedDocument validates + sanitizes before we touch state.
    importSharedDocument: (code) => {
      const result = decodeSharedDocument(code);
      if (!result.ok) {
        get().addToast(`공유 링크를 열 수 없습니다: ${result.error}`, "error");
        return false;
      }
      const doc = makeDocument(
        result.document.title,
        result.document.nodes,
        result.document.edges.length
          ? result.document.edges
          : buildEdgesFromNodes(result.document.nodes),
      );
      doc.relations = result.document.relations ?? [];
      doc.appearance = appearanceFrom(get());
      // Preserve the sharer's layout so edge-face routing matches immediately.
      if (result.layoutMode) doc.layoutMode = result.layoutMode;
      set((s) => ({
        documents: [doc, ...s.documents],
        activeDocumentId: doc.id,
        ...inkFor(doc),
        nodes: doc.nodes,
        edges: doc.edges,
        relations: doc.relations ?? [],
        selectedRelationId: null,
        activeLayoutMode: doc.layoutMode ?? "right-tree",
        ...selectionFor(getRootNode(doc.nodes)?.id ?? null),
        history: [],
        future: [],
        dialog: null,
        revision: s.revision + 1,
      }));
      get().addToast("공유된 맵을 사본으로 추가했습니다", "success");
      get().fitToView();
      return true;
    },

    importOutline: (text) => {
      const result = parseOutlineToTree(text);
      if (!result) {
        get().addToast("가져올 내용이 없습니다", "error");
        return false;
      }
      const doc = makeDocument(result.title, result.nodes, result.edges);
      doc.appearance = appearanceFrom(get());
      set((s) => ({
        documents: [doc, ...s.documents],
        activeDocumentId: doc.id,
        ...inkFor(doc),
        nodes: doc.nodes,
        edges: doc.edges,
        relations: [],
        selectedRelationId: null,
        activeLayoutMode: DEFAULT_LAYOUT_MODE,
        ...selectionFor(getRootNode(doc.nodes)?.id ?? null),
        history: [],
        future: [],
        dialog: null,
        revision: s.revision + 1,
      }));
      get().addToast(
        `아웃라인을 가져왔습니다 (노드 ${result.nodes.length}개)`,
        "success",
      );
      if (doc.nodes.length > 200)
        layoutRuntime.queue({
          strategy: "full",
          mode: DEFAULT_LAYOUT_MODE,
          routingOnly: false,
        });
      else get().fitToView();
      return true;
    },

    exportMarkdown: () => {
      const { documents, activeDocumentId } = get();
      const doc = documents.find((d) => d.id === activeDocumentId);
      return doc ? exportMarkdown(doc) : "";
    },

    exportOutlineText: () => {
      const { documents, activeDocumentId } = get();
      const doc = documents.find((d) => d.id === activeDocumentId);
      return doc ? exportOutlineText(doc) : "";
    },

    // Both dialog previews and direct downloads use this same settled graph.
    renderImage: async (format) => {
      if (get().inkGestureActive)
        throw new Error("획을 마친 뒤 이미지를 저장하세요.");
      const id = get().activeDocumentId;
      const checkDocument = () => {
        if (id !== get().activeDocumentId)
          throw new Error(
            "문서가 바뀌었습니다. 현재 문서에서 다시 저장하세요.",
          );
      };
      // html-to-image temporarily changes live edge SVGs. Serialize captures
      // so rapid tab changes / repeated saves cannot restore each other's DOM.
      const task = imageQueue.then(async () => {
        checkDocument();
        await ensureDocumentFont(
          get().font,
          get()
            .nodes.map((n) => n.data.label)
            .join(" "),
        );
        // FontFaceSet completion precedes ResizeObserver / React Flow measurement.
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        await get().settleLayout();
        checkDocument();
        const url = await renderCanvasImage(
          get().nodes,
          format,
          Object.values(get().layoutRoutes),
          get().ink,
        );
        checkDocument();
        return url;
      });
      imageQueue = task.catch(() => undefined);
      return task;
    },

    exportImage: async (format) => {
      const { documents, activeDocumentId } = get();
      const doc = documents.find((d) => d.id === activeDocumentId);
      try {
        const url = await get().renderImage(format);
        const name = `${safeFileName(doc?.title ?? "mindbranch")}.${format}`;
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        get().addToast(`${name} 다운로드를 시작했습니다`, "success");
      } catch (e) {
        get().addToast(
          e instanceof Error ? e.message : "이미지 저장에 실패했습니다",
          "error",
        );
      }
    },

    // ── UI ──
    toggleTheme: () => {
      const order: MindMapTheme[] = ["light", "dark", "system"];
      const current = get().theme;
      const next = order[(order.indexOf(current) + 1) % order.length];
      get().setTheme(next);
    },

    setTheme: (theme) => {
      applyThemeClass(theme);
      setAppearance({ theme });
    },

    setFont: (font) => setAppearance({ font }),

    setNodeStyle: (nodeStyle) => setAppearance({ nodeStyle }),

    setEdgeStyle: (edgeStyle) => setAppearance({ edgeStyle }),
    setEdgeAnimated: (edgeAnimated) => setAppearance({ edgeAnimated }),
    setEdgeWidth: (edgeWidth) => setAppearance({ edgeWidth }),
    setEdgeColorMode: (edgeColorMode) => setAppearance({ edgeColorMode }),
    setEdgeLine: (edgeLine) => setAppearance({ edgeLine }),

    // One-tap curated look: applies the preset's whole combination at once.
    // Never touches the user's light/dark theme preference.
    applyThemePreset: (presetId) => {
      const preset = THEME_PRESETS.find((p) => p.id === presetId);
      if (!preset) return;
      const st = preset.settings;
      setAppearance({
        nodeStyle: st.nodeStyle,
        edgeStyle: st.edgeStyle,
        edgeWidth: st.edgeWidth,
        edgeColorMode: st.edgeColorMode,
        edgeLine: st.edgeLine,
        edgeAnimated: st.edgeAnimated,
        rainbowBranches: st.rainbowBranches,
        nodeTint: st.nodeTint,
        canvasBg: st.canvasBg,
      });
      const isDark =
        typeof document !== "undefined" &&
        document.documentElement.classList.contains("dark");
      get().addToast(
        presetId === "neon" && !isDark
          ? "프리셋: 네온 — 다크 테마에서 가장 멋져요"
          : `프리셋: ${preset.label}`,
        "success",
      );
    },

    setNodeTint: (nodeTint) => setAppearance({ nodeTint }),
    setCanvasBg: (canvasBg) => setAppearance({ canvasBg }),
    setRainbowBranches: (rainbowBranches) => setAppearance({ rainbowBranches }),
    setAccent: (accent) => {
      applyAccentAttr(accent);
      setAppearance({ accent });
    },

    setLevelFontSize: (level, size) => {
      const clamped = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, size));
      const next = [...get().levelFontSizes];
      next[level] = clamped;
      setAppearance({ levelFontSizes: next });
    },

    resetLevelFontSizes: () =>
      setAppearance({
        levelFontSizes: [...DEFAULT_LEVEL_FONT_SIZES],
      }),

    toggleSidebar: () =>
      set((s) => ({
        sidebarCollapsed: !s.sidebarCollapsed,
        revision: s.revision + 1,
      })),

    toggleInspector: () =>
      set((s) => ({
        inspectorOpen: !s.inspectorOpen,
        revision: s.revision + 1,
      })),

    setInspectorOpen: (open) => set({ inspectorOpen: open }),

    setDialog: (dialog) => set({ dialog, mobileMoreOpen: false }),

    setImportTab: (importTab) => set({ importTab }),

    openContextMenu: (nodeId, x, y) =>
      set({
        contextMenu: { nodeId, x, y },
        selectedNodeId: nodeId,
        selectedNodeIds: [nodeId],
      }),
    closeContextMenu: () => set({ contextMenu: null }),

    setOutlineOpen: (open) => set({ outlineOpen: open }),
    setMobileDrawerOpen: (open) => set({ mobileDrawerOpen: open }),
    setMobileMoreOpen: (open) => set({ mobileMoreOpen: open }),
    setMobileSheetOpen: (open) => set({ mobileSheetOpen: open }),

    openPresentationMode: () => {
      const { selectedNodeId, nodes } = get();
      const order = getVisibleDfsOrder(nodes);
      // Start from the selected node's step (or the root) so a presenter can
      // jump into the middle of a large map.
      const idx = Math.max(0, order.indexOf(selectedNodeId ?? ""));
      const target = order[idx] ?? null;
      set({
        presentationMode: true,
        presentationIndex: idx,
        ...selectionFor(target),
        contextMenu: null,
        editingNodeId: null,
      });
      if (target) focusSoon(target);
    },
    closePresentationMode: () => {
      set({ presentationMode: false, presentationIndex: 0 });
      get().fitToView();
    },

    presentationNext: () => {
      const order = getVisibleDfsOrder(get().nodes);
      const idx = Math.min(order.length - 1, get().presentationIndex + 1);
      const next = order[idx];
      if (next) {
        set({ presentationIndex: idx, ...selectionFor(next) });
        get().focusNode(next);
      }
    },
    presentationPrev: () => {
      const order = getVisibleDfsOrder(get().nodes);
      const idx = Math.max(0, get().presentationIndex - 1);
      const prev = order[idx];
      if (prev) {
        set({ presentationIndex: idx, ...selectionFor(prev) });
        get().focusNode(prev);
      }
    },
  };
});

// Selector helpers used across components.
export function selectActiveDocument(
  s: MindMapState,
): MindMapDocument | undefined {
  return s.documents.find((d) => d.id === s.activeDocumentId);
}

export function selectSelectedNode(s: MindMapState): MindMapNode | undefined {
  return s.nodes.find((n) => n.id === s.selectedNodeId);
}

export { getChildrenMap, getDescendantIds };

layoutRuntime = new LayoutRuntime(
  () => useMindMapStore.getState(),
  (patch) => useMindMapStore.setState(patch),
);
useMindMapStore.subscribe((state, before) =>
  layoutRuntime.observe(state, before),
);
