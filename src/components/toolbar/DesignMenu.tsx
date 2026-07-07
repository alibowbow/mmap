"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import {
  ACCENT_OPTIONS,
  CANVAS_BG_OPTIONS,
  EDGE_COLOR_OPTIONS,
  EDGE_LINE_OPTIONS,
  EDGE_STYLE_OPTIONS,
  EDGE_WIDTH_OPTIONS,
  NODE_STYLE_OPTIONS,
  THEME_PRESETS,
} from "@/lib/constants";
import { useMindMapStore } from "@/store/mindMapStore";

function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      className="flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-sm text-ink"
    >
      <span>{label}</span>
      <span
        className={cn(
          "relative h-5 w-9 rounded-full transition",
          on ? "bg-brand" : "bg-surface-sunken"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
            on ? "left-[18px]" : "left-0.5"
          )}
        />
      </span>
    </button>
  );
}

export function DesignMenu({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const nodeStyle = useMindMapStore((s) => s.nodeStyle);
  const setNodeStyle = useMindMapStore((s) => s.setNodeStyle);
  const nodeTint = useMindMapStore((s) => s.nodeTint);
  const setNodeTint = useMindMapStore((s) => s.setNodeTint);
  const edgeStyle = useMindMapStore((s) => s.edgeStyle);
  const setEdgeStyle = useMindMapStore((s) => s.setEdgeStyle);
  const edgeAnimated = useMindMapStore((s) => s.edgeAnimated);
  const setEdgeAnimated = useMindMapStore((s) => s.setEdgeAnimated);
  const edgeWidth = useMindMapStore((s) => s.edgeWidth);
  const setEdgeWidth = useMindMapStore((s) => s.setEdgeWidth);
  const edgeColorMode = useMindMapStore((s) => s.edgeColorMode);
  const setEdgeColorMode = useMindMapStore((s) => s.setEdgeColorMode);
  const edgeLine = useMindMapStore((s) => s.edgeLine);
  const setEdgeLine = useMindMapStore((s) => s.setEdgeLine);
  const applyThemePreset = useMindMapStore((s) => s.applyThemePreset);
  const canvasBg = useMindMapStore((s) => s.canvasBg);
  const setCanvasBg = useMindMapStore((s) => s.setCanvasBg);
  const accent = useMindMapStore((s) => s.accent);
  const setAccent = useMindMapStore((s) => s.setAccent);
  const rainbowBranches = useMindMapStore((s) => s.rainbowBranches);
  const setRainbowBranches = useMindMapStore((s) => s.setRainbowBranches);

  useEffect(() => {
    if (!open) return;
    // Capture-phase pointerdown — the canvas pane stops mousedown bubbling.
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  const seg =
    "flex flex-1 flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[11px] font-medium transition";

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
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              테마 프리셋
            </p>
            <div className="mb-3 grid grid-cols-3 gap-1.5">
              {THEME_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => applyThemePreset(p.id)}
                  title={p.description}
                  className="flex items-center gap-1.5 rounded-xl border border-line px-2 py-1.5 text-[11px] font-medium text-ink-soft transition hover:bg-surface-raised hover:text-ink"
                >
                  <span
                    className="h-3.5 w-3.5 shrink-0 rounded-full"
                    style={{
                      background: `linear-gradient(135deg, ${p.swatch[0]}, ${p.swatch[1]})`,
                    }}
                  />
                  {p.label}
                </button>
              ))}
            </div>

            <div className="my-2 h-px bg-line" />

            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              노드 스타일
            </p>
            <div className="mb-3 grid grid-cols-4 gap-1.5">
              {NODE_STYLE_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setNodeStyle(o.id)}
                  className={cn(
                    seg,
                    nodeStyle === o.id
                      ? "border-brand bg-brand/10 text-ink"
                      : "border-line text-ink-soft hover:bg-surface-raised"
                  )}
                >
                  <Icon name={o.icon} size={16} />
                  {o.label.split(" ")[0]}
                </button>
              ))}
            </div>

            <Toggle on={nodeTint} onChange={setNodeTint} label="색 채움(틴트)" />
            <Toggle
              on={rainbowBranches}
              onChange={setRainbowBranches}
              label="가지 자동 색상"
            />

            <div className="my-2 h-px bg-line" />

            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              엣지 모양
            </p>
            <div className="mb-2 flex gap-1.5">
              {EDGE_STYLE_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setEdgeStyle(o.id)}
                  className={cn(
                    seg,
                    edgeStyle === o.id
                      ? "border-brand bg-brand/10 text-ink"
                      : "border-line text-ink-soft hover:bg-surface-raised"
                  )}
                >
                  <Icon name={o.icon} size={16} />
                  {o.label}
                </button>
              ))}
            </div>
            <Toggle
              on={edgeAnimated}
              onChange={setEdgeAnimated}
              label="엣지 애니메이션"
            />

            <div className="mt-2 flex items-center gap-2">
              <span className="w-12 shrink-0 text-xs text-ink-soft">두께</span>
              <div className="flex flex-1 gap-1.5">
                {EDGE_WIDTH_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => setEdgeWidth(o.value)}
                    className={cn(
                      "flex-1 rounded-lg border px-1 py-1.5 text-[11px] font-medium transition",
                      edgeWidth === o.value
                        ? "border-brand bg-brand/10 text-ink"
                        : "border-line text-ink-soft hover:bg-surface-raised"
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <span className="w-12 shrink-0 text-xs text-ink-soft">색</span>
              <div className="flex flex-1 gap-1.5">
                {EDGE_COLOR_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => setEdgeColorMode(o.id)}
                    className={cn(
                      "flex-1 rounded-lg border px-1 py-1.5 text-[11px] font-medium transition",
                      edgeColorMode === o.id
                        ? "border-brand bg-brand/10 text-ink"
                        : "border-line text-ink-soft hover:bg-surface-raised"
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <span className="w-12 shrink-0 text-xs text-ink-soft">선</span>
              <div className="flex flex-1 gap-1.5">
                {EDGE_LINE_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => setEdgeLine(o.id)}
                    className={cn(
                      "flex-1 rounded-lg border px-1 py-1.5 text-[11px] font-medium transition",
                      edgeLine === o.id
                        ? "border-brand bg-brand/10 text-ink"
                        : "border-line text-ink-soft hover:bg-surface-raised"
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="my-2 h-px bg-line" />

            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              캔버스 배경
            </p>
            <div className="mb-3 flex gap-1.5">
              {CANVAS_BG_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setCanvasBg(o.id)}
                  className={cn(
                    seg,
                    canvasBg === o.id
                      ? "border-brand bg-brand/10 text-ink"
                      : "border-line text-ink-soft hover:bg-surface-raised"
                  )}
                >
                  <Icon name={o.icon} size={16} />
                  {o.label}
                </button>
              ))}
            </div>

            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              테마 색상
            </p>
            <div className="flex items-center justify-between px-0.5">
              {ACCENT_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setAccent(o.id)}
                  title={o.label}
                  aria-label={`테마 색상: ${o.label}`}
                  className={cn(
                    "h-6 w-6 rounded-full transition",
                    accent === o.id
                      ? "ring-2 ring-ink ring-offset-2 ring-offset-surface-overlay scale-110"
                      : "hover:scale-110"
                  )}
                  style={{ backgroundColor: o.swatch }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
