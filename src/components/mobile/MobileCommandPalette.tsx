"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { filterCommands } from "@/lib/commands";
import { useMindMapStore } from "@/store/mindMapStore";

// Command palette as a bottom sheet (like the "더보기" menu) so it only covers
// the lower part of the screen and the canvas stays visible behind it.
export function MobileCommandPalette() {
  const open = useMindMapStore((s) => s.commandPaletteOpen);
  const close = useMindMapStore((s) => s.closeCommandPalette);
  const execute = useMindMapStore((s) => s.executeCommand);

  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => filterCommands(query), [query]);

  // Reset the query each time the sheet opens. We intentionally don't autofocus
  // the input — that would pop the keyboard and cover the screen, defeating the
  // compact bottom-sheet feel. Tapping the field starts a search.
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-slate-950/40 backdrop-blur-sm"
            onClick={close}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            className="fixed inset-x-0 bottom-0 z-[121] flex max-h-[70vh] flex-col rounded-t-3xl border-t border-line bg-surface-raised pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-float"
          >
            <div className="flex items-center justify-center pb-1 pt-2">
              <div className="h-1.5 w-10 rounded-full bg-ink-faint/40" />
            </div>

            {/* Search field */}
            <div className="px-3 pt-1 pb-2">
              <div className="flex items-center gap-2 rounded-xl bg-surface-overlay px-3">
                <Search size={17} className="shrink-0 text-ink-faint" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="명령 검색…"
                  className="h-10 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
                />
              </div>
            </div>

            {/* Results */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain mf-scroll px-1.5 pb-1">
              {results.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-ink-faint">
                  일치하는 명령이 없습니다
                </p>
              ) : (
                results.map((cmd) => (
                  <button
                    key={cmd.id}
                    onClick={() => execute(cmd.id)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition active:bg-surface-overlay"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-overlay text-ink-soft">
                      <Icon name={cmd.icon} size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium leading-tight text-ink">
                        {cmd.title}
                      </span>
                      <span className="block truncate text-[11px] leading-tight text-ink-faint">
                        {cmd.description}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
