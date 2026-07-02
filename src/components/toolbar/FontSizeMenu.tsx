"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import {
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  LEVEL_FONT_LABELS,
} from "@/lib/constants";
import { useMindMapStore } from "@/store/mindMapStore";

// Popover to adjust node label sizes per depth level.
export function FontSizeMenu({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const sizes = useMindMapStore((s) => s.levelFontSizes);
  const setLevelFontSize = useMindMapStore((s) => s.setLevelFontSize);
  const resetLevelFontSizes = useMindMapStore((s) => s.resetLevelFontSizes);

  useEffect(() => {
    if (!open) return;
    // Capture-phase pointerdown — the canvas pane stops mousedown bubbling.
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  const stepBtn =
    "flex h-7 w-7 items-center justify-center rounded-lg border border-line text-ink-soft hover:bg-surface-raised disabled:opacity-40 disabled:pointer-events-none";

  return (
    <div ref={ref} className="relative inline-flex">
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-line bg-surface-overlay/95 p-3 shadow-float backdrop-blur-xl"
          >
            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              레벨별 글자 크기
            </p>
            <div className="space-y-1.5">
              {LEVEL_FONT_LABELS.map((label, i) => {
                const size = sizes[i] ?? 14;
                return (
                  <div key={label} className="flex items-center gap-2">
                    <span className="flex-1 text-sm text-ink">{label}</span>
                    <button
                      className={stepBtn}
                      aria-label={`${label} 글자 작게`}
                      disabled={size <= FONT_SIZE_MIN}
                      onClick={() => setLevelFontSize(i, size - 1)}
                    >
                      <Minus size={14} />
                    </button>
                    <span className="w-7 text-center text-sm tabular-nums text-ink-soft">
                      {size}
                    </span>
                    <button
                      className={stepBtn}
                      aria-label={`${label} 글자 크게`}
                      disabled={size >= FONT_SIZE_MAX}
                      onClick={() => setLevelFontSize(i, size + 1)}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
            <button
              onClick={resetLevelFontSizes}
              className={cn(
                "mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs text-ink-soft transition hover:bg-surface-raised"
              )}
            >
              <RotateCcw size={13} /> 기본값으로
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
