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

export interface IngredientTransaction {
  ID: number;
  restaurant_id: number;
  ingredient_id: number;
  type: "in" | "out" | "adjust";
  quantity: number;
  note: string;
  created_by_id: number;
  created_by?: { ID: number; first_name: string; last_name: string };
  CreatedAt?: string;
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
