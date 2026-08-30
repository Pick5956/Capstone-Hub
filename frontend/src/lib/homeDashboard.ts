import type { Order } from "../types/order";
import type { RestaurantTable } from "../types/table";

export const activeOrderStatuses = new Set(["open", "sent_to_kitchen", "cooking", "ready", "served"]);

export type DashboardFloorTable = {
  key: number;
  label: string;
  status: "occupied" | "available" | "reserved" | "inactive";
  guests?: number;
  // The table's own capacity, not who is on it — what a free table has to
  // offer, where an occupied one reports its party instead.
  seats: number;
  minutes?: number;
  zone?: string;
};

const pad = (part: number) => String(part).padStart(2, "0");

export function toDashboardDate(value: Date) {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

export function shiftDashboardDate(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const next = new Date(year, month - 1, day, 12, 0, 0, 0);
  next.setDate(next.getDate() + days);
  return toDashboardDate(next);
}

// The API groups ledger spending by its Bangkok date before applying any row
// cap, so charts and totals stay complete even when drill-down rows are partial.
export type DailyExpenseAggregate = { date: string; amount: number; entries: number };

export function dailyExpenseTotalsByDate(daily: DailyExpenseAggregate[]) {
  const totals = new Map<string, { amount: number; entries: number }>();
  for (const item of daily) {
    const previous = totals.get(item.date);
    totals.set(item.date, {
      amount: (previous?.amount ?? 0) + item.amount,
      entries: (previous?.entries ?? 0) + item.entries,
    });
  }
  return totals;
}

export function totalDailyExpensesForMonth(daily: DailyExpenseAggregate[], month: string) {
  return daily.reduce((sum, item) => (item.date.startsWith(month) ? sum + item.amount : sum), 0);
}

export function hasPartialDailyExpenseRows(shownRows: number, totalEntries: number) {
  return shownRows < totalEntries;
}

// The kitchen queue splits an order into one ticket per round it sent, so two
// rounds off one table share an order ID and differ only here. Anything that
// counts or keys tickets has to use this, not `order.ID`.
export function kitchenTicketKey(order: Order) {
  return order.kitchen_ticket_id ?? `${order.ID}:${order.kitchen_batch ?? 0}`;
}

export function uniqueKitchenTickets(orders: Order[]) {
  const seen = new Set<string>();
  return orders.filter((order) => {
    const key = kitchenTicketKey(order);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function uniqueOrdersById(orders: Order[]) {
  const seen = new Set<number>();
  return orders.filter((order) => {
    if (seen.has(order.ID)) return false;
    seen.add(order.ID);
    return true;
  });
}

export function toDashboardFloorTables(tables: RestaurantTable[], orders: Order[], now: Date): DashboardFloorTable[] {
  const activeByTable = new Map<number, Order>();
  for (const order of orders) {
    if (!order.table_id || !activeOrderStatuses.has(order.status) || activeByTable.has(order.table_id)) continue;
    activeByTable.set(order.table_id, order);
  }

  return tables.map((table) => {
    const activeOrder = activeByTable.get(table.ID);
    const openedAt = activeOrder ? new Date(activeOrder.opened_at).getTime() : Number.NaN;
    return {
      key: table.ID,
      label: table.display_label || table.table_number,
      status: table.status === "free" ? "available" : table.status,
      guests: activeOrder?.customer_count,
      seats: table.capacity,
      minutes: Number.isFinite(openedAt) ? Math.max(0, Math.floor((now.getTime() - openedAt) / 60000)) : undefined,
      zone: table.zone,
    };
  });
}
