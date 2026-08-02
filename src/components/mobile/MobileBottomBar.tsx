"use client";

import {
  CornerDownRight,
  MoreHorizontal,
  Pencil,
  Plus,
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
        "flex h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-semibold transition-colors disabled:opacity-40",
        primary
          ? "bg-brand text-brand-contrast"
          : "text-ink-soft active:bg-surface-sunken"
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
  const selectedRelationId = useMindMapStore((s) => s.selectedRelationId);
  const addChildNode = useMindMapStore((s) => s.addChildNode);
  const addSiblingNode = useMindMapStore((s) => s.addSiblingNode);
  const deleteNode = useMindMapStore((s) => s.deleteNode);
  const removeRelation = useMindMapStore((s) => s.removeRelation);
  const setMobileSheetOpen = useMindMapStore((s) => s.setMobileSheetOpen);
  const setMobileMoreOpen = useMindMapStore((s) => s.setMobileMoreOpen);

  const has = !!selectedNodeId;

  return (
    <nav
      aria-label="선택한 노드 작업"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))]"
    >
      <div className="pointer-events-auto flex items-center gap-1 rounded-[20px] border border-line bg-surface-raised/96 p-1.5 shadow-float backdrop-blur-md">
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
          label={selectedRelationId ? "관계 삭제" : "삭제"}
          disabled={!has && !selectedRelationId}
          onClick={() => {
            if (selectedRelationId) removeRelation(selectedRelationId);
            else if (has) deleteNode(selectedNodeId!);
          }}
        >
          <Trash2 size={18} />
        </Action>
        <Action label="더보기" onClick={() => setMobileMoreOpen(true)}>
          <MoreHorizontal size={20} />
        </Action>
      </div>
    </nav>
  );
}
