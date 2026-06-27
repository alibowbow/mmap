"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { filterCommands } from "@/lib/commands";
import { useMindMapStore } from "@/store/mindMapStore";

// Full-screen command palette for mobile.
export function MobileCommandPalette() {
  const open = useMindMapStore((s) => s.commandPaletteOpen);
  const close = useMindMapStore((s) => s.closeCommandPalette);
  const execute = useMindMapStore((s) => s.executeCommand);

  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => filterCommands(query), [query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[130] flex flex-col bg-surface-base"
        >
          <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-2 pt-[env(safe-area-inset-top)]">
            <button
              onClick={close}
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
                onChange={(e) => setQuery(e.target.value)}
                placeholder="명령 검색…"
                className="h-10 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto mf-scroll p-2 pb-[env(safe-area-inset-bottom)]">
            {results.map((cmd) => (
              <button
                key={cmd.id}
                onClick={() => execute(cmd.id)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-left transition active:bg-surface-overlay"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-overlay text-ink-soft">
                  <Icon name={cmd.icon} size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink">
                    {cmd.title}
                  </span>
                  <span className="block truncate text-xs text-ink-faint">
                    {cmd.description}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
