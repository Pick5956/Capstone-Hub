import type { User } from './auth';

export interface Role {
  ID: number;
  restaurant_id?: number | null;
  name: string;
  display_name: string;
  permissions: string;
  is_system: boolean;
}

export interface MembershipUserSummary {
  ID: number;
  email: string;
  first_name: string;
  last_name: string;
  nickname: string;
  profile_image: string;
}

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
  service_charge_enabled: boolean;
  service_charge_rate: number;
  vat_enabled: boolean;
  vat_rate: number;
  promptpay_name: string;
  promptpay_qr_image: string;
  cover_image: string;
  latitude?: number | null;
  longitude?: number | null;
  order_radius_meters?: number;
  owner_id: number;
  owner?: User;
  CreatedAt?: string;
  UpdatedAt?: string;
}

export type MembershipStatus = 'active' | 'suspended' | 'removed';

export interface Membership {
  ID: number;
  user_id: number;
  restaurant_id: number;
  role_id: number;
  permissions_override?: string | null;
  status: MembershipStatus;
  joined_at: string;
  invited_by_user_id?: number | null;
  user?: MembershipUserSummary;
  restaurant?: Restaurant;
  role?: Role;
}

export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface InvitationRestaurantSummary {
  ID: number;
  name: string;
  branch_name: string;
  address: string;
  logo: string;
}

export interface InvitationRoleSummary {
  ID: number;
  restaurant_id?: number | null;
  name: string;
  display_name: string;
  is_system: boolean;
}

export interface Invitation {
  ID: number;
  restaurant_id: number;
  role_id: number;
  email: string;
  expires_at?: string | null;
  status: InvitationStatus;
  accepted_at?: string | null;
  restaurant?: InvitationRestaurantSummary;
  role?: InvitationRoleSummary;
}

export interface AdminInvitation extends Invitation {
  token: string;
  invited_by_user_id: number;
  accepted_by_user_id?: number | null;
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

export interface RestaurantInput {
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
  cover_image?: string;
  split_zones?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  order_radius_meters?: number;
}
