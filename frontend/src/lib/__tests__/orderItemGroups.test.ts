import { describe, expect, it } from "vitest";
import { groupOrderItems } from "../orderItemGroups";
import type { OrderItem } from "../../types/order";

const item = (id: number, name: string, updatedAt: string, menuId = id): OrderItem => ({
  ID: id,
  order_id: 1,
  restaurant_id: 1,
  menu_id: menuId,
  menu_name: name,
  unit_price: 50,
  options_total: 0,
  quantity: 1,
  subtotal: 50,
  note: "",
  status: "pending",
  CreatedAt: `2026-07-13T00:00:0${id}Z`,
  UpdatedAt: updatedAt,
});

describe("groupOrderItems", () => {
  it("preserves API order when a non-first item receives a newer UpdatedAt", () => {
    const groups = groupOrderItems([
      item(1, "First", "2026-07-13T00:00:01Z"),
      item(2, "Second", "2026-07-13T00:10:00Z"),
      item(3, "Third", "2026-07-13T00:00:03Z"),
    ]);

    expect(groups.map((group) => group.firstItem.menu_name)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
  });

  it("combines the same menu configuration across separate order rounds", () => {
    const groups = groupOrderItems([
      item(1, "Pad Thai", "2026-07-13T00:00:01Z", 9),
      item(2, "Pad Thai", "2026-07-13T00:10:00Z", 9),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ quantity: 2, subtotal: 100 });
  });
});
