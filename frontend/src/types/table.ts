export type TableStatus = "free" | "occupied" | "reserved";

export interface RestaurantTable {
  ID: number;
  restaurant_id: number;
  table_number: string;
  capacity: number;
  zone: string;
  status: TableStatus;
  CreatedAt?: string;
  UpdatedAt?: string;
}

export interface RestaurantTableInput {
  table_number: string;
  capacity: number;
  zone?: string;
  status: TableStatus;
}
