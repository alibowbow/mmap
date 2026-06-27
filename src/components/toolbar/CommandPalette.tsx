"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { filterCommands } from "@/lib/commands";
import { useMindMapStore } from "@/store/mindMapStore";

// Desktop command palette (Ctrl/Cmd + K).
export function CommandPalette() {
  const open = useMindMapStore((s) => s.commandPaletteOpen);
  const close = useMindMapStore((s) => s.closeCommandPalette);
  const execute = useMindMapStore((s) => s.executeCommand);

  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => filterCommands(query), [query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => setActive(0), [query]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = results[active];
      if (cmd) execute(cmd.id);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[110] flex items-start justify-center p-4 pt-[12vh]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
            onClick={close}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface-overlay/95 backdrop-blur-xl shadow-float"
          >
            <div className="flex items-center gap-2.5 border-b border-line/60 px-4">
              <Search size={18} className="text-ink-faint" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="명령 검색…"
                className="h-12 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
              />
              <kbd className="rounded-md border border-line bg-surface-base px-1.5 py-0.5 text-[10px] text-ink-faint">
                ESC
              </kbd>
            </div>
            <div className="max-h-[50vh] overflow-y-auto mf-scroll p-2">
              {results.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-ink-faint">
                  결과가 없습니다
                </p>
              )}
              {results.map((cmd, i) => (
                <button
                  key={cmd.id}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => execute(cmd.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition",
                    i === active ? "bg-brand/10" : "hover:bg-surface-raised"
                  )}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-raised text-ink-soft">
                    <Icon name={cmd.icon} size={16} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-ink">
                      {cmd.title}
                    </span>
                    <span className="block truncate text-xs text-ink-faint">
                      {cmd.description}
                    </span>
                  </span>
                  {cmd.shortcut && (
                    <kbd className="rounded-md border border-line bg-surface-base px-1.5 py-0.5 text-[10px] text-ink-faint">
                      {cmd.shortcut}
                    </kbd>
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
