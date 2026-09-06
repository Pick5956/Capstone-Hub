"use client";

import { useSyncExternalStore } from "react";

// True when the viewport matches `query`. Reads the same value on the server
// and on the first client render (false) so hydration never disagrees, then
// tracks the media query live.
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
