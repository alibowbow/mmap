"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  ChevronsDownUp,
  ClipboardCopy,
  ClipboardPaste,
  Copy,
  CornerDownRight,
  LayoutGrid,
  Map as MapIcon,
  Palette,
  Pencil,
  Plus,
  Sparkles,
  SquareArrowOutUpRight,
  Trash2,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import {
  EMOJI_PRESETS,
  NODE_COLOR_PALETTE,
  NODE_STATUSES,
  NODE_STATUS_CONFIG,
  NODE_TYPES,
  NODE_TYPE_CONFIG,
} from "@/lib/constants";
import { getRootNode } from "@/lib/tree";
import { useMindMapStore } from "@/store/mindMapStore";

function Item({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition hover:bg-surface-raised",
        danger ? "text-red-500" : "text-ink"
      )}
    >
      <span className="text-ink-soft">{icon}</span>
      {label}
    </button>
  );
}

// Compact half-width item — keeps the menu short.
function GridItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-ink transition hover:bg-surface-raised"
    >
      <span className="shrink-0 text-ink-soft">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

export function NodeContextMenu() {
  const menu = useMindMapStore((s) => s.contextMenu);
  const close = useMindMapStore((s) => s.closeContextMenu);
  const node = useMindMapStore((s) =>
    s.nodes.find((n) => n.id === s.contextMenu?.nodeId)
  );

  const addChildNode = useMindMapStore((s) => s.addChildNode);
  const addSiblingNode = useMindMapStore((s) => s.addSiblingNode);
  const setEditingNode = useMindMapStore((s) => s.setEditingNode);
  const updateNodeData = useMindMapStore((s) => s.updateNodeData);
  const toggleCollapse = useMindMapStore((s) => s.toggleCollapse);
  const duplicateSubtree = useMindMapStore((s) => s.duplicateSubtree);
  const copySubtree = useMindMapStore((s) => s.copySubtree);
  const pasteSubtree = useMindMapStore((s) => s.pasteSubtree);
  const hasClipboard = useMindMapStore((s) => Boolean(s.clipboard?.length));
  const autoLayoutSubtree = useMindMapStore((s) => s.autoLayoutSubtree);
  const promoteNodeToMap = useMindMapStore((s) => s.promoteNodeToMap);
  const openLinkedDoc = useMindMapStore((s) => s.openLinkedDoc);
  const deleteNode = useMindMapStore((s) => s.deleteNode);
  const setNodeSide = useMindMapStore((s) => s.setNodeSide);
  const rootId = useMindMapStore((s) => getRootNode(s.nodes)?.id);

  useEffect(() => {
    if (!menu) return;
    const onScroll = () => close();
    window.addEventListener("wheel", onScroll, { passive: true });
    return () => window.removeEventListener("wheel", onScroll);
  }, [menu, close]);

  // Clamp to the viewport using the menu's real size (it varies with the
  // node's options), so items like 삭제 are never cut off screen.
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    if (!menu) {
      setPos(null);
      return;
    }
    const el = menuRef.current;
    // offsetWidth/Height ignore the entrance scale transform.
    const w = el?.offsetWidth ?? 230;
    const h = el?.offsetHeight ?? 420;
    setPos({
      x: Math.max(8, Math.min(menu.x, window.innerWidth - w - 12)),
      y: Math.max(8, Math.min(menu.y, window.innerHeight - h - 12)),
    });
  }, [menu]);

  if (!menu || !node) return null;

  const x = pos?.x ?? menu.x;
  const y = pos?.y ?? menu.y;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[90]" onClick={close} onContextMenu={(e) => { e.preventDefault(); close(); }}>
        <motion.div
          ref={menuRef}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.12 }}
          style={{ left: x, top: y, maxHeight: "calc(100vh - 24px)" }}
          onClick={(e) => e.stopPropagation()}
          className="absolute w-56 overflow-y-auto mf-scroll rounded-2xl border border-line bg-surface-overlay/95 backdrop-blur-xl p-1.5 shadow-float"
        >
          {/* Primary actions as a compact 3-up row */}
          <div className="grid grid-cols-3 gap-1 px-1 pb-1">
            {[
              {
                icon: <Plus size={15} />,
                label: "자식",
                onClick: () => {
                  addChildNode(node.id);
                  close();
                },
              },
              {
                icon: <CornerDownRight size={15} />,
                label: "형제",
                onClick: () => {
                  addSiblingNode(node.id);
                  close();
                },
              },
              {
                icon: <Pencil size={14} />,
                label: "편집",
                onClick: () => {
                  setEditingNode(node.id);
                  close();
                },
              },
            ].map((a) => (
              <button
                key={a.label}
                onClick={a.onClick}
                className="flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10.5px] text-ink-soft transition hover:bg-surface-raised hover:text-ink"
              >
                {a.icon}
                {a.label}
              </button>
            ))}
          </div>

          <div className="my-1 h-px bg-line" />

          {/* Color row */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5">
            <Palette size={15} className="text-ink-soft" />
            <div className="flex flex-1 flex-wrap gap-1">
              {NODE_COLOR_PALETTE.slice(0, 6).map((c) => (
                <button
                  key={c}
                  onClick={() => updateNodeData(node.id, { color: c })}
                  className="h-4 w-4 rounded-full border border-line"
                  style={{ background: c }}
                  aria-label={`색상 ${c}`}
                />
              ))}
            </div>
          </div>

          {/* Emoji row */}
          <div className="grid grid-cols-9 gap-0.5 px-2.5 py-1">
            {EMOJI_PRESETS.map((em) => (
              <button
                key={em}
                onClick={() =>
                  updateNodeData(node.id, {
                    emoji: node.data.emoji === em ? undefined : em,
                  })
                }
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-md text-[14px] transition hover:bg-surface-raised",
                  node.data.emoji === em && "bg-brand/15 ring-1 ring-brand/40"
                )}
                aria-label={`이모지 ${em}`}
              >
                {em}
              </button>
            ))}
            {node.data.emoji && (
              <button
                onClick={() => updateNodeData(node.id, { emoji: undefined })}
                className="flex h-6 w-6 items-center justify-center rounded-md text-[11px] text-ink-faint transition hover:bg-surface-raised"
                aria-label="이모지 지우기"
              >
                ✕
              </button>
            )}
          </div>

          {/* Type row */}
          <div className="flex items-center gap-1 px-2.5 py-1.5">
            {NODE_TYPES.filter((t) => t !== "root").map((t) => (
              <button
                key={t}
                onClick={() => updateNodeData(node.id, { type: t })}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-lg transition",
                  node.data.type === t
                    ? "bg-brand/15 text-brand"
                    : "text-ink-soft hover:bg-surface-raised"
                )}
                style={
                  node.data.type === t
                    ? { color: NODE_TYPE_CONFIG[t].color }
                    : undefined
                }
                aria-label={NODE_TYPE_CONFIG[t].label}
              >
                <Icon name={NODE_TYPE_CONFIG[t].icon} size={14} />
              </button>
            ))}
          </div>

          {/* Status row */}
          <div className="flex flex-wrap gap-1 px-2.5 py-1.5">
            {NODE_STATUSES.map((st) => (
              <button
                key={st}
                onClick={() => updateNodeData(node.id, { status: st })}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-medium transition",
                  (node.data.status ?? "none") === st
                    ? "text-white"
                    : "bg-surface-raised text-ink-soft"
                )}
                style={
                  (node.data.status ?? "none") === st
                    ? { background: NODE_STATUS_CONFIG[st].color }
                    : undefined
                }
              >
                {NODE_STATUS_CONFIG[st].label}
              </button>
            ))}
          </div>

          {/* Branch direction (first-level branches only) */}
          {!(node.data.isRoot || node.data.type === "root") &&
            node.data.parentId === rootId && (
              <>
                <div className="my-1 h-px bg-line" />
                <div className="flex items-center gap-1 px-2.5 py-1">
                  <span className="text-ink-soft">
                    <ArrowRight size={15} />
                  </span>
                  {(
                    [
                      { id: undefined, label: "자동", icon: <Sparkles size={13} /> },
                      { id: "left", label: "왼쪽", icon: <ArrowLeft size={13} /> },
                      { id: "right", label: "오른쪽", icon: <ArrowRight size={13} /> },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => {
                        setNodeSide(node.id, opt.id);
                        close();
                      }}
                      className={cn(
                        "inline-flex flex-1 items-center justify-center gap-1 rounded-lg px-1.5 py-1 text-[11px] font-medium transition",
                        (node.data.side ?? undefined) === opt.id
                          ? "bg-brand/15 text-brand"
                          : "text-ink-soft hover:bg-surface-raised"
                      )}
                    >
                      {opt.icon}
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}

          <div className="my-1 h-px bg-line" />

          <div className="grid grid-cols-2 gap-0.5 px-0.5">
            <GridItem
              icon={<ChevronsDownUp size={14} />}
              label={node.data.collapsed ? "펼치기" : "접기"}
              onClick={() => {
                toggleCollapse(node.id);
                close();
              }}
            />
            <GridItem
              icon={<LayoutGrid size={14} />}
              label="하위 정렬"
              onClick={() => {
                autoLayoutSubtree(node.id);
                close();
              }}
            />
            <GridItem
              icon={<Copy size={14} />}
              label="복제"
              onClick={() => {
                duplicateSubtree(node.id);
                close();
              }}
            />
            <GridItem
              icon={<ClipboardCopy size={14} />}
              label="복사 ⌘C"
              onClick={() => {
                copySubtree(node.id);
                close();
              }}
            />
            {hasClipboard && (
              <GridItem
                icon={<ClipboardPaste size={14} />}
                label="붙여넣기 ⌘V"
                onClick={() => {
                  pasteSubtree(node.id);
                  close();
                }}
              />
            )}
            {node.data.linkedDocId ? (
              <GridItem
                icon={<MapIcon size={14} />}
                label="연결 맵 열기"
                onClick={() => {
                  openLinkedDoc(node.data.linkedDocId!);
                  close();
                }}
              />
            ) : (
              !(node.data.isRoot || node.data.type === "root") && (
                <GridItem
                  icon={<SquareArrowOutUpRight size={14} />}
                  label="새 맵 분리"
                  onClick={() => {
                    promoteNodeToMap(node.id);
                    close();
                  }}
                />
              )
            )}
          </div>
          {!(node.data.isRoot || node.data.type === "root") && (
            <>
              <div className="my-1 h-px bg-line" />
              <Item
                icon={<Trash2 size={15} />}
                label="삭제"
                danger
                onClick={() => {
                  deleteNode(node.id);
                  close();
                }}
              />
            </>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
