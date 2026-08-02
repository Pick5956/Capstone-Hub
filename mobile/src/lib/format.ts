import type { DisplayLanguage } from '@/src/lib/display-preferences';
import type { OrderItemStatus, OrderStatus } from '@/src/types/order';
import type { TableStatus } from '@/src/types/table';

export function money(value: number | null | undefined, language: DisplayLanguage = 'th') {
  return `฿${Number(value || 0).toLocaleString(language === 'th' ? 'th-TH' : 'en-US', { maximumFractionDigits: 0 })}`;
}

export function tableStatusLabel(status: TableStatus, language: DisplayLanguage = 'th') {
  const labels: Record<TableStatus, Record<DisplayLanguage, string>> = {
    free: { th: 'ว่าง', en: 'Available' },
    occupied: { th: 'มีออเดอร์', en: 'Occupied' },
    reserved: { th: 'จอง', en: 'Reserved' },
    inactive: { th: 'ปิดใช้งาน', en: 'Inactive' },
  };
  return labels[status]?.[language] || status;
}

export function orderStatusLabel(status: OrderStatus, language: DisplayLanguage = 'th') {
  const labels: Record<OrderStatus, Record<DisplayLanguage, string>> = {
    open: { th: 'เปิดอยู่', en: 'Open' },
    sent_to_kitchen: { th: 'ส่งเข้าครัว', en: 'Sent to kitchen' },
    cooking: { th: 'กำลังทำ', en: 'Cooking' },
    ready: { th: 'ครัวทำเสร็จ', en: 'Kitchen done' },
    served: { th: 'ครัวทำเสร็จ', en: 'Kitchen done' },
    completed: { th: 'ปิดแล้ว', en: 'Closed' },
    cancelled: { th: 'ยกเลิก', en: 'Cancelled' },
  };
  return labels[status]?.[language] || status;
}

export function itemStatusLabel(status: OrderItemStatus, language: DisplayLanguage = 'th') {
  const labels: Record<OrderItemStatus, Record<DisplayLanguage, string>> = {
    pending: { th: 'รอส่ง', en: 'Pending' },
    cooking: { th: 'กำลังทำ', en: 'Cooking' },
    ready: { th: 'ครัวทำเสร็จ', en: 'Kitchen done' },
    served: { th: 'ครัวทำเสร็จ', en: 'Kitchen done' },
    cancelled: { th: 'ยกเลิก', en: 'Cancelled' },
  };
  return labels[status]?.[language] || status;
}
