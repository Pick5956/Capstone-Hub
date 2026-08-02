import { apiRequest } from './client';
import type { RegisterInput, User } from '@/src/types/auth';
import type { Membership, Role } from '@/src/types/restaurant';

export interface LoginResponse {
  token: string;
  user: User;
  memberships: Membership[];
}

export function login(email: string, password: string) {
  return apiRequest<LoginResponse>('/api/login', {
    method: 'POST',
    skipAuth: true,
    skipRestaurant: true,
    body: JSON.stringify({ email, password }),
  });
}

export function googleLogin(idToken: string) {
  return apiRequest<LoginResponse>('/api/google-login', {
    method: 'POST',
    skipAuth: true,
    skipRestaurant: true,
    body: JSON.stringify({ id_token: idToken }),
  });
}

export function getCurrentUser() {
  return apiRequest<User>('/api/v1/users/profile');
}

export function updateProfile(data: Pick<User, 'first_name' | 'last_name' | 'nickname' | 'phone'>) {
  return apiRequest<User>('/api/v1/users/profile', { method: 'PATCH', body: JSON.stringify(data) });
}

export function requestPasswordReset(email: string) {
  return apiRequest<{ message?: string }>('/api/forgot-password', {
    method: 'POST',
    skipAuth: true,
    skipRestaurant: true,
    body: JSON.stringify({ email }),
  });
}

export function register(data: RegisterInput) {
  return apiRequest<User>('/api/register', {
    method: 'POST',
    skipAuth: true,
    skipRestaurant: true,
    body: JSON.stringify(data),
  });
}

export function getRoles() {
  return apiRequest<{ data: Role[] }>('/api/v1/roles');
}

export function createRole(data: { display_name: string; permissions: string[] }) {
  return apiRequest<{ role: Role }>('/api/v1/roles', { method: 'POST', body: JSON.stringify(data) });
}

export function updateRole(id: number, data: { display_name: string }) {
  return apiRequest<{ role: Role }>(`/api/v1/roles/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export function updateRolePermissions(id: number, permissions: string[]) {
  return apiRequest<{ role: Role }>(`/api/v1/roles/${id}/permissions`, { method: 'PATCH', body: JSON.stringify({ permissions }) });
}

export function deleteRole(id: number) {
  return apiRequest<{ status: string }>(`/api/v1/roles/${id}`, { method: 'DELETE' });
}
