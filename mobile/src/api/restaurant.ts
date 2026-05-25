import { apiRequest } from './client';
import type { Membership } from '@/src/types/restaurant';

export function getMyMemberships() {
  return apiRequest<{ memberships: Membership[] }>('/api/v1/restaurants/me', {
    skipRestaurant: true,
  });
}
