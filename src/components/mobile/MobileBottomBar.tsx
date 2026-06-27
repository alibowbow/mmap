"use client";

import {
  CornerDownRight,
  LayoutGrid,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

import { cn } from "@/lib/cn";
import { useMindMapStore } from "@/store/mindMapStore";

function Action({
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
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "flex h-12 min-w-[48px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-medium transition disabled:opacity-40",
        primary
          ? "bg-brand text-white"
          : "text-ink-soft active:bg-surface-overlay"
      )}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}

// Mobile floating action bar (respects safe-area inset).
export function MobileBottomBar() {
  const selectedNodeId = useMindMapStore((s) => s.selectedNodeId);
  const addChildNode = useMindMapStore((s) => s.addChildNode);
  const addSiblingNode = useMindMapStore((s) => s.addSiblingNode);
  const deleteNode = useMindMapStore((s) => s.deleteNode);
  const autoLayout = useMindMapStore((s) => s.autoLayout);
  const setSearchOpen = useMindMapStore((s) => s.setSearchOpen);
  const setMobileSheetOpen = useMindMapStore((s) => s.setMobileSheetOpen);
  const setMobileMoreOpen = useMindMapStore((s) => s.setMobileMoreOpen);

  const has = !!selectedNodeId;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-line mf-glass p-1.5 shadow-float">
        <Action
          label="자식"
          primary
          disabled={!has}
          onClick={() => has && addChildNode(selectedNodeId!)}
        >
          <Plus size={20} />
        </Action>
        <Action
          label="형제"
          disabled={!has}
          onClick={() => has && addSiblingNode(selectedNodeId!)}
        >
          <CornerDownRight size={19} />
        </Action>
        <Action
          label="편집"
          disabled={!has}
          onClick={() => has && setMobileSheetOpen(true)}
        >
          <Pencil size={18} />
        </Action>
        <Action
          label="삭제"
          disabled={!has}
          onClick={() => has && deleteNode(selectedNodeId!)}
        >
          <Trash2 size={18} />
        </Action>
        <Action label="정렬" onClick={() => autoLayout()}>
          <LayoutGrid size={19} />
        </Action>
        <Action label="검색" onClick={() => setSearchOpen(true)}>
          <Search size={19} />
        </Action>
        <Action label="더보기" onClick={() => setMobileMoreOpen(true)}>
          <MoreHorizontal size={20} />
        </Action>
      </div>
    </div>
  );
}
