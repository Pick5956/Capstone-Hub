import type { RestaurantTable } from '@/src/types/table';

export type ReservationStatus = 'active' | 'seated' | 'cancelled';

export interface Reservation {
  ID: number;
  restaurant_id: number;
  table_id: number;
  table_label: string;
  name: string;
  phone: string;
  status: ReservationStatus;
  reserved_by_user_id: number;
  resolved_at?: string | null;
  CreatedAt?: string;
  table?: RestaurantTable | null;
}

export interface ReservationListResponse {
  reservations: Reservation[];
  has_more: boolean;
  next_offset: number;
  counts: Partial<Record<ReservationStatus, number>>;
}

export interface ReserveTableInput {
  reservation_phone: string;
  reservation_name?: string;
}
