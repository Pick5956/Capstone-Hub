import { apiRequest } from './client';
import type { Category, CategoryInput, MenuItem, MenuItemInput } from '@/src/types/menu';

export function listCategories() {
  return apiRequest<{ categories: Category[] }>('/api/v1/categories');
}

export function listMenuItems(categoryId?: number) {
  const query = categoryId ? `?category_id=${categoryId}` : '';
  return apiRequest<{ menu_items: MenuItem[] }>(`/api/v1/menu-items${query}`);
}

export function createCategory(data: CategoryInput) {
  return apiRequest<Category>('/api/v1/categories', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateCategory(id: number, data: CategoryInput) {
  return apiRequest<Category>(`/api/v1/categories/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteCategory(id: number) {
  return apiRequest<{ status: string }>(`/api/v1/categories/${id}`, {
    method: 'DELETE',
  });
}

export function createMenuItem(data: MenuItemInput) {
  return apiRequest<MenuItem>('/api/v1/menu-items', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateMenuItem(id: number, data: MenuItemInput) {
  return apiRequest<MenuItem>(`/api/v1/menu-items/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteMenuItem(id: number) {
  return apiRequest<{ status: string }>(`/api/v1/menu-items/${id}`, {
    method: 'DELETE',
  });
}

export function setMenuItemAvailability(id: number, isAvailable: boolean) {
  return apiRequest<MenuItem>(`/api/v1/menu-items/${id}/availability`, {
    method: 'PATCH',
    body: JSON.stringify({ is_available: isAvailable }),
  });
}
