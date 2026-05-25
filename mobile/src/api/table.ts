import { apiRequest } from './client';
import type { RestaurantTable } from '@/src/types/table';

export function listTables() {
  return apiRequest<{ tables: RestaurantTable[] }>('/api/v1/tables');
}
