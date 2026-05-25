import { publicApiClient } from "./apiClient";
import type { Category, MenuItem } from "../types/menu";
import type { Order } from "../types/order";
import type { RestaurantTable } from "../types/table";

export interface CustomerRestaurant {
  id: number;
  name: string;
  branch_name: string;
  logo: string;
  open_time: string;
  close_time: string;
}

export interface CustomerTablePayload {
  restaurant: CustomerRestaurant;
  table: RestaurantTable;
  categories: Category[];
  menu_items: MenuItem[];
  order?: Order;
}

export interface CustomerCartItemInput {
  menu_id: number;
  quantity: number;
  note?: string;
  selected_option_ids?: number[];
}

export interface SubmitCustomerOrderInput {
  note?: string;
  items: CustomerCartItemInput[];
}

export const getCustomerTableOrder = (token: string) =>
  publicApiClient.get<CustomerTablePayload>(`/api/public/table-orders/${token}`);

export const submitCustomerTableOrder = (token: string, data: SubmitCustomerOrderInput) =>
  publicApiClient.post<CustomerTablePayload>(`/api/public/table-orders/${token}/submit`, data);
