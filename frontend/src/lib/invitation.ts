import { apiClient } from "./apiClient";
import { Invitation, Membership } from "../types/restaurant";

export interface CreateInvitationInput {
  role_id: number;
  email?: string;
  expires_in_days?: number; // 0 or omitted = no expiry
}

export const createInvitation = (restaurantId: number, data: CreateInvitationInput) =>
  apiClient.post<Invitation>(`/api/v1/restaurants/${restaurantId}/invitations`, data);

export const listPendingInvitations = (restaurantId: number) =>
  apiClient.get<{ invitations: Invitation[] }>(`/api/v1/restaurants/${restaurantId}/invitations`);

export const revokeInvitation = (restaurantId: number, invitationId: number) =>
  apiClient.delete(`/api/v1/restaurants/${restaurantId}/invitations/${invitationId}`);

// Public — invitee can preview before logging in.
export const getInvitationByToken = (token: string) =>
  apiClient.get<{ invitation: Invitation; usable: boolean }>(`/api/invitations/${token}`);

export const acceptInvitation = (token: string) =>
  apiClient.post<{ membership: Membership }>(`/api/v1/invitations/${token}/accept`);
