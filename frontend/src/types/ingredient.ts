export interface IngredientCategory {
  ID: number;
  restaurant_id: number;
  name: string;
  display_order: number;
  is_active: boolean;
  CreatedAt?: string;
  UpdatedAt?: string;
}

export interface Ingredient {
  ID: number;
  restaurant_id: number;
  name: string;
  // sku/image_url/yield_percent are no longer collected in the inventory form,
  // but the API still returns them and the menu page reads yield_percent for
  // per-dish cost — so the response type keeps them.
  sku?: string;
  category_id?: number | null;
  image_url?: string;
  unit: string;
  stock: number;
  min_stock: number;
  cost_per_unit: number;
  yield_percent?: number;
  storage_type?: string;
  category?: IngredientCategory;
  CreatedAt?: string;
  UpdatedAt?: string;
}

export type TransactionType = "in" | "out" | "adjust";

export interface IngredientTransaction {
  ID: number;
  restaurant_id: number;
  ingredient_id: number;
  type: TransactionType;
  quantity: number;
  /** What a restock cost. Only "in" carries money; "out" and "adjust" are always 0. */
  amount: number;
  note: string;
  created_by_id: number;
  // The log stores ids only — the API joins these names on so a whole-inventory
  // read is readable. They are empty when the row points at a deleted record.
  ingredient_name: string;
  ingredient_unit: string;
  category_name: string;
  created_by_name: string;
  CreatedAt?: string;
}

export interface TransactionQuery {
  ingredient_id?: number;
  category_id?: number;
  type?: TransactionType | "";
  search?: string;
  /** Inclusive YYYY-MM-DD in the shop timezone. */
  from?: string;
  /** Inclusive YYYY-MM-DD — the API widens it to cover the whole day. */
  to?: string;
  page?: number;
  limit?: number;
}

export interface TransactionListResponse {
  transactions: IngredientTransaction[];
  total: number;
  page: number;
  limit: number;
}

export interface CSVExportResult {
  filename: string;
  /** Rows actually written. Fewer than `total` when the server capped the file. */
  rows: number;
  total: number;
  truncated: boolean;
}

export interface IngredientInput {
  name: string;
  category_id?: number;
  unit: string;
  stock: number;
  min_stock: number;
  cost_per_unit: number;
  storage_type?: string;
}

export interface AdjustStockInput {
  type: "in" | "out" | "adjust";
  quantity: number;
  note?: string;
  /** What the restock cost. Stock-in only; a positive value writes an expense entry. */
  amount?: number;
}
