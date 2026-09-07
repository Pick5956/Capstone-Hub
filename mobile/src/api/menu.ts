import { File as FileSystemFile } from 'expo-file-system';

import { apiRequest } from './client';
import {
  MENU_IMAGE_BACKGROUND_PREVIEW_PATH,
  MENU_IMAGE_UPLOAD_PATH,
  appendMenuImageBackgroundPreview,
  appendMenuImageUpload,
  type MenuImageBackgroundOptions,
  type MenuImageBackgroundPreview,
  type MenuImageUploadFile,
  type MenuImageUploadPart,
} from '@/src/lib/menu-image';
import type { Category, CategoryInput, MenuItem, MenuItemInput } from '@/src/types/menu';

/**
 * Turns a picked or cropped file into a part Expo's fetch can serialise. Its
 * bytes are read only when the body is built, so nothing is held in memory
 * while the request is being assembled.
 */
async function toMenuImageUploadPart(
  source: MenuImageUploadFile,
): Promise<MenuImageUploadPart> {
  const handle = new FileSystemFile(source.uri);
  return {
    name: source.name,
    type: source.type,
    bytes: () => handle.bytes(),
  };
}

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

export async function previewMenuImageBackground(
  source: MenuImageUploadFile,
  backgroundStrength: number,
  signal?: AbortSignal,
) {
  const formData = new FormData();
  const file = await toMenuImageUploadPart(source);
  appendMenuImageBackgroundPreview(formData, file, backgroundStrength);
  return apiRequest<MenuImageBackgroundPreview>(MENU_IMAGE_BACKGROUND_PREVIEW_PATH, {
    method: 'POST',
    body: formData,
    signal,
  });
}

export async function uploadMenuImage(source: MenuImageUploadFile, options: MenuImageBackgroundOptions) {
  const formData = new FormData();
  const file = await toMenuImageUploadPart(source);
  appendMenuImageUpload(formData, file, options);
  return apiRequest<{ image_url: string; path: string; background_removed: boolean }>(MENU_IMAGE_UPLOAD_PATH, {
    method: 'POST',
    body: formData,
  });
}
