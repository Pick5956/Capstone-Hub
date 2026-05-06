export interface Ingredient {
  ID: number;
  restaurant_id: number;
  name: string;
  unit: string;
  stock: number;
  min_stock: number;
  cost_per_unit: number;
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
  unit: string;
  stock: number;
  min_stock: number;
  cost_per_unit: number;
}

export interface AdjustStockInput {
  type: "in" | "out" | "adjust";
  quantity: number;
  note?: string;
}
