import type { OrderItemStatus, OrderStatus } from '@/src/types/order';
import type { TableStatus } from '@/src/types/table';

export function money(value: number | null | undefined) {
  return `฿${Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 })}`;
}

export function tableStatusLabel(status: TableStatus) {
  if (status === 'free') return 'ว่าง';
  if (status === 'occupied') return 'มีออเดอร์';
  return 'จอง';
}

export function orderStatusLabel(status: OrderStatus) {
  const labels: Record<OrderStatus, string> = {
    open: 'เปิดอยู่',
    sent_to_kitchen: 'ส่งเข้าครัว',
    cooking: 'กำลังทำ',
    ready: 'พร้อมเสิร์ฟ',
    served: 'เสิร์ฟแล้ว',
    completed: 'ปิดแล้ว',
    cancelled: 'ยกเลิก',
  };
  return labels[status] || status;
}

export function itemStatusLabel(status: OrderItemStatus) {
  const labels: Record<OrderItemStatus, string> = {
    pending: 'รอส่ง',
    cooking: 'กำลังทำ',
    ready: 'พร้อมเสิร์ฟ',
    served: 'เสิร์ฟแล้ว',
    cancelled: 'ยกเลิก',
  };
  return labels[status] || status;
}
