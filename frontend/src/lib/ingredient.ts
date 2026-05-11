import { apiClient } from "./apiClient";
import type {
  AdjustStockInput,
  Ingredient,
  IngredientCategory,
  IngredientInput,
  IngredientTransaction,
} from "../types/ingredient";

export const listIngredientCategories = () =>
  apiClient.get<{ categories: IngredientCategory[] }>("/api/v1/ingredient-categories");

export const createIngredientCategory = (data: {
  name: string;
  display_order?: number;
  is_active?: boolean;
}) => apiClient.post<IngredientCategory>("/api/v1/ingredient-categories", data);

export const listIngredients = () =>
  apiClient.get<{ ingredients: Ingredient[] }>("/api/v1/ingredients");

export const createIngredient = (data: IngredientInput) =>
  apiClient.post<Ingredient>("/api/v1/ingredients", data);

export const updateIngredient = (id: number, data: IngredientInput) =>
  apiClient.put<Ingredient>(`/api/v1/ingredients/${id}`, data);

export const deleteIngredient = (id: number) =>
  apiClient.delete(`/api/v1/ingredients/${id}`);

export const adjustStock = (id: number, data: AdjustStockInput) =>
  apiClient.post<Ingredient>(`/api/v1/ingredients/${id}/adjust`, data);

export const listTransactions = (ingredientId: number) =>
  apiClient.get<{ transactions: IngredientTransaction[] }>(
    `/api/v1/ingredients/${ingredientId}/transactions`
  );
