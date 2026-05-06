import { apiClient } from "./apiClient";
import type { AddOrderItemInput, OpenOrderInput, Order, OrderItemStatus, OrderStatus } from "../types/order";

export const listOrders = (params?: { status?: OrderStatus | ""; table_id?: number; date?: string }) =>
  apiClient.get<{ orders: Order[] }>("/api/v1/orders", { params });

export const getOrder = (id: number) =>
  apiClient.get<Order>(`/api/v1/orders/${id}`);

export const createOrder = (data: OpenOrderInput) =>
  apiClient.post<Order>("/api/v1/orders", data);

export const updateOrder = (id: number, data: { customer_count: number; note?: string }) =>
  apiClient.patch<Order>(`/api/v1/orders/${id}`, data);

export const cancelOrder = (id: number, reason: string) =>
  apiClient.post<Order>(`/api/v1/orders/${id}/cancel`, { reason });

export const closeOrder = (id: number) =>
  apiClient.post<Order>(`/api/v1/orders/${id}/close`);

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
