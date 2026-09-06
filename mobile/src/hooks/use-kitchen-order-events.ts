import { fetch as expoFetch } from 'expo/fetch';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { apiUrl } from '@/src/api/client';
import {
  isKitchenOrderChangeEvent,
  parseOrderChangeEvent,
  parseServerSentEvents,
} from '@/src/lib/order-events';
import { getToken, getTokenType } from '@/src/storage/session-store';

type KitchenOrderEventsOptions = {
  enabled?: boolean;
  restaurantId?: number | null;
};

/**
 * `live` once the server has greeted the stream, `offline` after it drops and
 * while the backoff waits, `idle` when nothing is listening - the screen is not
 * focused, or there is no restaurant yet - so a paused stream is never reported
 * to the kitchen as a fault.
 */
export type KitchenRealtimeStatus = 'idle' | 'connecting' | 'live' | 'offline';

const maxRetryDelayMs = 30_000;
const refreshDebounceMs = 100;

function isActiveAppState(state: AppStateStatus | null) {
  return state === null || state === 'active';
}

/**
 * Listens for restaurant-scoped order invalidations and asks the screen to
 * reload its REST snapshot. REST remains the kitchen queue source of truth.
 */
export function useKitchenOrderEvents(
  callback: () => void | Promise<void>,
  { enabled = true, restaurantId }: KitchenOrderEventsOptions = {},
) {
  const callbackRef = useRef(callback);
  const [status, setStatus] = useState<KitchenRealtimeStatus>('idle');
  // Written through a ref as well so the async connection loop can report
  // without being re-created whenever the status changes.
  const statusRef = useRef<KitchenRealtimeStatus>('idle');
  const reportStatus = useCallback((next: KitchenRealtimeStatus) => {
    if (statusRef.current === next) return;
    statusRef.current = next;
    setStatus(next);
  }, []);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled || !restaurantId) {
      reportStatus('idle');
      return;
    }
    reportStatus('connecting');

    let disposed = false;
    let appIsActive = isActiveAppState(AppState.currentState);
    let retryDelayMs = 1_000;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let wakeRetry: (() => void) | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let refreshRunning = false;
    let refreshQueued = false;
    let connectionAbortController: AbortController | null = null;

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
          // The screen owns load feedback and recovery polling retries.
        }
      } while (!disposed && refreshQueued);
      refreshRunning = false;
    };

    const queueRefresh = () => {
      if (refreshTimer !== null || disposed) return;
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

    const connect = async (): Promise<'rotate' | 'closed'> => {
      const [token, tokenType] = await Promise.all([getToken(), getTokenType()]);
      if (!token || disposed || !appIsActive) throw new Error('missing active session');

      const abortController = new AbortController();
      connectionAbortController = abortController;
      try {
        const response = await expoFetch(`${apiUrl}/api/v1/events/orders`, {
          method: 'GET',
          headers: {
            Accept: 'text/event-stream',
            Authorization: `${tokenType} ${token}`,
            'Cache-Control': 'no-cache',
            'X-Restaurant-ID': String(restaurantId),
          },
          signal: abortController.signal,
        });
        if (!response.ok || !response.body) {
          throw new Error(`order event stream failed (${response.status})`);
        }

        retryDelayMs = 1_000;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let rotateRequested = false;

        try {
          while (!disposed && appIsActive) {
            const { value, done } = await reader.read();
            if (done) return rotateRequested ? 'rotate' : 'closed';
            const parsed = parseServerSentEvents(
              buffer,
              decoder.decode(value, { stream: true }),
            );
            buffer = parsed.buffer;

            for (const message of parsed.messages) {
              if (message.event === 'connected') {
                reportStatus('live');
                queueRefresh();
                continue;
              }
              if (message.event === 'reconnect') {
                rotateRequested = true;
                continue;
              }
              const event = parseOrderChangeEvent(message);
              if (event && isKitchenOrderChangeEvent(event)) queueRefresh();
            }
          }
          return 'closed';
        } finally {
          reader.releaseLock();
        }
      } finally {
        if (connectionAbortController === abortController) {
          connectionAbortController = null;
        }
      }
    };

    const run = async () => {
      while (!disposed) {
        if (!appIsActive) {
          // Backgrounded, not broken: the queue is simply not being watched.
          reportStatus('idle');
          await waitBeforeRetry(maxRetryDelayMs);
          continue;
        }

        let outcome: 'rotate' | 'closed' = 'closed';
        try {
          outcome = await connect();
        } catch {
          if (disposed) return;
        }
        if (disposed || !appIsActive) continue;
        if (outcome === 'rotate') {
          reportStatus('connecting');
          continue;
        }

        reportStatus('offline');
        await waitBeforeRetry(retryDelayMs);
        reportStatus('connecting');
        retryDelayMs = Math.min(retryDelayMs * 2, maxRetryDelayMs);
      }
    };

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      const nextIsActive = isActiveAppState(state);
      if (nextIsActive === appIsActive) return;
      appIsActive = nextIsActive;
      retryDelayMs = 1_000;
      if (nextIsActive) {
        wakeRetry?.();
        queueRefresh();
      } else {
        connectionAbortController?.abort();
        wakeRetry?.();
      }
    });

    void run();
    return () => {
      disposed = true;
      appStateSubscription.remove();
      connectionAbortController?.abort();
      if (refreshTimer !== null) clearTimeout(refreshTimer);
      wakeRetry?.();
      reportStatus('idle');
    };
  }, [enabled, reportStatus, restaurantId]);

  return status;
}
