"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
} from "@xyflow/react";
import { ChevronDown, Map as MapIcon } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

import { CanvasEmptyState } from "@/components/canvas/CanvasEmptyState";
import { MindMapEdge } from "@/components/canvas/MindMapEdge";
import { MindMapNode } from "@/components/canvas/MindMapNode";
import { cn } from "@/lib/cn";
import { NODE_HEIGHT, NODE_TYPE_CONFIG, NODE_WIDTH } from "@/lib/constants";
import { subtreeDrag as armedDrag } from "@/lib/dragState";
import {
  computeDepths,
  getDescendantIds,
  getHiddenNodeIds,
} from "@/lib/tree";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useMindMapStore } from "@/store/mindMapStore";
import type { MindMapNodeData } from "@/types/mindmap";

const nodeTypes = { mindmap: MindMapNode };
const edgeTypes = { mindmap: MindMapEdge };

function CanvasInner() {
  const isMobile = useIsMobile();
  const nodes = useMindMapStore((s) => s.nodes);
  const edges = useMindMapStore((s) => s.edges);
  const selectedNodeIds = useMindMapStore((s) => s.selectedNodeIds);
  const presentationMode = useMindMapStore((s) => s.presentationMode);
  const edgeWidth = useMindMapStore((s) => s.edgeWidth);
  const edgeColorMode = useMindMapStore((s) => s.edgeColorMode);

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
    const dn: Node<MindMapNodeData>[] = nodes.map((n) => ({
      ...n,
      type: "mindmap",
      selected: selectedSet.has(n.id),
      hidden: hidden.has(n.id),
      draggable: !presentationMode,
      data: { ...n.data, _depth: depths.get(n.id) ?? 0 },
    }));
    const de: Edge[] = edges.map((e) => {
      // Route each edge from the face pointing toward its child. Horizontal
      // trees use left/right, vertical/org & radial use top/bottom — chosen by
      // whichever axis dominates the parent→child offset.
      const s = posMap.get(e.source);
      const t = posMap.get(e.target);
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
      const stroke =
        edgeColorMode === "node" ? colorOf.get(e.source) : undefined;
      return {
        ...e,
        type: "mindmap",
        sourceHandle,
        targetHandle,
        style: { strokeWidth: edgeWidth, ...(stroke ? { stroke } : {}) },
        hidden: hidden.has(e.source) || hidden.has(e.target),
      };
    });
    return { displayNodes: dn, displayEdges: de };
  }, [
    nodes,
    edges,
    selectedNodeIds,
    presentationMode,
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
    closeContextMenu();
  }, [selectNode, closeContextMenu]);

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
    <div className="relative h-full w-full mf-canvas-bg">
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
        onInit={registerFlow}
        onMoveEnd={(_, vp) => updateViewport(vp)}
        minZoom={0.15}
        maxZoom={2.5}
        nodesDraggable={!presentationMode}
        nodesConnectable={false}
        elementsSelectable
        multiSelectionKeyCode={null}
        selectionKeyCode={null}
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
        <Background
          variant={BackgroundVariant.Dots}
          gap={22}
          size={1.4}
          className="!opacity-70"
        />
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
