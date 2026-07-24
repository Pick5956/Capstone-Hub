import { apiRequest } from './client';
import type {
  BulkCreateTablesInput,
  MoveTableZoneInput,
  RestaurantTable,
  RestaurantTableInput,
  TableTag,
  TableTagInput,
  TableZone,
  TableZoneInput,
} from '@/src/types/table';

export function listTables() {
  return apiRequest<{ tables: RestaurantTable[] }>('/api/v1/tables');
}

export function createTable(data: RestaurantTableInput) {
  return apiRequest<RestaurantTable>('/api/v1/tables', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function bulkCreateTables(data: BulkCreateTablesInput) {
  return apiRequest<{ tables: RestaurantTable[] }>('/api/v1/tables/bulk-create', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateTable(id: number, data: RestaurantTableInput) {
  return apiRequest<RestaurantTable>(`/api/v1/tables/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteTable(id: number) {
  return apiRequest<{ status: string }>(`/api/v1/tables/${id}`, {
    method: 'DELETE',
  });
}

export function updateTableStatus(id: number, status: RestaurantTable['status'], reservationPhone?: string, reservationName?: string) {
  return apiRequest<RestaurantTable>(`/api/v1/tables/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, reservation_phone: reservationPhone || '', reservation_name: reservationName || '' }),
  });
}

export function regenerateTableCustomerToken(id: number) {
  return apiRequest<RestaurantTable>(`/api/v1/tables/${id}/regenerate-customer-token`, {
    method: 'POST',
  });
}

export function moveTableZone(id: number, data: MoveTableZoneInput) {
  return apiRequest<RestaurantTable>(`/api/v1/tables/${id}/move-zone`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function listTableZones() {
  return apiRequest<{ zones: TableZone[] }>('/api/v1/table-zones');
}

export function createTableZone(data: TableZoneInput) {
  return apiRequest<TableZone>('/api/v1/table-zones', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateTableZone(id: number, data: TableZoneInput) {
  return apiRequest<TableZone>(`/api/v1/table-zones/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteTableZone(id: number) {
  return apiRequest<{ status: string }>(`/api/v1/table-zones/${id}`, {
    method: 'DELETE',
  });
}

export function listTableTags() {
  return apiRequest<{ tags: TableTag[] }>('/api/v1/table-tags');
}

export function createTableTag(data: TableTagInput) {
  return apiRequest<TableTag>('/api/v1/table-tags', {
    method: 'POST',
    body: JSON.stringify({ color: 'gray', ...data }),
  });
}

export function updateTableTag(id: number, data: TableTagInput) {
  return apiRequest<TableTag>(`/api/v1/table-tags/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ color: 'gray', ...data }),
  });
}

export function deleteTableTag(id: number) {
  return apiRequest<{ status: string }>(`/api/v1/table-tags/${id}`, {
    method: 'DELETE',
  });
}
