"use client";

import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { Maximize2, Minimize2, Plus } from "lucide-react";
import { useState } from "react";

import { NodeEditorFields } from "@/components/panels/NodeEditorFields";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { NODE_TYPE_CONFIG } from "@/lib/constants";
import {
  selectSelectedNode,
  useMindMapStore,
} from "@/store/mindMapStore";

type Snap = "medium" | "expanded";

// Heights as a fraction of the dynamic viewport height.
const SNAP_VH: Record<Snap, number> = {
  medium: 50,
  expanded: 85,
};

export function MobileNodeSheet() {
  const open = useMindMapStore((s) => s.mobileSheetOpen);
  const setOpen = useMindMapStore((s) => s.setMobileSheetOpen);
  const node = useMindMapStore(selectSelectedNode);
  const addChildNode = useMindMapStore((s) => s.addChildNode);

  const [snap, setSnap] = useState<Snap>("medium");

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 140) {
      // dragged down far → close
      setOpen(false);
      setSnap("medium");
    } else if (info.offset.y > 60) {
      setSnap("medium");
    } else if (info.offset.y < -60) {
      setSnap("expanded");
    }
  };

  const conf = node ? NODE_TYPE_CONFIG[node.data.type] : null;

  return (
    <AnimatePresence>
      {open && node && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-slate-950/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            drag="y"
            dragControls={undefined}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.05, bottom: 0.4 }}
            onDragEnd={onDragEnd}
            style={{ height: `${SNAP_VH[snap]}dvh` }}
            className="fixed inset-x-0 bottom-0 z-[121] flex flex-col rounded-t-3xl border-t border-line bg-surface-raised shadow-float"
          >
            {/* Drag handle */}
            <div className="flex shrink-0 cursor-grab touch-none items-center justify-center pt-2.5 pb-1.5 active:cursor-grabbing">
              <div className="h-1.5 w-10 rounded-full bg-ink-faint/40" />
            </div>

            {/* Header */}
            <div className="flex shrink-0 items-center gap-2 px-4 pb-2">
              {conf && (
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-lg"
                  style={{
                    background: `${conf.color}22`,
                    color: node.data.color ?? conf.color,
                  }}
                >
                  <Icon name={conf.icon} size={15} />
                </span>
              )}
              <span className="flex-1 truncate text-sm font-semibold text-ink">
                {node.data.label || "노드 편집"}
              </span>
              <button
                onClick={() =>
                  setSnap((s) => (s === "expanded" ? "medium" : "expanded"))
                }
                aria-label="시트 크기 전환"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft active:bg-surface-overlay"
              >
                {snap === "expanded" ? (
                  <Minimize2 size={17} />
                ) : (
                  <Maximize2 size={17} />
                )}
              </button>
            </div>

            {/* Scrollable editor — extra bottom padding so the soft keyboard
                never hides the active input. */}
            <div className="flex-1 overflow-y-auto mf-scroll px-4 pb-40">
              <NodeEditorFields node={node} />
            </div>

            {/* Sticky add-child button */}
            <div className="shrink-0 border-t border-line/60 bg-surface-raised p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <Button
                variant="primary"
                className="w-full justify-center"
                onClick={() => addChildNode(node.id)}
              >
                <Plus size={16} /> 자식 노드 추가
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
