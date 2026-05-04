import { Role } from "./role";
import { User } from "./auth";

export interface Restaurant {
  ID: number;
  name: string;
  branch_name: string;
  restaurant_type: string;
  address: string;
  phone: string;
  logo: string;
  open_time: string;
  close_time: string;
  table_count: number;
  owner_id: number;
  owner?: User;
  CreatedAt?: string;
  UpdatedAt?: string;
}

export type MembershipStatus = "active" | "suspended" | "removed";

export interface Membership {
  ID: number;
  user_id: number;
  restaurant_id: number;
  role_id: number;
  status: MembershipStatus;
  joined_at: string;
  invited_by_user_id?: number | null;

  user?: User;
  restaurant?: Restaurant;
  role?: Role;
}

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export interface Invitation {
  ID: number;
  restaurant_id: number;
  role_id: number;
  email: string;
  token: string;
  expires_at?: string | null;
  status: InvitationStatus;
  invited_by_user_id: number;
  accepted_at?: string | null;
  accepted_by_user_id?: number | null;

  restaurant?: Restaurant;
  role?: Role;
}

export interface RestaurantAuditLog {
  ID: number;
  restaurant_id: number;
  actor_user_id?: number | null;
  target_user_id?: number | null;
  invitation_id?: number | null;
  action: string;
  details: string;
  CreatedAt?: string;
  UpdatedAt?: string;

  actor_user?: User;
  target_user?: User;
  invitation?: Invitation;
}
