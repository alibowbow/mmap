"use client";

import { useState } from "react";

import { cn } from "@/lib/cn";

export type TooltipProps = {
  label: string;
  children: React.ReactNode;
  side?: "top" | "bottom" | "right" | "left";
  className?: string;
};

// Lightweight hover tooltip. On touch devices it simply no-ops (we rely on
// toasts / labels for mobile feedback instead).
export function Tooltip({
  label,
  children,
  side = "bottom",
  className,
}: TooltipProps) {
  const [show, setShow] = useState(false);

  const pos: Record<string, string> = {
    top: "bottom-full mb-2 left-1/2 -translate-x-1/2",
    bottom: "top-full mt-2 left-1/2 -translate-x-1/2",
    right: "left-full ml-2 top-1/2 -translate-y-1/2",
    left: "right-full mr-2 top-1/2 -translate-y-1/2",
  };

  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      {show && (
        <span
          role="tooltip"
          className={cn(
            "pointer-events-none absolute z-[120] whitespace-nowrap rounded-lg px-2 py-1 text-[11px] font-medium",
            "bg-slate-900 text-white shadow-lg animate-fade-in",
            pos[side]
          )}
        >
          {label}
        </span>
      )}
    </span>
  );
}
