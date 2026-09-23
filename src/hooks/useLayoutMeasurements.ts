"use client";
import {
  useNodesInitialized,
  useReactFlow,
  useStore as useFlowStore,
  useUpdateNodeInternals,
} from "@xyflow/react";
import { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import { useMindMapStore } from "@/store/mindMapStore";
import type { EnginePort, Face } from "@/lib/layout-engine/types";

export function useLayoutMeasurements() {
  const initialized = useNodesInitialized(),
    { getInternalNode } = useReactFlow(),
    updateInternals = useUpdateNodeInternals();
  const nodes = useMindMapStore((s) => s.nodes),
    documentId = useMindMapStore((s) => s.activeDocumentId);
  const nodeStyle = useMindMapStore((s) => s.nodeStyle),
    font = useMindMapStore((s) => s.font),
    sizes = useMindMapStore((s) => s.levelFontSizes);
  const update = useMindMapStore((s) => s.updateLayoutMeasurements);
  // Undo can restore already-cached dimensions before React Flow refreshes its
  // handles. In that case no new app dimensions change fires. Observe the
  // actual handle objects as well, without reacting to camera/selection state.
  const handles = useFlowStore(
    useShallow((s) =>
      Array.from(s.nodeLookup.values(), (n) => n.internals.handleBounds),
    ),
  );
  useEffect(() => {
    if (!initialized && nodes.length) return;
    const raf = requestAnimationFrame(() => {
      const ports = new Map<string, EnginePort[]>();
      for (const n of nodes) {
        const internals = getInternalNode(n.id);
        if (!internals?.internals.handleBounds) continue;
        const ps: EnginePort[] = [];
        for (const handles of Object.values(internals.internals.handleBounds))
          for (const h of handles ?? []) {
            if (!h.id) continue;
            const face = h.position as Face;
            const x =
              h.x +
              (face === "right" ? h.width : face === "left" ? 0 : h.width / 2);
            const y =
              h.y +
              (face === "bottom"
                ? h.height
                : face === "top"
                  ? 0
                  : h.height / 2);
            ps.push({ handleId: h.id, face, offset: { x, y } });
          }
        ports.set(n.id, ps);
      }
      update(ports);
    });
    return () => cancelAnimationFrame(raf);
  }, [initialized, nodes, handles, getInternalNode, update, documentId]);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (active)
        updateInternals(
          useMindMapStore
            .getState()
            .nodes.filter((n) => !n.hidden)
            .map((n) => n.id),
        );
    };
    const raf = requestAnimationFrame(refresh);
    void document.fonts?.ready.then(refresh);
    document.fonts?.addEventListener("loadingdone", refresh);
    return () => {
      active = false;
      cancelAnimationFrame(raf);
      document.fonts?.removeEventListener("loadingdone", refresh);
    };
  }, [documentId, font, nodeStyle, sizes, updateInternals]);
}
