"use client";

import { motion } from "framer-motion";
import {
  CornerDownRight,
  LayoutGrid,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";

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
          "flex h-10 w-10 items-center justify-center rounded-xl transition disabled:opacity-40 " +
          (primary
            ? "bg-brand text-white hover:brightness-110 shadow-sm"
            : "text-ink-soft hover:bg-surface-overlay hover:text-ink")
        }
      >
        {children}
      </button>
    </Tooltip>
  );
}

// Glassmorphism floating action bar, centered at the bottom of the canvas.
export function FloatingToolbar() {
  const selectedNodeId = useMindMapStore((s) => s.selectedNodeId);
  const addChildNode = useMindMapStore((s) => s.addChildNode);
  const addSiblingNode = useMindMapStore((s) => s.addSiblingNode);
  const autoLayout = useMindMapStore((s) => s.autoLayout);
  const setSearchOpen = useMindMapStore((s) => s.setSearchOpen);
  const openCommandPalette = useMindMapStore((s) => s.openCommandPalette);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="pointer-events-auto absolute bottom-5 left-1/2 z-20 -translate-x-1/2"
    >
      <div className="flex items-center gap-1 rounded-2xl border border-line mf-glass p-1.5 shadow-float">
        <ToolButton
          label="자식 노드 추가 (Tab)"
          primary
          disabled={!selectedNodeId}
          onClick={() => selectedNodeId && addChildNode(selectedNodeId)}
        >
          <Plus size={18} />
        </ToolButton>
        <ToolButton
          label="형제 노드 추가 (Enter)"
          disabled={!selectedNodeId}
          onClick={() => selectedNodeId && addSiblingNode(selectedNodeId)}
        >
          <CornerDownRight size={18} />
        </ToolButton>
        <div className="mx-0.5 h-6 w-px bg-line" />
        <ToolButton label="자동 정렬" onClick={() => autoLayout()}>
          <LayoutGrid size={18} />
        </ToolButton>
        <ToolButton label="검색 (Ctrl+F)" onClick={() => setSearchOpen(true)}>
          <Search size={18} />
        </ToolButton>
        <ToolButton
          label="커맨드 팔레트 (Ctrl+K)"
          onClick={openCommandPalette}
        >
          <Sparkles size={18} />
        </ToolButton>
      </div>
    </motion.div>
  );
}
