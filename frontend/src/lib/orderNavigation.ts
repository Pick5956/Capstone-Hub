import type { Order } from "@/src/types/order";

export function orderPosHref(order: Pick<Order, "ID" | "order_number">) {
  return `/pos/orders/${order.ID}?ref=${encodeURIComponent(order.order_number)}`;
}
