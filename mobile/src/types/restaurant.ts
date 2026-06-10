import type { User } from './auth';

export interface Role {
  ID: number;
  restaurant_id?: number | null;
  name: string;
  display_name: string;
  permissions: string;
  is_system: boolean;
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
  user?: User;
  restaurant?: Restaurant;
  role?: Role;
}

export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

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
}
