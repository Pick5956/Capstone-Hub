import { publicApiClient } from "./apiClient";
import type {
  OrderItemFulfillmentType,
  OrderItemStatus,
  OrderStatus,
} from "../types/order";

export interface CustomerRestaurant {
  name: string;
  branch_name: string;
  logo: string;
  open_time: string;
  close_time: string;
  /** Restaurant requires the device to be on-site before ordering. */
  geofence_required?: boolean;
}

export interface CustomerTable {
  table_number: string;
  display_label: string;
  capacity: number;
  zone?: string;
}

export interface CustomerCategory {
  ID: number;
  name: string;
  display_order: number;
  is_active: boolean;
}

export interface CustomerMenuOption {
  ID: number;
  name: string;
  price_delta: number;
  is_default: boolean;
  display_order: number;
  is_active: boolean;
}

export interface CustomerMenuOptionGroup {
  ID: number;
  name: string;
  required: boolean;
  min_select: number;
  max_select: number;
  display_order: number;
  is_active: boolean;
  options: CustomerMenuOption[];
}

export interface CustomerMenuItem {
  ID: number;
  category_id: number;
  category?: CustomerCategory;
  name: string;
  price: number;
  image_url: string;
  description: string;
  is_available: boolean;
  /**
   * Portions still makeable from current stock after subtracting what queued orders
   * have already claimed. Undefined/null means the item has no recipe (not
   * stock-limited); 0 means sold out.
   */
  remaining_servings?: number | null;
  display_order: number;
  categories: Array<{ category_id: number }>;
  option_groups: CustomerMenuOptionGroup[];
}

export interface CustomerOrderItem {
  ID: number;
  menu_name: string;
  image_url: string;
  unit_price: number;
  options_total: number;
  quantity: number;
  subtotal: number;
  fulfillment_type: OrderItemFulfillmentType;
  note: string;
  status: OrderItemStatus;
  selected_options: Array<{
    ID: number;
    group_name: string;
    option_name: string;
    price_delta: number;
  }>;
}

export interface CustomerOrder {
  order_number: string;
  status: OrderStatus;
  items: CustomerOrderItem[];
}

export interface CustomerTablePayload {
  restaurant: CustomerRestaurant;
  table: CustomerTable;
  categories: CustomerCategory[];
  menu_items: CustomerMenuItem[];
  order?: CustomerOrder;
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

export const createCustomerOrderRequestKey = () => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `customer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
};

export const submitCustomerTableOrder = (
  token: string,
  data: SubmitCustomerOrderInput,
  requestKey: string,
) =>
  publicApiClient.post<CustomerTablePayload>(
    `/api/public/table-orders/${token}/submit`,
    data,
    { headers: { "Idempotency-Key": requestKey } },
  );
