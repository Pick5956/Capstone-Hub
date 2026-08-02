import type { Membership } from '@/src/types/restaurant';

export function resolveActiveRestaurantId(
  memberships: Membership[],
  storedRestaurantId: number | null,
): number | null {
  if (
    storedRestaurantId
    && memberships.some((membership) => membership.restaurant_id === storedRestaurantId)
  ) {
    return storedRestaurantId;
  }
  return memberships.length === 1 ? memberships[0].restaurant_id : null;
}

export function upsertMembership(
  current: Membership[],
  incoming: Membership,
): Membership[] {
  const index = current.findIndex(
    (membership) => membership.restaurant_id === incoming.restaurant_id,
  );
  if (index < 0) return [...current, incoming];
  return current.map((membership, currentIndex) => (
    currentIndex === index ? incoming : membership
  ));
}
