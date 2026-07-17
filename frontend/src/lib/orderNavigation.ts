import type { Order } from "@/src/types/order";

export function orderPosHref(order: Pick<Order, "ID" | "order_number">) {
  return `/pos/orders/${order.ID}?ref=${encodeURIComponent(order.order_number)}`;
}

export function canCloseEmptyTableOrder(
  order: Pick<Order, "order_type" | "table_id" | "status"> & { items?: readonly unknown[] },
) {
  return order.order_type === "dine_in"
    && Boolean(order.table_id)
    && order.status === "open"
    && (order.items?.length ?? 0) === 0;
}
