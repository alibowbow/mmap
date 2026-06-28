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
  DEFAULT_FONT,
  DEFAULT_NODE_LABEL,
  DEFAULT_NODE_STYLE,
  LAYOUT_GAP_X,
  NODE_HEIGHT,
  NODE_TYPE_CONFIG,
  NODE_WIDTH,
} from "@/lib/constants";
import {
  exportDocumentJson,
  exportMarkdown,
  exportOutlineText,
} from "@/lib/export";
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
  getHiddenNodeIds,
  getNodeMap,
  getRootNode,
  getSubtreeIds,
  walkTree,
} from "@/lib/tree";
import { parseImportJson } from "@/lib/validation";
import type {
  BranchSide,
  Edge,
  LayoutMode,
  MindMapDocument,
  MindMapNode,
  MindMapNodeData,
  MindMapTheme,
  SaveStatus,
  TemplateType,
} from "@/types/mindmap";

export type ToastType = "success" | "error" | "info";
export type Toast = { id: string; message: string; type: ToastType };
export type DialogType = "template" | "export" | "import" | "shortcuts" | null;
export type ContextMenuState = { nodeId: string; x: number; y: number } | null;

const HISTORY_LIMIT = 60;

type HistoryEntry = { nodes: MindMapNode[]; edges: Edge[] };

