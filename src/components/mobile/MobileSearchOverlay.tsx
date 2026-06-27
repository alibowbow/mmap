"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Search } from "lucide-react";
import { useEffect, useRef } from "react";

import {
  FilterChips,
  SearchResultRow,
  useSearchResults,
} from "@/components/panels/SearchPanel";
import { useMindMapStore } from "@/store/mindMapStore";

// Full-screen search overlay for mobile.
export function MobileSearchOverlay() {
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
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[120] flex flex-col bg-surface-base"
        >
          <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-2 pt-[env(safe-area-inset-top)]">
            <button
              onClick={() => setSearchOpen(false)}
              aria-label="뒤로"
              className="flex h-10 w-10 items-center justify-center rounded-xl text-ink-soft active:bg-surface-overlay"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex flex-1 items-center gap-2 rounded-xl bg-surface-overlay px-3">
              <Search size={18} className="text-ink-faint" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="노드 검색…"
                className="h-10 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
              />
            </div>
          </div>

          <div className="border-b border-line p-3">
            <FilterChips />
          </div>

          <div className="flex-1 overflow-y-auto mf-scroll p-2 pb-[env(safe-area-inset-bottom)]">
            {results.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-ink-faint">
                일치하는 노드가 없습니다
              </p>
            ) : (
              results.map((n) => (
                <SearchResultRow key={n.id} node={n} onPick={() => pick(n.id)} />
              ))
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
