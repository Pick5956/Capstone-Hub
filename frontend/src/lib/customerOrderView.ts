import type { Language } from "@/src/providers/LanguageProvider";
import type { OrderItemStatus } from "@/src/types/order";

export function customerTableOrdersHref(token: string) {
  return `/customer/t/${encodeURIComponent(token)}/orders`;
}

export function customerTableMenuHref(token: string) {
  return `/customer/t/${encodeURIComponent(token)}`;
}

export function summarizeCustomerOrderItems(
  items: Array<{ quantity: number; subtotal: number }>,
) {
  return items.reduce(
    (summary, item) => ({
      itemCount: summary.itemCount + item.quantity,
      total: summary.total + item.subtotal,
    }),
    { itemCount: 0, total: 0 },
  );
}

export function shouldShowCustomerCartAction(canOrder: boolean, itemCount: number) {
  return canOrder && itemCount > 0;
}

export function customerOrderItemStatusLabel(status: OrderItemStatus, language: Language) {
  const labels: Record<OrderItemStatus, { th: string; en: string }> = {
    pending: { th: "รับรายการแล้ว", en: "Received" },
    cooking: { th: "กำลังเตรียม", en: "Preparing" },
    ready: { th: "เสร็จแล้ว", en: "Done" },
    served: { th: "เสร็จแล้ว", en: "Done" },
    cancelled: { th: "ยกเลิก", en: "Cancelled" },
  };

  return labels[status][language];
}
