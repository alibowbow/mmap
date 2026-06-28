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
  const nodeStyle = useMindMapStore((s) => s.nodeStyle);

  const isEditing = editingNodeId === id;
  const typeConf = NODE_TYPE_CONFIG[d.type] ?? NODE_TYPE_CONFIG.idea;
  const color = d.color ?? typeConf.color;
  const isRoot = d.isRoot || d.type === "root";
  // "plain" nodes show only the user's text — no type icon/label or color rail.
  const isPlain = d.type === "plain" && !isRoot;

  // Visual style (workspace-wide): card / soft / outline / line.
  const style = nodeStyle === "soft" || nodeStyle === "outline" || nodeStyle === "line"
    ? nodeStyle
    : "card";
  const isLine = style === "line";
  const isOutline = style === "outline";
  // The type header (icon + label) is hidden for plain and root nodes.
  const hideTypeHeader = isPlain || isRoot;
  // The left color rail only appears on the filled card/soft styles.
  const showRail = (style === "card" || style === "soft") && !isPlain;

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

  // Per-style chrome (background, border, rounding, shadow).
  const chrome = cn(
    "transition-all duration-150",
    style === "card" &&
      (selected
        ? "rounded-2xl border border-transparent bg-surface-raised shadow-ring scale-[1.02]"
        : "rounded-2xl border border-line bg-surface-raised shadow-node hover:shadow-float hover:-translate-y-0.5"),
    style === "soft" &&
      (selected
        ? "rounded-[26px] border border-transparent bg-surface-raised shadow-ring scale-[1.02]"
        : "rounded-[26px] border border-line bg-surface-raised shadow-node hover:shadow-float hover:-translate-y-0.5"),
    isOutline &&
      (selected
        ? "rounded-2xl border-2 bg-surface-base/30 shadow-ring scale-[1.02]"
        : "rounded-2xl border-2 bg-surface-base/30 hover:-translate-y-0.5"),
    isLine &&
      (selected
        ? "rounded-md border-0 border-b-2 bg-transparent shadow-ring scale-[1.02]"
        : "rounded-md border-0 border-b-2 bg-transparent hover:-translate-y-0.5")
  );

  return (
    <div
      style={{
        width: NODE_WIDTH,
        minHeight: isLine ? undefined : NODE_HEIGHT,
        borderColor: isOutline || isLine ? color : undefined,
      }}
      className={cn(
        "group relative",
        chrome,
        isMatch && !selected && "ring-2 ring-amber-400/80"
      )}
    >
      {/* Hidden handles on all four faces. The edge picks the face that points
          toward its child (left/right for trees, top/bottom for org/radial). */}
      <Handle id="left-target" type="target" position={Position.Left} />
      <Handle id="left-source" type="source" position={Position.Left} />
      <Handle id="right-target" type="target" position={Position.Right} />
      <Handle id="right-source" type="source" position={Position.Right} />
      <Handle id="top-target" type="target" position={Position.Top} />
      <Handle id="top-source" type="source" position={Position.Top} />
      <Handle id="bottom-target" type="target" position={Position.Bottom} />
      <Handle id="bottom-source" type="source" position={Position.Bottom} />

      {/* Root gradient sheen (skipped on the borderless line style) */}
      {isRoot && !isLine && (
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

      {/* Left color rail (filled card/soft styles only) */}
      {showRail && (
        <div
          className="absolute left-0 top-3 bottom-3 w-1 rounded-full"
          style={{ background: color }}
        />
      )}

      <div
        className={cn(
          "relative px-3.5",
          isLine ? "py-2" : "py-3",
          showRail ? "pl-4" : "pl-3.5"
        )}
      >
        {/* Header: icon + type + status (root/plain hide the type label) */}
        {(!hideTypeHeader || statusConf) && (
          <div className="flex items-center gap-1.5 mb-1.5">
            {!hideTypeHeader && (
              <>
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-md"
                  style={{ background: hexToRgba(color, 0.16), color }}
                >
                  <Icon name={typeConf.icon} size={13} />
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                  {typeConf.label}
                </span>
              </>
            )}
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
        )}

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
            placeholder="내용 입력…"
            className="nodrag w-full resize-none rounded-lg bg-surface-base border border-brand/50 px-2 py-1 text-sm font-medium text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-brand/40"
          />
        ) : (
          <div
            className={cn(
              "text-sm font-semibold leading-snug break-words",
              isRoot && "text-[15px]",
              d.label ? "text-ink" : "text-ink-faint font-normal italic"
            )}
          >
            {d.label || "내용 입력…"}
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

        {/* Footer: link + collapsed indicator */}
        {(d.link || (d.collapsed && childCount > 0)) && (
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
