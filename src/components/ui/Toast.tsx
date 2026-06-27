"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useEffect } from "react";

import { cn } from "@/lib/cn";
import { useMindMapStore, type Toast as ToastModel } from "@/store/mindMapStore";

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

function ToastItem({ toast }: { toast: ToastModel }) {
  const dismiss = useMindMapStore((s) => s.dismissToast);
  const Icon = ICONS[toast.type];

  useEffect(() => {
    const t = setTimeout(() => dismiss(toast.id), 3200);
    return () => clearTimeout(t);
  }, [toast.id, dismiss]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.96 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "pointer-events-auto flex items-center gap-2.5 rounded-2xl border border-line bg-surface-overlay/95 backdrop-blur-xl px-3.5 py-3 shadow-float min-w-[240px] max-w-[360px]"
      )}
    >
      <Icon
        size={18}
        className={cn(
          toast.type === "success" && "text-emerald-500",
          toast.type === "error" && "text-red-500",
          toast.type === "info" && "text-brand"
        )}
      />
      <span className="flex-1 text-sm text-ink">{toast.message}</span>
      <button
        onClick={() => dismiss(toast.id)}
        aria-label="알림 닫기"
        className="text-ink-faint hover:text-ink"
      >
        <X size={14} />
      </button>
    </motion.div>
  );
}

export function ToastViewport() {
  const toasts = useMindMapStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 -translate-x-1/2 z-[200] flex flex-col items-center gap-2 px-3 pb-[env(safe-area-inset-bottom)]">
      <AnimatePresence>
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} />
        ))}
      </AnimatePresence>
    </div>
  );
}
