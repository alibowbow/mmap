"use client";

import { ChevronRight, ListTree } from "lucide-react";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { NODE_TYPE_CONFIG } from "@/lib/constants";
import { getChildrenMap, getRootNode } from "@/lib/tree";
import { useMindMapStore } from "@/store/mindMapStore";
import type { MindMapNode } from "@/types/mindmap";

function OutlineRow({
  node,
  depth,
  childrenMap,
}: {
  node: MindMapNode;
  depth: number;
  childrenMap: Map<string, MindMapNode[]>;
}) {
  const selectedNodeId = useMindMapStore((s) => s.selectedNodeId);
  const selectNode = useMindMapStore((s) => s.selectNode);
  const focusNode = useMindMapStore((s) => s.focusNode);
  const toggleCollapse = useMindMapStore((s) => s.toggleCollapse);

  const kids = childrenMap.get(node.id) ?? [];
  const conf = NODE_TYPE_CONFIG[node.data.type] ?? NODE_TYPE_CONFIG.idea;
  const active = node.id === selectedNodeId;

  return (
    <>
      <div
        onClick={() => {
          selectNode(node.id);
          focusNode(node.id);
        }}
        style={{ paddingLeft: 8 + depth * 14 }}
        className={cn(
          "group flex cursor-pointer items-center gap-1.5 rounded-lg pr-2 py-1.5 text-sm transition",
          active ? "bg-brand/10 text-ink" : "text-ink-soft hover:bg-surface-overlay"
        )}
      >
        {kids.length > 0 ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleCollapse(node.id);
            }}
            className="shrink-0 text-ink-faint"
          >
            <ChevronRight
              size={13}
              className={cn(
                "transition-transform",
                !node.data.collapsed && "rotate-90"
              )}
            />
          </button>
        ) : (
          <span className="w-[13px] shrink-0" />
        )}
        <span style={{ color: node.data.color ?? conf.color }}>
          <Icon name={conf.icon} size={13} />
        </span>
        <span className="truncate">{node.data.label}</span>
      </div>
      {!node.data.collapsed &&
        kids.map((k) => (
          <OutlineRow
            key={k.id}
            node={k}
            depth={depth + 1}
            childrenMap={childrenMap}
          />
        ))}
    </>
  );
}

export function OutlinePanel() {
  const nodes = useMindMapStore((s) => s.nodes);
  const childrenMap = getChildrenMap(nodes);
  const root = getRootNode(nodes);

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
        <ListTree size={13} /> 아웃라인
      </div>
      <div className="flex-1 overflow-y-auto mf-scroll px-2 pb-3 min-h-0">
        {root ? (
          <OutlineRow node={root} depth={0} childrenMap={childrenMap} />
        ) : (
          <p className="px-3 py-2 text-sm text-ink-faint">노드가 없습니다</p>
        )}
      </div>
    </div>
  );
}
