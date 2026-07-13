import { describe, expect, it } from "vitest";
import { pageTitle } from "../documentTitle";

describe("pageTitle", () => {
  it("labels operational routes in the selected language", () => {
    expect(pageTitle("/kitchen", "th")).toBe("คิวครัว · Restaurant Hub");
    expect(pageTitle("/orders", "en")).toBe("Order archive · Restaurant Hub");
  });

  it("includes the current order number on POS order tabs", () => {
    expect(pageTitle("/pos/orders/A001", "th", "ครัวบ้านเรา")).toBe("ออเดอร์ A001 · ครัวบ้านเรา");
    expect(pageTitle("/pos/orders/42", "th", "ครัวบ้านเรา", "A001")).toBe("ออเดอร์ A001 · ครัวบ้านเรา");
  });

  it("uses the restaurant name as the active workspace brand", () => {
    expect(pageTitle("/home", "th", "ร้านตัวอย่าง")).toBe("ภาพรวมร้าน · ร้านตัวอย่าง");
  });
});
