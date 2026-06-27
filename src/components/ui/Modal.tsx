"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect } from "react";

import { cn } from "@/lib/cn";

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  fullScreenOnMobile?: boolean;
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  fullScreenOnMobile,
}: ModalProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center p-0 sm:p-6 sm:items-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "relative w-full bg-surface-raised border border-line shadow-float flex flex-col",
              fullScreenOnMobile
                ? "h-[100dvh] sm:h-auto rounded-none sm:rounded-3xl sm:max-w-lg sm:max-h-[85vh]"
                : "rounded-3xl max-w-lg max-h-[88vh] mt-6 sm:mt-0",
              className
            )}
          >
            {(title || description) && (
              <div className="flex items-start justify-between gap-4 p-5 pb-3 border-b border-line/60">
                <div>
                  {title && (
                    <h2 className="text-base font-semibold text-ink">{title}</h2>
                  )}
                  {description && (
                    <p className="mt-0.5 text-sm text-ink-soft">{description}</p>
                  )}
                </div>
                <button
                  onClick={onClose}
                  aria-label="닫기"
                  className="shrink-0 h-9 w-9 flex items-center justify-center rounded-xl text-ink-soft hover:bg-surface-overlay"
                >
                  <X size={18} />
                </button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-5">{children}</div>
            {footer && (
              <div className="p-4 border-t border-line/60 flex items-center justify-end gap-2">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
