import { describe, expect, it } from "vitest";
import { orderPosHref } from "../orderNavigation";

describe("orderPosHref", () => {
  it("uses the database ID so daily order numbers cannot open an older order", () => {
    expect(orderPosHref({ ID: 42, order_number: "A001" })).toBe("/pos/orders/42?ref=A001");
  });
});
