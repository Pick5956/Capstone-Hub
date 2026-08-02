"use client";

import { useEffect, useRef, useState } from "react";

import { authRepository } from "../app/repositories/authRepository";
import { apiUrl } from "../lib/apiClient";
import {
  matchesOrderEventFilter,
  parseOrderChangeEvent,
  parseServerSentEvents,
  type OrderEventFilter,
  type RealtimeConnectionStatus,
} from "../lib/orderEvents";

type OrderEventsOptions = {
  enabled?: boolean;
  restaurantId?: number | null;
  eventFilter?: OrderEventFilter;
};

const maxRetryDelayMs = 30_000;
const refreshDebounceMs = 100;

/**
 * Subscribes to restaurant-scoped order invalidations over authenticated SSE.
 * The callback refetches REST data, which remains the source of truth.
 */
export function useOrderEvents(
  callback: () => void | Promise<void>,
  { enabled = true, restaurantId, eventFilter = { kind: "all" } }: OrderEventsOptions = {},
) {
  const callbackRef = useRef(callback);
  const eventFilterRef = useRef(eventFilter);
  const [connectionStatus, setConnectionStatus] = useState<RealtimeConnectionStatus>("idle");

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    eventFilterRef.current = eventFilter;
  }, [eventFilter]);

  useEffect(() => {
    if (!enabled || !restaurantId) return;

    let cancelled = false;
    let retryDelayMs = 1_000;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let wakeRetry: (() => void) | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let refreshRunning = false;
    let refreshQueued = false;
    const abortController = new AbortController();

    const refresh = async () => {
      if (refreshRunning) {
        refreshQueued = true;
        return;
      }
      refreshRunning = true;
      do {
        refreshQueued = false;
        try {
          await callbackRef.current();
        } catch {
          // The page owns its user-facing load error and the fallback poll retries.
        }
      } while (!cancelled && refreshQueued);
      refreshRunning = false;
    };

    const queueRefresh = () => {
      if (refreshTimer !== null) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        void refresh();
      }, refreshDebounceMs);
    };

    const waitBeforeRetry = (delayMs: number) => new Promise<void>((resolve) => {
      const finish = () => {
        if (retryTimer !== null) clearTimeout(retryTimer);
        retryTimer = null;
        wakeRetry = null;
        resolve();
      };
      wakeRetry = finish;
      retryTimer = setTimeout(finish, delayMs);
    });

    const connect = async (): Promise<"rotate" | "closed"> => {
      const token = authRepository.getToken();
      const tokenType = authRepository.getTokenType();
      if (!token || !tokenType) throw new Error("missing authentication");

      const response = await fetch(`${apiUrl}/api/v1/events/orders`, {
        method: "GET",
        headers: {
          Accept: "text/event-stream",
          Authorization: `${tokenType} ${token}`,
          "Cache-Control": "no-cache",
          "X-Restaurant-ID": String(restaurantId),
        },
        cache: "no-store",
        signal: abortController.signal,
      });
      if (!response.ok || !response.body) {
        throw new Error(`order event stream failed (${response.status})`);
      }

      retryDelayMs = 1_000;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let rotateRequested = false;

      while (!cancelled) {
        const { value, done } = await reader.read();
        if (done) return rotateRequested ? "rotate" : "closed";
        const parsed = parseServerSentEvents(buffer, decoder.decode(value, { stream: true }));
        buffer = parsed.buffer;

        for (const message of parsed.messages) {
          if (message.event === "connected") {
            setConnectionStatus("connected");
            continue;
          }
          if (message.event === "reconnect") {
            rotateRequested = true;
            continue;
          }
          const event = parseOrderChangeEvent(message);
          if (event && matchesOrderEventFilter(event, eventFilterRef.current)) {
            queueRefresh();
          }
        }
      }
      return "closed";
    };

    const run = async () => {
      setConnectionStatus("connecting");
      while (!cancelled) {
        let outcome: "rotate" | "closed" = "closed";
        try {
          outcome = await connect();
        } catch (error) {
          if (cancelled || (error instanceof DOMException && error.name === "AbortError")) return;
        }
        if (cancelled) return;
        if (outcome === "rotate") continue;
        setConnectionStatus("reconnecting");
        await waitBeforeRetry(retryDelayMs);
        retryDelayMs = Math.min(retryDelayMs * 2, maxRetryDelayMs);
      }
    };

    void run();
    return () => {
      cancelled = true;
      abortController.abort();
      if (refreshTimer !== null) clearTimeout(refreshTimer);
      wakeRetry?.();
    };
  }, [enabled, restaurantId]);

  return enabled && restaurantId ? connectionStatus : "idle";
}
