"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";

export type DropdownItem = {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  active?: boolean;
  disabled?: boolean;
};

export type DropdownProps = {
  trigger: React.ReactNode;
  items: DropdownItem[];
  align?: "left" | "right";
  className?: string;
  width?: number;
};

export function Dropdown({
  trigger,
  items,
  align = "left",
  className,
  width = 200,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className={cn("relative inline-flex", className)}>
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            style={{ width }}
            className={cn(
              "absolute top-full mt-2 z-50 p-1 rounded-2xl border border-line bg-surface-overlay/95 backdrop-blur-xl shadow-float",
              align === "right" ? "right-0" : "left-0"
            )}
          >
            {items.map((item) => (
              <button
                key={item.id}
                disabled={item.disabled}
                onClick={() => {
                  item.onSelect?.();
                  setOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm text-left transition",
                  "hover:bg-surface-raised disabled:opacity-40 disabled:pointer-events-none",
                  item.danger ? "text-red-500" : "text-ink",
                  item.active && "bg-surface-raised font-medium"
                )}
              >
                {item.icon && (
                  <span className="shrink-0 text-ink-soft">{item.icon}</span>
                )}
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
