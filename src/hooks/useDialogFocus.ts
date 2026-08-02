"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  '[data-dialog-autofocus], button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keep keyboard focus inside a mobile modal surface and restore it on close. */
export function useDialogFocus<T extends HTMLElement>(
  open: boolean,
  onClose: () => void
) {
  const dialogRef = useRef<T>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    const focusable = () =>
      Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ??
          []
      ).filter((element) => element.offsetParent !== null);

    const frame = requestAnimationFrame(() => {
      const preferred = dialogRef.current?.querySelector<HTMLElement>(
        "[data-dialog-autofocus]"
      );
      const first = preferred ?? focusable()[0];
      (first ?? dialogRef.current)?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        const activeMenu = document.querySelector<HTMLElement>('[role="menu"]');
        if (activeMenu?.contains(document.activeElement)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!dialogRef.current.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      if (previousFocusRef.current?.isConnected) {
        previousFocusRef.current.focus();
      }
    };
  }, [open]);

  return dialogRef;
}
