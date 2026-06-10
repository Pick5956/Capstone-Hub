import type { Membership } from "@/src/types/restaurant";

export function membershipWith(...permissions: string[]): Membership {
  return {
    ID: 1,
    user_id: 1,
    restaurant_id: 1,
    role_id: 1,
    status: "active",
    joined_at: "2026-01-01T00:00:00Z",
    role: {
      ID: 1,
      name: "test-role",
      permissions: JSON.stringify(permissions),
    },
  };
}

export const ownerMembership = membershipWith("*");
