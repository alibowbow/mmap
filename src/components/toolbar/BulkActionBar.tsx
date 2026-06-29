"use client";

import { motion } from "framer-motion";
import { Trash2, X } from "lucide-react";

import { Icon } from "@/components/ui/Icon";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/cn";
import {
  NODE_COLOR_PALETTE,
  NODE_STATUSES,
  NODE_STATUS_CONFIG,
  NODE_TYPES,
  NODE_TYPE_CONFIG,
} from "@/lib/constants";
import { useMindMapStore } from "@/store/mindMapStore";

// Floating bar for editing several selected nodes at once.
export function BulkActionBar() {
  const ids = useMindMapStore((s) => s.selectedNodeIds);
  const bulkUpdateData = useMindMapStore((s) => s.bulkUpdateData);
  const bulkDelete = useMindMapStore((s) => s.bulkDelete);
  const selectNode = useMindMapStore((s) => s.selectNode);

  if (ids.length < 2) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className="pointer-events-auto absolute left-1/2 top-4 z-30 -translate-x-1/2"
    >
      <div className="flex items-center gap-2 rounded-2xl border border-line mf-glass px-2.5 py-2 shadow-float">
        <span className="px-1 text-xs font-semibold text-ink whitespace-nowrap">
          {ids.length}개 선택
        </span>
        <div className="h-5 w-px bg-line" />

        {/* Colors */}
        <div className="flex items-center gap-1">
          {NODE_COLOR_PALETTE.slice(0, 8).map((c) => (
            <button
              key={c}
              onClick={() => bulkUpdateData(ids, { color: c })}
              aria-label={`색상 ${c}`}
              className="h-5 w-5 rounded-full border border-line/60 transition hover:scale-110"
              style={{ background: c }}
            />
          ))}
        </div>
        <div className="h-5 w-px bg-line" />

        {/* Types */}
        <div className="flex items-center gap-0.5">
          {NODE_TYPES.filter((t) => t !== "root").map((t) => (
            <Tooltip key={t} label={NODE_TYPE_CONFIG[t].label} side="top">
              <button
                onClick={() => bulkUpdateData(ids, { type: t })}
                aria-label={NODE_TYPE_CONFIG[t].label}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-soft transition hover:bg-surface-raised hover:text-ink"
              >
                <Icon name={NODE_TYPE_CONFIG[t].icon} size={15} />
              </button>
            </Tooltip>
          ))}
        </div>
        <div className="h-5 w-px bg-line" />

        {/* Status */}
        <div className="flex items-center gap-1">
          {NODE_STATUSES.filter((s) => s !== "none").map((st) => (
            <Tooltip key={st} label={NODE_STATUS_CONFIG[st].label} side="top">
              <button
                onClick={() => bulkUpdateData(ids, { status: st })}
                aria-label={NODE_STATUS_CONFIG[st].label}
                className="h-4 w-4 rounded-full border border-line/60 transition hover:scale-110"
                style={{ background: NODE_STATUS_CONFIG[st].dot }}
              />
            </Tooltip>
          ))}
        </div>
        <div className="h-5 w-px bg-line" />

        <Tooltip label="선택 삭제" side="top">
          <button
            onClick={() => bulkDelete(ids)}
            aria-label="선택한 노드 삭제"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-red-500 transition hover:bg-red-500/10"
          >
            <Trash2 size={16} />
          </button>
        </Tooltip>
        <Tooltip label="선택 해제" side="top">
          <button
            onClick={() => selectNode(null)}
            aria-label="선택 해제"
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-lg text-ink-soft transition hover:bg-surface-raised hover:text-ink"
            )}
          >
            <X size={16} />
          </button>
        </Tooltip>
      </div>
    </motion.div>
  );
}
