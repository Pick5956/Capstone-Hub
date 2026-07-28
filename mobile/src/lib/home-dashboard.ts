type KitchenQueueItem = {
  status: string;
  sent_at?: string | null;
};

type KitchenQueueOrder = {
  opened_at: string;
  items?: KitchenQueueItem[];
};

type InventoryLevel = {
  stock: number;
  min_stock: number;
};

export type HomeOperationalCounts = {
  overdueKitchen: number;
  readyKitchen: number;
  activeKitchen: number;
  outOfStock: number;
  lowStock: number;
  occupiedTables: number;
};

export type HomeAccess = {
  canViewKitchen: boolean;
  canViewInventory: boolean;
  canTakeOrder: boolean;
  canViewOrders: boolean;
};

export type HomePriorityKey =
  | 'kitchen-overdue'
  | 'kitchen-ready'
  | 'stock-out'
  | 'stock-low'
  | 'kitchen-active'
  | 'take-order'
  | 'orders'
  | 'overview';

export type HomePriority = {
  key: HomePriorityKey;
  count: number;
  href?: '/kitchen' | '/inventory' | '/tables' | '/orders';
  tone: 'danger' | 'success' | 'warning' | 'info' | 'neutral';
};

const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;

function toDateKey(value: Date) {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateKey(value: string) {
  if (!dateKeyPattern.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day, 12));
  return toDateKey(parsed) === value ? parsed : null;
}

export function shiftDashboardDate(value: string, days: number) {
  const parsed = parseDateKey(value);
  if (!parsed || !Number.isFinite(days)) return value;
  parsed.setUTCDate(parsed.getUTCDate() + Math.trunc(days));
  return toDateKey(parsed);
}

export function clampDashboardDate(current: string, candidate: string, today: string) {
  if (!parseDateKey(candidate) || !parseDateKey(today) || candidate > today) return current;
  return candidate;
}

function minutesSince(value: string | null | undefined, now: Date) {
  if (!value) return 0;
  const startedAt = new Date(value).getTime();
  if (!Number.isFinite(startedAt)) return 0;
  return Math.max(0, Math.floor((now.getTime() - startedAt) / 60_000));
}

export function summarizeKitchenQueue(orders: KitchenQueueOrder[], now = new Date()) {
  let overdueKitchen = 0;
  let readyKitchen = 0;
  let activeKitchen = 0;

  for (const order of orders) {
    const items = order.items ?? [];
    const activeItems = items.filter((item) => item.status === 'pending' || item.status === 'cooking');
    const hasReady = items.some((item) => item.status === 'ready');

    if (!activeItems.length) {
      if (hasReady) readyKitchen += 1;
      continue;
    }

    activeKitchen += 1;
    const sentTimes = activeItems
      .map((item) => item.sent_at)
      .filter((value): value is string => Boolean(value))
      .sort((first, second) => new Date(first).getTime() - new Date(second).getTime());
    const waited = minutesSince(sentTimes[0] ?? order.opened_at, now);
    if (waited >= 10) overdueKitchen += 1;
  }

  return { overdueKitchen, readyKitchen, activeKitchen };
}

export function summarizeInventory(ingredients: InventoryLevel[]) {
  let outOfStock = 0;
  let lowStock = 0;

  for (const ingredient of ingredients) {
    const stock = Number(ingredient.stock);
    const minimum = Number(ingredient.min_stock);
    if (!Number.isFinite(stock) || !Number.isFinite(minimum)) continue;
    if (stock <= 0) {
      outOfStock += 1;
    } else if (minimum > 0 && stock <= minimum * 1.5) {
      lowStock += 1;
    }
  }

  return { outOfStock, lowStock };
}

export function buildHomeAttention(counts: HomeOperationalCounts, access: HomeAccess): HomePriority[] {
  const alerts: HomePriority[] = [];

  if (access.canViewKitchen && counts.overdueKitchen > 0) {
    alerts.push({ key: 'kitchen-overdue', count: counts.overdueKitchen, href: '/kitchen', tone: 'danger' });
  }
  if (access.canViewKitchen && counts.readyKitchen > 0) {
    alerts.push({ key: 'kitchen-ready', count: counts.readyKitchen, href: '/kitchen', tone: 'success' });
  }
  if (access.canViewInventory && counts.outOfStock > 0) {
    alerts.push({ key: 'stock-out', count: counts.outOfStock, href: '/inventory', tone: 'danger' });
  }
  if (access.canViewInventory && counts.lowStock > 0) {
    alerts.push({ key: 'stock-low', count: counts.lowStock, href: '/inventory', tone: 'warning' });
  }

  return alerts;
}

export function resolveHomePriority(counts: HomeOperationalCounts, access: HomeAccess): HomePriority {
  const attention = buildHomeAttention(counts, access);
  if (attention.length) return attention[0];
  if (access.canViewKitchen && counts.activeKitchen > 0) {
    return { key: 'kitchen-active', count: counts.activeKitchen, href: '/kitchen', tone: 'warning' };
  }
  if (access.canTakeOrder) {
    return { key: 'take-order', count: counts.occupiedTables, href: '/tables', tone: 'info' };
  }
  if (access.canViewOrders) {
    return { key: 'orders', count: 0, href: '/orders', tone: 'info' };
  }
  return { key: 'overview', count: 0, tone: 'neutral' };
}
