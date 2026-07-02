"use client";

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
  DEFAULT_CANVAS_BG,
  DEFAULT_FONT,
  DEFAULT_LEVEL_FONT_SIZES,
  DEFAULT_NODE_LABEL,
  DEFAULT_NODE_STYLE,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  NODE_HEIGHT,
  NODE_TYPE_CONFIG,
  NODE_WIDTH,
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
import { runLayout, runSubtreeLayout } from "@/lib/layout";
import {
  loadWorkspaceFromStorage,
  saveWorkspaceToStorage,
} from "@/lib/storage";
import { buildTemplate, templateTitle } from "@/lib/templates";
import {
  buildEdgesFromNodes,
  getChildrenMap,
  getDescendantIds,
  getNodeMap,
  getRootNode,
  getSubtreeIds,
  getVisibleDfsOrder,
} from "@/lib/tree";
import { parseImportJson } from "@/lib/validation";
import type {
  BranchSide,
  Edge,
  LayoutMode,
  MindMapDocument,
  MindMapNode,
  MindMapNodeData,
  MindMapRelation,
  MindMapTheme,
  SaveStatus,
  TemplateType,
} from "@/types/mindmap";

export type ToastType = "success" | "error" | "info";
export type Toast = { id: string; message: string; type: ToastType };
export type DialogType = "template" | "export" | "import" | "shortcuts" | null;
export type ContextMenuState = { nodeId: string; x: number; y: number } | null;

const HISTORY_LIMIT = 60;

type HistoryEntry = {
  nodes: MindMapNode[];
  edges: Edge[];
  relations: MindMapRelation[];
};

