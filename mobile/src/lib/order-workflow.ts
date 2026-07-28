import type { Order, OrderItem, OrderItemStatus } from '@/src/types/order';

type KitchenItem = Pick<OrderItem, 'status'>;
type KitchenTicket = Pick<Order, 'ID' | 'kitchen_batch' | 'kitchen_ticket_id'>;
type EmptyOrderCandidate = Pick<Order, 'order_type' | 'table_id' | 'status'> & {
  items?: unknown[] | null;
};

export function canCloseEmptyOrder(order: EmptyOrderCandidate | null | undefined) {
  return Boolean(
    order
    && order.order_type === 'dine_in'
    && order.table_id
    && order.status === 'open'
    && (order.items?.length ?? 0) === 0,
  );
}

export function canCancelOrderForRole(
  roleName: string | null | undefined,
  status: Order['status'],
) {
  if (status === 'completed' || status === 'cancelled') return false;
  return roleName !== 'waiter' || status === 'open';
}

export function isKitchenComplete(items: KitchenItem[] | null | undefined) {
  const activeItems = (items ?? []).filter((item) => item.status !== 'cancelled');
  return activeItems.length > 0
    && activeItems.every((item) => item.status === 'ready' || item.status === 'served');
}

export function kitchenTicketKey(ticket: KitchenTicket) {
  const backendKey = ticket.kitchen_ticket_id?.trim();
  return backendKey || `${ticket.ID}:${ticket.kitchen_batch ?? 0}`;
}

export function paymentReceivedAmount(
  _method: 'cash' | 'promptpay_qr',
  grandTotal: number,
) {
  return grandTotal;
}

export function isCookingItem(status: OrderItemStatus) {
  return status === 'pending' || status === 'cooking';
}

export function isKitchenDoneItem(status: OrderItemStatus) {
  return status === 'ready' || status === 'served';
}

export function isOptionSelectionBelowMinimum(
  minSelect: number | null | undefined,
  selectedCount: number,
) {
  const normalizedMinimum = Math.max(0, Number(minSelect) || 0);
  return selectedCount < normalizedMinimum;
}

export function validateKitchenCancelReason(value: string) {
  const reason = value.trim();
  if (!reason) return { reason: null, error: 'required' as const };
  if (reason.length > 500) return { reason: null, error: 'too_long' as const };
  return { reason, error: null };
}
