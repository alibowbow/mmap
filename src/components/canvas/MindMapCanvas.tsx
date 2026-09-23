"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import { ChevronDown, Map as MapIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
} from "react";

import { CanvasEmptyState } from "@/components/canvas/CanvasEmptyState";
import { MindMapEdge } from "@/components/canvas/MindMapEdge";
import { MindMapNode } from "@/components/canvas/MindMapNode";
import { RelationEdge } from "@/components/canvas/RelationEdge";
import { cn } from "@/lib/cn";
import { BRANCH_AUTO_PALETTE, NODE_TYPE_CONFIG } from "@/lib/constants";
import { subtreeDrag as armedDrag } from "@/lib/dragState";
import {
  computeDepths,
  getDescendantIds,
  getHiddenNodeIds,
  getRootNode,
  getSubtreeIds,
  getVisibleDfsOrder,
} from "@/lib/tree";
import { useLayoutMeasurements } from "@/hooks/useLayoutMeasurements";
import { nodeRect } from "@/lib/layout-engine/adapter";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useMindMapStore } from "@/store/mindMapStore";
import type { MindMapNodeData } from "@/types/mindmap";

const nodeTypes = { mindmap: MindMapNode };
const edgeTypes = { mindmap: MindMapEdge, relation: RelationEdge };

