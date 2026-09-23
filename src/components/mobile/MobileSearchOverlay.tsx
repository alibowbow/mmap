"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Search } from "lucide-react";

import {
  FilterChips,
  SearchResultRow,
  useSearchResults,
} from "@/components/panels/SearchPanel";
import { useDialogFocus } from "@/hooks/useDialogFocus";
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
  const dialogRef = useDialogFocus<HTMLDivElement>(open, () =>
    setSearchOpen(false)
  );

  const pick = (id: string) => {
    selectNode(id);
    focusNode(id);
    setSearchOpen(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={dialogRef}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.18 }}
          role="dialog"
          aria-modal="true"
          aria-label="노드 검색"
          tabIndex={-1}
          className="fixed inset-0 z-[120] flex flex-col bg-surface-base"
        >
          <div className="flex min-h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-end gap-2 border-b border-line px-2 pb-1.5 pt-[env(safe-area-inset-top)]">
            <button
              onClick={() => setSearchOpen(false)}
              aria-label="뒤로"
              className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-soft active:bg-surface-overlay"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex flex-1 items-center gap-2 rounded-xl bg-surface-overlay px-3">
              <Search size={18} className="text-ink-faint" />
              <input
                data-dialog-autofocus
                value={query}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="노드 검색…"
                className="h-11 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink-soft"
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
