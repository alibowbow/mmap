"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CornerDownRight, Pencil, Plus } from "lucide-react";

import { Tooltip } from "@/components/ui/Tooltip";
import { useMindMapStore } from "@/store/mindMapStore";

function ToolButton({
  label,
  onClick,
  children,
  primary,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Tooltip label={label} side="top">
      <button
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={
          "flex h-11 w-11 items-center justify-center rounded-xl transition-colors disabled:opacity-35 " +
          (primary
            ? "bg-brand text-brand-contrast shadow-sm hover:brightness-105"
            : "text-ink-soft hover:bg-surface-sunken hover:text-ink")
        }
      >
        {children}
      </button>
    </Tooltip>
  );
}

// A selection-only action dock. Global navigation and layout controls live in
// the top bar, leaving this dock focused on the node currently being shaped.
export function FloatingToolbar() {
  const selectedNodeId = useMindMapStore((s) => s.selectedNodeId);
  const selectedIsRoot = useMindMapStore((s) =>
    s.nodes.some((node) => node.id === s.selectedNodeId && node.data.isRoot)
  );
  const addChildNode = useMindMapStore((s) => s.addChildNode);
  const addSiblingNode = useMindMapStore((s) => s.addSiblingNode);
  const setEditingNode = useMindMapStore((s) => s.setEditingNode);

  return (
    <AnimatePresence>
      {selectedNodeId && (
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="pointer-events-auto absolute bottom-5 left-1/2 z-20 -translate-x-1/2"
        >
          <div className="flex items-center gap-1 rounded-[18px] border border-line bg-surface-raised/96 p-1.5 shadow-float backdrop-blur-md">
            <ToolButton
              label="자식 노드 추가 (Tab)"
              primary
              onClick={() => addChildNode(selectedNodeId)}
            >
              <Plus size={18} />
            </ToolButton>
            <ToolButton
              label="형제 노드 추가 (Enter)"
              disabled={selectedIsRoot}
              onClick={() => addSiblingNode(selectedNodeId)}
            >
              <CornerDownRight size={18} />
            </ToolButton>
            <ToolButton
              label="내용 편집 (F2)"
              onClick={() => setEditingNode(selectedNodeId)}
            >
              <Pencil size={17} />
            </ToolButton>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
