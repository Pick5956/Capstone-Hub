import { apiRequest } from './client';
import {
  MENU_IMAGE_BACKGROUND_PREVIEW_PATH,
  MENU_IMAGE_UPLOAD_PATH,
  appendMenuImageBackgroundPreview,
  appendMenuImageUpload,
  type MenuImageBackgroundOptions,
  type MenuImageBackgroundPreview,
  type MenuImageUploadFile,
} from '@/src/lib/menu-image';
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

export function previewMenuImageBackground(
  file: MenuImageUploadFile,
  backgroundStrength: number,
  signal?: AbortSignal,
) {
  const formData = new FormData();
  appendMenuImageBackgroundPreview(formData, file, backgroundStrength);
  return apiRequest<MenuImageBackgroundPreview>(MENU_IMAGE_BACKGROUND_PREVIEW_PATH, {
    method: 'POST',
    body: formData,
    signal,
  });
}

export function uploadMenuImage(file: MenuImageUploadFile, options: MenuImageBackgroundOptions) {
  const formData = new FormData();
  appendMenuImageUpload(formData, file, options);
  return apiRequest<{ image_url: string; path: string; background_removed: boolean }>(MENU_IMAGE_UPLOAD_PATH, {
    method: 'POST',
    body: formData,
  });
}
