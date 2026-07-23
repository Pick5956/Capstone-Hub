import type { Language } from "@/src/providers/LanguageProvider";
import type { OrderItem, OrderItemStatus } from "@/src/types/order";

export function customerTableOrdersHref(token: string) {
  return `/customer/t/${encodeURIComponent(token)}/orders`;
}

export function customerTableMenuHref(token: string) {
  return `/customer/t/${encodeURIComponent(token)}`;
}

export function summarizeCustomerOrderItems(items: OrderItem[]) {
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
    ready: { th: "พร้อมเสิร์ฟ", en: "Ready" },
    served: { th: "เสิร์ฟแล้ว", en: "Served" },
    cancelled: { th: "ยกเลิก", en: "Cancelled" },
  };

  return labels[status][language];
}
