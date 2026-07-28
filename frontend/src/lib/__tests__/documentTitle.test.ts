import { describe, expect, it } from "vitest";
import { pageTitle } from "../documentTitle";

describe("pageTitle", () => {
  it("labels operational routes in the selected language", () => {
    expect(pageTitle("/kitchen", "th")).toBe("จอครัว · Dishy");
    expect(pageTitle("/orders", "en")).toBe("Order archive · Dishy");
  });

  it("includes the current order number on POS order tabs", () => {
    expect(pageTitle("/pos/orders/A001", "th", "ครัวบ้านเรา")).toBe("ออเดอร์ A001 · ครัวบ้านเรา");
    expect(pageTitle("/pos/orders/42", "th", "ครัวบ้านเรา", "A001")).toBe("ออเดอร์ A001 · ครัวบ้านเรา");
  });

  it("uses the restaurant name as the active workspace brand", () => {
    expect(pageTitle("/home", "th", "ร้านตัวอย่าง")).toBe("ภาพรวมร้าน · ร้านตัวอย่าง");
  });

  it("distinguishes the customer table order history from the menu", () => {
    expect(pageTitle("/customer/t/table-token", "th")).toBe("สั่งอาหาร · Dishy");
    expect(pageTitle("/customer/t/table-token/orders", "th")).toBe("รายการที่สั่ง · Dishy");
    expect(pageTitle("/customer/t/table-token/orders", "en")).toBe("Table orders · Dishy");
  });
});
