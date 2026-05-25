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

export function getCurrentUser() {
  return apiRequest<User>('/api/v1/users/profile');
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
  return apiRequest<{ data: Role[] }>('/api/roles', {
    skipRestaurant: true,
  });
}
