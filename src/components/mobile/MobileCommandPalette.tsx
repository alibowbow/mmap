"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { filterCommands, type CommandId } from "@/lib/commands";
import { useMindMapStore } from "@/store/mindMapStore";

// On mobile the always-visible bottom bar already covers node actions
// (자식/형제/정렬/검색) and the "더보기" sheet covers files + design + settings.
// So the command palette keeps only a few high-value "jump" actions that would
// otherwise be buried — avoiding the heavy overlap with those menus. (The
// desktop ⌘K palette still lists every command; it has no bottom bar.)
const MOBILE_COMMAND_IDS: CommandId[] = [
  "new-map",
  "open-templates",
  "presentation",
  "share-link",
  "export-json",
];

// Command palette as a bottom sheet (like the "더보기" menu) so it only covers
// the lower part of the screen and the canvas stays visible behind it.
export function MobileCommandPalette() {
  const open = useMindMapStore((s) => s.commandPaletteOpen);
  const close = useMindMapStore((s) => s.closeCommandPalette);
  const execute = useMindMapStore((s) => s.executeCommand);

  const [query, setQuery] = useState("");
  const dialogRef = useDialogFocus<HTMLDivElement>(open, close);
  // Curate to the essentials, preserving the order above and honoring search.
  const results = useMemo(() => {
    const matched = new Map(filterCommands(query).map((c) => [c.id, c]));
    return MOBILE_COMMAND_IDS.map((id) => matched.get(id)).filter(
      (c): c is NonNullable<typeof c> => Boolean(c)
    );
  }, [query]);

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
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-slate-950/40 backdrop-blur-sm"
            onClick={close}
          />
          <motion.div
            ref={dialogRef}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            role="dialog"
            aria-modal="true"
            aria-label="명령 팔레트"
            tabIndex={-1}
            className="fixed inset-x-0 bottom-0 z-[121] flex max-h-[70vh] flex-col rounded-t-3xl border-t border-line bg-surface-raised pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-float"
          >
            <div className="flex h-12 items-center gap-2 px-3">
              <div className="h-1.5 w-10 rounded-full bg-ink-faint/40" aria-hidden="true" />
              <span className="flex-1 text-sm font-semibold text-ink">명령</span>
              <button
                onClick={close}
                aria-label="명령 팔레트 닫기"
                className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-soft active:bg-surface-overlay"
              >
                <X size={19} />
              </button>
            </div>

            {/* Search field */}
            <div className="px-3 pt-1 pb-2">
              <div className="flex items-center gap-2 rounded-xl bg-surface-overlay px-3">
                <Search size={17} className="shrink-0 text-ink-faint" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="명령 검색…"
                  className="h-11 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink-soft"
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
                    className="flex min-h-14 w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left transition active:bg-surface-overlay"
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
