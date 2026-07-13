"use client";

import { useEffect, useRef } from "react";
import { createSingleFlight } from "../lib/singleFlight";

type VisiblePollingOptions = {
  enabled?: boolean;
  intervalMs: number;
  runImmediately?: boolean;
  refreshOnFocus?: boolean;
};

/**
 * Polls only while the document is visible and prevents overlapping requests.
 * The latest callback is kept in a ref so render-only changes do not restart the timer.
 */
export function useVisiblePolling(
  callback: () => void | Promise<void>,
  {
    enabled = true,
    intervalMs,
    runImmediately = true,
    refreshOnFocus = true,
  }: VisiblePollingOptions,
) {
  const callbackRef = useRef(callback);
  const runSingleFlightRef = useRef(createSingleFlight());

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;

    const poll = () => {
      if (document.visibilityState !== "visible") return;
      void runSingleFlightRef.current(async () => {
        await callbackRef.current();
      });
    };

    if (runImmediately) poll();
    const timer = window.setInterval(poll, intervalMs);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") poll();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    if (refreshOnFocus) window.addEventListener("focus", poll);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (refreshOnFocus) window.removeEventListener("focus", poll);
    };
  }, [enabled, intervalMs, refreshOnFocus, runImmediately]);
}
