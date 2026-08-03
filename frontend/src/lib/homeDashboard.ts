import type { Order } from "../types/order";
import type { RestaurantTable } from "../types/table";

export const activeOrderStatuses = new Set(["open", "sent_to_kitchen", "cooking", "ready", "served"]);

export type DashboardFloorTable = {
  key: number;
  label: string;
  status: "occupied" | "available" | "reserved" | "inactive";
  guests?: number;
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

// Ledger spending per Bangkok calendar day. `spent_at` is a date-only value
// already anchored to Bangkok, so the leading YYYY-MM-DD is the day it belongs
// to — parsing it into a Date would drag it across midnight in other zones.
export function totalExpensesByDate(expenses: { spent_at: string; amount: number }[]) {
  const totals = new Map<string, number>();
  for (const expense of expenses) {
    const key = expense.spent_at.slice(0, 10);
    totals.set(key, (totals.get(key) ?? 0) + expense.amount);
  }
  return totals;
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
      minutes: Number.isFinite(openedAt) ? Math.max(0, Math.floor((now.getTime() - openedAt) / 60000)) : undefined,
      zone: table.zone,
    };
  });
}
