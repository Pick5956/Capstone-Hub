import { apiClient } from "./apiClient";
import { Membership, Restaurant } from "../types/restaurant";

export interface CreateRestaurantInput {
  name: string;
  address?: string;
  phone?: string;
  logo?: string;
  open_time?: string;
  close_time?: string;
  table_count?: number;
}

export const createRestaurant = (data: CreateRestaurantInput) =>
  apiClient.post<{ restaurant: Restaurant; membership: Membership }>(
    "/api/v1/restaurants",
    data
  );

export const joinRestaurantByInviteCode = (inviteCode: string) =>
  apiClient.post<{ membership: Membership }>("/api/v1/restaurants/join", {
    invite_code: inviteCode,
  });

export const getMyMemberships = () =>
  apiClient.get<{ memberships: Membership[] }>("/api/v1/restaurants/me");

export const getRestaurant = (id: number) =>
  apiClient.get<Restaurant>(`/api/v1/restaurants/${id}`);

export const listMembers = (id: number) =>
  apiClient.get<{ members: Membership[] }>(`/api/v1/restaurants/${id}/members`);
