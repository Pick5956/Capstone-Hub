export type TableStatus = "free" | "occupied" | "reserved";

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
  table_zone?: TableZone | null;
  tags?: TableTag[];
  CreatedAt?: string;
  UpdatedAt?: string;
}

export interface RestaurantTableInput {
  zone_id?: number | null;
  capacity: number;
  status: TableStatus;
  tag_ids?: number[];
}

export interface BulkCreateTablesInput {
  zone_id?: number | null;
  count: number;
  capacity: number;
  tag_ids?: number[];
}

export interface MoveTableZoneInput {
  zone_id?: number | null;
}

export interface TableZone {
  ID: number;
  restaurant_id: number;
  name: string;
  prefix: string;
  display_order: number;
  is_active: boolean;
  CreatedAt?: string;
  UpdatedAt?: string;
}

export interface TableZoneInput {
  name: string;
  prefix?: string;
  display_order: number;
  is_active: boolean;
}

export type TableTagColor = "gray" | "orange" | "sky" | "emerald" | "amber";

export interface TableTag {
  ID: number;
  restaurant_id: number;
  name: string;
  color: TableTagColor;
  display_order: number;
  is_active: boolean;
  CreatedAt?: string;
  UpdatedAt?: string;
}

export interface TableTagInput {
  name: string;
  color: TableTagColor;
  display_order: number;
  is_active: boolean;
}
