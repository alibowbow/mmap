"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import {
  NODE_STATUSES,
  NODE_STATUS_CONFIG,
  NODE_TYPES,
  NODE_TYPE_CONFIG,
} from "@/lib/constants";
import { useMindMapStore } from "@/store/mindMapStore";
import type { MindMapNode } from "@/types/mindmap";

// Shared search results selector (query + type/status filters).
export function useSearchResults(): MindMapNode[] {
  const nodes = useMindMapStore((s) => s.nodes);
  const query = useMindMapStore((s) => s.searchQuery);
  const types = useMindMapStore((s) => s.searchTypes);
  const statuses = useMindMapStore((s) => s.searchStatuses);

  return useMemo(() => {
    const q = query.trim().toLowerCase();
    return nodes.filter((n) => {
      if (types.length && !types.includes(n.data.type)) return false;
      if (statuses.length && !statuses.includes(n.data.status ?? "none"))
        return false;
      if (!q) return true;
      return (
        n.data.label.toLowerCase().includes(q) ||
        n.data.description?.toLowerCase().includes(q) ||
        n.data.tags?.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [nodes, query, types, statuses]);
}

export function SearchResultRow({
  node,
  onPick,
}: {
  node: MindMapNode;
  onPick: () => void;
}) {
  const conf = NODE_TYPE_CONFIG[node.data.type] ?? NODE_TYPE_CONFIG.idea;
  return (
    <button
      onClick={onPick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-surface-raised"
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{ background: `${conf.color}22`, color: node.data.color ?? conf.color }}
      >
        <Icon name={conf.icon} size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">
          {node.data.label}
        </span>
        {node.data.description && (
          <span className="block truncate text-xs text-ink-faint">
            {node.data.description}
          </span>
        )}
      </span>
      {node.data.status && node.data.status !== "none" && (
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{
            background: `${NODE_STATUS_CONFIG[node.data.status].color}22`,
            color: NODE_STATUS_CONFIG[node.data.status].color,
          }}
        >
          {NODE_STATUS_CONFIG[node.data.status].label}
        </span>
      )}
    </button>
  );
}

export function FilterChips() {
  const types = useMindMapStore((s) => s.searchTypes);
  const statuses = useMindMapStore((s) => s.searchStatuses);
  const toggleType = useMindMapStore((s) => s.toggleSearchType);
  const toggleStatus = useMindMapStore((s) => s.toggleSearchStatus);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {NODE_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => toggleType(t)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition",
              types.includes(t)
                ? "border-brand bg-brand/10 text-ink"
                : "border-line text-ink-soft hover:bg-surface-overlay"
            )}
          >
            <Icon name={NODE_TYPE_CONFIG[t].icon} size={12} />
            {NODE_TYPE_CONFIG[t].label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {NODE_STATUSES.filter((s) => s !== "none").map((st) => (
          <button
            key={st}
            onClick={() => toggleStatus(st)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition",
              statuses.includes(st)
                ? "border-brand bg-brand/10 text-ink"
                : "border-line text-ink-soft hover:bg-surface-overlay"
            )}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: NODE_STATUS_CONFIG[st].dot }}
            />
            {NODE_STATUS_CONFIG[st].label}
          </button>
        ))}
      </div>
    </div>
  );
}

// Desktop search panel (floating, top-center).
export function SearchPanel() {
  const open = useMindMapStore((s) => s.searchOpen);
  const setSearchOpen = useMindMapStore((s) => s.setSearchOpen);
  const query = useMindMapStore((s) => s.searchQuery);
  const setSearchQuery = useMindMapStore((s) => s.setSearchQuery);
  const selectNode = useMindMapStore((s) => s.selectNode);
  const focusNode = useMindMapStore((s) => s.focusNode);

  const results = useSearchResults();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const pick = (id: string) => {
    selectNode(id);
    focusNode(id);
    setSearchOpen(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[95]"
            onClick={() => setSearchOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="fixed left-1/2 top-[10vh] z-[96] w-[min(560px,92vw)] -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-surface-overlay/95 backdrop-blur-xl shadow-float"
          >
            <div className="flex items-center gap-2.5 border-b border-line/60 px-4">
              <Search size={18} className="text-ink-faint" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="노드 제목, 설명, 태그 검색…"
                className="h-12 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
              />
              <button
                onClick={() => setSearchOpen(false)}
                aria-label="검색 닫기"
                className="text-ink-faint hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>
            <div className="border-b border-line/60 p-3">
              <FilterChips />
            </div>
            <div className="max-h-[42vh] overflow-y-auto mf-scroll p-2">
              {results.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-ink-faint">
                  일치하는 노드가 없습니다
                </p>
              ) : (
                results.map((n) => (
                  <SearchResultRow key={n.id} node={n} onPick={() => pick(n.id)} />
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
