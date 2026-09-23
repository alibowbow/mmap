"use client";

import { useMediaQuery } from "@/hooks/useMediaQuery";

// Canvas-first breakpoints. Inline side panels only appear when there is
// genuinely enough room for them; laptops and tablets use floating drawers so
// the map never collapses into a narrow strip.
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767px)");
}

export function useIsTablet(): boolean {
  return useMediaQuery("(min-width: 768px) and (max-width: 1535px)");
}

export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 1536px)");
}

// Touch-first device (phones, tablets): the primary pointer is a finger. Used
// for gesture policy, not layout — a tablet can be wide yet still touch-first.
export function useIsTouchPrimary(): boolean {
  return useMediaQuery("(pointer: coarse)");
}