export type MindMapState = {
  // ── Data ──
  documents: MindMapDocument[];
  activeDocumentId: string | null;
  nodes: MindMapNode[];
  edges: Edge[];

  // ── Selection / editing ──
  selectedNodeId: string | null;
  editingNodeId: string | null;

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
  dialog: DialogType;
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
  toggleCollapse: (nodeId: string) => void;
  setNodeSide: (nodeId: string, side: BranchSide | undefined) => void;
  selectNode: (nodeId: string | null) => void;
  setEditingNode: (nodeId: string | null) => void;
  moveNodesBy: (ids: string[], dx: number, dy: number) => void;

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
  exportMarkdown: () => string;
  exportOutlineText: () => string;

  // ── UI actions ──
  toggleTheme: () => void;
  setTheme: (theme: MindMapTheme) => void;
  setFont: (font: string) => void;
  setNodeStyle: (style: string) => void;
  toggleSidebar: () => void;
  toggleInspector: () => void;
  setInspectorOpen: (open: boolean) => void;
  setDialog: (dialog: DialogType) => void;
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
  function syncActiveDocument(
    nodes: MindMapNode[],
    edges: Edge[],
    touch = true
  ) {
    const { activeDocumentId, documents } = get();
    if (!activeDocumentId) return;
    const updated = documents.map((d) =>
      d.id === activeDocumentId
        ? { ...d, nodes, edges, updatedAt: touch ? nowIso() : d.updatedAt }
        : d
    );
    set((s) => ({
      documents: updated,
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

    selectedNodeId: null,
    editingNodeId: null,

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
    dialog: null,
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
        selectedNodeId: getRootNode(doc.nodes)?.id ?? null,
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
        selectedNodeId: wasActive
          ? getRootNode(nextDocs[0].nodes)?.id ?? null
          : s.selectedNodeId,
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

    setActiveDocument: (documentId) => {
      const { documents } = get();
      const doc = documents.find((d) => d.id === documentId);
      if (!doc) return;
      set((s) => ({
        activeDocumentId: documentId,
        nodes: doc.nodes,
        edges: doc.edges,
        selectedNodeId: getRootNode(doc.nodes)?.id ?? null,
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
        set({
          documents,
          activeDocumentId: activeId,
          nodes: active.nodes,
          edges: active.edges,
          selectedNodeId: getRootNode(active.nodes)?.id ?? null,
          theme: ws.theme,
          font: ws.font ?? DEFAULT_FONT,
          nodeStyle: ws.nodeStyle ?? DEFAULT_NODE_STYLE,
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
          selectedNodeId: getRootNode(sample.nodes)?.id ?? null,
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
      const siblings = nodes.filter((n) => n.data.parentId === parentId);
      // Grow in the same direction as the parent's branch so children of a
      // left-side node appear to the left (avoiding overlap with the root side).
      const root = getRootNode(nodes);
      const onLeft =
        !!root && parent.id !== root.id && parent.position.x < root.position.x;
      const dir = onLeft ? -1 : 1;
      const newNode: MindMapNode = {
        id,
        type: "mindmap",
        position: {
          x: parent.position.x + dir * (NODE_WIDTH + LAYOUT_GAP_X),
          y: parent.position.y + siblings.length * (NODE_HEIGHT + 24),
        },
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
        const nextNodes = [...expanded, newNode];
        const nextEdges = [
          ...eds,
          { id: `e_${parentId}_${id}`, source: parentId, target: id, type: "mindmap" },
        ];
        return { nodes: nextNodes, edges: nextEdges };
      });
      set({ selectedNodeId: id, editingNodeId: id });
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
        selectedNodeId: parentId,
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
        selectedNodeId: parentId,
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
      set({ selectedNodeId: newRootId });
      get().addToast("하위 트리를 복제했습니다", "success");
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
      set({ selectedNodeId: nodeId, contextMenu: null }),

    setEditingNode: (nodeId) => set({ editingNodeId: nodeId }),

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
      const next = applyNodeChanges(changes, get().nodes) as MindMapNode[];
      set({ nodes: next });
      // Persist position/drag changes (debounced save handled upstream).
      const meaningful = changes.some(
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
        case "import-json":
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
      const { nodes, edges, history } = get();
      const snapshot: HistoryEntry = {
        nodes: nodes.map(cloneNode),
        edges: edges.map((e) => ({ ...e })),
      };
      const next = [...history, snapshot].slice(-HISTORY_LIMIT);
      set({ history: next, future: [] });
    },

    undo: () => {
      const { history, nodes, edges } = get();
      if (history.length === 0) return;
      const prev = history[history.length - 1];
      const current: HistoryEntry = {
        nodes: nodes.map(cloneNode),
        edges: edges.map((e) => ({ ...e })),
      };
      set((s) => ({
        nodes: prev.nodes,
        edges: prev.edges,
        history: history.slice(0, -1),
        future: [current, ...s.future].slice(0, HISTORY_LIMIT),
      }));
      syncActiveDocument(prev.nodes, prev.edges);
    },

    redo: () => {
      const { future, nodes, edges } = get();
      if (future.length === 0) return;
      const nextEntry = future[0];
      const current: HistoryEntry = {
        nodes: nodes.map(cloneNode),
        edges: edges.map((e) => ({ ...e })),
      };
      set((s) => ({
        nodes: nextEntry.nodes,
        edges: nextEntry.edges,
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
      set((s) => ({
        documents: [doc, ...s.documents],
        activeDocumentId: doc.id,
        nodes: doc.nodes,
        edges: doc.edges,
        selectedNodeId: getRootNode(doc.nodes)?.id ?? null,
        history: [],
        future: [],
        dialog: null,
        revision: s.revision + 1,
      }));
      get().addToast("문서를 가져왔습니다", "success");
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

    openContextMenu: (nodeId, x, y) =>
      set({ contextMenu: { nodeId, x, y }, selectedNodeId: nodeId }),
    closeContextMenu: () => set({ contextMenu: null }),

    setOutlineOpen: (open) => set({ outlineOpen: open }),
    setMobileDrawerOpen: (open) => set({ mobileDrawerOpen: open }),
    setMobileMoreOpen: (open) => set({ mobileMoreOpen: open }),
    setMobileSheetOpen: (open) => set({ mobileSheetOpen: open }),

    openPresentationMode: () => {
      const { selectedNodeId, nodes } = get();
      const target = selectedNodeId ?? getRootNode(nodes)?.id ?? null;
      set({ presentationMode: true, selectedNodeId: target });
      if (target) focusSoon(target);
    },
    closePresentationMode: () => {
      set({ presentationMode: false });
      get().fitToView();
    },

    presentationNext: () => {
      const order = visibleOrder(get().nodes);
      const { selectedNodeId } = get();
      const idx = order.indexOf(selectedNodeId ?? "");
      const next = order[Math.min(order.length - 1, idx + 1)] ?? order[0];
      if (next) {
        set({ selectedNodeId: next });
        get().focusNode(next);
      }
    },
    presentationPrev: () => {
      const order = visibleOrder(get().nodes);
      const { selectedNodeId } = get();
      const idx = order.indexOf(selectedNodeId ?? "");
      const prev = order[Math.max(0, idx - 1)] ?? order[0];
      if (prev) {
        set({ selectedNodeId: prev });
        get().focusNode(prev);
      }
    },
  };
});

// DFS order of currently-visible nodes (used for presentation navigation).
function visibleOrder(nodes: MindMapNode[]): string[] {
  const hidden = getHiddenNodeIds(nodes);
  const order: string[] = [];
  walkTree(nodes, (node) => {
    if (!hidden.has(node.id)) order.push(node.id);
  });
  return order;
}

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
