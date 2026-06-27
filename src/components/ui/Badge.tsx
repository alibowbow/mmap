"use client";

import { cn } from "@/lib/cn";

export type BadgeProps = {
  children: React.ReactNode;
  className?: string;
  color?: string; // optional hex for a dot
  dot?: boolean;
};

export function Badge({ children, className, color, dot }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium leading-none",
        "bg-surface-overlay text-ink-soft border border-line/70",
        className
      )}
    >
      {dot && (
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: color ?? "currentColor" }}
        />
      )}
      {children}
    </span>
  );
}
