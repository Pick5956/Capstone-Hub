import { describe, expect, it } from "vitest";
import {
  customerOrderItemStatusLabel,
  customerTableOrdersHref,
  shouldShowCustomerCartAction,
  summarizeCustomerOrderItems,
} from "../customerOrderView";
import { createCustomerOrderRequestKey } from "../customerOrder";
import type { OrderItem } from "../../types/order";

const orderItem = (overrides: Partial<OrderItem>): OrderItem => ({
  ID: 1,
  order_id: 10,
  restaurant_id: 2,
  menu_id: 3,
  menu_name: "ข้าวผัด",
  unit_price: 50,
  options_total: 0,
  quantity: 1,
  subtotal: 50,
  note: "",
  status: "cooking",
  ...overrides,
});

describe("customer order view helpers", () => {
  it("builds the separate table-order route without exposing the token as a query", () => {
    expect(customerTableOrdersHref("abc_123")).toBe("/customer/t/abc_123/orders");
    expect(customerTableOrdersHref("token/with/slash")).toBe("/customer/t/token%2Fwith%2Fslash/orders");
  });

  it("summarizes quantities and totals from the active table order", () => {
    const summary = summarizeCustomerOrderItems([
      orderItem({ quantity: 2, subtotal: 100 }),
      orderItem({ ID: 2, quantity: 1, subtotal: 75, status: "ready" }),
    ]);

    expect(summary).toEqual({ itemCount: 3, total: 175 });
  });

  it("provides guest-friendly bilingual kitchen statuses", () => {
    expect(customerOrderItemStatusLabel("cooking", "th")).toBe("กำลังเตรียม");
    expect(customerOrderItemStatusLabel("ready", "en")).toBe("Ready");
    expect(customerOrderItemStatusLabel("cancelled", "th")).toBe("ยกเลิก");
  });

  it("shows the combined cart action only after an orderable table has at least one item", () => {
    expect(shouldShowCustomerCartAction(true, 0)).toBe(false);
    expect(shouldShowCustomerCartAction(true, 1)).toBe(true);
    expect(shouldShowCustomerCartAction(false, 3)).toBe(false);
  });

  it("creates request keys accepted by the public order API", () => {
    const first = createCustomerOrderRequestKey();
    const second = createCustomerOrderRequestKey();

    expect(first.length).toBeGreaterThanOrEqual(16);
    expect(first.length).toBeLessThanOrEqual(128);
    expect(first).not.toMatch(/\s/);
    expect(second).not.toBe(first);
  });
});
