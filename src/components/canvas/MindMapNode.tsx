"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ChevronRight, ExternalLink } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import {
  NODE_HEIGHT,
  NODE_STATUS_CONFIG,
  NODE_TYPE_CONFIG,
  NODE_WIDTH,
} from "@/lib/constants";
import { countChildren } from "@/lib/tree";
import { useMindMapStore } from "@/store/mindMapStore";
import type { MindMapNodeData } from "@/types/mindmap";

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function MindMapNodeComponent({ id, data, selected }: NodeProps) {
  const d = data as MindMapNodeData;
  const editingNodeId = useMindMapStore((s) => s.editingNodeId);
  const searchQuery = useMindMapStore((s) => s.searchQuery);
  const updateNodeLabel = useMindMapStore((s) => s.updateNodeLabel);
  const setEditingNode = useMindMapStore((s) => s.setEditingNode);
  const toggleCollapse = useMindMapStore((s) => s.toggleCollapse);
  const childCount = useMindMapStore((s) => countChildren(s.nodes, id));

  const isEditing = editingNodeId === id;
  const typeConf = NODE_TYPE_CONFIG[d.type] ?? NODE_TYPE_CONFIG.idea;
  const color = d.color ?? typeConf.color;
  const isRoot = d.isRoot || d.type === "root";

  const statusConf =
    d.status && d.status !== "none" ? NODE_STATUS_CONFIG[d.status] : null;

  const checklistDone =
    d.checklist?.filter((c) => c.checked).length ?? 0;
  const checklistTotal = d.checklist?.length ?? 0;

  // Search highlight match (label / description / tags)
  const q = searchQuery.trim().toLowerCase();
  const isMatch =
    q.length > 0 &&
    (d.label.toLowerCase().includes(q) ||
      d.description?.toLowerCase().includes(q) ||
      d.tags?.some((t) => t.toLowerCase().includes(q)));

  const [draft, setDraft] = useState(d.label);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing) {
      setDraft(d.label);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [isEditing, d.label]);

  const commitLabel = () => {
    const trimmed = draft.trim();
    updateNodeLabel(id, trimmed.length ? trimmed : d.label);
    setEditingNode(null);
  };

  return (
    <div
      style={{ width: NODE_WIDTH, minHeight: NODE_HEIGHT }}
      className={cn(
        "group relative rounded-2xl border transition-all duration-150",
        "bg-surface-raised",
        selected
          ? "border-transparent shadow-ring scale-[1.02]"
          : "border-line shadow-node hover:shadow-float hover:-translate-y-0.5",
        isMatch && !selected && "ring-2 ring-amber-400/80"
      )}
    >
      {/* Hidden handles — edges still connect, visuals come from custom edge */}
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />

      {/* Root gradient sheen */}
      {isRoot && (
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl opacity-90"
          style={{
            background: `linear-gradient(135deg, ${hexToRgba(
              color,
              0.16
            )}, ${hexToRgba(color, 0.02)})`,
          }}
        />
      )}

      {/* Left color rail */}
      <div
        className="absolute left-0 top-3 bottom-3 w-1 rounded-full"
        style={{ background: color }}
      />

      <div className="relative px-3.5 py-3 pl-4">
        {/* Header: icon + type + status */}
        <div className="flex items-center gap-1.5 mb-1.5">
          <span
            className="flex h-5 w-5 items-center justify-center rounded-md"
            style={{ background: hexToRgba(color, 0.16), color }}
          >
            <Icon name={typeConf.icon} size={13} />
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
            {typeConf.label}
          </span>
          {statusConf && (
            <span
              className="ml-auto inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
              style={{
                background: hexToRgba(statusConf.color, 0.14),
                color: statusConf.color,
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: statusConf.dot }}
              />
              {statusConf.label}
            </span>
          )}
        </div>

        {/* Label / inline editor */}
        {isEditing ? (
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitLabel}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                commitLabel();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setEditingNode(null);
              }
              e.stopPropagation();
            }}
            rows={2}
            className="nodrag w-full resize-none rounded-lg bg-surface-base border border-brand/50 px-2 py-1 text-sm font-medium text-ink focus:outline-none focus:ring-2 focus:ring-brand/40"
          />
        ) : (
          <div
            className={cn(
              "text-sm font-semibold leading-snug text-ink break-words",
              isRoot && "text-[15px]"
            )}
          >
            {d.label || "제목 없음"}
          </div>
        )}

        {d.description && !isEditing && (
          <p className="mt-1 text-[11px] leading-snug text-ink-soft line-clamp-2">
            {d.description}
          </p>
        )}

        {/* Checklist progress (tasks) */}
        {checklistTotal > 0 && (
          <div className="mt-2">
            <div className="flex items-center justify-between text-[9px] text-ink-faint mb-1">
              <span>체크리스트</span>
              <span>
                {checklistDone}/{checklistTotal}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${(checklistDone / checklistTotal) * 100}%`,
                  background: color,
                }}
              />
            </div>
          </div>
        )}

        {/* Tags */}
        {d.tags && d.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {d.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-surface-overlay px-1.5 py-0.5 text-[9px] font-medium text-ink-soft border border-line/60"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Footer: link + child count */}
        {(d.link || childCount > 0 || d.collapsed) && (
          <div className="mt-2 flex items-center gap-2 text-[10px] text-ink-faint">
            {d.link && (
              <a
                href={d.link}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="nodrag inline-flex items-center gap-0.5 text-brand hover:underline"
              >
                <ExternalLink size={10} /> 링크
              </a>
            )}
            {childCount > 0 && (
              <span className="inline-flex items-center gap-0.5">
                {childCount}개 하위
              </span>
            )}
            {d.collapsed && childCount > 0 && (
              <span className="rounded bg-surface-overlay px-1 py-0.5 text-ink-soft">
                접힘
              </span>
            )}
          </div>
        )}
      </div>

      {/* Collapse / expand toggle */}
      {childCount > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleCollapse(id);
          }}
          aria-label={d.collapsed ? "펼치기" : "접기"}
          className={cn(
            "nodrag absolute -right-3 top-1/2 -translate-y-1/2 z-10",
            "flex h-6 w-6 items-center justify-center rounded-full border border-line bg-surface-raised text-ink-soft shadow-sm",
            "hover:text-ink hover:border-brand/50 transition"
          )}
        >
          <ChevronRight
            size={14}
            className={cn("transition-transform", !d.collapsed && "rotate-90")}
          />
        </button>
      )}
    </div>
  );
}

export const MindMapNode = memo(MindMapNodeComponent);
