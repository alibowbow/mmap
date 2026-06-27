"use client";

import { useEffect, useRef } from "react";

// Runs `effect` after `delay` ms of no changes to `deps`.
export function useDebouncedEffect(
  effect: () => void,
  deps: React.DependencyList,
  delay = 600
): void {
  const callback = useRef(effect);
  callback.current = effect;

  useEffect(() => {
    const handle = setTimeout(() => callback.current(), delay);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, delay]);
}
