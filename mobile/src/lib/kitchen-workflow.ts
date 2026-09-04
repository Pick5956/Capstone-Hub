import type { OrderType } from '@/src/types/order';

export type KitchenUrgency = 'normal' | 'warning' | 'overdue';

function kitchenErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export class KitchenMutationError extends Error {
  mutationError: unknown;
  reconciliationError: unknown;
  mutationFailed: boolean;
  reconciliationFailed: boolean;

  constructor(
    mutationError: unknown,
    reconciliationError: unknown,
    mutationFailed = mutationError !== undefined,
    reconciliationFailed = reconciliationError !== undefined,
  ) {
    super(kitchenErrorMessage(
      mutationError ?? reconciliationError,
      'Kitchen update failed',
    ));
    this.name = 'KitchenMutationError';
    this.mutationError = mutationError;
    this.reconciliationError = reconciliationError;
    this.mutationFailed = mutationFailed;
    this.reconciliationFailed = reconciliationFailed;
  }
}

type KitchenTimingSource = {
  opened_at?: string | null;
  kitchen_sent_at?: string | null;
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

export function kitchenTicketStartedAt(ticket: KitchenTimingSource) {
  const kitchenSentAt = timestamp(ticket.kitchen_sent_at);
  if (kitchenSentAt !== null) return kitchenSentAt;

  const sentTimes = (ticket.items || [])
    .map((item) => timestamp(item.sent_at))
    .filter((value): value is number => value !== null);
  if (sentTimes.length) return Math.min(...sentTimes);

  return timestamp(ticket.opened_at);
}

export function kitchenTicketSentTimeLabel(
  ticket: KitchenTimingSource,
  language: 'th' | 'en',
) {
  const startedAt = kitchenTicketStartedAt(ticket);
  if (startedAt === null) return '−';
  const time = new Intl.DateTimeFormat(language === 'th' ? 'th-TH' : 'en-US', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(startedAt));
  return language === 'th' ? `${time} น.` : time;
}

export function kitchenTicketTiming(
  ticket: KitchenTimingSource,
  now = Date.now(),
): { minutes: number; urgency: KitchenUrgency } {
  const startedAt = kitchenTicketStartedAt(ticket);
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
  let reconciliationError: unknown;
  let mutationFailed = false;
  let reconciliationFailed = false;
  try {
    result = await mutate();
  } catch (err) {
    mutationFailed = true;
    mutationError = err;
  }

  try {
    await reconcile();
  } catch (err) {
    reconciliationFailed = true;
    reconciliationError = err;
  }

  if (mutationFailed || reconciliationFailed) {
    throw new KitchenMutationError(
      mutationError,
      reconciliationError,
      mutationFailed,
      reconciliationFailed,
    );
  }
  return result as T;
}

// Declared standalone rather than intersected with KitchenTimingSource: an
// intersection of two `items` array types keeps the first element shape, so the
// ready stamps this needs would be invisible to the compiler.
type KitchenRound = {
  opened_at?: string | null;
  kitchen_sent_at?: string | null;
  items?: readonly {
    sent_at?: string | null;
    ready_at?: string | null;
    status?: string;
  }[] | null;
};

/**
 * When the kitchen finished a round: the last item in it to be marked ready.
 *
 * A round is only "finished" once nothing in it is still cooking, so the latest
 * ready stamp - not the earliest - is the moment the pass could hand it over.
 */
export function kitchenRoundFinishedAt(round: KitchenRound): number | null {
  const readyTimes = (round.items || [])
    .filter((item) => item.status === 'ready' || item.status === 'served')
    .map((item) => timestamp(item.ready_at))
    .filter((value): value is number => value !== null);

  return readyTimes.length ? Math.max(...readyTimes) : null;
}

/**
 * How long the round spent in the kitchen, in seconds, or null when either end
 * of the window is missing. Never negative: clock skew between the device and
 * the server must not surface as a round that finished before it started.
 */
export function kitchenRoundDurationSeconds(round: KitchenRound): number | null {
  const startedAt = kitchenTicketStartedAt(round);
  const finishedAt = kitchenRoundFinishedAt(round);
  if (startedAt === null || finishedAt === null) return null;
  return Math.max(0, Math.round((finishedAt - startedAt) / 1000));
}

/** Most recently finished round first; rounds with no finish stamp sink last. */
export function sortKitchenRoundsByFinish<T extends KitchenRound>(
  rounds: readonly T[],
): T[] {
  return [...rounds].sort((left, right) => {
    const leftFinish = kitchenRoundFinishedAt(left);
    const rightFinish = kitchenRoundFinishedAt(right);
    if (leftFinish === rightFinish) return 0;
    if (leftFinish === null) return 1;
    if (rightFinish === null) return -1;
    return rightFinish - leftFinish;
  });
}

export function formatKitchenDuration(
  seconds: number | null,
  language: 'th' | 'en',
): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '−';
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return language === 'th'
    ? `${minutes} นาที ${remainder} วินาที`
    : `${minutes}m ${remainder}s`;
}

export function kitchenRoundFinishedLabel(
  round: KitchenRound,
  language: 'th' | 'en',
): string {
  const finishedAt = kitchenRoundFinishedAt(round);
  if (finishedAt === null) return '−';
  const time = new Intl.DateTimeFormat(language === 'th' ? 'th-TH' : 'en-US', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(finishedAt));
  return language === 'th' ? `${time} น.` : time;
}
