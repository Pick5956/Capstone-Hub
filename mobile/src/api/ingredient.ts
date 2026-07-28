import { apiRequest } from './client';
import type {
  AdjustStockInput,
  Ingredient,
  IngredientCategory,
  IngredientInput,
  IngredientMetadataInput,
  IngredientTransaction,
} from '@/src/types/ingredient';

export const listIngredientCategories = () => apiRequest<{ categories: IngredientCategory[] }>('/api/v1/ingredient-categories');
export const createIngredientCategory = (data: { name: string; display_order?: number; is_active?: boolean }) => apiRequest<IngredientCategory>('/api/v1/ingredient-categories', { method: 'POST', body: JSON.stringify(data) });
export const listIngredients = () => apiRequest<{ ingredients: Ingredient[] }>('/api/v1/ingredients');
export const createIngredient = (data: IngredientInput) => apiRequest<Ingredient>('/api/v1/ingredients', { method: 'POST', body: JSON.stringify(data) });
export const updateIngredient = (id: number, data: IngredientMetadataInput) => apiRequest<Ingredient>(`/api/v1/ingredients/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteIngredient = (id: number) => apiRequest<void>(`/api/v1/ingredients/${id}`, { method: 'DELETE' });
export const adjustStock = (id: number, data: AdjustStockInput) => apiRequest<Ingredient>(`/api/v1/ingredients/${id}/adjust`, { method: 'POST', body: JSON.stringify(data) });
export const listTransactions = (id: number) => apiRequest<{ transactions: IngredientTransaction[] }>(`/api/v1/ingredients/${id}/transactions`);
