import { apiRequest } from './client';
import type { Invitation, Membership, Restaurant, RestaurantInput } from '@/src/types/restaurant';

export function getMyMemberships() {
  return apiRequest<{ memberships: Membership[] }>('/api/v1/restaurants/me', {
    skipRestaurant: true,
  });
}

export function createRestaurant(data: RestaurantInput) {
  return apiRequest<{ restaurant: Restaurant; membership: Membership }>('/api/v1/restaurants', {
    method: 'POST',
    skipRestaurant: true,
    body: JSON.stringify(data),
  });
}

export function getRestaurant(id: number) {
  return apiRequest<Restaurant>(`/api/v1/restaurants/${id}`, {
    skipRestaurant: true,
  });
}

export function updateRestaurant(id: number, data: RestaurantInput) {
  return apiRequest<{ restaurant: Restaurant }>(`/api/v1/restaurants/${id}`, {
    method: 'PATCH',
    skipRestaurant: true,
    body: JSON.stringify(data),
  });
}

export function listMembers(restaurantId: number) {
  return apiRequest<{ members: Membership[] }>(`/api/v1/restaurants/${restaurantId}/members`, {
    skipRestaurant: true,
  });
}

export function updateMemberStatus(restaurantId: number, memberId: number, status: Membership['status']) {
  return apiRequest<{ member: Membership }>(`/api/v1/restaurants/${restaurantId}/members/${memberId}/status`, {
    method: 'PATCH',
    skipRestaurant: true,
    body: JSON.stringify({ status }),
  });
}

export function updateMemberRole(restaurantId: number, memberId: number, roleId: number) {
  return apiRequest<{ member: Membership }>(`/api/v1/restaurants/${restaurantId}/members/${memberId}/role`, {
    method: 'PATCH',
    skipRestaurant: true,
    body: JSON.stringify({ role_id: roleId }),
  });
}

export function deleteRestaurant(id: number) {
  return apiRequest<{ status: string }>(`/api/v1/restaurants/${id}`, { method: 'DELETE', skipRestaurant: true });
}

export function updateMemberPermissions(restaurantId: number, memberId: number, permissions: string[] | null) {
  return apiRequest<{ member: Membership }>(`/api/v1/restaurants/${restaurantId}/members/${memberId}/permissions`, {
    method: 'PATCH',
    skipRestaurant: true,
    body: JSON.stringify({ use_role_permissions: permissions === null, permissions: permissions || [] }),
  });
}

export function createInvitation(restaurantId: number, data: { role_id: number; email?: string; expires_in_days?: number }) {
  return apiRequest<Invitation>(`/api/v1/restaurants/${restaurantId}/invitations`, {
    method: 'POST',
    skipRestaurant: true,
    body: JSON.stringify(data),
  });
}

export function listPendingInvitations(restaurantId: number) {
  return apiRequest<{ invitations: Invitation[] }>(`/api/v1/restaurants/${restaurantId}/invitations`, {
    skipRestaurant: true,
  });
}

export function revokeInvitation(restaurantId: number, invitationId: number) {
  return apiRequest<{ status: string }>(`/api/v1/restaurants/${restaurantId}/invitations/${invitationId}`, {
    method: 'DELETE',
    skipRestaurant: true,
  });
}

export function getInvitationByToken(token: string) {
  return apiRequest<{ invitation: Invitation; usable: boolean }>(`/api/invitations/${token}`, {
    skipAuth: true,
    skipRestaurant: true,
  });
}

export function acceptInvitation(token: string) {
  return apiRequest<{ membership: Membership }>(`/api/v1/invitations/${token}/accept`, {
    method: 'POST',
    skipRestaurant: true,
  });
}
