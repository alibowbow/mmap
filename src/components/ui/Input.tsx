"use client";

import { forwardRef } from "react";

import { cn } from "@/lib/cn";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-xl border border-line bg-surface-base px-3 text-sm text-ink",
        "placeholder:text-ink-faint transition",
        "focus-visible:border-brand/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-soft",
        className
      )}
      {...props}
    />
  );
});
