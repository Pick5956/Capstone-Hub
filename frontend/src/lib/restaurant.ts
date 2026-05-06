import { apiClient } from "./apiClient";
import { Membership, MembershipStatus, Restaurant, RestaurantAuditLog } from "../types/restaurant";

export interface CreateRestaurantInput {
  name: string;
  branch_name: string;
  restaurant_type: string;
  address?: string;
  phone?: string;
  logo?: string;
  open_time?: string;
  close_time?: string;
  table_count?: number;
  service_charge_enabled?: boolean;
  service_charge_rate?: number;
  vat_enabled?: boolean;
  vat_rate?: number;
  promptpay_name?: string;
  promptpay_qr_image?: string;
}

export type UpdateRestaurantInput = CreateRestaurantInput;

export const createRestaurant = (data: CreateRestaurantInput) =>
  apiClient.post<{ restaurant: Restaurant; membership: Membership }>(
    "/api/v1/restaurants",
    data
  );

export const getMyMemberships = () =>
  apiClient.get<{ memberships: Membership[] }>("/api/v1/restaurants/me");

export const getRestaurant = (id: number) =>
  apiClient.get<Restaurant>(`/api/v1/restaurants/${id}`);

export const updateRestaurant = (id: number, data: UpdateRestaurantInput) =>
  apiClient.patch<{ restaurant: Restaurant }>(`/api/v1/restaurants/${id}`, data);

export const uploadRestaurantLogo = (id: number, file: File) => {
  const formData = new FormData();
  formData.append("image", file);
  return apiClient.post<{ restaurant: Restaurant }>(`/api/v1/restaurants/${id}/upload-logo`, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
};

export const listMembers = (id: number) =>
  apiClient.get<{ members: Membership[] }>(`/api/v1/restaurants/${id}/members`);

export const updateMemberStatus = (restaurantId: number, memberId: number, status: MembershipStatus) =>
  apiClient.patch<{ member: Membership }>(`/api/v1/restaurants/${restaurantId}/members/${memberId}/status`, {
    status,
  });

export const updateMemberRole = (restaurantId: number, memberId: number, roleId: number) =>
  apiClient.patch<{ member: Membership }>(`/api/v1/restaurants/${restaurantId}/members/${memberId}/role`, {
    role_id: roleId,
  });

export const listAuditLogs = (restaurantId: number, limit = 20) =>
  apiClient.get<{ logs: RestaurantAuditLog[] }>(`/api/v1/restaurants/${restaurantId}/audit-logs`, {
    params: { limit },
  });
