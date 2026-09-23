"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useId, useRef, useState } from "react";

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
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const focusTrigger = () =>
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();

  useEffect(() => {
    const triggerButton = ref.current?.querySelector<HTMLButtonElement>("button");
    if (!triggerButton) return;
    triggerButton.setAttribute("aria-haspopup", "menu");
    triggerButton.setAttribute("aria-expanded", String(open));
    triggerButton.setAttribute("aria-controls", menuId);
  }, [menuId, open]);

  useEffect(() => {
    if (!open) return;
    // Capture-phase pointerdown: the React Flow pane (d3-zoom) stops mousedown
    // propagation, so a bubble listener never fires for canvas clicks and the
    // menu would stay open covering the map.
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const focusItems = () =>
      Array.from(
        menuRef.current?.querySelectorAll<HTMLButtonElement>(
          'button[role="menuitem"]:not([disabled])'
        ) ?? []
      );
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        setOpen(false);
        focusTrigger();
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        event.stopImmediatePropagation();
        setOpen(false);
        focusTrigger();
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const buttons = focusItems();
      if (buttons.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? buttons.length - 1
            : event.key === "ArrowDown"
              ? (current + 1 + buttons.length) % buttons.length
              : (current - 1 + buttons.length) % buttons.length;
      buttons[next]?.focus();
    };
    const frame = requestAnimationFrame(() => focusItems()[0]?.focus());
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative inline-flex", className)}>
      {/* Stop propagation here so the trigger toggles the menu without also
          firing click handlers on parent elements (e.g. a document card). */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {trigger}
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={menuRef}
            id={menuId}
            role="menu"
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
                role="menuitem"
                tabIndex={-1}
                aria-current={item.active ? "true" : undefined}
                disabled={item.disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  item.onSelect?.();
                  setOpen(false);
                  requestAnimationFrame(focusTrigger);
                }}
                className={cn(
                  "flex min-h-11 w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition",
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
