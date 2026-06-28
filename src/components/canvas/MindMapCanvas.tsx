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
import { useCallback, useMemo, useState } from "react";

import { CanvasEmptyState } from "@/components/canvas/CanvasEmptyState";
import { MindMapEdge } from "@/components/canvas/MindMapEdge";
import { MindMapNode } from "@/components/canvas/MindMapNode";
import { cn } from "@/lib/cn";
import { NODE_TYPE_CONFIG } from "@/lib/constants";
import { getHiddenNodeIds } from "@/lib/tree";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useMindMapStore } from "@/store/mindMapStore";
import type { MindMapNodeData } from "@/types/mindmap";

const nodeTypes = { mindmap: MindMapNode };
const edgeTypes = { mindmap: MindMapEdge };

function CanvasInner() {
  const isMobile = useIsMobile();
  const nodes = useMindMapStore((s) => s.nodes);
  const edges = useMindMapStore((s) => s.edges);
  const selectedNodeId = useMindMapStore((s) => s.selectedNodeId);
  const presentationMode = useMindMapStore((s) => s.presentationMode);

  const onNodesChange = useMindMapStore((s) => s.onNodesChange);
  const onEdgesChange = useMindMapStore((s) => s.onEdgesChange);
  const selectNode = useMindMapStore((s) => s.selectNode);
  const setEditingNode = useMindMapStore((s) => s.setEditingNode);
  const openContextMenu = useMindMapStore((s) => s.openContextMenu);
  const closeContextMenu = useMindMapStore((s) => s.closeContextMenu);
  const registerFlow = useMindMapStore((s) => s.registerFlow);
  const updateViewport = useMindMapStore((s) => s.updateViewport);
  const setMobileSheetOpen = useMindMapStore((s) => s.setMobileSheetOpen);

  const [miniMapOpen, setMiniMapOpen] = useState(false);

  // Compute visible nodes/edges (hide collapsed subtrees) and selection flag.
  const { displayNodes, displayEdges } = useMemo(() => {
    const hidden = getHiddenNodeIds(nodes);
    const posMap = new Map(nodes.map((n) => [n.id, n.position]));
    const dn: Node<MindMapNodeData>[] = nodes.map((n) => ({
      ...n,
      type: "mindmap",
      selected: n.id === selectedNodeId,
      hidden: hidden.has(n.id),
      draggable: !presentationMode,
    }));
    const de: Edge[] = edges.map((e) => {
      // Route each edge from the side that faces its child: left-side branches
      // connect parent-left → child-right, right-side branches the other way.
      const s = posMap.get(e.source);
      const t = posMap.get(e.target);
      const leftBranch = !!s && !!t && t.x < s.x;
      return {
        ...e,
        type: "mindmap",
        sourceHandle: leftBranch ? "left-source" : "right-source",
        targetHandle: leftBranch ? "right-target" : "left-target",
        hidden: hidden.has(e.source) || hidden.has(e.target),
      };
    });
    return { displayNodes: dn, displayEdges: de };
  }, [nodes, edges, selectedNodeId, presentationMode]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      selectNode(node.id);
      closeContextMenu();
    },
    [selectNode, closeContextMenu]
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
        onPaneClick={onPaneClick}
        onInit={registerFlow}
        onMoveEnd={(_, vp) => updateViewport(vp)}
        minZoom={0.15}
        maxZoom={2.5}
        nodesDraggable={!presentationMode}
        nodesConnectable={false}
        elementsSelectable
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
