import type { OrderItem } from "@/src/types/order";

export type OrderItemGroup = {
  key: string;
  firstItem: OrderItem;
  items: OrderItem[];
  quantity: number;
  subtotal: number;
  statusQuantities: Record<OrderItem["status"], number>;
  pendingItems: OrderItem[];
  readyItems: OrderItem[];
};

export const groupOrderItems = (items: OrderItem[] = []) => {
  const groups = new Map<string, OrderItemGroup>();

  for (const item of items) {
    const optionKey = [...(item.selected_options ?? [])]
      .sort((first, second) => first.menu_option_id - second.menu_option_id)
      .map((option) => `${option.option_group_id}:${option.menu_option_id}:${option.price_delta}`)
      .join("|");
    const key = [item.menu_id, item.menu_name, item.unit_price, item.options_total, item.fulfillment_type ?? "dine_in", item.note ?? "", optionKey].join("::");
    const existing = groups.get(key);

    if (existing) {
      existing.items.push(item);
      existing.quantity += item.quantity;
      existing.subtotal += item.subtotal;
      existing.statusQuantities[item.status] = (existing.statusQuantities[item.status] ?? 0) + item.quantity;
      if (item.status === "pending") existing.pendingItems.push(item);
      if (item.status === "ready") existing.readyItems.push(item);
      continue;
    }

    groups.set(key, {
      key,
      firstItem: item,
      items: [item],
      quantity: item.quantity,
      subtotal: item.subtotal,
      statusQuantities: {
        pending: item.status === "pending" ? item.quantity : 0,
        cooking: item.status === "cooking" ? item.quantity : 0,
        ready: item.status === "ready" ? item.quantity : 0,
        served: item.status === "served" ? item.quantity : 0,
        cancelled: item.status === "cancelled" ? item.quantity : 0,
      },
      pendingItems: item.status === "pending" ? [item] : [],
      readyItems: item.status === "ready" ? [item] : [],
    });
  }

  return Array.from(groups.values());
};
