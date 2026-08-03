import { describe, expect, it } from "vitest";
import {
  shiftDashboardDate,
  toDashboardDate,
  toDashboardFloorTables,
  totalExpensesByDate,
  uniqueOrdersById,
} from "../homeDashboard";
import type { Order } from "../../types/order";
import type { RestaurantTable } from "../../types/table";

const table = (id: number, label: string): RestaurantTable => ({
  ID: id,
  restaurant_id: 1,
  zone: "main",
  table_number: label,
  display_label: label,
  sequence_number: id,
  capacity: 4,
  status: "free",
});

const order = (id: number): Order => ({
  ID: id,
  restaurant_id: 1,
  order_type: "dine_in",
  order_number: `A${id}`,
  order_date: "2026-07-13",
  staff_id: 1,
  customer_count: 2,
  status: "open",
  subtotal: 100,
  discount_amount: 0,
  service_charge_amount: 0,
  vat_amount: 0,
  total_amount: 100,
  grand_total: 100,
  payment_status: "unpaid",
  note: "",
  opened_at: "2026-07-13T12:00:00+07:00",
  version: 1,
});

describe("home dashboard helpers", () => {
  it("keeps table keys unique even when display labels are duplicated", () => {
    const floor = toDashboardFloorTables([
      table(11, "16"),
      table(12, "16"),
    ], [], new Date("2026-07-13T13:00:00+07:00"));

    expect(floor.map((item) => item.key)).toEqual([11, 12]);
  });

  it("deduplicates repeated kitchen orders by database ID", () => {
    expect(uniqueOrdersById([order(16), order(16), order(17)]).map((item) => item.ID)).toEqual([16, 17]);
  });

  it("sums the expense ledger onto the Bangkok day it was spent", () => {
    const totals = totalExpensesByDate([
      { spent_at: "2026-07-13T00:00:00+07:00", amount: 250 },
      { spent_at: "2026-07-13T00:00:00+07:00", amount: 120.5 },
      // Midnight in Bangkok is the previous day in UTC; the key must not shift.
      { spent_at: "2026-07-14T00:00:00+07:00", amount: 80 },
    ]);

    expect(totals.get("2026-07-13")).toBe(370.5);
    expect(totals.get("2026-07-14")).toBe(80);
    expect(totals.get("2026-07-15")).toBeUndefined();
  });

  it("moves dashboard dates without UTC conversion", () => {
    expect(shiftDashboardDate("2026-07-13", -1)).toBe("2026-07-12");
    expect(toDashboardDate(new Date("2026-07-13T00:30:00+07:00"))).toBe("2026-07-13");
  });
});
