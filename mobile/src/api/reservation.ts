import { apiRequest } from './client';
import {
  buildReservationActionPath,
  buildReservationListPath,
  type ReservationListQuery,
} from '@/src/lib/reservation-query';
import type {
  ReservationListResponse,
  ReserveTableInput,
} from '@/src/types/reservation';
import type { RestaurantTable } from '@/src/types/table';

export function listReservations(params?: ReservationListQuery) {
  return apiRequest<ReservationListResponse>(buildReservationListPath(params));
}

export function reserveTable(tableId: number, data: ReserveTableInput) {
  return apiRequest<RestaurantTable>(buildReservationActionPath(tableId, 'reserve'), {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function cancelReservation(tableId: number) {
  return apiRequest<RestaurantTable>(buildReservationActionPath(tableId, 'cancel'), {
    method: 'POST',
  });
}