export type MindMapState = {
  // ── Data ──
  documents: MindMapDocument[];
  activeDocumentId: string | null;
  nodes: MindMapNode[];
  edges: Edge[];
  relations: MindMapRelation[];

  // ── Selection / editing ──
  selectedNodeId: string | null; // primary selection (inspector / single-node UI)
  selectedNodeIds: string[]; // full multi-selection set
  editingNodeId: string | null;
  dropTargetId: string | null; // node currently hovered as a re-parent target
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
  nodeTint: boolean;
  canvasBg: string;
  accent: string;
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
  saveStatus: SaveStatus;
  lastSavedAt: string | null;
  revision: number;
  hydrated: boolean;

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
  addToast: (message: string, type?: ToastType) => void;
  dismissToast: (id: string) => void;

  // ── Document actions ──
  createDocument: (templateType?: TemplateType) => void;
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
  setEditingNode: (nodeId: string | null) => void;
  moveNodesBy: (ids: string[], dx: number, dy: number) => void;
  bulkUpdateData: (ids: string[], partial: Partial<MindMapNodeData>) => void;
  bulkDelete: (ids: string[]) => void;
  setDropTargetId: (id: string | null) => void;
  reparentNode: (nodeId: string, newParentId: string) => void;

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
  importOutline: (text: string) => boolean;
  exportMarkdown: () => string;
  exportOutlineText: () => string;
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
  setNodeTint: (on: boolean) => void;
  setCanvasBg: (bg: string) => void;
  setAccent: (accent: string) => void;
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

function makeDocument(
  title: string,
  nodes: MindMapNode[],
  edges: Edge[]
): MindMapDocument {
  const ts = nowIso();
  return {
    id: createId("doc"),
    title,
    nodes,
    edges,
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
  return makeDocument("MindForge 시작하기", nodes, edges);
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

export const useMindMapStore = create<MindMapState>((set, get) => {
  // Write the live nodes/edges back into the active document and mark dirty.
  // Relations referencing deleted nodes are pruned here — every node mutation
  // funnels through this, so it's the single cleanup choke point.
  function syncActiveDocument(
    nodes: MindMapNode[],
    edges: Edge[],
    touch = true
  ) {
    const { activeDocumentId, documents } = get();
    if (!activeDocumentId) return;
    const nodeIds = new Set(nodes.map((n) => n.id));
    const relations = get().relations.filter(
      (r) => nodeIds.has(r.source) && nodeIds.has(r.target)
    );
    const updated = documents.map((d) =>
      d.id === activeDocumentId
        ? {
            ...d,
            nodes,
            edges,
            relations,
            updatedAt: touch ? nowIso() : d.updatedAt,
          }
        : d
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
    producer: (nodes: MindMapNode[], edges: Edge[]) => {
      nodes: MindMapNode[];
      edges: Edge[];
    },
    record = true
  ) {
    const { nodes, edges } = get();
    if (record) get().pushHistory();
    const next = producer(nodes, edges);
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
    documents: [],
    activeDocumentId: null,
    nodes: [],
    edges: [],
    relations: [],

    selectedNodeId: null,
    selectedNodeIds: [],
    editingNodeId: null,
    dropTargetId: null,
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
    nodeTint: false,
    canvasBg: DEFAULT_CANVAS_BG,
    accent: DEFAULT_ACCENT,
    dialog: null,
    importTab: "json",
    contextMenu: null,
    outlineOpen: true,
    mobileDrawerOpen: false,
    mobileMoreOpen: false,
    mobileSheetOpen: false,

    history: [],
    future: [],

    saveStatus: "idle",
    lastSavedAt: null,
    revision: 0,
    hydrated: false,

    presentationMode: false,
    presentationIndex: 0,
    presentationReveal: true,
    setPresentationReveal: (presentationReveal) => set({ presentationReveal }),
    activeLayoutMode: "right-tree",

    flow: null,
    registerFlow: (instance) => set({ flow: instance }),

    toasts: [],
    addToast: (message, type = "info") =>
      set((s) => ({
        toasts: [...s.toasts, { id: createId("t"), message, type }],
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
              })()
            )
          : blankRootDocument();
      set((s) => ({
        documents: [doc, ...s.documents],
        activeDocumentId: doc.id,
        nodes: doc.nodes,
        edges: doc.edges,
        relations: [],
        selectedRelationId: null,
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

    duplicateDocument: (documentId) => {
      const { documents } = get();
      const src = documents.find((d) => d.id === documentId);
      if (!src) return;
      const copy = makeDocument(
        `${src.title} (복사본)`,
        src.nodes.map(cloneNode),
        src.edges.map((e) => ({ ...e }))
      );
      copy.relations = (src.relations ?? []).map((r) => ({ ...r }));
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
        nodes: wasActive ? nextDocs[0].nodes : s.nodes,
        edges: wasActive ? nextDocs[0].edges : s.edges,
        relations: wasActive ? nextDocs[0].relations ?? [] : s.relations,
        selectedRelationId: wasActive ? null : s.selectedRelationId,
        ...(wasActive
          ? selectionFor(getRootNode(nextDocs[0].nodes)?.id ?? null)
          : {}),
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
          d.id === documentId ? { ...d, title, updatedAt: nowIso() } : d
        ),
        revision: s.revision + 1,
      }));
    },

    // Pin toggling doesn't touch updatedAt — pinning shouldn't reorder the
    // "recent" sort or make an untouched document look freshly edited.
    toggleDocumentPin: (documentId) => {
      set((s) => ({
        documents: s.documents.map((d) =>
          d.id === documentId ? { ...d, pinned: !d.pinned } : d
        ),
        revision: s.revision + 1,
      }));
    },

    setActiveDocument: (documentId) => {
      const { documents } = get();
      const doc = documents.find((d) => d.id === documentId);
      if (!doc) return;
      set((s) => ({
        activeDocumentId: documentId,
        nodes: doc.nodes,
        edges: doc.edges,
        relations: doc.relations ?? [],
        selectedRelationId: null,
        connectMode: false,
        ...selectionFor(getRootNode(doc.nodes)?.id ?? null),
        editingNodeId: null,
        history: [],
        future: [],
        mobileDrawerOpen: false,
        revision: s.revision + 1,
      }));
      get().fitToView();
    },

    loadWorkspace: () => {
      const result = loadWorkspaceFromStorage();
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
        applyThemeClass(ws.theme);
        applyAccentAttr(ws.accent ?? DEFAULT_ACCENT);
        set({
          documents,
          activeDocumentId: activeId,
          nodes: active.nodes,
          edges: active.edges,
          relations: active.relations ?? [],
          ...selectionFor(getRootNode(active.nodes)?.id ?? null),
          theme: ws.theme,
          font: ws.font ?? DEFAULT_FONT,
          nodeStyle: ws.nodeStyle ?? DEFAULT_NODE_STYLE,
          levelFontSizes: ws.levelFontSizes ?? [...DEFAULT_LEVEL_FONT_SIZES],
          edgeStyle: ws.edgeStyle ?? "curved",
          edgeAnimated: ws.edgeAnimated ?? false,
          edgeWidth: ws.edgeWidth ?? 2,
          edgeColorMode: ws.edgeColorMode ?? "default",
          nodeTint: ws.nodeTint ?? false,
          canvasBg: ws.canvasBg ?? DEFAULT_CANVAS_BG,
          accent: ws.accent ?? DEFAULT_ACCENT,
          sidebarCollapsed: ws.sidebarCollapsed,
          inspectorOpen: ws.inspectorOpen,
          hydrated: true,
          lastSavedAt: nowIso(),
          saveStatus: "saved",
        });
      } else {
        // Empty or corrupted → start fresh with a sample document.
        const sample = sampleDocument();
        applyThemeClass("system");
        set({
          documents: [sample],
          activeDocumentId: sample.id,
          nodes: sample.nodes,
          edges: sample.edges,
          relations: [],
          ...selectionFor(getRootNode(sample.nodes)?.id ?? null),
          hydrated: true,
        });
        if ("corrupted" in result && result.corrupted) {
          get().addToast(
            "저장된 데이터를 불러오지 못해 새 워크스페이스를 시작합니다",
            "error"
          );
        }
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
        nodeTint,
        canvasBg,
        accent,
        sidebarCollapsed,
        inspectorOpen,
        hydrated,
      } = get();
      if (!hydrated) return;
      set({ saveStatus: "saving" });
      const ok = saveWorkspaceToStorage({
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
        nodeTint,
        canvasBg,
        accent,
        sidebarCollapsed,
        inspectorOpen,
      });
      set({
        saveStatus: ok ? "saved" : "error",
        lastSavedAt: ok ? nowIso() : get().lastSavedAt,
      });
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
        position: { ...parent.position }, // temporary; auto-layout repositions it
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
          n.id === parentId ? { ...n, data: { ...n.data, collapsed: false } } : n
        );
        const withNew = [...expanded, newNode];
        // Re-run the active layout so the new node never overlaps siblings.
        const laid = runLayout(withNew, get().activeLayoutMode);
        return { nodes: laid, edges: buildEdgesFromNodes(laid) };
      });
      set({ ...selectionFor(id), editingNodeId: id });
      focusSoon(id);
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
      commit(
        (nds, eds) => ({
          nodes: nds.map((n) =>
            n.id === nodeId ? { ...n, data: { ...n.data, label } } : n
          ),
          edges: eds,
        }),
        false // label edits are noisy; skip per-keystroke history
      );
    },

    updateNodeData: (nodeId, partial) => {
      commit((nds, eds) => ({
        nodes: nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, ...partial } } : n
        ),
        edges: eds,
      }));
    },

    deleteNode: (nodeId) => {
      const { nodes } = get();
      const node = getNodeMap(nodes).get(nodeId);
      if (!node) return;
      if (node.data.isRoot || !node.data.parentId) {
        get().addToast("루트 노드는 삭제할 수 없습니다", "error");
        return;
      }
      const parentId = node.data.parentId;
      commit((nds, eds) => {
        // reparent children to the deleted node's parent
        const nextNodes = nds
          .filter((n) => n.id !== nodeId)
          .map((n) =>
            n.data.parentId === nodeId
              ? { ...n, data: { ...n.data, parentId } }
              : n
          );
        return { nodes: nextNodes, edges: buildEdgesFromNodes(nextNodes) };
      });
      set((s) => ({
        ...selectionFor(parentId),
        editingNodeId: null,
        mobileSheetOpen: false,
        contextMenu: null,
        history: s.history,
      }));
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
        return { nodes: nextNodes, edges: buildEdgesFromNodes(nextNodes) };
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
      const idMap = new Map<string, string>();
      for (const oldId of subtreeIds) idMap.set(oldId, createId("n"));
      const clones: MindMapNode[] = subtreeIds.map((oldId) => {
        const original = getNodeMap(nodes).get(oldId)!;
        const newId = idMap.get(oldId)!;
        const isSubRoot = oldId === nodeId;
        const newParent = isSubRoot
          ? original.data.parentId ?? null
          : idMap.get(original.data.parentId ?? "") ?? null;
        const clone = cloneNode(original);
        return {
          ...clone,
          id: newId,
          selected: false,
          data: {
            ...clone.data,
            parentId: newParent,
            isRoot: false,
            label: isSubRoot ? `${clone.data.label} (복사본)` : clone.data.label,
          },
          position: {
            x: original.position.x + (isSubRoot ? NODE_WIDTH + 60 : 0),
            y: original.position.y + (isSubRoot ? 40 : 0),
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
          selected: false,
          data: {
            ...clone.data,
            parentId: isSubRoot
              ? targetId
              : idMap.get(clone.data.parentId ?? "") ?? targetId,
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
            : n
        );
        const withNew = [...expanded, ...clones];
        const laid = runLayout(withNew, get().activeLayoutMode);
        return { nodes: laid, edges: buildEdgesFromNodes(laid) };
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
              : idMap.get(original.data.parentId ?? "") ?? null,
            isRoot: isSubRoot,
            type: isSubRoot ? "root" : clone.data.type,
            collapsed: false,
            linkedDocId: undefined,
            backDocId: isSubRoot ? activeDocumentId ?? undefined : undefined,
            backNodeId: isSubRoot ? nodeId : undefined,
          },
        };
      });
      const laid = runLayout(newNodes, "right-tree");
      const newDoc = makeDocument(
        node.data.label || "새 맵",
        laid,
        buildEdgesFromNodes(laid)
      );

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
              : n
          );
        return { nodes: nextNodes, edges: buildEdgesFromNodes(nextNodes) };
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
          })
        );
      }
    },

    toggleCollapse: (nodeId) => {
      commit((nds, eds) => ({
        nodes: nds.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, collapsed: !n.data.collapsed } }
            : n
        ),
        edges: eds,
      }));
    },

    // Set a first-level branch's direction and re-run the bidirectional layout
    // so the change is immediately visible.
    setNodeSide: (nodeId, side) => {
      commit((nds) => {
        const updated = nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, side } } : n
        );
        const laid = runLayout(updated, "bidirectional");
        return { nodes: laid, edges: buildEdgesFromNodes(laid) };
      });
      set({ activeLayoutMode: "bidirectional" });
      requestAnimationFrame(() => get().fitToView());
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

    setEditingNode: (nodeId) => set({ editingNodeId: nodeId }),

    // Apply the same data patch to many nodes at once.
    bulkUpdateData: (ids, partial) => {
      if (!ids.length) return;
      const idset = new Set(ids);
      commit((nds, eds) => ({
        nodes: nds.map((n) =>
          idset.has(n.id) ? { ...n, data: { ...n.data, ...partial } } : n
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
        return { nodes: next, edges: buildEdgesFromNodes(next) };
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
      const laid = runSubtreeLayout(updated, newParentId, get().activeLayoutMode);
      set({ nodes: laid, edges: buildEdgesFromNodes(laid), dropTargetId: null });
      syncActiveDocument(laid, buildEdgesFromNodes(laid));
      requestAnimationFrame(() => get().focusNode(nodeId));
      get().addToast("부모를 변경했습니다", "success");
    },

    // ── Relations (free-form cross links) ──
    setConnectMode: (on) =>
      set({ connectMode: on, selectedRelationId: null }),

    addRelation: (source, target) => {
      if (source === target) return;
      const { relations, nodes } = get();
      const ids = new Set(nodes.map((n) => n.id));
      if (!ids.has(source) || !ids.has(target)) return;
      // Ignore duplicates (either direction) and links mirroring a tree edge.
      const dup = relations.some(
        (r) =>
          (r.source === source && r.target === target) ||
          (r.source === target && r.target === source)
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
      get().pushHistory();
      set((s) => ({
        relations: s.relations.map((r) =>
          r.id === id ? { ...r, label: label.trim() || undefined } : r
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
          : n
      );
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
      const next = applyNodeChanges(rest, get().nodes) as MindMapNode[];
      set({ nodes: next });
      // Persist position/drag changes (debounced save handled upstream).
      const meaningful = rest.some(
        (c) =>
          c.type === "position" ||
          c.type === "remove" ||
          c.type === "add" ||
          c.type === "dimensions"
      );
      if (meaningful) syncActiveDocument(next, get().edges, false);
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
          d.id === activeDocumentId ? { ...d, viewport } : d
        ),
      });
    },

    autoLayout: (mode) => {
      const layoutMode = mode ?? get().activeLayoutMode;
      commit((nds) => {
        const laid = runLayout(nds, layoutMode);
        return { nodes: laid, edges: buildEdgesFromNodes(laid) };
      });
      set({ activeLayoutMode: layoutMode });
      requestAnimationFrame(() => get().fitToView());
    },

    autoLayoutSubtree: (nodeId, mode) => {
      const layoutMode = mode ?? get().activeLayoutMode;
      commit((nds) => {
        const laid = runSubtreeLayout(nds, nodeId, layoutMode);
        return { nodes: laid, edges: buildEdgesFromNodes(laid) };
      });
      requestAnimationFrame(() => get().focusNode(nodeId));
    },

    fitToView: () => {
      const { flow } = get();
      if (!flow) return;
      requestAnimationFrame(() =>
        flow.fitView({ padding: 0.2, duration: 400, maxZoom: 1.2 })
      );
    },

    focusNode: (nodeId) => {
      const { flow, nodes } = get();
      if (!flow) return;
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      flow.setCenter(
        node.position.x + NODE_WIDTH / 2,
        node.position.y + NODE_HEIGHT / 2,
        { zoom: Math.max(flow.getZoom?.() ?? 1, 1), duration: 450 }
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
        case "export-markdown":
          s.setDialog("export");
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
      const { nodes, edges, relations, history } = get();
      const snapshot: HistoryEntry = {
        nodes: nodes.map(cloneNode),
        edges: edges.map((e) => ({ ...e })),
        relations: relations.map((r) => ({ ...r })),
      };
      const next = [...history, snapshot].slice(-HISTORY_LIMIT);
      set({ history: next, future: [] });
    },

    undo: () => {
      const { history, nodes, edges, relations } = get();
      if (history.length === 0) return;
      const prev = history[history.length - 1];
      const current: HistoryEntry = {
        nodes: nodes.map(cloneNode),
        edges: edges.map((e) => ({ ...e })),
        relations: relations.map((r) => ({ ...r })),
      };
      set((s) => ({
        nodes: prev.nodes,
        edges: prev.edges,
        relations: prev.relations ?? [],
        history: history.slice(0, -1),
        future: [current, ...s.future].slice(0, HISTORY_LIMIT),
      }));
      syncActiveDocument(prev.nodes, prev.edges);
    },

    redo: () => {
      const { future, nodes, edges, relations } = get();
      if (future.length === 0) return;
      const nextEntry = future[0];
      const current: HistoryEntry = {
        nodes: nodes.map(cloneNode),
        edges: edges.map((e) => ({ ...e })),
        relations: relations.map((r) => ({ ...r })),
      };
      set((s) => ({
        nodes: nextEntry.nodes,
        edges: nextEntry.edges,
        relations: nextEntry.relations ?? [],
        history: [...s.history, current].slice(-HISTORY_LIMIT),
        future: future.slice(1),
      }));
      syncActiveDocument(nextEntry.nodes, nextEntry.edges);
    },

    // ── IO ──
    exportJson: () => {
      const { documents, activeDocumentId } = get();
      const doc = documents.find((d) => d.id === activeDocumentId);
      if (!doc) return "";
      return exportDocumentJson(doc);
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
          : buildEdgesFromNodes(result.document.nodes)
      );
      doc.viewport = result.document.viewport;
      doc.relations = result.document.relations ?? [];
      set((s) => ({
        documents: [doc, ...s.documents],
        activeDocumentId: doc.id,
        nodes: doc.nodes,
        edges: doc.edges,
        relations: doc.relations ?? [],
        selectedRelationId: null,
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

    importOutline: (text) => {
      const result = parseOutlineToTree(text);
      if (!result) {
        get().addToast("가져올 내용이 없습니다", "error");
        return false;
      }
      const doc = makeDocument(result.title, result.nodes, result.edges);
      set((s) => ({
        documents: [doc, ...s.documents],
        activeDocumentId: doc.id,
        nodes: doc.nodes,
        edges: doc.edges,
        relations: [],
        selectedRelationId: null,
        ...selectionFor(getRootNode(doc.nodes)?.id ?? null),
        history: [],
        future: [],
        dialog: null,
        revision: s.revision + 1,
      }));
      get().addToast(
        `아웃라인을 가져왔습니다 (노드 ${result.nodes.length}개)`,
        "success"
      );
      get().fitToView();
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

    // Generate a PNG/SVG of the current map and download it directly.
    exportImage: async (format) => {
      const { documents, activeDocumentId } = get();
      const doc = documents.find((d) => d.id === activeDocumentId);
      try {
        const url = await renderCanvasImage(get().nodes, format);
        const name = `${safeFileName(doc?.title ?? "mindforge")}.${format}`;
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        get().addToast(`${name} 저장됨`, "success");
      } catch (e) {
        get().addToast(
          e instanceof Error ? e.message : "이미지 저장에 실패했습니다",
          "error"
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
      set((s) => ({ theme, revision: s.revision + 1 }));
    },

    setFont: (font) => set((s) => ({ font, revision: s.revision + 1 })),

    setNodeStyle: (nodeStyle) =>
      set((s) => ({ nodeStyle, revision: s.revision + 1 })),

    setEdgeStyle: (edgeStyle) =>
      set((s) => ({ edgeStyle, revision: s.revision + 1 })),
    setEdgeAnimated: (edgeAnimated) =>
      set((s) => ({ edgeAnimated, revision: s.revision + 1 })),
    setEdgeWidth: (edgeWidth) =>
      set((s) => ({ edgeWidth, revision: s.revision + 1 })),
    setEdgeColorMode: (edgeColorMode) =>
      set((s) => ({ edgeColorMode, revision: s.revision + 1 })),
    setNodeTint: (nodeTint) =>
      set((s) => ({ nodeTint, revision: s.revision + 1 })),
    setCanvasBg: (canvasBg) =>
      set((s) => ({ canvasBg, revision: s.revision + 1 })),
    setAccent: (accent) => {
      applyAccentAttr(accent);
      set((s) => ({ accent, revision: s.revision + 1 }));
    },

    setLevelFontSize: (level, size) =>
      set((s) => {
        const clamped = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, size));
        const next = [...s.levelFontSizes];
        next[level] = clamped;
        return { levelFontSizes: next, revision: s.revision + 1 };
      }),

    resetLevelFontSizes: () =>
      set((s) => ({
        levelFontSizes: [...DEFAULT_LEVEL_FONT_SIZES],
        revision: s.revision + 1,
      })),

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
  s: MindMapState
): MindMapDocument | undefined {
  return s.documents.find((d) => d.id === s.activeDocumentId);
}

export function selectSelectedNode(s: MindMapState): MindMapNode | undefined {
  return s.nodes.find((n) => n.id === s.selectedNodeId);
}

export { getChildrenMap, getDescendantIds };
