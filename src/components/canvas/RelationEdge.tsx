"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { useMindMapStore } from "@/store/mindMapStore";

// Free-form cross link between two nodes: dashed, arrowed, with an optional
// label chip. Click selects it (shows delete), double-click edits the label.
export function RelationEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps) {
  const selectRelation = useMindMapStore((s) => s.selectRelation);
  const removeRelation = useMindMapStore((s) => s.removeRelation);
  const updateRelationLabel = useMindMapStore((s) => s.updateRelationLabel);

  const label = (data?.label as string) ?? "";
  const isSelected = Boolean(data?.relSelected);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(label);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [editing, label]);

  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.4,
  });

  const commit = () => {
    updateRelationLabel(id, draft);
    setEditing(false);
  };

  return (
    <>
      <BaseEdge
        path={path}
        markerEnd={markerEnd}
        className="mf-relation-edge"
        style={isSelected ? { strokeWidth: 2.5 } : undefined}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
          className="nodrag nopan pointer-events-auto absolute z-10 flex items-center gap-1"
        >
          {editing ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") setEditing(false);
                e.stopPropagation();
              }}
              placeholder="관계 이름"
              className="w-28 rounded-full border border-brand/50 bg-surface-raised px-2.5 py-1 text-[11px] text-ink shadow-soft focus:outline-none focus:ring-2 focus:ring-brand/40"
            />
          ) : (
            (label || isSelected) && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  selectRelation(id);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setEditing(true);
                }}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] shadow-soft transition",
                  isSelected
                    ? "border-brand bg-brand text-white"
                    : "border-line bg-surface-raised text-ink-soft hover:border-brand/50",
                  !label && "italic text-white/80"
                )}
              >
                {label || "이름 입력"}
              </button>
            )
          )}
          {isSelected && !editing && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeRelation(id);
              }}
              aria-label="관계선 삭제"
              className="flex h-5 w-5 items-center justify-center rounded-full border border-line bg-surface-raised text-ink-soft shadow-soft transition hover:bg-red-500 hover:text-white"
            >
              <X size={11} />
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
