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
  /** Restaurant requires the device to be on-site before ordering. */
  geofence_required?: boolean;
}

export interface CustomerTablePayload {
  restaurant: CustomerRestaurant;
  table: RestaurantTable;
  categories: Category[];
  menu_items: MenuItem[];
  order?: Order;
  /** Items were held for staff confirmation because location was unverified. */
  awaiting_staff_confirm?: boolean;
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
  /** Device location; omitted when the customer declines or it is unavailable. */
  latitude?: number;
  longitude?: number;
  accuracy?: number;
}

/**
 * Reads the device location for the geofence check. Never rejects: when the
 * customer declines (or the browser cannot answer in time) it resolves to null
 * and the order is held for staff confirmation instead of being blocked.
 */
export function readDeviceLocation(timeoutMs = 8000): Promise<GeolocationCoordinates | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: GeolocationCoordinates | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        window.clearTimeout(timer);
        finish(position.coords);
      },
      () => {
        window.clearTimeout(timer);
        finish(null);
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 },
    );
  });
}

export const getCustomerTableOrder = (token: string) =>
  publicApiClient.get<CustomerTablePayload>(`/api/public/table-orders/${token}`);

export const submitCustomerTableOrder = (token: string, data: SubmitCustomerOrderInput) =>
  publicApiClient.post<CustomerTablePayload>(`/api/public/table-orders/${token}/submit`, data);
