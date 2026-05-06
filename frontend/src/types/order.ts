import type { MenuItem } from "./menu";
import type { RestaurantTable } from "./table";
import type { User } from "./auth";

export type OrderStatus = "open" | "sent_to_kitchen" | "cooking" | "ready" | "served" | "completed" | "cancelled";
export type OrderItemStatus = "pending" | "cooking" | "ready" | "served" | "cancelled";

export interface OrderItem {
  ID: number;
  order_id: number;
  restaurant_id: number;
  menu_id: number;
  menu_name: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
  note: string;
  status: OrderItemStatus;
  sent_at?: string | null;
  ready_at?: string | null;
  served_at?: string | null;
  cancelled_reason?: string;
  menu?: MenuItem;
  CreatedAt?: string;
  UpdatedAt?: string;
}

export interface OrderStatusLog {
  ID: number;
  order_id: number;
  from_status: string;
  to_status: string;
  changed_by: number;
  changed_at: string;
  note: string;
  user?: User;
}

export interface Order {
  ID: number;
  restaurant_id: number;
  table_id: number;
  order_number: string;
  order_date: string;
  staff_id: number;
  customer_count: number;
  status: OrderStatus;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  note: string;
  opened_at: string;
  closed_at?: string | null;
  cancelled_reason?: string;
  version: number;
  table?: RestaurantTable;
  staff?: User;
  items?: OrderItem[];
  status_logs?: OrderStatusLog[];
  CreatedAt?: string;
  UpdatedAt?: string;
}

export interface OpenOrderInput {
  table_id: number;
  customer_count: number;
  note?: string;
}

export interface AddOrderItemInput {
  menu_id: number;
  quantity: number;
  note?: string;
}
