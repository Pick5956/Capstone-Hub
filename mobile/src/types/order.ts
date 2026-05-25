import type { MenuItem } from './menu';
import type { RestaurantTable } from './table';
import type { User } from './auth';

export type OrderStatus = 'open' | 'sent_to_kitchen' | 'cooking' | 'ready' | 'served' | 'completed' | 'cancelled';
export type OrderItemStatus = 'pending' | 'cooking' | 'ready' | 'served' | 'cancelled';

export interface OrderItem {
  ID: number;
  order_id: number;
  restaurant_id: number;
  menu_id: number;
  menu_name: string;
  unit_price: number;
  options_total: number;
  quantity: number;
  subtotal: number;
  note: string;
  status: OrderItemStatus;
  menu?: MenuItem;
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
  payment_status: 'unpaid' | 'paid';
  note: string;
  opened_at: string;
  closed_at?: string | null;
  table?: RestaurantTable;
  staff?: User;
  items?: OrderItem[];
}
