import { apiClient } from "./apiClient";
import type { RestaurantTable } from "../types/table";

export type ReservationStatus = "active" | "seated" | "cancelled";

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
  table?: RestaurantTable;
}

export interface ReservationListResponse {
  reservations: Reservation[];
  has_more: boolean;
  next_offset: number;
  counts: Partial<Record<ReservationStatus, number>>;
}

// Reserve a table and start its reservation history record.
export const reserveTable = (id: number, reservationPhone: string, reservationName = "") =>
  apiClient.post<RestaurantTable>(`/api/v1/tables/${id}/reserve`, {
    reservation_phone: reservationPhone,
    reservation_name: reservationName,
  });

// Cancel a reservation (marks the record as a cancelled / no-show).
export const cancelReservation = (id: number) =>
  apiClient.post<RestaurantTable>(`/api/v1/tables/${id}/cancel-reservation`);

// Seat the guests: frees the table so an order can open, marking the record seated.
export const seatReservation = (id: number) =>
  apiClient.post<RestaurantTable>(`/api/v1/tables/${id}/seat-reservation`);

export const listReservations = (params: { status?: ReservationStatus; limit?: number; offset?: number } = {}) =>
  apiClient.get<ReservationListResponse>("/api/v1/reservations", { params });
