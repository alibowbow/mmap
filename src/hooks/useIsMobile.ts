"use client";

import { useMediaQuery } from "@/hooks/useMediaQuery";

// Breakpoints: mobile 0–767, tablet 768–1023, desktop 1024+.
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767px)");
}

export function useIsTablet(): boolean {
  return useMediaQuery("(min-width: 768px) and (max-width: 1023px)");
}

export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 1024px)");
}
