import { apiRequest } from './client';
import type { Category, MenuItem } from '@/src/types/menu';

export function listCategories() {
  return apiRequest<{ categories: Category[] }>('/api/v1/categories');
}

export function listMenuItems(categoryId?: number) {
  const query = categoryId ? `?category_id=${categoryId}` : '';
  return apiRequest<{ menu_items: MenuItem[] }>(`/api/v1/menu-items${query}`);
}
