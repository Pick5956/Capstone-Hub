export type TableStatus = 'free' | 'occupied' | 'reserved';

export interface TableZone {
  ID: number;
  restaurant_id: number;
  name: string;
  prefix: string;
  display_order: number;
  is_active: boolean;
}

export interface TableTag {
  ID: number;
  restaurant_id: number;
  name: string;
  display_order: number;
  is_active: boolean;
}

export interface RestaurantTable {
  ID: number;
  restaurant_id: number;
  zone_id?: number | null;
  table_number: string;
  display_label: string;
  sequence_number: number;
  capacity: number;
  zone: string;
  status: TableStatus;
  customer_token?: string;
  table_zone?: TableZone | null;
  tags?: TableTag[];
}
