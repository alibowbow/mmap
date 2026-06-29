"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  LayoutGrid,
  Link2,
  Map as MapIcon,
  Plus,
  Sparkles,
  SquareArrowOutUpRight,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { cn } from "@/lib/cn";
import {
  NODE_COLOR_PALETTE,
  NODE_STATUSES,
  NODE_STATUS_CONFIG,
  NODE_TYPES,
  NODE_TYPE_CONFIG,
} from "@/lib/constants";
import { createId } from "@/lib/id";
import { getRootNode } from "@/lib/tree";
import { useMindMapStore } from "@/store/mindMapStore";
import type { BranchSide, ChecklistItem, MindMapNode } from "@/types/mindmap";

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
        {label}
      </p>
      {children}
    </div>
  );
}

// Shared editor used by both the desktop inspector and the mobile bottom sheet.
export function NodeEditorFields({ node }: { node: MindMapNode }) {
  const updateNodeData = useMindMapStore((s) => s.updateNodeData);
  const updateNodeLabel = useMindMapStore((s) => s.updateNodeLabel);
  const toggleCollapse = useMindMapStore((s) => s.toggleCollapse);
  const autoLayoutSubtree = useMindMapStore((s) => s.autoLayoutSubtree);
  const duplicateSubtree = useMindMapStore((s) => s.duplicateSubtree);
  const deleteSubtree = useMindMapStore((s) => s.deleteSubtree);
  const deleteNode = useMindMapStore((s) => s.deleteNode);
  const promoteNodeToMap = useMindMapStore((s) => s.promoteNodeToMap);
  const openLinkedDoc = useMindMapStore((s) => s.openLinkedDoc);
  const setNodeSide = useMindMapStore((s) => s.setNodeSide);
  const rootId = useMindMapStore((s) => getRootNode(s.nodes)?.id);

  const d = node.data;
  const [tagDraft, setTagDraft] = useState("");
  const [checkDraft, setCheckDraft] = useState("");
  const isRoot = d.isRoot || d.type === "root";
  // Branch direction only makes sense for first-level branches off the root.
  const isFirstLevel = !isRoot && d.parentId === rootId;

  const addTag = () => {
    const t = tagDraft.trim().replace(/^#/, "");
    if (!t) return;
    const tags = Array.from(new Set([...(d.tags ?? []), t]));
    updateNodeData(node.id, { tags });
    setTagDraft("");
  };

  const removeTag = (tag: string) =>
    updateNodeData(node.id, { tags: (d.tags ?? []).filter((t) => t !== tag) });

  const addChecklistItem = () => {
    const text = checkDraft.trim();
    if (!text) return;
    const item: ChecklistItem = { id: createId("c"), text, checked: false };
    updateNodeData(node.id, { checklist: [...(d.checklist ?? []), item] });
    setCheckDraft("");
  };

  const toggleChecklist = (id: string) =>
    updateNodeData(node.id, {
      checklist: (d.checklist ?? []).map((c) =>
        c.id === id ? { ...c, checked: !c.checked } : c
      ),
    });

  const removeChecklist = (id: string) =>
    updateNodeData(node.id, {
      checklist: (d.checklist ?? []).filter((c) => c.id !== id),
    });

  return (
    <div className="space-y-5">
      {/* Title */}
      <Section label="제목">
        <Input
          value={d.label}
          onChange={(e) => updateNodeLabel(node.id, e.target.value)}
          placeholder="노드 제목"
        />
      </Section>

      {/* Type */}
      <Section label="타입">
        <div className="grid grid-cols-4 gap-1.5">
          {NODE_TYPES.filter((t) => t !== "root" || isRoot).map((t) => {
            const conf = NODE_TYPE_CONFIG[t];
            const active = d.type === t;
            return (
              <button
                key={t}
                onClick={() => updateNodeData(node.id, { type: t })}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[10px] font-medium transition min-h-[44px]",
                  active
                    ? "border-brand bg-brand/10 text-ink"
                    : "border-line text-ink-soft hover:bg-surface-overlay"
                )}
                style={active ? { color: conf.color } : undefined}
              >
                <Icon name={conf.icon} size={16} />
                {conf.label}
              </button>
            );
          })}
        </div>
      </Section>

      {/* Status */}
      <Section label="상태">
        <div className="flex flex-wrap gap-1.5">
          {NODE_STATUSES.map((st) => {
            const conf = NODE_STATUS_CONFIG[st];
            const active = (d.status ?? "none") === st;
            return (
              <button
                key={st}
                onClick={() => updateNodeData(node.id, { status: st })}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition min-h-[36px]",
                  active
                    ? "border-transparent text-white"
                    : "border-line text-ink-soft hover:bg-surface-overlay"
                )}
                style={active ? { background: conf.color } : undefined}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: active ? "#fff" : conf.dot }}
                />
                {conf.label}
              </button>
            );
          })}
        </div>
      </Section>

      {/* Branch direction (first-level branches only) */}
      {isFirstLevel && (
        <Section label="가지 방향 (양방향 레이아웃)">
          <div className="flex gap-1.5">
            {(
              [
                { id: undefined, label: "자동", icon: <Sparkles size={15} /> },
                { id: "left" as BranchSide, label: "왼쪽", icon: <ArrowLeft size={15} /> },
                { id: "right" as BranchSide, label: "오른쪽", icon: <ArrowRight size={15} /> },
              ] as { id: BranchSide | undefined; label: string; icon: React.ReactNode }[]
            ).map((opt) => {
              const active = (d.side ?? undefined) === opt.id;
              return (
                <button
                  key={opt.label}
                  onClick={() => setNodeSide(node.id, opt.id)}
                  className={cn(
                    "inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs font-medium transition min-h-[40px]",
                    active
                      ? "border-brand bg-brand/10 text-ink"
                      : "border-line text-ink-soft hover:bg-surface-overlay"
                  )}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {/* Color */}
      <Section label="색상">
        <div className="flex flex-wrap items-center gap-2">
          {NODE_COLOR_PALETTE.map((c) => {
            const active = (d.color ?? "") === c;
            return (
              <button
                key={c}
                onClick={() => updateNodeData(node.id, { color: c })}
                aria-label={`색상 ${c}`}
                className={cn(
                  "h-8 w-8 rounded-full border-2 transition flex items-center justify-center",
                  active ? "border-ink scale-110" : "border-transparent"
                )}
                style={{ background: c }}
              >
                {active && <Check size={14} className="text-white" />}
              </button>
            );
          })}
          {/* Custom hex picker */}
          <label
            className="relative h-8 w-8 cursor-pointer overflow-hidden rounded-full border-2 border-dashed border-line"
            title="직접 색상 선택"
            style={{
              background:
                "conic-gradient(from 0deg, #ef4444, #f59e0b, #22c55e, #06b6d4, #6366f1, #ec4899, #ef4444)",
            }}
          >
            <input
              type="color"
              value={d.color ?? "#6366f1"}
              onChange={(e) => updateNodeData(node.id, { color: e.target.value })}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
        </div>
      </Section>

      {/* Description */}
      <Section label="설명">
        <Textarea
          value={d.description ?? ""}
          onChange={(e) =>
            updateNodeData(node.id, { description: e.target.value })
          }
          placeholder="노드에 대한 설명을 적어보세요"
        />
      </Section>

      {/* Tags */}
      <Section label="태그">
        {d.tags && d.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {d.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-surface-overlay border border-line px-2 py-1 text-xs text-ink-soft"
              >
                #{tag}
                <button
                  onClick={() => removeTag(tag)}
                  aria-label={`${tag} 삭제`}
                  className="text-ink-faint hover:text-red-500"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
            placeholder="태그 추가 후 Enter"
          />
          <Button size="icon" onClick={addTag} aria-label="태그 추가">
            <Plus size={16} />
          </Button>
        </div>
      </Section>

      {/* Checklist */}
      <Section label="체크리스트">
        {d.checklist && d.checklist.length > 0 && (
          <div className="space-y-1.5">
            {d.checklist.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2 rounded-lg bg-surface-overlay px-2 py-1.5"
              >
                <button
                  onClick={() => toggleChecklist(item.id)}
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition",
                    item.checked
                      ? "bg-emerald-500 border-emerald-500 text-white"
                      : "border-line"
                  )}
                  aria-label="체크 토글"
                >
                  {item.checked && <Check size={13} />}
                </button>
                <span
                  className={cn(
                    "flex-1 text-sm",
                    item.checked
                      ? "line-through text-ink-faint"
                      : "text-ink-soft"
                  )}
                >
                  {item.text}
                </span>
                <button
                  onClick={() => removeChecklist(item.id)}
                  aria-label="항목 삭제"
                  className="text-ink-faint hover:text-red-500"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={checkDraft}
            onChange={(e) => setCheckDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addChecklistItem();
              }
            }}
            placeholder="항목 추가 후 Enter"
          />
          <Button size="icon" onClick={addChecklistItem} aria-label="항목 추가">
            <Plus size={16} />
          </Button>
        </div>
      </Section>

      {/* Link */}
      <Section label="링크">
        <div className="relative">
          <Link2
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
          />
          <Input
            value={d.link ?? ""}
            onChange={(e) => updateNodeData(node.id, { link: e.target.value })}
            placeholder="https://"
            className="pl-9"
          />
        </div>
      </Section>

      {/* Cross-map link */}
      {!isRoot && (
        <Section label="맵 연결">
          {d.linkedDocId ? (
            <Button
              className="w-full justify-center"
              onClick={() => openLinkedDoc(d.linkedDocId!)}
            >
              <MapIcon size={15} /> 연결된 맵 열기
            </Button>
          ) : (
            <Button
              className="w-full justify-center"
              onClick={() => promoteNodeToMap(node.id)}
            >
              <SquareArrowOutUpRight size={15} /> 새 맵으로 분리
            </Button>
          )}
        </Section>
      )}

      {/* Actions */}
      <Section label="작업">
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => autoLayoutSubtree(node.id)}>
            <LayoutGrid size={15} /> 하위 정렬
          </Button>
          <Button onClick={() => duplicateSubtree(node.id)}>
            <Copy size={15} /> 하위 복제
          </Button>
          <Button onClick={() => toggleCollapse(node.id)}>
            <Icon name="ListTree" size={15} />
            {d.collapsed ? "펼치기" : "접기"}
          </Button>
          {!isRoot && (
            <Button
              variant="danger"
              onClick={() => deleteSubtree(node.id)}
            >
              <Trash2 size={15} /> 하위 삭제
            </Button>
          )}
        </div>
        {!isRoot && (
          <Button
            variant="ghost"
            className="w-full justify-center text-red-500"
            onClick={() => deleteNode(node.id)}
          >
            <Trash2 size={15} /> 이 노드만 삭제
          </Button>
        )}
      </Section>
    </div>
  );
}
