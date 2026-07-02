"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import { ChevronDown, Map as MapIcon } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

import { CanvasEmptyState } from "@/components/canvas/CanvasEmptyState";
import { MindMapEdge } from "@/components/canvas/MindMapEdge";
import { MindMapNode } from "@/components/canvas/MindMapNode";
import { RelationEdge } from "@/components/canvas/RelationEdge";
import { cn } from "@/lib/cn";
import { NODE_HEIGHT, NODE_TYPE_CONFIG, NODE_WIDTH } from "@/lib/constants";
import { subtreeDrag as armedDrag } from "@/lib/dragState";
import {
  computeDepths,
  getDescendantIds,
  getHiddenNodeIds,
  getVisibleDfsOrder,
} from "@/lib/tree";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useMindMapStore } from "@/store/mindMapStore";
import type { MindMapNodeData } from "@/types/mindmap";

const nodeTypes = { mindmap: MindMapNode };
const edgeTypes = { mindmap: MindMapEdge, relation: RelationEdge };

function CanvasInner() {
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
  const relations = useMindMapStore((s) => s.relations);
  const connectMode = useMindMapStore((s) => s.connectMode);
  const selectedRelationId = useMindMapStore((s) => s.selectedRelationId);
  const addRelation = useMindMapStore((s) => s.addRelation);
  const selectRelation = useMindMapStore((s) => s.selectRelation);

  const onNodesChange = useMindMapStore((s) => s.onNodesChange);
  const onEdgesChange = useMindMapStore((s) => s.onEdgesChange);
  const selectNode = useMindMapStore((s) => s.selectNode);
  const toggleNodeSelection = useMindMapStore((s) => s.toggleNodeSelection);
  const setEditingNode = useMindMapStore((s) => s.setEditingNode);
  const openContextMenu = useMindMapStore((s) => s.openContextMenu);
  const closeContextMenu = useMindMapStore((s) => s.closeContextMenu);
  const registerFlow = useMindMapStore((s) => s.registerFlow);
  const updateViewport = useMindMapStore((s) => s.updateViewport);
  const setMobileSheetOpen = useMindMapStore((s) => s.setMobileSheetOpen);
  const moveNodesBy = useMindMapStore((s) => s.moveNodesBy);
  const pushHistory = useMindMapStore((s) => s.pushHistory);
  const setDropTargetId = useMindMapStore((s) => s.setDropTargetId);
  const reparentNode = useMindMapStore((s) => s.reparentNode);

  const [miniMapOpen, setMiniMapOpen] = useState(false);
  // Tracks an in-progress subtree drag (descendants follow the dragged node).
  const subtreeDrag = useRef<{
    id: string;
    descIds: string[];
    last: { x: number; y: number };
  } | null>(null);
  // Tracks a single-node drag for re-parent detection.
  const reparent = useRef<{ id: string; descendants: Set<string> } | null>(null);

  // Compute visible nodes/edges (hide collapsed subtrees) and selection flag.
  const { displayNodes, displayEdges } = useMemo(() => {
    const hidden = getHiddenNodeIds(nodes);
    const posMap = new Map(nodes.map((n) => [n.id, n.position]));
    const colorOf = new Map(
      nodes.map((n) => [
        n.id,
        n.data.color ??
          NODE_TYPE_CONFIG[n.data.type]?.color ??
          "#94a3b8",
      ])
    );
    const depths = computeDepths(nodes);
    const selectedSet = new Set(selectedNodeIds);
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
    const dn: Node<MindMapNodeData>[] = nodes.map((n) => ({
      ...n,
      type: "mindmap",
      selected: selectedSet.has(n.id),
      hidden: hidden.has(n.id) || (revealed ? !revealed.has(n.id) : false),
      draggable: !presentationMode,
      data: {
        ...n.data,
        _depth: depths.get(n.id) ?? 0,
        _dimmed: presentationMode && currentId !== null && n.id !== currentId,
      },
    }));
    const nodeHidden = (id: string) =>
      hidden.has(id) || (revealed ? !revealed.has(id) : false);
    // Route an edge from the face pointing toward its far end. Horizontal
    // spans use left/right, vertical spans top/bottom — chosen by whichever
    // axis dominates the offset.
    const handlesFor = (sourceId: string, targetId: string) => {
      const s = posMap.get(sourceId);
      const t = posMap.get(targetId);
      let sourceHandle = "right-source";
      let targetHandle = "left-target";
      if (s && t) {
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        if (Math.abs(dx) >= Math.abs(dy)) {
          sourceHandle = dx < 0 ? "left-source" : "right-source";
          targetHandle = dx < 0 ? "right-target" : "left-target";
        } else {
          sourceHandle = dy < 0 ? "top-source" : "bottom-source";
          targetHandle = dy < 0 ? "bottom-target" : "top-target";
        }
      }
      return { sourceHandle, targetHandle };
    };
    const de: Edge[] = edges.map((e) => {
      const stroke =
        edgeColorMode === "node" ? colorOf.get(e.source) : undefined;
      return {
        ...e,
        type: "mindmap",
        ...handlesFor(e.source, e.target),
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
        markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
        data: { label: r.label, relSelected: r.id === selectedRelationId },
        hidden: nodeHidden(r.source) || nodeHidden(r.target),
        zIndex: 5,
      });
    }
    return { displayNodes: dn, displayEdges: de };
  }, [
    nodes,
    edges,
    relations,
    selectedNodeIds,
    selectedRelationId,
    presentationMode,
    presentationIndex,
    presentationReveal,
    edgeWidth,
    edgeColorMode,
  ]);

  const onNodeClick = useCallback(
    (e: React.MouseEvent, node: Node) => {
      // Shift / Cmd / Ctrl + click toggles multi-selection.
      if (e.shiftKey || e.metaKey || e.ctrlKey) toggleNodeSelection(node.id);
      else selectNode(node.id);
      closeContextMenu();
    },
    [selectNode, toggleNodeSelection, closeContextMenu]
  );

  const onNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (isMobile) {
        setEditingNode(node.id);
      } else {
        setEditingNode(node.id);
      }
    },
    [setEditingNode, isMobile]
  );

  const onNodeContextMenu = useCallback(
    (e: React.MouseEvent, node: Node) => {
      e.preventDefault();
      // A long-press that armed (or started) a subtree drag must not also open
      // the context menu / mobile sheet.
      if (armedDrag.armedId || subtreeDrag.current) return;
      if (isMobile) {
        // On mobile a long-press opens the detail sheet instead of a menu.
        selectNode(node.id);
        setMobileSheetOpen(true);
        return;
      }
      openContextMenu(node.id, e.clientX, e.clientY);
    },
    [openContextMenu, isMobile, selectNode, setMobileSheetOpen]
  );

  const onPaneClick = useCallback(() => {
    selectNode(null);
    selectRelation(null);
    closeContextMenu();
  }, [selectNode, selectRelation, closeContextMenu]);

  // Connect mode: dragging between two node handles creates a relation.
  const onConnect = useCallback(
    (conn: Connection) => {
      if (conn.source && conn.target) addRelation(conn.source, conn.target);
    },
    [addRelation]
  );

  const onEdgeClick = useCallback(
    (e: React.MouseEvent, edge: Edge) => {
      if (edge.type === "relation") {
        e.stopPropagation();
        selectRelation(edge.id);
      }
    },
    [selectRelation]
  );

  // Subtree drag: if the long-press armed this node, capture its descendants so
  // they can follow the same delta during the drag.
  const onNodeDragStart = useCallback(
    (_: MouseEvent | TouchEvent, node: Node) => {
      const state = useMindMapStore.getState();
      // Snapshot once so the whole drag (move / subtree / re-parent) is one undo.
      pushHistory();
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
    [pushHistory]
  );

  const onNodeDrag = useCallback(
    (_: MouseEvent | TouchEvent, node: Node) => {
      const ds = subtreeDrag.current;
      if (ds && ds.id === node.id) {
        const dx = node.position.x - ds.last.x;
        const dy = node.position.y - ds.last.y;
        if (dx || dy) {
          moveNodesBy(ds.descIds, dx, dy);
          ds.last = { ...node.position };
        }
        return; // subtree drags don't re-parent
      }
      // Re-parent detection: the dragged node's center over another node.
      const rp = reparent.current;
      if (!rp || rp.id !== node.id) return;
      const cx = node.position.x + NODE_WIDTH / 2;
      const cy = node.position.y + NODE_HEIGHT / 2;
      let targetId: string | null = null;
      for (const n of useMindMapStore.getState().nodes) {
        if (n.id === node.id || rp.descendants.has(n.id)) continue;
        const w = n.measured?.width ?? NODE_WIDTH;
        const h = n.measured?.height ?? NODE_HEIGHT;
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
    [moveNodesBy, setDropTargetId]
  );

  const onNodeDragStop = useCallback(
    (_: MouseEvent | TouchEvent, node: Node) => {
      const targetId = useMindMapStore.getState().dropTargetId;
      if (targetId && !subtreeDrag.current) {
        reparentNode(node.id, targetId);
      }
      setDropTargetId(null);
      subtreeDrag.current = null;
      reparent.current = null;
      armedDrag.armedId = null;
    },
    [reparentNode, setDropTargetId]
  );

  const isEmpty = nodes.length === 0;

  return (
    <div
      className={cn(
        "relative h-full w-full mf-canvas-bg",
        connectMode && "mf-connecting"
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
        onMoveEnd={(_, vp) => updateViewport(vp)}
        minZoom={0.15}
        maxZoom={2.5}
        nodesDraggable={!presentationMode && !connectMode}
        nodesConnectable={connectMode && !presentationMode}
        connectionRadius={40}
        elementsSelectable
        multiSelectionKeyCode={null}
        selectionKeyCode="Shift"
        selectionMode={SelectionMode.Partial}
        panOnScroll
        panOnScrollSpeed={0.6}
        zoomOnPinch
        selectionOnDrag={false}
        panOnDrag={presentationMode ? false : [0, 1, 2]}
        proOptions={{ hideAttribution: true }}
        fitView
        fitViewOptions={{ padding: 0.25, maxZoom: 1.2 }}
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
            className={canvasBg === "dots" ? "!opacity-70" : "!opacity-40"}
          />
        )}
        {!presentationMode && !isMobile && (
          <Controls
            showInteractive={false}
            position="bottom-left"
            className="!mb-4 !ml-4"
          />
        )}
        {!presentationMode && (!isMobile || miniMapOpen) && (
          <MiniMap
            pannable
            zoomable
            position="bottom-right"
            className={cn("!mb-4 !mr-4", isMobile && "!h-24 !w-32")}
            nodeColor={(n) => {
              const data = n.data as MindMapNodeData;
              return (
                data?.color ??
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
          className="absolute bottom-[5.5rem] right-3 z-10 flex h-10 w-10 items-center justify-center rounded-xl mf-glass border border-line text-ink-soft shadow-soft"
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
              onClick={() =>
                useMindMapStore.getState().setConnectMode(false)
              }
              className="ml-1 rounded-full bg-brand px-2.5 py-0.5 text-[11px] font-semibold text-white transition hover:opacity-90"
            >
              완료
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
