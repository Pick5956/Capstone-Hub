import type { ReservationStatus } from '@/src/types/reservation';

export type ReservationStatusFilter = '' | ReservationStatus;

export type ReservationListQuery = {
  status?: ReservationStatusFilter;
  limit?: number;
  offset?: number;
};

export type ReservationAction = 'reserve' | 'cancel' | 'seat';

export function buildReservationListPath(params: ReservationListQuery = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);

  if (Number.isFinite(params.limit) && Number(params.limit) > 0) {
    query.set('limit', String(Math.min(100, Math.trunc(Number(params.limit)))));
  }
  if (Number.isFinite(params.offset) && Number(params.offset) > 0) {
    query.set('offset', String(Math.trunc(Number(params.offset))));
  }

  const suffix = query.toString();
  return `/api/v1/reservations${suffix ? `?${suffix}` : ''}`;
}

export function buildReservationActionPath(tableId: number, action: ReservationAction) {
  const suffix = action === 'cancel' ? 'cancel-reservation' : action === 'seat' ? 'seat-reservation' : 'reserve';
  return `/api/v1/tables/${tableId}/${suffix}`;
}