function CanvasInner() {
  useLayoutMeasurements();
  const isMobile = useIsMobile();
  const nodes = useMindMapStore((s) => s.nodes);
  const edges = useMindMapStore((s) => s.edges);
  const selectedNodeIds = useMindMapStore((s) => s.selectedNodeIds);
  const presentationMode = useMindMapStore((s) => s.presentationMode);
  const presentationIndex = useMindMapStore((s) => s.presentationIndex);
  const presentationReveal = useMindMapStore((s) => s.presentationReveal);
  const edgeWidth = useMindMapStore((s) => s.edgeWidth);
  const edgeColorMode = useMindMapStore((s) => s.edgeColorMode);
  const canvasBg = useMindMapStore((s) => s.canvasBg);
  const activeLayoutMode = useMindMapStore((s) => s.activeLayoutMode);
  const rainbowBranches = useMindMapStore((s) => s.rainbowBranches);
  const focusModeNodeId = useMindMapStore((s) => s.focusModeNodeId);
  const exitFocusMode = useMindMapStore((s) => s.exitFocusMode);
  const relations = useMindMapStore((s) => s.relations);
  const connectMode = useMindMapStore((s) => s.connectMode);
  const selectedRelationId = useMindMapStore((s) => s.selectedRelationId);
  const addRelation = useMindMapStore((s) => s.addRelation);
  const selectRelation = useMindMapStore((s) => s.selectRelation);

  const onNodesChange = useMindMapStore((s) => s.onNodesChange);
  const onEdgesChange = useMindMapStore((s) => s.onEdgesChange);
  const selectNode = useMindMapStore((s) => s.selectNode);
  const setEditingNode = useMindMapStore((s) => s.setEditingNode);
  const openContextMenu = useMindMapStore((s) => s.openContextMenu);
  const closeContextMenu = useMindMapStore((s) => s.closeContextMenu);
  const registerFlow = useMindMapStore((s) => s.registerFlow);
  const updateViewport = useMindMapStore((s) => s.updateViewport);
  const setMobileSheetOpen = useMindMapStore((s) => s.setMobileSheetOpen);
  const moveNodesBy = useMindMapStore((s) => s.moveNodesBy);
  const beginNodeDrag = useMindMapStore((s) => s.beginNodeDrag);
  const endNodeDrag = useMindMapStore((s) => s.endNodeDrag);
  const routes = useMindMapStore((s) => s.layoutRoutes);
  const layoutBusy = useMindMapStore((s) => s.layoutBusy);
  const noteCameraIntent = useMindMapStore((s) => s.noteCameraIntent);
  const setDropTargetId = useMindMapStore((s) => s.setDropTargetId);
  const reparentNode = useMindMapStore((s) => s.reparentNode);

  useEffect(() => {
    return () => registerFlow(null);
  }, [registerFlow]);

  const [miniMapOpen, setMiniMapOpen] = useState(false);
  // React Flow can emit click/context-menu events immediately after a drag.
  // Keep the dragged node's menu blocked until the gesture is over and the
  // user deliberately clicks/taps it again.
  const [menuBlockedNodeId, setMenuBlockedNodeId] = useState<string | null>(
    null,
  );
  const dragMenuGuard = useRef<{ nodeId: string; until: number } | null>(null);
  const dragMenuIsSuppressed = useCallback((nodeId: string) => {
    const guard = dragMenuGuard.current;
    return !!guard && guard.nodeId === nodeId && Date.now() < guard.until;
  }, []);
  // Tracks an in-progress subtree drag (descendants follow the dragged node).
  const subtreeDrag = useRef<{
    id: string;
    descIds: string[];
    last: { x: number; y: number };
  } | null>(null);
  // Tracks a single-node drag for re-parent detection.
  const reparent = useRef<{ id: string; descendants: Set<string> } | null>(
    null,
  );
  const pointerFocus = useRef(false);

  const onCanvasPointerDown = useCallback(() => {
    pointerFocus.current = true;
    window.setTimeout(() => {
      pointerFocus.current = false;
    }, 0);
  }, []);

  const onCanvasFocus = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      const nodeElement = target.closest<HTMLElement>(".react-flow__node");
      if (pointerFocus.current || target !== nodeElement) return;
      const nodeId = nodeElement.dataset.id;
      if (nodeId) selectNode(nodeId);
    },
    [selectNode],
  );

  const projectedData = useRef(
    new Map<string, { raw: MindMapNodeData; data: MindMapNodeData }>(),
  );
  // Compute visible nodes/edges (hide collapsed subtrees) and selection flag.
  const { displayNodes: baseNodes, displayEdges: baseEdges } = useMemo(() => {
    const hidden = getHiddenNodeIds(nodes);
    const posMap = new Map(nodes.map((n) => [n.id, n.position]));
    const childCounts = new Map<string, number>();
    for (const n of nodes)
      if (n.data.parentId)
        childCounts.set(
          n.data.parentId,
          (childCounts.get(n.data.parentId) ?? 0) + 1,
        );
    // Rainbow mode: each first-level branch gets a palette hue; descendants
    // inherit it (walking up parentId). Explicit node colors still win.
    const autoColorOf = new Map<string, string>();
    if (rainbowBranches) {
      const root = getRootNode(nodes);
      if (root) {
        const firstLevel = nodes.filter((n) => n.data.parentId === root.id);
        firstLevel.forEach((branch, i) => {
          const c = BRANCH_AUTO_PALETTE[i % BRANCH_AUTO_PALETTE.length];
          for (const id of getSubtreeIds(nodes, branch.id)) {
            autoColorOf.set(id, c);
          }
        });
      }
    }
    const colorOf = new Map(
      nodes.map((n) => [
        n.id,
        n.data.color ??
          autoColorOf.get(n.id) ??
          NODE_TYPE_CONFIG[n.data.type]?.color ??
          "#94a3b8",
      ]),
    );
    // Focus mode: only the focused subtree stays visible.
    const focusSet =
      focusModeNodeId && posMap.has(focusModeNodeId)
        ? new Set(getSubtreeIds(nodes, focusModeNodeId))
        : null;
    const depths = computeDepths(nodes);
    // Presentation: step-reveal hides nodes beyond the current step, and the
    // spotlight dims everything except the current node.
    let revealed: Set<string> | null = null;
    let currentId: string | null = null;
    if (presentationMode) {
      const order = getVisibleDfsOrder(nodes);
      currentId = order[presentationIndex] ?? null;
      if (presentationReveal) {
        revealed = new Set(order.slice(0, presentationIndex + 1));
      }
    }
    const nodeHidden = (id: string) =>
      hidden.has(id) ||
      (revealed ? !revealed.has(id) : false) ||
      (focusSet ? !focusSet.has(id) : false);
    const nextData = new Map<
      string,
      { raw: MindMapNodeData; data: MindMapNodeData }
    >();
    const dn: Node<MindMapNodeData>[] = nodes.map((n) => {
      const prev = projectedData.current.get(n.id),
        depth = depths.get(n.id) ?? 0,
        count = childCounts.get(n.id) ?? 0,
        dimmed = presentationMode && currentId !== null && n.id !== currentId,
        autoColor = autoColorOf.get(n.id);
      const data =
        prev?.raw === n.data &&
        prev.data._depth === depth &&
        prev.data._childCount === count &&
        prev.data._dimmed === dimmed &&
        prev.data._autoColor === autoColor
          ? prev.data
          : {
              ...n.data,
              _depth: depth,
              _childCount: count,
              _dimmed: dimmed,
              _autoColor: autoColor,
              _suppressMenu: false,
            };
      nextData.set(n.id, { raw: n.data, data });
      return {
        ...n,
        type: "mindmap",
        ariaLabel: `노드: ${n.data.label || "내용 없음"}`,
        selected: false,
        hidden: nodeHidden(n.id),
        draggable: !presentationMode,
        data,
      };
    });
    projectedData.current = nextData;
    const horizontalFaces = (dx: number) =>
      dx < 0
        ? { sourceHandle: "left-source", targetHandle: "right-target" }
        : { sourceHandle: "right-source", targetHandle: "left-target" };
    const verticalFaces = (dy: number) =>
      dy < 0
        ? { sourceHandle: "top-source", targetHandle: "bottom-target" }
        : { sourceHandle: "bottom-source", targetHandle: "top-target" };
    // Free-relation routing: pick the face by whichever axis dominates.
    const handlesFor = (sourceId: string, targetId: string) => {
      const s = posMap.get(sourceId);
      const t = posMap.get(targetId);
      if (!s || !t) return horizontalFaces(1);
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      return Math.abs(dx) >= Math.abs(dy)
        ? horizontalFaces(dx)
        : verticalFaces(dy);
    };
    // Tree-edge routing follows the layout so branches never leave an odd
    // face (e.g. a right-tree child slightly above its parent must still exit
    // the parent's right face, or edges tangle across siblings).
    const treeHandlesFor = (sourceId: string, targetId: string) => {
      const s = posMap.get(sourceId);
      const t = posMap.get(targetId);
      if (!s || !t) return horizontalFaces(1);
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      if (activeLayoutMode === "vertical") return verticalFaces(dy);
      if (activeLayoutMode === "radial") {
        return Math.abs(dx) >= Math.abs(dy)
          ? horizontalFaces(dx)
          : verticalFaces(dy);
      }
      // right-tree / bidirectional: strictly horizontal by the side the
      // child sits on.
      return horizontalFaces(dx);
    };
    const de: Edge[] = edges.map((e) => {
      // Color tree edges by the TARGET (child): the child's color IS the
      // branch color, so root fan-out edges each take their branch hue
      // instead of all inheriting the root's color. For non-root edges the
      // source and target colors match under rainbow inheritance anyway.
      const stroke =
        edgeColorMode === "node" ? colorOf.get(e.target) : undefined;
      return {
        ...e,
        type: "mindmap",
        ...treeHandlesFor(e.source, e.target),
        style: { strokeWidth: edgeWidth, ...(stroke ? { stroke } : {}) },
        hidden: nodeHidden(e.source) || nodeHidden(e.target),
      };
    });
    // Free-form relations render on top as dashed, arrowed edges.
    for (const r of relations) {
      if (!posMap.has(r.source) || !posMap.has(r.target)) continue;
      de.push({
        id: r.id,
        source: r.source,
        target: r.target,
        type: "relation",
        ...handlesFor(r.source, r.target),
        data: { label: r.label, relSelected: false },
        hidden: nodeHidden(r.source) || nodeHidden(r.target),
        zIndex: 5,
      });
    }
    return { displayNodes: dn, displayEdges: de };
  }, [
    nodes,
    edges,
    relations,
    presentationMode,
    presentationIndex,
    presentationReveal,
    edgeWidth,
    edgeColorMode,
    activeLayoutMode,
    rainbowBranches,
    focusModeNodeId,
  ]);
  const displayNodes = useMemo(() => {
    const selected = new Set(selectedNodeIds);
    return baseNodes.map((n) =>
      selected.has(n.id) || menuBlockedNodeId === n.id
        ? {
            ...n,
            selected: selected.has(n.id),
            data:
              menuBlockedNodeId === n.id
                ? { ...n.data, _suppressMenu: true }
                : n.data,
          }
        : n,
    );
  }, [baseNodes, selectedNodeIds, menuBlockedNodeId]);
  const displayEdges = useMemo(
    () =>
      baseEdges.map((e) => {
        const route = routes[e.id];
        return {
          ...e,
          ...(route
            ? {
                sourceHandle: route.sourcePort.handleId,
                targetHandle: route.targetPort.handleId,
              }
            : {}),
          data: { ...e.data, route, relSelected: e.id === selectedRelationId },
        };
      }),
    [baseEdges, selectedRelationId, routes],
  );

  const onNodeClick = useCallback(
    (e: React.MouseEvent, node: Node) => {
      if (dragMenuIsSuppressed(node.id)) {
        e.stopPropagation();
        closeContextMenu();
        return;
      }
      // This is a new, intentional click after the drag guard expired.
      if (menuBlockedNodeId === node.id) setMenuBlockedNodeId(null);
      // React Flow emits controlled selection changes through onNodesChange.
      // Let that single path own plain and modifier clicks; toggling here as
      // well would apply Shift/Cmd selection twice.
      closeContextMenu();
    },
    [closeContextMenu, dragMenuIsSuppressed, menuBlockedNodeId],
  );

  const onNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (dragMenuIsSuppressed(node.id)) return;
      if (menuBlockedNodeId === node.id) setMenuBlockedNodeId(null);
      if (isMobile) {
        setEditingNode(node.id);
      } else {
        setEditingNode(node.id);
      }
    },
    [setEditingNode, isMobile, dragMenuIsSuppressed, menuBlockedNodeId],
  );

  const onNodeContextMenu = useCallback(
    (e: React.MouseEvent, node: Node) => {
      e.preventDefault();
      // A long-press that armed, started, or just finished a drag must not also
      // open the context menu / mobile detail sheet.
      if (
        armedDrag.armedId ||
        subtreeDrag.current ||
        dragMenuIsSuppressed(node.id)
      )
        return;
      if (menuBlockedNodeId === node.id) setMenuBlockedNodeId(null);
      if (isMobile) {
        // On mobile a long-press opens the detail sheet instead of a menu.
        selectNode(node.id);
        setMobileSheetOpen(true);
        return;
      }
      openContextMenu(node.id, e.clientX, e.clientY);
    },
    [
      openContextMenu,
      isMobile,
      selectNode,
      setMobileSheetOpen,
      dragMenuIsSuppressed,
      menuBlockedNodeId,
    ],
  );

  const onPaneClick = useCallback(() => {
    setMenuBlockedNodeId(null);
    selectNode(null);
    selectRelation(null);
    closeContextMenu();
  }, [selectNode, selectRelation, closeContextMenu]);

  // Connect mode: dragging between two node handles creates a relation.
  const onConnect = useCallback(
    (conn: Connection) => {
      if (conn.source && conn.target) addRelation(conn.source, conn.target);
    },
    [addRelation],
  );

  const onEdgeClick = useCallback(
    (e: React.MouseEvent, edge: Edge) => {
      if (edge.type === "relation") {
        e.stopPropagation();
        selectRelation(edge.id);
        return;
      }
      // Tree edge (가지): select the CHILD node — the branch head. Branch
      // color/label/thickness all live on the child, so this puts the quick
      // bar (palette, edit, delete) one tap away from any branch line.
      e.stopPropagation();
      setMenuBlockedNodeId(null);
      selectNode(edge.target);
    },
    [selectRelation, selectNode],
  );

  // Subtree drag: if the long-press armed this node, capture its descendants so
  // they can follow the same delta during the drag.
  const onNodeDragStart = useCallback(
    (_: MouseEvent | TouchEvent, node: Node) => {
      const state = useMindMapStore.getState();
      // Hide any already-open menu and suppress the quick bar for this node.
      // `Infinity` keeps synthetic contextmenu/click events blocked until the
      // drag-stop handler replaces it with a short post-gesture guard.
      dragMenuGuard.current = {
        nodeId: node.id,
        until: Number.POSITIVE_INFINITY,
      };
      setMenuBlockedNodeId(node.id);
      closeContextMenu();
      setMobileSheetOpen(false);
      // Snapshot once so the whole drag (move / subtree / re-parent) is one undo.
      beginNodeDrag([...new Set([node.id, ...state.selectedNodeIds])]);
      const descIds = getDescendantIds(state.nodes, node.id);
      reparent.current = { id: node.id, descendants: new Set(descIds) };
      if (armedDrag.armedId === node.id) {
        subtreeDrag.current = {
          id: node.id,
          descIds,
          last: { ...node.position },
        };
      } else {
        subtreeDrag.current = null;
      }
    },
    [beginNodeDrag, closeContextMenu, setMobileSheetOpen],
  );

  const onNodeDrag = useCallback(
    (_: MouseEvent | TouchEvent, node: Node) => {
      const ds = subtreeDrag.current;
      if (ds && ds.id === node.id) {
        const dx = node.position.x - ds.last.x;
        const dy = node.position.y - ds.last.y;
        if (dx || dy) {
          const state = useMindMapStore.getState();
          // React Flow already moved selected descendants; a collapsed node's
          // hidden descendants were translated in onNodesChange.
          const root = state.nodes.find((n) => n.id === node.id);
          if (!root?.data.collapsed)
            moveNodesBy(
              ds.descIds.filter((id) => !state.selectedNodeIds.includes(id)),
              dx,
              dy,
            );
          ds.last = { ...node.position };
        }
        return; // subtree drags don't re-parent
      }
      // Re-parent detection: the dragged node's center over another node.
      const rp = reparent.current;
      if (!rp || rp.id !== node.id) return;
      const state = useMindMapStore.getState();
      const dragged = nodeRect(node as import("@/types/mindmap").MindMapNode);
      const cx = dragged.x + dragged.width / 2;
      const cy = dragged.y + dragged.height / 2;
      const hidden = getHiddenNodeIds(state.nodes);
      const focus = state.focusModeNodeId
        ? new Set(getSubtreeIds(state.nodes, state.focusModeNodeId))
        : null;
      let targetId: string | null = null;
      // Reverse render order is the stable tie-break for overlapping targets.
      for (const n of [...state.nodes].reverse()) {
        if (
          n.id === node.id ||
          rp.descendants.has(n.id) ||
          hidden.has(n.id) ||
          (focus && !focus.has(n.id))
        )
          continue;
        const { width: w, height: h } = nodeRect(n);
        if (
          cx >= n.position.x &&
          cx <= n.position.x + w &&
          cy >= n.position.y &&
          cy <= n.position.y + h
        ) {
          targetId = n.id;
          break;
        }
      }
      if (useMindMapStore.getState().dropTargetId !== targetId) {
        setDropTargetId(targetId);
      }
    },
    [moveNodesBy, setDropTargetId],
  );

  const onNodeDragStop = useCallback(
    (_: MouseEvent | TouchEvent, node: Node) => {
      // Some browsers dispatch contextmenu/click after pointerup. Keep those
      // synthetic events out, while allowing a later deliberate tap.
      dragMenuGuard.current = { nodeId: node.id, until: Date.now() + 450 };
      setMenuBlockedNodeId(node.id);
      const targetId = useMindMapStore.getState().dropTargetId;
      if (targetId && !subtreeDrag.current) {
        reparentNode(node.id, targetId);
      }
      setDropTargetId(null);
      subtreeDrag.current = null;
      reparent.current = null;
      armedDrag.armedId = null;
      endNodeDrag();
    },
    [reparentNode, setDropTargetId, endNodeDrag],
  );

  const isEmpty = nodes.length === 0;

  return (
    <div
      data-mindmap-canvas="true"
      role="region"
      aria-label="MindForge 마인드맵 캔버스"
      aria-busy={layoutBusy}
      onPointerDownCapture={onCanvasPointerDown}
      onFocusCapture={onCanvasFocus}
      className={cn(
        "relative h-full w-full mf-canvas-bg",
        connectMode && "mf-connecting",
      )}
    >
      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeContextMenu={onNodeContextMenu}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={onPaneClick}
        onConnect={onConnect}
        onEdgeClick={onEdgeClick}
        onInit={registerFlow}
        onMoveStart={(event) => {
          if (event) noteCameraIntent();
        }}
        onMoveEnd={(_, vp) => updateViewport(vp)}
        minZoom={0.15}
        maxZoom={2.5}
        disableKeyboardA11y
        deleteKeyCode={null}
        nodesDraggable={!presentationMode && !connectMode}
        nodesConnectable={connectMode && !presentationMode}
        nodesFocusable
        edgesFocusable={false}
        connectionRadius={40}
        elementsSelectable
        multiSelectionKeyCode={["Shift", "Meta", "Control"]}
        selectionKeyCode="Shift"
        selectionMode={SelectionMode.Partial}
        panOnScroll
        panOnScrollSpeed={0.6}
        zoomOnPinch
        selectionOnDrag={false}
        panOnDrag={presentationMode ? false : [0, 1, 2]}
        proOptions={{ hideAttribution: true }}
        fitView
        fitViewOptions={{
          padding: isMobile ? 0.1 : 0.25,
          // Initial shared maps can be much larger than the starter map. The
          // store's panel-aware fit pass raises compact maps to 0.35 after the
          // bounds are known, while large maps must remain free to reach 0.15.
          minZoom: 0.15,
          maxZoom: 1.2,
        }}
        className="touch-none"
      >
        {canvasBg !== "none" && (
          <Background
            variant={
              canvasBg === "lines"
                ? BackgroundVariant.Lines
                : canvasBg === "cross"
                  ? BackgroundVariant.Cross
                  : BackgroundVariant.Dots
            }
            gap={canvasBg === "dots" ? 22 : 30}
            size={canvasBg === "dots" ? 1.4 : canvasBg === "cross" ? 5 : 1}
            className={canvasBg === "dots" ? "!opacity-55" : "!opacity-35"}
          />
        )}
        {!presentationMode && !isMobile && (
          <Controls
            showInteractive={false}
            position="bottom-left"
            className="!mb-5 !ml-5"
          />
        )}
        {!presentationMode && (!isMobile || miniMapOpen) && (
          <MiniMap
            pannable
            zoomable
            position="bottom-right"
            className={cn("!mb-5 !mr-5", isMobile && "!h-24 !w-32")}
            nodeColor={(n) => {
              const data = n.data as MindMapNodeData;
              return (
                data?.color ??
                data?._autoColor ??
                NODE_TYPE_CONFIG[data?.type ?? "idea"]?.color ??
                "#94a3b8"
              );
            }}
            maskColor="rgb(15 23 42 / 0.06)"
          />
        )}
      </ReactFlow>

      {/* Mobile mini-map toggle */}
      {!presentationMode && isMobile && (
        <button
          onClick={() => setMiniMapOpen((o) => !o)}
          aria-label="미니맵 토글"
          className="absolute bottom-[5.75rem] right-3 z-10 flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface-raised/96 text-ink-soft shadow-soft backdrop-blur-md"
        >
          {miniMapOpen ? <ChevronDown size={18} /> : <MapIcon size={18} />}
        </button>
      )}

      {/* Connect mode hint */}
      {connectMode && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-brand/40 bg-brand/10 px-4 py-2 text-xs font-medium text-ink shadow-soft backdrop-blur">
            <span className="h-2 w-2 animate-pulse rounded-full bg-brand" />
            노드 가장자리 점에서 드래그해 관계선을 연결하세요
            <button
              onClick={() => useMindMapStore.getState().setConnectMode(false)}
              className="ml-1 rounded-full bg-brand px-2.5 py-0.5 text-[11px] font-semibold text-brand-contrast transition hover:opacity-90"
            >
              완료
            </button>
          </div>
        </div>
      )}

      {/* Focus mode banner */}
      {focusModeNodeId && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-brand/40 bg-brand/10 px-4 py-2 text-xs font-medium text-ink shadow-soft backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-brand" />
            포커스 모드 — 이 가지만 표시 중
            <button
              onClick={exitFocusMode}
              className="ml-1 rounded-full bg-brand px-2.5 py-0.5 text-[11px] font-semibold text-brand-contrast transition hover:opacity-90"
            >
              전체 보기
            </button>
          </div>
        </div>
      )}

      {isEmpty && <CanvasEmptyState />}
    </div>
  );
}

export function MindMapCanvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
