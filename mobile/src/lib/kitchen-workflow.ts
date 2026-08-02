import type { OrderType } from '@/src/types/order';

export type KitchenUrgency = 'normal' | 'warning' | 'overdue';

type KitchenTimingSource = {
  opened_at?: string | null;
  items?: readonly {
    sent_at?: string | null;
  }[] | null;
};

export function createKitchenMutationGate() {
  let isLocked = false;
  return {
    get locked() {
      return isLocked;
    },
    tryAcquire() {
      if (isLocked) return false;
      isLocked = true;
      return true;
    },
    release() {
      isLocked = false;
    },
  };
}

function timestamp(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export function kitchenTicketTiming(
  ticket: KitchenTimingSource,
  now = Date.now(),
): { minutes: number; urgency: KitchenUrgency } {
  const sentTimes = (ticket.items || [])
    .map((item) => timestamp(item.sent_at))
    .filter((value): value is number => value !== null);
  const fallback = timestamp(ticket.opened_at);
  const startedAt = sentTimes.length
    ? Math.min(...sentTimes)
    : fallback;
  const minutes = startedAt === null
    ? 0
    : Math.max(0, Math.floor((now - startedAt) / 60000));
  const urgency: KitchenUrgency = minutes >= 10
    ? 'overdue'
    : minutes >= 5
      ? 'warning'
      : 'normal';
  return { minutes, urgency };
}

export function kitchenFulfillmentContext(
  orderType: OrderType,
  itemType?: OrderType,
) {
  const fulfillment = itemType || orderType;
  return {
    fulfillment,
    differsFromOrder: fulfillment !== orderType,
  };
}

export function resolveKitchenImageUrl(value: string | null | undefined, apiBase: string) {
  const normalized = value?.trim() || '';
  if (!normalized) return '';
  if (/^https?:\/\//i.test(normalized)) return normalized;
  const base = apiBase.replace(/\/+$/, '');
  return `${base}${normalized.startsWith('/') ? '' : '/'}${normalized}`;
}

export async function runKitchenMutation<T>(
  mutate: () => Promise<T>,
  reconcile: () => Promise<void>,
) {
  let result: T | undefined;
  let mutationError: unknown;
  try {
    result = await mutate();
  } catch (err) {
    mutationError = err;
  }

  try {
    await reconcile();
  } catch (err) {
    if (!mutationError) throw err;
  }

  if (mutationError) throw mutationError;
  return result as T;
}
