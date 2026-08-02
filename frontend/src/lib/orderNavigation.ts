import type { Order } from "@/src/types/order";

export function orderPosHref(order: Pick<Order, "ID" | "order_number">) {
  return `/pos/orders/${order.ID}?ref=${encodeURIComponent(order.order_number)}`;
}

export function canCloseEmptyTableOrder(
  order: Pick<Order, "order_type" | "table_id" | "status"> & { items?: readonly { status?: string }[] },
) {
  // Cancelled items (e.g. the kitchen ran out of stock) leave the table empty,
  // so only non-cancelled items should keep the table from being closed.
  const activeItemCount = order.items?.filter((item) => item?.status !== "cancelled").length ?? 0;
  return order.order_type === "dine_in"
    && Boolean(order.table_id)
    && order.status === "open"
    && activeItemCount === 0;
}
