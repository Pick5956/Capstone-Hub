import { apiClient } from "./apiClient";
import type { AddOrderItemInput, Bill, OpenOrderInput, Order, OrderItemStatus, OrderStatus } from "../types/order";

export type OrderListStatus = OrderStatus | "active" | "closed" | "";

export interface OrderListSummary {
  total: number;
  active: number;
  closed: number;
  statuses: Record<OrderStatus, number>;
}

export interface OrderListResponse {
  orders: Order[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    has_more: boolean;
  };
  summary?: OrderListSummary;
}

export const listOrders = (params?: {
  status?: OrderListStatus;
  payment_status?: "paid" | "unpaid" | "";
  search?: string;
  include_summary?: boolean;
  table_id?: number;
  date?: string;
  page?: number;
  limit?: number;
}) => apiClient.get<OrderListResponse>("/api/v1/orders", { params });

export const getOrder = (id: string | number) =>
  apiClient.get<Order>(`/api/v1/orders/${id}`);

export const createOrder = (data: OpenOrderInput) =>
  apiClient.post<Order>("/api/v1/orders", data);

export const updateOrder = (id: number, data: { customer_count: number; note?: string }) =>
  apiClient.patch<Order>(`/api/v1/orders/${id}`, data);

export const cancelOrder = (id: number, reason: string) =>
  apiClient.post<Order>(`/api/v1/orders/${id}/cancel`, { reason });

export const closeEmptyTableOrder = (id: number) =>
  apiClient.post<Order>(`/api/v1/orders/${id}/close-empty-table`);

export const closeOrder = (id: number) =>
  apiClient.post<Order>(`/api/v1/orders/${id}/close`);

export const getOrderBill = (id: number) =>
  apiClient.get<Bill>(`/api/v1/orders/${id}/bill`);

export const payOrder = (id: number, data: { method: "cash" | "promptpay_qr"; received_amount?: number; note?: string }) =>
  apiClient.post<Order>(`/api/v1/orders/${id}/pay`, data);

export const addOrderItem = (orderId: number, data: AddOrderItemInput) =>
  apiClient.post<Order>(`/api/v1/orders/${orderId}/items`, data);

export const updateOrderItem = (orderId: number, itemId: number, data: { quantity: number; note?: string }) =>
  apiClient.patch<Order>(`/api/v1/orders/${orderId}/items/${itemId}`, data);

export const deleteOrderItem = (orderId: number, itemId: number) =>
  apiClient.delete<Order>(`/api/v1/orders/${orderId}/items/${itemId}`);

export const updateOrderItemStatus = (orderId: number, itemId: number, status: OrderItemStatus, reason?: string) =>
  apiClient.patch<Order>(`/api/v1/orders/${orderId}/items/${itemId}/status`, { status, reason });

export const sendOrderToKitchen = (orderId: number) =>
  apiClient.post<Order>(`/api/v1/orders/${orderId}/send-to-kitchen`);

export const kitchenQueue = () =>
  apiClient.get<{ orders: Order[] }>("/api/v1/kitchen/queue");
