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
  service_charge_amount: number;
  vat_amount: number;
  total_amount: number;
  grand_total: number;
  payment_status: "unpaid" | "paid";
  note: string;
  opened_at: string;
  closed_at?: string | null;
  cancelled_reason?: string;
  version: number;
  table?: RestaurantTable;
  staff?: User;
  items?: OrderItem[];
  payments?: OrderPayment[];
  status_logs?: OrderStatusLog[];
  CreatedAt?: string;
  UpdatedAt?: string;
}

export interface OrderPayment {
  ID: number;
  order_id: number;
  restaurant_id: number;
  method: "cash" | "promptpay_qr";
  amount: number;
  received_amount: number;
  change_amount: number;
  note: string;
  paid_by: number;
  paid_at: string;
}

export interface Bill {
  order: Order;
  items: OrderItem[];
  subtotal: number;
  discount_amount: number;
  service_charge_enabled: boolean;
  service_charge_rate: number;
  service_charge_amount: number;
  vat_enabled: boolean;
  vat_rate: number;
  vat_amount: number;
  total_amount: number;
  grand_total: number;
  payment_status: "unpaid" | "paid";
  promptpay_name: string;
  promptpay_qr_image: string;
  payments: OrderPayment[];
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
