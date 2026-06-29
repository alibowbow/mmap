"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { EDGE_STYLE_OPTIONS, NODE_STYLE_OPTIONS } from "@/lib/constants";
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

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
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
              노드 스타일
            </p>
            <div className="mb-3 flex gap-1.5">
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
