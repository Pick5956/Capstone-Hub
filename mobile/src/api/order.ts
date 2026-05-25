import { apiRequest } from './client';
import type { Order, OrderItemStatus, OrderStatus } from '@/src/types/order';

export function listOrders(params?: { status?: OrderStatus | ''; table_id?: number; date?: string }) {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.table_id) query.set('table_id', String(params.table_id));
  if (params?.date) query.set('date', params.date);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return apiRequest<{ orders: Order[] }>(`/api/v1/orders${suffix}`);
}

export function kitchenQueue() {
  return apiRequest<{ orders: Order[] }>('/api/v1/kitchen/queue');
}

export function getOrder(id: number) {
  return apiRequest<Order>(`/api/v1/orders/${id}`);
}

export function createOrder(data: { table_id: number; customer_count: number; note?: string }) {
  return apiRequest<Order>('/api/v1/orders', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function addOrderItem(orderId: number, data: { menu_id: number; quantity: number; note?: string; selected_option_ids?: number[] }) {
  return apiRequest<Order>(`/api/v1/orders/${orderId}/items`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateOrderItem(orderId: number, itemId: number, data: { quantity: number; note?: string }) {
  return apiRequest<Order>(`/api/v1/orders/${orderId}/items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function deleteOrderItem(orderId: number, itemId: number) {
  return apiRequest<Order>(`/api/v1/orders/${orderId}/items/${itemId}`, {
    method: 'DELETE',
  });
}

export function sendOrderToKitchen(orderId: number) {
  return apiRequest<Order>(`/api/v1/orders/${orderId}/send-to-kitchen`, {
    method: 'POST',
  });
}

export function updateOrderItemStatus(orderId: number, itemId: number, status: OrderItemStatus) {
  return apiRequest<Order>(`/api/v1/orders/${orderId}/items/${itemId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function payOrder(orderId: number, data: { method: 'cash' | 'promptpay_qr'; received_amount?: number; note?: string }) {
  return apiRequest<Order>(`/api/v1/orders/${orderId}/pay`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function closeOrder(orderId: number) {
  return apiRequest<Order>(`/api/v1/orders/${orderId}/close`, {
    method: 'POST',
  });
}
