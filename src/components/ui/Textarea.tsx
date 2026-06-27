"use client";

import { forwardRef } from "react";

import { cn } from "@/lib/cn";

export type TextareaProps =
  React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          "w-full min-h-[80px] px-3 py-2 rounded-xl bg-surface-base border border-line text-sm text-ink leading-relaxed resize-y",
          "placeholder:text-ink-faint transition",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:border-brand/50",
          className
        )}
        {...props}
      />
    );
  }
);
